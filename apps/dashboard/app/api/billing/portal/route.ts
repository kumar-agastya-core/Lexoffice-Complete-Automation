import { requireAuth, getTenantId } from '@/app/lib/auth';
import { query } from '@lexware/db';
import { stripe } from '@/app/lib/stripe';

export async function POST(request: Request): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  const tenantId = getTenantId();

  try {
    const res = await query<{ stripe_customer_id: string | null; plan: string }>(
      `SELECT stripe_customer_id, plan FROM tenant_profiles WHERE id = $1`,
      [tenantId],
    );
    const tenant = res.rows[0];
    if (!tenant) return Response.json({ error: 'Tenant not found' }, { status: 404 });

    if (!tenant.stripe_customer_id || tenant.plan === 'free') {
      return Response.json({ error: 'Kein aktives Abonnement' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: `${appUrl}/billing`,
    });

    return Response.json({ url: session.url });
  } catch (err) {
    console.error('[api/billing/portal]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
