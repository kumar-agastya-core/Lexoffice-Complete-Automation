import { requireAuth, getTenantId } from '@/app/lib/auth';
import { query } from '@lexware/db';
import { cookies } from 'next/headers';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  const { clientId } = await params;
  const agencyId = getTenantId();

  try {
    await query(
      `DELETE FROM agency_clients
        WHERE agency_tenant_id = $1 AND client_tenant_id = $2`,
      [agencyId, clientId],
    );

    const cookieStore = await cookies();
    const active = cookieStore.get('lx_active_tenant')?.value;
    if (active === clientId) {
      cookieStore.delete('lx_active_tenant');
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/mandanten/:id DELETE]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
