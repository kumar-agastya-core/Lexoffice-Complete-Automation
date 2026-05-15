import { requireAuth, getTenantId } from '@/app/lib/auth';
import { query } from '@lexware/db';

export async function GET(request: Request): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  const tenantId = getTenantId();

  try {
    const [tenantRes, usageRes] = await Promise.all([
      query<{ plan: string; stripe_subscription_id: string | null; stripe_customer_id: string | null }>(
        `SELECT plan, stripe_subscription_id, stripe_customer_id
           FROM tenant_profiles WHERE id = $1`,
        [tenantId],
      ),
      query<{
        docs_processed: number;
        tier1_count: number;
        tier2_count: number;
        tier3_count: number;
        ai_cost_cents: number;
      }>(
        `SELECT docs_processed, tier1_count, tier2_count, tier3_count, ai_cost_cents
           FROM usage_monthly
          WHERE tenant_id = $1 AND year_month = TO_CHAR(NOW(), 'YYYY-MM')`,
        [tenantId],
      ),
    ]);

    const tenant = tenantRes.rows[0];
    const usage = usageRes.rows[0];

    return Response.json({
      plan: tenant?.plan ?? 'free',
      hasSubscription: !!(tenant?.stripe_subscription_id),
      docsThisMonth: usage?.docs_processed ?? 0,
      tier1Count: usage?.tier1_count ?? 0,
      tier2Count: usage?.tier2_count ?? 0,
      tier3Count: usage?.tier3_count ?? 0,
    });
  } catch (err) {
    console.error('[api/billing/status]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
