import { requireAuth } from '@/app/lib/auth';
import { cookies } from 'next/headers';

export async function POST(request: Request): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  const cookieStore = await cookies();
  cookieStore.delete('lx_active_tenant');
  return Response.json({ ok: true });
}
