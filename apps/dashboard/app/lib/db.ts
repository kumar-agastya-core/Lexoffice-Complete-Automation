import { query, getTenantById } from '@lexware/db';

export { getTenantById };

export interface ClarificationSession {
  id: string;
  question: string;
  context_json: Record<string, unknown> | null;
  answer: string | null;
  status: 'open' | 'answered' | 'timed_out';
  asked_at: string;
  answered_at: string | null;
}

export interface ExceptionPayload {
  lexwareDraftVoucherId?: string;
  resolvedVoucherId?: string;
  [key: string]: unknown;
}

export interface ExceptionRow {
  id: string;
  tenant_id: string;
  job_id: string | null;
  reason: string;
  payload: ExceptionPayload;
  reference_docs: Array<{ filename: string; base64: string; uploadedAt: string; size: number }>;
  original_file_base64: string | null;
  original_mime_type: string;
  status: string;
  created_at: string;
  sessions: ClarificationSession[];
}

export async function getException(id: string): Promise<ExceptionRow | null> {
  const res = await query<Omit<ExceptionRow, 'sessions'>>(
    `SELECT id, tenant_id, job_id, reason,
            COALESCE(payload, '{}'::jsonb) AS payload,
            COALESCE(reference_docs, '[]'::jsonb) AS reference_docs,
            original_file_base64,
            COALESCE(original_mime_type, 'application/pdf') AS original_mime_type,
            status, created_at
       FROM exception_queue WHERE id = $1 LIMIT 1`,
    [id],
  );
  const row = res.rows[0];
  if (!row) return null;

  const sessRes = await query<ClarificationSession>(
    `SELECT id, question, context_json, answer, status, asked_at, answered_at
       FROM clarification_sessions
      WHERE context_json->>'exceptionId' = $1
      ORDER BY asked_at ASC`,
    [id],
  );

  return { ...row, sessions: sessRes.rows };
}

interface ExceptionListRow {
  id: string;
  tenant_id: string;
  reason: string;
  status: string;
  created_at: string;
  payload: Record<string, unknown>;
  pending_sessions: string;
}

export async function getExceptions(
  tenantId: string,
  status: string,
  page: number,
  pageSize: number,
): Promise<{ rows: ExceptionListRow[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const statusFilter =
    status === 'all'
      ? ''
      : status === 'resolved'
        ? `AND eq.status = 'resolved'`
        : `AND eq.status IN ('pending', 'awaiting_approval')`;

  const [dataRes, countRes] = await Promise.all([
    query<ExceptionListRow>(
      `SELECT eq.id, eq.tenant_id, eq.reason, eq.status, eq.created_at,
              COALESCE(eq.payload, '{}'::jsonb) AS payload,
              COUNT(cs.id) FILTER (WHERE cs.status = 'open') AS pending_sessions
         FROM exception_queue eq
         LEFT JOIN clarification_sessions cs
           ON cs.context_json->>'exceptionId' = eq.id::text AND cs.status = 'open'
        WHERE eq.tenant_id = $1 ${statusFilter}
        GROUP BY eq.id
        ORDER BY eq.created_at DESC
        LIMIT $2 OFFSET $3`,
      [tenantId, pageSize, offset],
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM exception_queue
        WHERE tenant_id = $1 ${statusFilter}`,
      [tenantId],
    ),
  ]);

  return { rows: dataRes.rows, total: Number(countRes.rows[0]?.count ?? 0) };
}

export async function answerClarification(
  exceptionId: string,
  sessionId: string,
  answer: string,
  contextUpdate: Record<string, unknown> | null,
): Promise<void> {
  await query(
    `UPDATE clarification_sessions
        SET answer = $1,
            status = 'answered',
            answered_at = NOW(),
            context_json = CASE
              WHEN $2::jsonb IS NOT NULL
              THEN COALESCE(context_json, '{}'::jsonb) || $2::jsonb
              ELSE context_json
            END
      WHERE id = $3 AND context_json->>'exceptionId' = $4`,
    [answer, contextUpdate ? JSON.stringify(contextUpdate) : null, sessionId, exceptionId],
  );
}

export async function allBlockersResolved(exceptionId: string): Promise<boolean> {
  const res = await query<{ open_count: string }>(
    `SELECT COUNT(*) AS open_count
       FROM clarification_sessions
      WHERE context_json->>'exceptionId' = $1 AND status = 'open'`,
    [exceptionId],
  );
  return Number(res.rows[0]?.open_count ?? 1) === 0;
}

export async function resolveException(exceptionId: string, voucherId: string): Promise<void> {
  await query(
    `UPDATE exception_queue
        SET status = 'resolved',
            resolved_by = 'api',
            resolved_at = NOW(),
            payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object('resolvedVoucherId', $2)
      WHERE id = $1`,
    [exceptionId, voucherId],
  );
}

export async function appendReferenceDoc(
  exceptionId: string,
  doc: { filename: string; base64: string; uploadedAt: string; size: number },
): Promise<void> {
  await query(
    `UPDATE exception_queue
        SET reference_docs = COALESCE(reference_docs, '[]'::jsonb) || $2::jsonb
      WHERE id = $1`,
    [exceptionId, JSON.stringify([doc])],
  );
}

interface SyncProgress {
  status: string;
  contacts_synced: number;
  fingerprints_created: number;
  categories_cached: number;
  vouchers_learned: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export async function getSyncProgress(tenantId: string): Promise<SyncProgress | null> {
  const res = await query<SyncProgress>(
    `SELECT status, contacts_synced, fingerprints_created, categories_cached,
            vouchers_learned, error_message, started_at, completed_at
       FROM initial_sync_progress WHERE tenant_id = $1 LIMIT 1`,
    [tenantId],
  );
  return res.rows[0] ?? null;
}
