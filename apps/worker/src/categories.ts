import { query } from '@lexware/db';
import type { LexwareClient } from '@lexware/client';
import type { PostingCategory } from './types.js';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheRow {
  categories: PostingCategory[];
  fetched_at: string;
}

export async function getPostingCategories(
  tenantId: string,
  lexwareClient: LexwareClient,
): Promise<PostingCategory[]> {
  // Try DB cache first
  try {
    const res = await query<CacheRow>(
      `SELECT pcc.categories, pcc.fetched_at
         FROM posting_categories_cache pcc
         JOIN tenant_profiles tp ON tp.id = pcc.tenant_id
        WHERE tp.lexware_org = $1
        LIMIT 1`,
      [tenantId],
    );
    if (res.rows.length > 0) {
      const row = res.rows[0];
      const age = Date.now() - new Date(row.fetched_at).getTime();
      if (age < CACHE_TTL_MS) {
        return row.categories as PostingCategory[];
      }
    }
  } catch {
    // DB unavailable — fall through to API
  }

  // Fetch from Lexware API
  const data = await lexwareClient.request<PostingCategory[]>('/v1/posting-categories');
  const categories: PostingCategory[] = data ?? [];

  // Upsert cache
  if (categories.length > 0) {
    try {
      await query(
        `INSERT INTO posting_categories_cache (tenant_id, categories)
         VALUES (
           (SELECT id FROM tenant_profiles WHERE lexware_org = $1 LIMIT 1),
           $2::jsonb
         )
         ON CONFLICT (tenant_id) DO UPDATE
           SET categories = EXCLUDED.categories,
               fetched_at = NOW()`,
        [tenantId, JSON.stringify(categories)],
      );
    } catch {
      // Non-fatal — categories were fetched, cache write failed
    }
  }

  return categories;
}
