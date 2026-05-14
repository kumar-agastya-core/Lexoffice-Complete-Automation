import { requireAuth, getApiKey } from '@/app/lib/auth';
import { getPaymentStatus } from '@/app/lib/lexware';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ voucherId: string }> },
): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  const { voucherId } = await params;

  try {
    const apiKey = getApiKey();
    const status = await getPaymentStatus(voucherId, apiKey);
    return Response.json(status);
  } catch (err) {
    console.error('[api/payments] error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
