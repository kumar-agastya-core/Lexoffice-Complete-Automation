import { requireAuth } from '@/app/lib/auth';
import { answerClarification, allBlockersResolved, getException } from '@/app/lib/db';
import { query } from '@lexware/db';
import { getResumeQueue } from '@/app/lib/queue';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  const { id } = await params;

  let body: { sessionId: string; answer: string };
  try {
    body = await request.json() as { sessionId: string; answer: string };
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.sessionId || !body.answer) {
    return Response.json({ error: 'sessionId and answer required' }, { status: 400 });
  }

  try {
    const exception = await getException(id);
    if (!exception) return Response.json({ error: 'Not found' }, { status: 404 });

    await answerClarification(id, body.sessionId, body.answer, null);
    const resolved = await allBlockersResolved(id);

    let resumeEnqueued = false;
    if (resolved) {
      // Flip to awaiting_approval
      await query(
        `UPDATE exception_queue SET status = 'awaiting_approval' WHERE id = $1 AND status = 'pending'`,
        [id],
      );

      // Check queue for existing resume job to avoid duplicates
      const resumeQueue = getResumeQueue();
      const waiting = await resumeQueue.getWaiting();
      const alreadyQueued = waiting.some(
        (j) => (j.data as { exceptionId?: string }).exceptionId === id,
      );

      if (!alreadyQueued) {
        await resumeQueue.add('resume', {
          exceptionId: id,
          tenantId: exception.tenant_id,
        });
        resumeEnqueued = true;
      }

      console.log(`[api/answer] All blockers resolved for exception ${id} — resume job ${alreadyQueued ? 'already queued' : 'enqueued'}`);
    }

    return Response.json({ status: 'answered', allResolved: resolved, resumeEnqueued });
  } catch (err) {
    console.error('[api/answer] error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
