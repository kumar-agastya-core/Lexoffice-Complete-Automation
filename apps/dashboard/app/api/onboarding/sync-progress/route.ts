import { getSyncProgress } from '@/app/lib/db';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');

  if (!tenantId) {
    return Response.json({ error: 'tenantId required' }, { status: 400 });
  }

  try {
    const progress = await getSyncProgress(tenantId);
    if (!progress) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json(progress);
  } catch (err) {
    console.error('[onboarding/sync-progress]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
