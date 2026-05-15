import { requireAuth, getTenantId } from '@/app/lib/auth';
import { query } from '@lexware/db';
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `Du bist ein KI-Buchhaltungsassistent für das Lexware Automation System.
Du hilfst dem Nutzer mit Buchhaltungsfragen, Belegklassifikation und Lexware-spezifischen Themen.
Antworte immer auf Deutsch.
Du hast Zugriff auf das Ausnahmen-System und kannst Belege erläutern.`;

const MODEL = 'claude-sonnet-4-20250514';

function sseChunk(obj: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

export async function POST(request: Request): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  let body: { conversationId: string; message: string; attachedFileJobId?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.conversationId || !body.message?.trim()) {
    return Response.json({ error: 'conversationId and message required' }, { status: 400 });
  }

  const tenantId = getTenantId();

  // Validate conversation belongs to tenant
  const convCheck = await query(
    `SELECT id FROM conversations WHERE id = $1 AND tenant_id = $2`,
    [body.conversationId, tenantId],
  );
  if (!convCheck.rows[0]) {
    return Response.json({ error: 'Conversation not found' }, { status: 404 });
  }

  // Load message history
  const historyRes = await query<{ role: string; content: string }>(
    `SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [body.conversationId],
  );

  // Save user message
  const userMessage = body.message.trim();
  await query(
    `INSERT INTO messages (conversation_id, tenant_id, role, content)
     VALUES ($1, $2, 'user', $3)`,
    [body.conversationId, tenantId, userMessage],
  );

  // Build messages array for Anthropic
  const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string }> =
    historyRes.rows.map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
    }));

  let finalUserContent = userMessage;
  if (body.attachedFileJobId) {
    finalUserContent += `\n\nDer Nutzer hat eine Datei hochgeladen (Job-ID: ${body.attachedFileJobId}). Beziehe dich darauf.`;
  }
  anthropicMessages.push({ role: 'user', content: finalUserContent });

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? '';
  const client = new Anthropic({ apiKey: anthropicApiKey });

  const stream = new ReadableStream({
    async start(controller) {
      let assistantText = '';
      try {
        const response = await client.messages.stream(
          {
            model: MODEL,
            max_tokens: 2000,
            system: SYSTEM_PROMPT,
            messages: anthropicMessages,
          },
          {
            headers: {
              'anthropic-beta': 'prompt-caching-2024-07-31',
            },
          },
        );

        for await (const event of response) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            assistantText += event.delta.text;
            controller.enqueue(sseChunk({ type: 'text', delta: event.delta.text }));
          } else if (event.type === 'message_stop') {
            controller.enqueue(sseChunk({ type: 'done' }));
          }
        }

        // Save assistant message + update conversation title
        await query(
          `INSERT INTO messages (conversation_id, tenant_id, role, content)
           VALUES ($1, $2, 'assistant', $3)`,
          [body.conversationId, tenantId, assistantText],
        );
        await query(
          `UPDATE conversations
              SET updated_at = NOW(),
                  title = CASE WHEN title = 'Neue Unterhaltung' THEN LEFT($2, 60) ELSE title END
            WHERE id = $1`,
          [body.conversationId, userMessage],
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        controller.enqueue(sseChunk({ type: 'error', message: msg }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
