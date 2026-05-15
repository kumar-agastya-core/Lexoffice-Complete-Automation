import { requireAuth, getTenantId } from '@/app/lib/auth';
import { query } from '@lexware/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  const { id } = await params;
  const tenantId = getTenantId();

  try {
    const convRes = await query<{ id: string; title: string; created_at: string }>(
      `SELECT id, title, created_at FROM conversations WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (!convRes.rows[0]) return Response.json({ error: 'Not found' }, { status: 404 });

    const msgRes = await query<{
      id: string;
      role: string;
      content: string;
      tool_calls: unknown;
      tool_results: unknown;
      created_at: string;
    }>(
      `SELECT id, role, content, tool_calls, tool_results, created_at
         FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC`,
      [id],
    );

    return Response.json({ conversation: convRes.rows[0], messages: msgRes.rows });
  } catch (err) {
    console.error('[api/agent/conversations/:id GET]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  const { id } = await params;
  const tenantId = getTenantId();

  try {
    await query(
      `DELETE FROM conversations WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/agent/conversations/:id DELETE]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
