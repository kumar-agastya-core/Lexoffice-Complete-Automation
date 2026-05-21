export async function POST(): Promise<Response> {
  return Response.json({ error: 'Billing not configured' }, { status: 503 });
}
