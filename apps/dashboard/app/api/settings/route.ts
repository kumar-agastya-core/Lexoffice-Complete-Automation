import { requireAuth, getTenantId } from '@/app/lib/auth';
import { query } from '@lexware/db';
import { encryptSecret, hashApiKey } from '@lexware/crypto';
import { LexwareClient } from '@lexware/client';

export async function GET(request: Request): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  try {
    const tenantId = getTenantId();
    const res = await query<{
      company_name: string;
      vat_id: string | null;
      business_type: string | null;
      approval_threshold: string;
      auto_post_enabled: boolean;
      lexoffice_api_key_hash: string | null;
    }>(
      `SELECT company_name, vat_id, business_type, approval_threshold, auto_post_enabled,
              lexoffice_api_key_hash
         FROM tenant_profiles WHERE id = $1 LIMIT 1`,
      [tenantId],
    );

    const row = res.rows[0];
    if (!row) return Response.json({ error: 'Tenant not found' }, { status: 404 });

    return Response.json({
      companyName: row.company_name,
      vatId: row.vat_id,
      businessType: row.business_type,
      approvalThreshold: Number(row.approval_threshold),
      autoPost: row.auto_post_enabled,
      hasApiKey: row.lexoffice_api_key_hash !== null,
    });
  } catch (err) {
    console.error('[api/settings GET]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  let body: {
    approvalThreshold?: number;
    autoPost?: boolean;
    apiKey?: string;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const tenantId = getTenantId();
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (body.approvalThreshold !== undefined) {
      const val = Number(body.approvalThreshold);
      if (isNaN(val) || val < 0) {
        return Response.json({ error: 'approvalThreshold must be a non-negative number' }, { status: 400 });
      }
      setClauses.push(`approval_threshold = $${idx++}`);
      params.push(val);
    }

    if (body.autoPost !== undefined) {
      setClauses.push(`auto_post_enabled = $${idx++}`);
      params.push(Boolean(body.autoPost));
    }

    if (body.apiKey !== undefined) {
      const key = body.apiKey.trim();
      if (!key) {
        return Response.json({ error: 'apiKey cannot be empty' }, { status: 400 });
      }
      try {
        const client = new LexwareClient(key);
        const profile = await client.request<{ companyName?: string }>('/v1/profile');
        if (!profile) throw new Error('null profile');
      } catch {
        return Response.json({ error: 'Invalid Lexware API key — validation failed' }, { status: 422 });
      }
      setClauses.push(`lexoffice_api_key_encrypted = $${idx++}`);
      params.push(encryptSecret(key));
      setClauses.push(`lexoffice_api_key_hash = $${idx++}`);
      params.push(hashApiKey(key));
    }

    if (setClauses.length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(tenantId);

    await query(
      `UPDATE tenant_profiles SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      params,
    );

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/settings PATCH]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
