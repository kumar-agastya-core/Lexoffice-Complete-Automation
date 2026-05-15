import { requireAuth, getTenantId } from '@/app/lib/auth';
import { query } from '@lexware/db';

export async function GET(request: Request): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  try {
    const tenantId = getTenantId();
    const res = await query<{ inbound_email: string | null }>(
      `SELECT inbound_email FROM tenant_profiles WHERE id = $1 LIMIT 1`,
      [tenantId],
    );
    const email = res.rows[0]?.inbound_email ?? null;
    return Response.json({ email });
  } catch (err) {
    console.error('[api/settings/email]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
