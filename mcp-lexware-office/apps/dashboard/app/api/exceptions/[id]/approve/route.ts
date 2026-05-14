import { requireAuth, getApiKey } from '@/app/lib/auth';
import { getException, resolveException } from '@/app/lib/db';
import { approveVoucher } from '@/app/lib/lexware';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  const { id } = await params;

  try {
    const exception = await getException(id);
    if (!exception) return Response.json({ error: 'Not found' }, { status: 404 });

    if (exception.status !== 'awaiting_approval') {
      return Response.json(
        { error: `Cannot approve exception with status "${exception.status}"` },
        { status: 409 },
      );
    }

    const voucherId = exception.payload.lexwareDraftVoucherId;
    if (!voucherId) {
      return Response.json({ error: 'No draft voucher ID on this exception' }, { status: 422 });
    }

    const apiKey = getApiKey();
    const result = await approveVoucher(voucherId, apiKey);

    if (!result.success) {
      return Response.json({ error: result.error ?? 'Lexware API error' }, { status: 502 });
    }

    await resolveException(id, voucherId);

    const deeplink = `https://app.lexware.de/permalink/vouchers/view/${voucherId}`;
    return Response.json({ success: true, voucherId, deeplink });
  } catch (err) {
    console.error('[api/approve] error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
