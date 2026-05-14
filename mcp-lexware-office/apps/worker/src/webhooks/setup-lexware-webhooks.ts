import { LexwareClient } from '@lexware/client';

interface WebhookSubscription {
  id: string;
  eventType: string;
  callbackUrl: string;
}

export async function setupLexwareWebhooks(
  _tenantId: string,
  lexwareApiKey: string,
  workerBaseUrl: string,
): Promise<{ voucherWebhookId: string; paymentWebhookId: string }> {
  const client = new LexwareClient(lexwareApiKey);
  const callbackUrl = `${workerBaseUrl}/webhook/lexware`;

  const [voucherResult, paymentResult] = await Promise.all([
    client.writeRequest<WebhookSubscription>(
      '/v1/event-subscriptions',
      'POST',
      { eventType: 'voucher.created', callbackUrl },
    ),
    client.writeRequest<WebhookSubscription>(
      '/v1/event-subscriptions',
      'POST',
      { eventType: 'payment.changed', callbackUrl },
    ),
  ]);

  if (!voucherResult?.ok) {
    throw new Error(`Failed to create voucher.created webhook: ${JSON.stringify(voucherResult)}`);
  }
  if (!paymentResult?.ok) {
    throw new Error(`Failed to create payment.changed webhook: ${JSON.stringify(paymentResult)}`);
  }

  return {
    voucherWebhookId: voucherResult.data.id,
    paymentWebhookId: paymentResult.data.id,
  };
}
