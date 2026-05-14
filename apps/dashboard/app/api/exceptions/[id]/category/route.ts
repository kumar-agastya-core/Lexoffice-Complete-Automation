import { requireAuth, getApiKey } from '@/app/lib/auth';
import { getException, answerClarification } from '@/app/lib/db';
import { updateVoucherCategory } from '@/app/lib/lexware';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  const { id } = await params;

  let body: { sessionId: string; categoryId: string; categoryName: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.sessionId || !body.categoryId) {
    return Response.json({ error: 'sessionId and categoryId required' }, { status: 400 });
  }

  try {
    const exception = await getException(id);
    if (!exception) return Response.json({ error: 'Not found' }, { status: 404 });

    const voucherId = exception.payload.lexwareDraftVoucherId;
    if (voucherId) {
      const apiKey = getApiKey();
      await updateVoucherCategory(voucherId, body.categoryId, apiKey);
    }

    await answerClarification(
      id,
      body.sessionId,
      `Category selected: ${body.categoryName} (${body.categoryId})`,
      { categoryId: body.categoryId, categoryName: body.categoryName },
    );

    return Response.json({ success: true });
  } catch (err) {
    console.error('[api/category] error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
