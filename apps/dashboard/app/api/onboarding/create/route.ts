import { LexwareClient } from '@lexware/client';
import { encryptSecret, hashApiKey } from '@lexware/crypto';
import { getBusinessType, type BusinessTypeId } from '@lexware/client';
import { query } from '@lexware/db';

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c] ?? c))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20)
    .replace(/-$/g, '');
}

async function findUniqueSlug(base: string): Promise<string> {
  const res = await query<{ slug: string }>(
    `SELECT slug FROM tenant_profiles WHERE slug LIKE $1`,
    [`${base}%`],
  );
  const taken = new Set(res.rows.map((r: { slug: string }) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base.slice(0, 17)}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base.slice(0, 16)}-${Date.now().toString(36).slice(-4)}`;
}

interface LexwareProfile {
  companyName?: string;
  vatRegistrationId?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: { apiKey?: string; businessTypeId?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.apiKey?.trim() || !body.businessTypeId) {
    return Response.json({ error: 'apiKey and businessTypeId required' }, { status: 400 });
  }

  const apiKey = body.apiKey.trim();

  // Re-validate key
  let profile: LexwareProfile;
  try {
    const client = new LexwareClient(apiKey);
    const p = await client.request<LexwareProfile>('/v1/profile');
    if (!p) return Response.json({ error: 'Invalid API key' }, { status: 401 });
    profile = p;
  } catch {
    return Response.json({ error: 'Could not reach Lexware API' }, { status: 502 });
  }

  const businessType = getBusinessType(body.businessTypeId as BusinessTypeId);
  if (!businessType) {
    return Response.json({ error: 'Invalid businessTypeId' }, { status: 400 });
  }

  const companyName = profile.companyName ?? 'Unknown Company';
  const baseSlug = generateSlug(companyName);

  try {
    const slug = await findUniqueSlug(baseSlug);
    const encryptedKey = encryptSecret(apiKey);
    const keyHash = hashApiKey(apiKey);
    const inboundDomain = process.env.INBOUND_EMAIL_DOMAIN ?? 'inbound.example.com';
    const inboundEmail = `${slug}@${inboundDomain}`;

    const res = await query<{ id: string }>(
      `INSERT INTO tenant_profiles
         (lexware_org, company_name, vat_id, slug, inbound_email,
          lexoffice_api_key_encrypted, lexoffice_api_key_hash,
          business_type, industry_operational_lens,
          setup_complete, setup_step, approval_threshold)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, 2, 5000)
       RETURNING id`,
      [
        slug,
        companyName,
        profile.vatRegistrationId ?? null,
        slug,
        inboundEmail,
        encryptedKey,
        keyHash,
        businessType.id,
        businessType.lens,
      ],
    );

    const tenantId = res.rows[0].id;

    // Seed initial sync progress
    await query(
      `INSERT INTO initial_sync_progress (tenant_id, status)
       VALUES ($1, 'pending')
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId],
    );

    return Response.json({ tenantId, slug, inboundEmail });
  } catch (err) {
    console.error('[onboarding/create]', err);
    return Response.json({ error: 'Database error' }, { status: 500 });
  }
}
