import { requireAuth } from '@/app/lib/auth';
import { getException } from '@/app/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  const { id } = await params;

  try {
    const exception = await getException(id);
    if (!exception) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(exception);
  } catch (err) {
    console.error('[api/exceptions/[id]] DB error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
