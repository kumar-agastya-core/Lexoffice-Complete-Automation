import { requireAuth } from '@/app/lib/auth';
import { getException, appendReferenceDoc } from '@/app/lib/db';

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  const { id } = await params;

  try {
    const exception = await getException(id);
    if (!exception) return Response.json({ error: 'Not found' }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) return Response.json({ error: 'No file provided' }, { status: 400 });
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return Response.json({ error: 'Only PDF files accepted' }, { status: 415 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return Response.json({ error: 'File too large (max 10 MB)' }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    await appendReferenceDoc(id, {
      filename: file.name,
      base64,
      uploadedAt: new Date().toISOString(),
      size: file.size,
    });

    return Response.json({ success: true, filename: file.name, size: file.size });
  } catch (err) {
    console.error('[api/upload] error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
