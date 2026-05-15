import { requireAuth, getTenantId } from '@/app/lib/auth';
import { query } from '@lexware/db';
import { stripe, PLAN_PRICES } from '@/app/lib/stripe';

export async function POST(request: Request): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  let body: { plan?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const plan = body.plan;
  if (!plan || !['starter', 'pro', 'agency'].includes(plan)) {
    return Response.json({ error: 'Invalid plan' }, { status: 400 });
  }

  const priceId = PLAN_PRICES[plan];
  if (!priceId) {
    return Response.json({ error: `Price ID for plan "${plan}" not configured` }, { status: 500 });
  }

  const tenantId = getTenantId();

  try {
    const res = await query<{
      stripe_customer_id: string | null;
      company_name: string;
      plan: string;
    }>(
      `SELECT stripe_customer_id, company_name, plan FROM tenant_profiles WHERE id = $1`,
      [tenantId],
    );
    const tenant = res.rows[0];
    if (!tenant) return Response.json({ error: 'Tenant not found' }, { status: 404 });

    if (tenant.plan !== 'free') {
      return Response.json(
        { error: 'Bereits abonniert — nutzen Sie das Kundenportal' },
        { status: 400 },
      );
    }

    let customerId = tenant.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: tenant.company_name,
        metadata: { tenantId },
      });
      customerId = customer.id;
      await query(
        `UPDATE tenant_profiles SET stripe_customer_id = $1 WHERE id = $2`,
        [customerId, tenantId],
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/billing?success=1`,
      cancel_url: `${appUrl}/billing?canceled=1`,
      metadata: { tenantId },
      subscription_data: { metadata: { tenantId } },
    });

    return Response.json({ url: session.url });
  } catch (err) {
    console.error('[api/billing/checkout]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
