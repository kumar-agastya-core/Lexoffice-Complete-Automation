import { LexwareClient } from '@lexware/client';
import { query } from '@lexware/db';

interface SyncProgress {
  contactsSynced: number;
  fingerprintsCreated: number;
  categoriesCached: number;
  vouchersLearned: number;
}

async function updateProgress(tenantId: string, fields: Partial<SyncProgress & { status: string; errorMessage: string; startedAt: Date; completedAt: Date }>): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 2;

  if (fields.status !== undefined) { sets.push(`status = $${i++}`); vals.push(fields.status); }
  if (fields.contactsSynced !== undefined) { sets.push(`contacts_synced = $${i++}`); vals.push(fields.contactsSynced); }
  if (fields.fingerprintsCreated !== undefined) { sets.push(`fingerprints_created = $${i++}`); vals.push(fields.fingerprintsCreated); }
  if (fields.categoriesCached !== undefined) { sets.push(`categories_cached = $${i++}`); vals.push(fields.categoriesCached); }
  if (fields.vouchersLearned !== undefined) { sets.push(`vouchers_learned = $${i++}`); vals.push(fields.vouchersLearned); }
  if (fields.errorMessage !== undefined) { sets.push(`error_message = $${i++}`); vals.push(fields.errorMessage); }
  if (fields.startedAt !== undefined) { sets.push(`started_at = $${i++}`); vals.push(fields.startedAt); }
  if (fields.completedAt !== undefined) { sets.push(`completed_at = $${i++}`); vals.push(fields.completedAt); }

  if (sets.length === 0) return;
  await query(
    `UPDATE initial_sync_progress SET ${sets.join(', ')} WHERE tenant_id = $1`,
    [tenantId, ...vals],
  );
}

interface LexwareContact {
  id: string;
  company?: { name?: string; vatRegistrationId?: string };
  person?: { firstName?: string; lastName?: string };
  roles?: { vendor?: object };
}

interface LexwareCategory {
  id: string;
  name: string;
  type: string;
  groupName?: string;
  splitAllowed?: boolean;
}

interface VoucherListItem {
  id: string;
  contactId?: string;
}

interface VoucherDetail {
  contactId?: string;
  voucherItems?: Array<{ categoryId?: string; taxAmount?: number }>;
  taxType?: string;
  type?: string;
}

export async function runInitialSync(tenantId: string, apiKey: string): Promise<void> {
  const client = new LexwareClient(apiKey);

  // Step 1: Mark running
  await updateProgress(tenantId, { status: 'running', startedAt: new Date() });

  try {
    // Step 2: Sync contacts
    let contactsSynced = 0;
    let fingerprintsCreated = 0;

    const contacts = await client.paginateAll<LexwareContact>('/v1/contacts', new URLSearchParams({ vendor: 'true' }));
    if (contacts) {
      for (const contact of contacts) {
        contactsSynced++;
        const vatId = contact.company?.vatRegistrationId;
        const name = contact.company?.name ?? `${contact.person?.firstName ?? ''} ${contact.person?.lastName ?? ''}`.trim();

        if ((vatId || contact.id) && name) {
          try {
            await query(
              `INSERT INTO vendor_fingerprints (tenant_id, vendor_name, lexware_contact_id)
               VALUES ($1, $2, $3)
               ON CONFLICT (tenant_id, vendor_name) DO UPDATE
                 SET lexware_contact_id = EXCLUDED.lexware_contact_id,
                     last_used_at = NOW()`,
              [tenantId, name, contact.id],
            );
            fingerprintsCreated++;
          } catch {
            // Skip individual contact errors
          }
        }

        if (contactsSynced % 50 === 0) {
          await updateProgress(tenantId, { contactsSynced, fingerprintsCreated });
        }
      }
    }
    await updateProgress(tenantId, { contactsSynced, fingerprintsCreated });

    // Step 3: Sync posting categories
    const categories = await client.request<LexwareCategory[]>('/v1/posting-categories');
    let categoriesCached = 0;
    if (categories) {
      for (const cat of categories) {
        try {
          await query(
            `INSERT INTO posting_categories_cache (tenant_id, categories)
             VALUES ($1, $2::jsonb)
             ON CONFLICT (tenant_id) DO UPDATE
               SET categories = $2::jsonb, fetched_at = NOW()`,
            [tenantId, JSON.stringify(categories)],
          );
          categoriesCached = categories.length;
          break; // single upsert for all categories (JSONB blob approach)
        } catch {
          break;
        }
      }
    }
    await updateProgress(tenantId, { categoriesCached });

    // Step 4: Learn from voucher history (last 90 days)
    const dateFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const voucherList = await client.paginateAll<VoucherListItem>(
      '/v1/voucherlist',
      new URLSearchParams({
        voucherType: 'purchaseinvoice',
        voucherStatus: 'open,paid,paidoff',
        dateFrom,
      }),
      100,
    );

    let vouchersLearned = 0;
    if (voucherList) {
      for (const item of voucherList.slice(0, 200)) { // cap at 200 for initial sync
        try {
          const detail = await client.request<VoucherDetail>(`/v1/vouchers/${item.id}`);
          if (!detail?.contactId || !detail.voucherItems?.length) continue;

          const primaryCategory = detail.voucherItems.find((vi) => vi.categoryId)?.categoryId;
          if (!primaryCategory) continue;

          await query(
            `UPDATE vendor_fingerprints
                SET category_id = $1, tax_type = $2, usage_count = usage_count + 1, last_used_at = NOW()
              WHERE tenant_id = $3
                AND lexware_contact_id = $4
                AND (category_id IS NULL OR category_id = $1)`,
            [primaryCategory, detail.taxType ?? 'gross', tenantId, detail.contactId],
          );
          vouchersLearned++;
        } catch {
          // Skip individual voucher errors — don't fail the whole sync
        }
      }
    }
    await updateProgress(tenantId, { vouchersLearned });

    // Step 5: Complete
    await updateProgress(tenantId, { status: 'complete', completedAt: new Date() });
    console.log(`[initial-sync] Tenant ${tenantId} sync complete: ${contactsSynced} contacts, ${categoriesCached} categories, ${vouchersLearned} vouchers`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[initial-sync] Tenant ${tenantId} sync failed: ${msg}`);
    await updateProgress(tenantId, { status: 'failed', errorMessage: msg });
    throw err;
  }
}
