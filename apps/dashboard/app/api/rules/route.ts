import { requireAuth, getTenantId } from '@/app/lib/auth';
import { query } from '@lexware/db';

export interface RuleRow {
  id: string;
  vendor_name: string;
  category_id: string | null;
  category_name: string | null;
  tax_type: string | null;
  always_unchecked: boolean;
  usage_count: number;
  last_used_at: string | null;
}

export async function GET(request: Request): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  try {
    const tenantId = getTenantId();
    const res = await query<RuleRow>(
      `SELECT vf.id, vf.vendor_name, vf.category_id,
              pc.name AS category_name,
              vf.tax_type, vf.always_unchecked, vf.usage_count,
              vf.last_used_at
         FROM vendor_fingerprints vf
         LEFT JOIN posting_categories_cache pcc ON pcc.tenant_id = vf.tenant_id
         LEFT JOIN LATERAL (
           SELECT cat->>'name' AS name
             FROM jsonb_array_elements(pcc.categories) AS cat
            WHERE cat->>'id' = vf.category_id
            LIMIT 1
         ) pc ON TRUE
        WHERE vf.tenant_id = $1
        ORDER BY vf.usage_count DESC, vf.vendor_name`,
      [tenantId],
    );
    return Response.json(res.rows);
  } catch (err) {
    console.error('[api/rules GET]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
