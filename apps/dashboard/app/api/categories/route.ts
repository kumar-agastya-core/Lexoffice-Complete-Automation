import { requireAuth, getApiKey } from '@/app/lib/auth';
import { LexwareClient } from '@lexware/client';

export async function GET(request: Request): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  try {
    const apiKey = getApiKey();
    const client = new LexwareClient(apiKey);
    const data = await client.request<unknown[]>('/v1/posting-categories');
    return Response.json(data ?? []);
  } catch (err) {
    console.error('[api/categories] error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
