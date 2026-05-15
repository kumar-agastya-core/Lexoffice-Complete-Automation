import { query } from '@lexware/db';
import { createClient } from '@/app/lib/supabase/server';

export async function POST(request: Request): Promise<Response> {
  let body: { tenantId?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.tenantId) {
    return Response.json({ error: 'tenantId required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await query(
      `UPDATE tenant_profiles
          SET supabase_user_id = $1
        WHERE id = $2 AND supabase_user_id IS NULL`,
      [user.id, body.tenantId],
    );
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/auth/link-tenant]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
