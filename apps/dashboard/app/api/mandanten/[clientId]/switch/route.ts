import { requireAuth, getTenantId } from '@/app/lib/auth';
import { query } from '@lexware/db';
import { cookies } from 'next/headers';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  const { clientId } = await params;
  const agencyId = getTenantId();

  try {
    const check = await query(
      `SELECT 1 FROM agency_clients
        WHERE agency_tenant_id = $1 AND client_tenant_id = $2`,
      [agencyId, clientId],
    );
    if (!check.rows[0]) {
      return Response.json({ error: 'Client not found' }, { status: 404 });
    }

    const cookieStore = await cookies();
    cookieStore.set('lx_active_tenant', clientId, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/mandanten/:id/switch]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
