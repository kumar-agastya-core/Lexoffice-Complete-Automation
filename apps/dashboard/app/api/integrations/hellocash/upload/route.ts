import { requireAuth, getTenantId } from '@/app/lib/auth';

export async function POST(request: Request): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isCsv = file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv');
    if (!isPdf && !isCsv) {
      return Response.json({ error: 'PDF or CSV files only' }, { status: 415 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return Response.json({ error: 'File too large (max 10MB)' }, { status: 413 });
    }

    const workerUrl = process.env.WORKER_BASE_URL ?? 'http://localhost:3001';
    const tenantId = getTenantId();

    const arrayBuffer = await file.arrayBuffer();
    const res = await fetch(`${workerUrl}/integrations/hellocash`, {
      method: 'POST',
      headers: {
        'Content-Type': isPdf ? 'application/pdf' : 'text/csv',
        'x-tenant-id': tenantId,
      },
      body: arrayBuffer,
    });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Worker error: ${err}` }, { status: 502 });
    }

    return Response.json(await res.json());
  } catch (err) {
    console.error('[integrations/hellocash/upload]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
