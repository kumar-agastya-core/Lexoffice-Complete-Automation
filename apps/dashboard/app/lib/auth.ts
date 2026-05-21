function getCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

export function requireAuth(request: Request): Response | null {
  const secret = process.env.DASHBOARD_SECRET;
  if (!secret) {
    return Response.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const session = getCookie(request, 'lx_session');
  if (session !== secret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export function getTenantId(): string {
  const id = process.env.TENANT_ID;
  if (!id) throw new Error('TENANT_ID env var is not set');
  return id;
}

export function getApiKey(): string {
  const key = process.env.LEXWARE_API_KEY;
  if (!key) throw new Error('LEXWARE_API_KEY env var is not set');
  return key;
}
