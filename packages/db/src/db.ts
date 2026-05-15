import pg from 'pg';

const { Pool } = pg;

export type { PoolClient } from 'pg';

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(sql, params);
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

// ── Tenant helpers ────────────────────────────────────────────────────────────

export interface TenantRow {
  id: string;
  lexware_org: string;
  company_name: string;
  vat_id: string | null;
  business_type: string | null;
  industry_operational_lens: string | null;
  approval_threshold: number;
  setup_complete: boolean;
  setup_step: number | null;
  slug: string | null;
  inbound_email: string | null;
  lexoffice_api_key_encrypted: string | null;
  lexoffice_api_key_hash: string | null;
  lexware_voucher_webhook_id: string | null;
  lexware_payment_webhook_id: string | null;
  auto_post_enabled: boolean;
  supabase_user_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: 'free' | 'starter' | 'pro' | 'agency';
  created_at: string;
  updated_at: string | null;
}

const TENANT_COLS = `
  id, lexware_org, company_name, vat_id, business_type, industry_operational_lens,
  approval_threshold, setup_complete, setup_step, slug, inbound_email,
  lexoffice_api_key_encrypted, lexoffice_api_key_hash,
  lexware_voucher_webhook_id, lexware_payment_webhook_id,
  auto_post_enabled, supabase_user_id,
  stripe_customer_id, stripe_subscription_id, plan,
  created_at, updated_at
`;

export async function getTenantBySlug(slug: string): Promise<TenantRow | null> {
  const res = await query<TenantRow>(
    `SELECT ${TENANT_COLS} FROM tenant_profiles WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  return res.rows[0] ?? null;
}

export async function getTenantByApiKeyHash(hash: string): Promise<TenantRow | null> {
  const res = await query<TenantRow>(
    `SELECT ${TENANT_COLS} FROM tenant_profiles WHERE lexoffice_api_key_hash = $1 LIMIT 1`,
    [hash],
  );
  return res.rows[0] ?? null;
}

export async function getTenantById(id: string): Promise<TenantRow | null> {
  const res = await query<TenantRow>(
    `SELECT ${TENANT_COLS} FROM tenant_profiles WHERE id = $1 LIMIT 1`,
    [id],
  );
  return res.rows[0] ?? null;
}

// ── Exception file helpers ────────────────────────────────────────────────────

export interface ExceptionFileRow {
  id: string;
  tenant_id: string;
  payload: Record<string, unknown>;
  reference_docs: Array<{ filename: string; base64: string; uploadedAt: string; size: number }>;
  original_file_base64: string | null;
  original_mime_type: string;
  status: string;
}

export interface ClarificationSessionRow {
  id: string;
  question: string;
  context_json: { triggerId?: string; exceptionId?: string; referenceDocs?: string[] } | null;
  answer: string | null;
  status: string;
}

export interface ExceptionWithFileResult {
  exception: ExceptionFileRow;
  sessions: ClarificationSessionRow[];
  fileBuffer: Buffer;
  mimeType: string;
}

export async function getExceptionWithFile(
  exceptionId: string,
): Promise<ExceptionWithFileResult | null> {
  const exRes = await query<ExceptionFileRow>(
    `SELECT id, tenant_id,
            COALESCE(payload, '{}'::jsonb) AS payload,
            COALESCE(reference_docs, '[]'::jsonb) AS reference_docs,
            original_file_base64,
            COALESCE(original_mime_type, 'application/pdf') AS original_mime_type,
            status
       FROM exception_queue
      WHERE id = $1 LIMIT 1`,
    [exceptionId],
  );

  const row = exRes.rows[0];
  if (!row || !row.original_file_base64) return null;

  const sessRes = await query<ClarificationSessionRow>(
    `SELECT id, question, context_json, answer, status
       FROM clarification_sessions
      WHERE context_json->>'exceptionId' = $1
      ORDER BY asked_at ASC`,
    [exceptionId],
  );

  const fileBuffer = Buffer.from(row.original_file_base64, 'base64');

  return {
    exception: row,
    sessions: sessRes.rows,
    fileBuffer,
    mimeType: row.original_mime_type,
  };
}
