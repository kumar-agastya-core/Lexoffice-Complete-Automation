import { LexwareClient } from '@lexware/client';

interface LexwareProfile {
  companyName?: string;
  vatRegistrationId?: string;
  taxType?: string;
  smallBusiness?: boolean;
  [k: string]: unknown;
}

export async function POST(request: Request): Promise<Response> {
  let body: { apiKey?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.apiKey?.trim()) {
    return Response.json({ valid: false, error: 'API key is required' }, { status: 400 });
  }

  try {
    const client = new LexwareClient(body.apiKey.trim());
    const profile = await client.request<LexwareProfile>('/v1/profile');

    if (!profile) {
      return Response.json({ valid: false, error: 'Invalid API key' });
    }

    return Response.json({
      valid: true,
      companyName: profile.companyName ?? '',
      vatId: profile.vatRegistrationId ?? null,
      taxType: profile.taxType ?? null,
      smallBusiness: profile.smallBusiness ?? false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('401') || msg.includes('Unauthorized')) {
      return Response.json({ valid: false, error: 'Invalid API key' });
    }
    console.error('[onboarding/validate]', msg);
    return Response.json({ valid: false, error: 'Could not reach Lexware API' }, { status: 502 });
  }
}
