import { requireAuth, getTenantId } from '@/app/lib/auth';
import { query } from '@lexware/db';

export async function GET(request: Request): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  try {
    const tenantId = getTenantId();
    const res = await query<{ id: string; title: string; created_at: string; updated_at: string }>(
      `SELECT id, title, created_at, updated_at
         FROM conversations
        WHERE tenant_id = $1
        ORDER BY updated_at DESC
        LIMIT 50`,
      [tenantId],
    );
    return Response.json({ conversations: res.rows });
  } catch (err) {
    console.error('[api/agent/conversations GET]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  try {
    const tenantId = getTenantId();
    const res = await query<{ id: string }>(
      `INSERT INTO conversations (tenant_id, title)
       VALUES ($1, 'Neue Unterhaltung') RETURNING id`,
      [tenantId],
    );
    return Response.json({ id: res.rows[0]?.id });
  } catch (err) {
    console.error('[api/agent/conversations POST]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
