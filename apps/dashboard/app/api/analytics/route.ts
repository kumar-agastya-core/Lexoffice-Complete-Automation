import { requireAuth, getTenantId } from '@/app/lib/auth';
import { query } from '@lexware/db';

interface MonthlyStats {
  month: string;
  total: string;
  resolved: string;
  auto_posted: string;
}

interface TierStats {
  tier1_count: string;
  tier2_count: string;
  total_count: string;
}

interface FingerprintCount {
  count: string;
}

interface WeeklyTrend {
  week: string;
  count: string;
}

export async function GET(request: Request): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  try {
    const tenantId = getTenantId();

    const [monthly, tier, fingerprints, weekly] = await Promise.all([
      query<MonthlyStats>(
        `SELECT TO_CHAR(created_at, 'YYYY-MM') AS month,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
                COUNT(*) FILTER (WHERE payload->>'tier' = '1') AS auto_posted
           FROM exception_queue
          WHERE tenant_id = $1
            AND created_at >= NOW() - INTERVAL '6 months'
          GROUP BY month
          ORDER BY month`,
        [tenantId],
      ),

      query<TierStats>(
        `SELECT
           COUNT(*) FILTER (WHERE payload->>'tier' = '1') AS tier1_count,
           COUNT(*) FILTER (WHERE payload->>'tier' = '2' OR payload->>'tier' IS NULL) AS tier2_count,
           COUNT(*) AS total_count
           FROM exception_queue
          WHERE tenant_id = $1`,
        [tenantId],
      ),

      query<FingerprintCount>(
        `SELECT COUNT(*) AS count FROM vendor_fingerprints WHERE tenant_id = $1`,
        [tenantId],
      ),

      query<WeeklyTrend>(
        `SELECT TO_CHAR(DATE_TRUNC('week', created_at), 'YYYY-MM-DD') AS week,
                COUNT(*) AS count
           FROM exception_queue
          WHERE tenant_id = $1
            AND created_at >= NOW() - INTERVAL '8 weeks'
          GROUP BY week
          ORDER BY week`,
        [tenantId],
      ),
    ]);

    const tierRow = tier.rows[0];
    const totalCount = Number(tierRow?.total_count ?? 0);
    const tier1Count = Number(tierRow?.tier1_count ?? 0);
    const tier1Rate = totalCount > 0 ? Math.round((tier1Count / totalCount) * 100) : 0;

    return Response.json({
      monthly: monthly.rows.map((r) => ({
        month: r.month,
        total: Number(r.total),
        resolved: Number(r.resolved),
        autoPosted: Number(r.auto_posted),
      })),
      tier: {
        tier1Count,
        tier2Count: Number(tierRow?.tier2_count ?? 0),
        totalCount,
        tier1Rate,
      },
      fingerprintCount: Number(fingerprints.rows[0]?.count ?? 0),
      weekly: weekly.rows.map((r) => ({
        week: r.week,
        count: Number(r.count),
      })),
    });
  } catch (err) {
    console.error('[api/analytics]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
