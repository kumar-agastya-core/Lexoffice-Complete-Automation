import { query } from '@lexware/db';
import { stripe, PLAN_PRICES } from '@/app/lib/stripe';
import type Stripe from 'stripe';

export const config = { api: { bodyParser: false } };

function resolvePlan(priceId: string): string {
  const entry = Object.entries(PLAN_PRICES).find(([, p]) => p === priceId);
  return entry?.[0] ?? 'starter';
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const sig = request.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Signature verification failed';
    console.error('[billing/webhook] Signature error:', msg);
    return Response.json({ error: msg }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenantId;
        const subscriptionId = session.subscription as string;
        const customerId = session.customer as string;
        if (!tenantId || !subscriptionId) break;

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = sub.items.data[0]?.price.id ?? '';
        const plan = resolvePlan(priceId);

        await query(
          `UPDATE tenant_profiles
              SET stripe_subscription_id = $1, stripe_customer_id = $2, plan = $3
            WHERE id = $4`,
          [subscriptionId, customerId, plan, tenantId],
        );
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price.id ?? '';
        const plan = resolvePlan(priceId);
        const status = sub.status;

        if (status === 'active' || status === 'trialing') {
          await query(
            `UPDATE tenant_profiles SET plan = $1 WHERE stripe_subscription_id = $2`,
            [plan, sub.id],
          );
        } else if (status === 'canceled' || status === 'unpaid') {
          await query(
            `UPDATE tenant_profiles SET plan = 'free', stripe_subscription_id = NULL
              WHERE stripe_subscription_id = $1`,
            [sub.id],
          );
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await query(
          `UPDATE tenant_profiles SET plan = 'free', stripe_subscription_id = NULL
            WHERE stripe_subscription_id = $1`,
          [sub.id],
        );
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error('[billing/webhook] Handler error:', err);
    // Still return 200 — Stripe will retry on 5xx
  }

  return Response.json({ received: true });
}
