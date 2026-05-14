import { query } from '@lexware/db';

export async function GET(): Promise<Response> {
  const checks = await Promise.allSettled([
    query('SELECT 1').then(() => 'connected' as const).catch(() => 'error' as const),
    Promise.resolve(process.env.npm_package_version ?? 'unknown'),
  ]);

  const db = checks[0].status === 'fulfilled' ? checks[0].value : 'error';
  const version = checks[1].status === 'fulfilled' ? checks[1].value : 'unknown';
  const status = db === 'connected' ? 'ok' : 'degraded';

  return Response.json(
    {
      status,
      db,
      version,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    { status: status === 'ok' ? 200 : 503 },
  );
}
