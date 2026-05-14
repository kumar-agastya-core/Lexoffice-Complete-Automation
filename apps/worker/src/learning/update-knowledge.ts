import OpenAI from 'openai';
import { query } from '@lexware/db';
import type { ExtractedDocument } from '../processor/pdf-extractor.js';
import type { FingerprintMatch } from '../processor/fingerprint-matcher.js';
import type { ClassificationResult } from '../types.js';

function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

async function generateEmbedding(openai: OpenAI, text: string): Promise<number[] | null> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8192),
    });
    return response.data[0].embedding;
  } catch (err) {
    console.error('[knowledge] Embedding generation failed:', err);
    return null;
  }
}

export async function updateKnowledge(
  extracted: ExtractedDocument,
  fingerprint: FingerprintMatch,
  result: ClassificationResult,
  tenantId: string,
): Promise<void> {
  if (result.kind === 'clarification_needed') return;

  const openai = getOpenAIClient();

  // Step 1: Upsert vendor fingerprint
  let fingerprintId = fingerprint.fingerprintId;
  if (!fingerprintId) {
    try {
      const res = await query<{ id: string }>(
        `INSERT INTO vendor_fingerprints (tenant_id, vendor_name, usage_count, last_used_at)
         VALUES (
           (SELECT id FROM tenant_profiles WHERE lexware_org = $1 LIMIT 1),
           $2, 1, NOW()
         )
         ON CONFLICT (tenant_id, vendor_name) DO UPDATE
           SET usage_count = vendor_fingerprints.usage_count + 1,
               last_used_at = NOW()
         RETURNING id`,
        [tenantId, extracted.vatId ?? extracted.iban ?? 'unknown-vendor'],
      );
      fingerprintId = res.rows[0]?.id ?? null;
    } catch (err) {
      console.error('[knowledge] Fingerprint upsert failed:', err);
    }
  }

  if (!fingerprintId) return;

  // Step 2: Upsert document type rule
  try {
    const processingStrategy = result.kind === 'settlement' ? 'multi_voucher' : 'single';
    await query(
      `INSERT INTO document_type_rules (tenant_id, rule_key, category_id, tax_type, voucher_type)
       VALUES (
         (SELECT id FROM tenant_profiles WHERE lexware_org = $1 LIMIT 1),
         $2, $3, $4, $5
       )
       ON CONFLICT (tenant_id, rule_key) DO UPDATE
         SET category_id = EXCLUDED.category_id,
             tax_type = EXCLUDED.tax_type`,
      [
        tenantId,
        `fp:${fingerprintId}`,
        result.kind === 'purchase_invoice' ? (result.data.lineItems[0]?.categoryId ?? '') : '',
        result.kind === 'purchase_invoice' ? result.data.taxType : 'gross',
        result.kind === 'purchase_invoice' ? result.data.voucherType : 'purchaseinvoice',
      ],
    );
  } catch (err) {
    console.error('[knowledge] Document type rule upsert failed:', err);
  }

  // Step 3: Save classification examples with embeddings (fire-and-forget inside this fn)
  const lineItems = gatherLineItems(result);
  const queryText = extracted.cleanText.slice(0, 500);

  for (const li of lineItems) {
    const text = li.description ?? queryText;
    if (!text.trim()) continue;

    // Generate embedding (non-blocking per-item)
    void (async () => {
      let embedding: number[] | null = null;
      if (openai) {
        embedding = await generateEmbedding(openai, text);
      }

      try {
        if (embedding) {
          await query(
            `INSERT INTO classification_examples
               (tenant_id, text_snippet, embedding, category_id, tax_type, voucher_type, source)
             VALUES (
               (SELECT id FROM tenant_profiles WHERE lexware_org = $1 LIMIT 1),
               $2, $3::vector, $4, $5, $6, 'auto'
             )
             ON CONFLICT DO NOTHING`,
            [
              tenantId,
              text,
              `[${embedding.join(',')}]`,
              li.categoryId,
              li.taxType,
              li.voucherType,
            ],
          );
        } else {
          // Insert without embedding — can be backfilled later
          await query(
            `INSERT INTO classification_examples
               (tenant_id, text_snippet, category_id, tax_type, voucher_type, source)
             VALUES (
               (SELECT id FROM tenant_profiles WHERE lexware_org = $1 LIMIT 1),
               $2, $3, $4, $5, 'auto'
             )
             ON CONFLICT DO NOTHING`,
            [tenantId, text, li.categoryId, li.taxType, li.voucherType],
          );
        }
      } catch (err) {
        console.error('[knowledge] Classification example insert failed:', err);
      }
    })();
  }
}

interface FlatLineItem {
  description?: string;
  categoryId: string;
  taxType: string;
  voucherType: string;
}

function gatherLineItems(result: ClassificationResult): FlatLineItem[] {
  if (result.kind === 'purchase_invoice') {
    return result.data.lineItems.map((li) => ({
      description: li.description,
      categoryId: li.categoryId,
      taxType: result.data.taxType,
      voucherType: result.data.voucherType,
    }));
  }
  if (result.kind === 'settlement') {
    return result.data.vouchers.flatMap((v) =>
      v.lineItems.map((li) => ({
        description: li.label,
        categoryId: li.categoryId,
        taxType: v.taxType,
        voucherType: v.voucherType,
      })),
    );
  }
  return [];
}
