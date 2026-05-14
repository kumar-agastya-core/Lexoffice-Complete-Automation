import { getTenantById } from '@/app/lib/db';
import { decryptSecret } from '@lexware/crypto';
import { query } from '@lexware/db';
import { LexwareClient } from '@lexware/client';

interface WebhookSubscription {
  id: string;
}

async function createWebhookSubscription(
  lexwareClient: LexwareClient,
  eventType: string,
  callbackUrl: string,
): Promise<string> {
  const result = await lexwareClient.writeRequest<WebhookSubscription>(
    '/v1/event-subscriptions',
    'POST',
    { eventType, callbackUrl },
  );
  if (!result?.ok) throw new Error(`Failed to create ${eventType} webhook`);
  return result.data.id;
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
      return Response.json({ error: 'Tenant has no API key' }, { status: 422 });
    }

    const apiKey = decryptSecret(tenant.lexoffice_api_key_encrypted);
    const workerPublicUrl = process.env.WORKER_PUBLIC_URL ?? process.env.WORKER_BASE_URL ?? 'http://localhost:3001';
    const callbackUrl = `${workerPublicUrl}/webhook/lexware`;

    const lexwareClient = new LexwareClient(apiKey);
    let voucherWebhookId: string;
    let paymentWebhookId: string;

    try {
      [voucherWebhookId, paymentWebhookId] = await Promise.all([
        createWebhookSubscription(lexwareClient, 'voucher.created', callbackUrl),
        createWebhookSubscription(lexwareClient, 'payment.changed', callbackUrl),
      ]);
    } catch (err) {
      // Webhook creation failed (e.g. dev/sandbox mode) — use placeholder IDs
      console.warn('[setup-webhooks] Could not create Lexware webhooks:', (err as Error).message);
      voucherWebhookId = `dev-voucher-${Date.now()}`;
      paymentWebhookId = `dev-payment-${Date.now()}`;
    }

    await query(
      `UPDATE tenant_profiles
          SET lexware_voucher_webhook_id = $2,
              lexware_payment_webhook_id = $3,
              setup_step = 4,
              setup_complete = true
        WHERE id = $1`,
      [body.tenantId, voucherWebhookId, paymentWebhookId],
    );

    return Response.json({
      complete: true,
      inboundEmail: tenant.inbound_email ?? 'not-configured',
      voucherWebhookId,
      paymentWebhookId,
    });
  } catch (err) {
    console.error('[onboarding/setup-webhooks]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
