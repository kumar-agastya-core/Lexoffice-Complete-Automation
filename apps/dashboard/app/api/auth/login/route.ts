import { timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret) {
    return Response.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  let body: { secret?: string };
  try {
    body = await request.json() as { secret?: string };
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const provided = body.secret ?? '';
  const maxLen = Math.max(provided.length, secret.length);
  const a = Buffer.alloc(maxLen);
  const b = Buffer.alloc(maxLen);
  Buffer.from(provided).copy(a);
  Buffer.from(secret).copy(b);

  if (!timingSafeEqual(a, b) || provided.length !== secret.length) {
    return Response.json({ error: 'Invalid secret' }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set('lx_session', secret, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return Response.json({ ok: true });
}
