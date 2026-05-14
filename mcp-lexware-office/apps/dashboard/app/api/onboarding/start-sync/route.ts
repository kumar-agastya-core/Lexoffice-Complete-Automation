import { getTenantById } from '@/app/lib/db';
import { decryptSecret } from '@lexware/crypto';
import { query } from '@lexware/db';

// BullMQ queue connection — fire job via REST to the worker
// (Dashboard doesn't run BullMQ directly; it calls the worker's HTTP API or uses shared Redis)
// For simplicity, we directly update DB status and the worker's initialSyncQueue picks it up
// In production: call worker's internal admin endpoint or share Redis connection.

async function enqueueViaDb(tenantId: string, apiKey: string): Promise<void> {
  // Store job intent — the worker's initialSyncQueue polls or listens
  // For now: update DB status to 'running' (worker will detect and run)
  // A cleaner Phase 7 solution: use BullMQ REST API or shared Redis.
  await query(
    `UPDATE initial_sync_progress SET status = 'pending' WHERE tenant_id = $1`,
    [tenantId],
  );
  // In real deployment: initialSyncQueue.add(tenantId, { tenantId, lexwareApiKey: apiKey })
  // The worker process is separate and listens on the same Redis.
  console.log(`[onboarding/start-sync] Sync queued for tenant ${tenantId} — key length: ${apiKey.length}`);
}

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

  try {
    const tenant = await getTenantById(body.tenantId);
    if (!tenant) return Response.json({ error: 'Tenant not found' }, { status: 404 });
    if (!tenant.lexoffice_api_key_encrypted) {
      return Response.json({ error: 'Tenant has no API key configured' }, { status: 422 });
    }

    const apiKey = decryptSecret(tenant.lexoffice_api_key_encrypted);
    await enqueueViaDb(body.tenantId, apiKey);

    return Response.json({ queued: true });
  } catch (err) {
    console.error('[onboarding/start-sync]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
