import { requireAuth, getTenantId } from '@/app/lib/auth';
import { query, getTenantBySlug } from '@lexware/db';

interface ClientRow {
  id: string;
  company_name: string;
  business_type: string | null;
  inbound_email: string | null;
  setup_complete: boolean;
  created_at: string;
  pending_exceptions: string;
  awaiting_approval: string;
  total_docs: string;
  last_doc_at: string | null;
  fingerprint_count: string;
}

export async function GET(request: Request): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  const agencyId = getTenantId();

  try {
    const typeCheck = await query<{ business_type: string | null }>(
      `SELECT business_type FROM tenant_profiles WHERE id = $1`,
      [agencyId],
    );
    if (typeCheck.rows[0]?.business_type !== 'agency') {
      return Response.json(
        { error: 'Nur für Buchhalter-Konten verfügbar' },
        { status: 403 },
      );
    }

    const res = await query<ClientRow>(
      `SELECT
          tp.id, tp.company_name, tp.business_type, tp.inbound_email,
          tp.setup_complete, tp.created_at,
          COUNT(eq.id) FILTER (WHERE eq.status = 'pending') AS pending_exceptions,
          COUNT(eq.id) FILTER (WHERE eq.status = 'awaiting_approval') AS awaiting_approval,
          COUNT(eq.id) AS total_docs,
          MAX(eq.created_at) AS last_doc_at,
          COUNT(vf.id) AS fingerprint_count
       FROM agency_clients ac
       JOIN tenant_profiles tp ON tp.id = ac.client_tenant_id
       LEFT JOIN exception_queue eq ON eq.tenant_id = tp.id
         AND eq.created_at >= NOW() - INTERVAL '30 days'
       LEFT JOIN vendor_fingerprints vf ON vf.tenant_id = tp.id
       WHERE ac.agency_tenant_id = $1
       GROUP BY tp.id
       ORDER BY pending_exceptions DESC, tp.company_name ASC`,
      [agencyId],
    );

    const clients = res.rows.map((row) => {
      const total = Number(row.total_docs);
      const open = Number(row.pending_exceptions) + Number(row.awaiting_approval);
      const automationRate = total > 0
        ? Math.round(((total - open) / total) * 100)
        : 0;
      return {
        id: row.id,
        companyName: row.company_name,
        businessType: row.business_type,
        inboundEmail: row.inbound_email,
        setupComplete: row.setup_complete,
        createdAt: row.created_at,
        pendingExceptions: Number(row.pending_exceptions),
        awaitingApproval: Number(row.awaiting_approval),
        openExceptions: open,
        totalDocs: total,
        lastDocAt: row.last_doc_at,
        fingerprintCount: Number(row.fingerprint_count),
        automationRate,
      };
    });

    return Response.json({ clients });
  } catch (err) {
    console.error('[api/mandanten GET]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  const agencyId = getTenantId();

  let body: { slug?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.slug?.trim()) {
    return Response.json({ error: 'slug required' }, { status: 400 });
  }

  try {
    const client = await getTenantBySlug(body.slug.trim());
    if (!client) {
      return Response.json({ error: 'Kein Konto mit dieser Slug gefunden' }, { status: 404 });
    }
    if (client.id === agencyId) {
      return Response.json({ error: 'Cannot add yourself as a client' }, { status: 400 });
    }

    await query(
      `INSERT INTO agency_clients (agency_tenant_id, client_tenant_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [agencyId, client.id],
    );

    return Response.json({ ok: true, clientId: client.id });
  } catch (err) {
    console.error('[api/mandanten POST]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
