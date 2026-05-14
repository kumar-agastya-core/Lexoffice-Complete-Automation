import { requireAuth, getTenantId } from '@/app/lib/auth';
import { getExceptions } from '@/app/lib/db';

export async function GET(request: Request): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  const { searchParams } = new URL(request.url);
  const rawStatus = searchParams.get('status') ?? 'pending';
  const status = rawStatus === 'all' || rawStatus === 'resolved' ? rawStatus : 'pending';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10)));

  try {
    const tenantId = getTenantId();
    const { rows, total } = await getExceptions(tenantId, status, page, pageSize);
    return Response.json({ exceptions: rows, total, page, pageSize });
  } catch (err) {
    console.error('[api/exceptions] DB error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
