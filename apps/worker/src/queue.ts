import { Queue, Worker, type Job } from 'bullmq';
import { runInitialSync } from './sync/initial-sync.js';
import { processResumeJob } from './resume/process-resume.js';
import { LexwareClient } from '@lexware/client';
import { query } from '@lexware/db';
import { extractPdfText } from './processor/pdf-extractor.js';
import { classifyDocument as classifyDocumentType } from './processor/document-classifier.js';
import { matchFingerprint } from './processor/fingerprint-matcher.js';
import { scoreComplexity } from './processor/complexity-scorer.js';
import { createException } from './exceptions/exception-manager.js';
import { AnthropicClassifier } from './classifier/anthropic-client.js';
import { classifyDocument } from './classifier/classify.js';
import { verifyMath } from './classifier/math-verifier.js';
import { buildVoucherPayloads } from './voucher/voucher-builder.js';
import { updateKnowledge } from './learning/update-knowledge.js';
import { getPostingCategories } from './categories.js';
import type { TenantProfile } from './types.js';
import type { TaxTypeHint } from './processor/document-classifier.js';

export interface DocumentJobMetadata {
  integrationType?: 'sumup' | 'hellocash' | 'lieferando';
  paymentMethod?: 'cash' | 'card';
  jobSubtype?: 'revenue' | 'fees';
  isExternalService13b?: boolean;
  vendorVatId?: string;
  kassenbuchEntries?: number;
}

export interface DocumentJob {
  tenantId: string;
  fileBuffer: Buffer;
  metadata?: DocumentJobMetadata;
  mimeType: string;
  source: 'email' | 'upload' | 'integration';
  receivedAt: string;
}

interface TenantRow {
  id: string;
  lexware_org: string;
  company_name: string;
  business_type: string | null;
  approval_threshold: number;
}

async function getTenant(tenantId: string): Promise<TenantProfile> {
  let row: TenantRow | undefined;
  try {
    const res = await query<TenantRow>(
      `SELECT id, lexware_org, company_name, business_type, approval_threshold
         FROM tenant_profiles
        WHERE lexware_org = $1 OR id::text = $1
        LIMIT 1`,
      [tenantId],
    );
    row = res.rows[0];
  } catch {
    // DB unavailable — use env key
  }

  const lexofficeApiKey = process.env.LEXWARE_OFFICE_API_KEY ?? process.env.LEXWARE_API_KEY ?? '';
  const businessType = row?.business_type ?? 'general';

  return {
    id: row?.id ?? tenantId,
    lexwareOrg: row?.lexware_org ?? tenantId,
    lexofficeApiKey,
    companyName: row?.company_name ?? 'Unknown',
    industryOperationalLens: deriveIndustryLens(businessType),
    taxFramework: 'Standard German VAT (19% / 7%)',
    smallBusiness: false,
    approvalThreshold: row?.approval_threshold ?? 5000,
  };
}

function deriveIndustryLens(businessType: string): string {
  const map: Record<string, string> = {
    restaurant: 'Restaurant & Food Service (7% on delivery, 19% in-house)',
    ecommerce: 'E-Commerce & Online Retail',
    consulting: 'Professional Services & Consulting',
    construction: 'Construction & Trades (§13b awareness)',
    retail: 'Retail',
  };
  return map[businessType.toLowerCase()] ?? `General Business (${businessType})`;
}

async function processDocument(job: Job<DocumentJob>): Promise<object> {
  const { tenantId, mimeType, source } = job.data;

  console.log(`[worker] Processing job ${job.id} — tenant=${tenantId} source=${source}`);

  // Step 1: Get tenant config
  const tenant = await getTenant(tenantId);
  const lexwareClient = new LexwareClient(tenant.lexofficeApiKey);

  // Step 2: Extract PDF text
  const buffer = Buffer.isBuffer(job.data.fileBuffer)
    ? job.data.fileBuffer
    : Buffer.from(job.data.fileBuffer);
  const extracted = await extractPdfText(buffer);

  // Step 3: Classify document type
  let { documentType, taxTypeHint } = classifyDocumentType(extracted);

  // Override tax type from integration metadata (parser already determined this)
  const meta = job.data.metadata;
  if (meta?.isExternalService13b) taxTypeHint = 'externalService13b' as TaxTypeHint;

  console.log(`[worker] Job ${job.id} classified: type=${documentType} tax=${taxTypeHint}${meta ? ` [${meta.integrationType}/${meta.jobSubtype ?? ''}]` : ''}`);

  // Step 4: Match vendor fingerprint
  const fingerprint = await matchFingerprint(extracted, tenant.lexwareOrg);
  console.log(
    `[worker] Job ${job.id} fingerprint: matched=${fingerprint.matched} ` +
    `vendor=${fingerprint.vendorName ?? 'unknown'} examples=${fingerprint.classificationExamples.length}`,
  );

  // ── Tier 1: fingerprint bypass ──────────────────────────────────────────────
  if (
    fingerprint.matched &&
    fingerprint.classificationExamples.length >= 3 &&
    fingerprint.documentTypeRule !== null
  ) {
    console.log(`[worker] Job ${job.id} — TIER 1 hit for vendor "${fingerprint.vendorName}", skipping LLM`);
    const { buildVoucherFromFingerprint } = await import('./voucher/fingerprint-voucher.js');
    const { payloads } = buildVoucherFromFingerprint(fingerprint, extracted);

    for (const payload of payloads) {
      const voucherResult = await lexwareClient.writeRequest<{ id: string }>(
        '/v1/vouchers', 'POST', payload,
      );
      if (voucherResult?.ok) {
        const voucherId = voucherResult.data.id;
        const fileBuffer = Buffer.isBuffer(job.data.fileBuffer)
          ? job.data.fileBuffer
          : Buffer.from(job.data.fileBuffer);
        await lexwareClient.fileUpload(`/v1/vouchers/${voucherId}/files`, {
          buffer: fileBuffer,
          fileName: `doc-tier1-${Date.now()}.pdf`,
          mimeType: job.data.mimeType,
        });
        await query(
          `UPDATE vendor_fingerprints SET usage_count = usage_count + 1, last_used_at = NOW()
           WHERE id = $1`,
          [fingerprint.fingerprintId],
        );
        console.log(`[worker] Job ${job.id} — TIER 1 voucher posted: ${voucherId}`);
      }
    }
    try {
      await query(
        `INSERT INTO usage_events (tenant_id, event_type, count, metadata)
         VALUES ($1, 'doc_processed', 1, $2::jsonb)`,
        [tenant.id, JSON.stringify({ tier: 1, voucherCount: payloads.length })],
      );
      await query(
        `INSERT INTO usage_monthly (tenant_id, year_month, docs_processed, tier1_count)
         VALUES ($1, TO_CHAR(NOW(), 'YYYY-MM'), 1, 1)
         ON CONFLICT (tenant_id, year_month) DO UPDATE SET
           docs_processed = usage_monthly.docs_processed + 1,
           tier1_count = usage_monthly.tier1_count + 1,
           updated_at = NOW()`,
        [tenant.id],
      );
    } catch (err) {
      console.warn('[worker] Usage tracking failed (non-fatal):', err);
    }
    void (async () => {
      try {
        const snippet = extracted.cleanText.slice(0, 200);
        const dominantCategoryId = fingerprint.classificationExamples
          .reduce<Record<string, number>>((acc, ex) => {
            acc[ex.targetCategoryUuid] = (acc[ex.targetCategoryUuid] ?? 0) + 1;
            return acc;
          }, {});
        const categoryId = Object.entries(dominantCategoryId)
          .sort(([, a], [, b]) => b - a)[0]?.[0];
        if (categoryId && snippet) {
          await query(
            `INSERT INTO classification_examples
               (tenant_id, text_snippet, category_id, tax_type, voucher_type, source)
             VALUES (
               (SELECT id FROM tenant_profiles WHERE lexware_org = $1 OR id::text = $1 LIMIT 1),
               $2, $3, 'gross', 'purchaseinvoice', 'auto'
             )
             ON CONFLICT DO NOTHING`,
            [tenant.lexwareOrg, snippet, categoryId],
          );
        }
      } catch (err) {
        console.warn('[tier1] classification_examples reinforcement failed (non-fatal):', err);
      }
    })();
    return { processed: payloads.length, tier: 1 };
  }

  // Step 5: Score complexity
  const complexity = scoreComplexity({ doc: extracted, fingerprint, documentType, taxTypeHint, approvalThreshold: tenant.approvalThreshold });
  console.log(
    `[worker] Job ${job.id} complexity: score=${complexity.score} ` +
    `triggers=[${complexity.triggers.map((t) => t.id).join(', ')}]`,
  );

  // Step 6: Route to exception manager if clarification needed
  if (complexity.requiresClarification) {
    const exception = await createException(
      job.data,
      extracted,
      complexity,
      lexwareClient,
      tenant.lexwareOrg,
    );
    console.log(
      `[worker] Job ${job.id} → exception created id=${exception.id} ` +
      `draft=${exception.lexwareDraftVoucherId ?? 'none'}`,
    );
    return { processed: 0, exceptionId: exception.id };
  }

  // Step 7: LLM Classification
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? '';
  const anthropicClient = new AnthropicClassifier(anthropicApiKey);
  const postingCategories = await getPostingCategories(tenant.lexwareOrg, lexwareClient);

  const classificationResult = await classifyDocument(
    extracted,
    fingerprint,
    documentType,
    taxTypeHint,
    tenant,
    postingCategories,
    buffer,
    anthropicClient,
  );

  console.log(
    `[worker] Job ${job.id} classified by LLM: kind=${classificationResult.kind} ` +
    `confidence=${classificationResult.confidence.toFixed(2)} pass=${classificationResult.passUsed}`,
  );

  // Handle LLM requesting clarification
  if (classificationResult.kind === 'clarification_needed') {
    const { scoreComplexity: sc } = await import('./processor/complexity-scorer.js');
    const syntheticComplexity = {
      score: 1,
      triggers: [{
        id: 'llm_clarification',
        severity: 'blocking' as const,
        question: classificationResult.data.question,
      }],
      requiresClarification: true,
    };
    const exception = await createException(
      job.data,
      extracted,
      syntheticComplexity,
      lexwareClient,
      tenant.lexwareOrg,
    );
    return { processed: 0, exceptionId: exception.id };
  }

  // Step 8: Math verification
  const mathResult = verifyMath(classificationResult, extracted);
  console.log(
    `[worker] Job ${job.id} math: passed=${mathResult.passed} ` +
    `calculated=€${mathResult.calculatedGross} stated=€${mathResult.statedGross}`,
  );

  // Step 9: Build and post voucher(s)
  const { payloads, loanFlagNote } = buildVoucherPayloads(
    classificationResult,
    extracted,
    fingerprint,
    mathResult,
  );

  const results: Array<{ voucherId: string; status: string }> = [];

  for (const payload of payloads) {
    const voucherResult = await lexwareClient.writeRequest<{ id: string }>(
      '/v1/vouchers',
      'POST',
      payload,
    );
    if (!voucherResult?.ok) {
      console.error(`[worker] Job ${job.id} voucher POST failed`, voucherResult);
      continue;
    }
    const voucherId = voucherResult.data.id;

    // Attach PDF to voucher
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([buffer], { type: mimeType }),
      `${voucherId}.pdf`,
    );
    await lexwareClient.multipartRequest(`/v1/vouchers/${voucherId}/files`, formData);

    results.push({ voucherId, status: payload.voucherStatus });
    console.log(`[worker] Job ${job.id} voucher created id=${voucherId} status=${payload.voucherStatus}`);
  }

  if (loanFlagNote) {
    console.warn(`[worker] Job ${job.id} LOAN FLAG: ${loanFlagNote}`);
  }

  // Step 10: Learn from this document (fire-and-forget — never blocks voucher creation)
  if (results.some((r) => r.status === 'open')) {
    void updateKnowledge(extracted, fingerprint, classificationResult, tenant.lexwareOrg)
      .catch((err) => console.error('[worker] updateKnowledge failed:', err));
  }

  // Step 11: Usage tracking (Tier 2)
  if (results.length > 0) {
    try {
      await query(
        `INSERT INTO usage_events (tenant_id, event_type, count, metadata)
         VALUES ($1, 'doc_processed', 1, $2::jsonb)`,
        [tenant.id, JSON.stringify({ tier: 2, voucherCount: results.length })],
      );
      await query(
        `INSERT INTO usage_monthly (tenant_id, year_month, docs_processed, tier2_count)
         VALUES ($1, TO_CHAR(NOW(), 'YYYY-MM'), 1, 1)
         ON CONFLICT (tenant_id, year_month) DO UPDATE SET
           docs_processed = usage_monthly.docs_processed + 1,
           tier2_count = usage_monthly.tier2_count + 1,
           updated_at = NOW()`,
        [tenant.id],
      );
    } catch (err) {
      console.warn('[worker] Usage tracking failed (non-fatal):', err);
    }
  }

  return { processed: results.length, vouchers: results };
}

// ── Queue & Worker setup ──────────────────────────────────────────────────────

export const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
};

export const documentQueue = new Queue<DocumentJob>('document-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export const documentWorker = new Worker<DocumentJob>(
  'document-processing',
  processDocument,
  {
    connection,
    concurrency: 5,
    limiter: { max: 1, duration: 1000 },
  },
);

documentWorker.on('completed', (job) => {
  console.log(`[worker] Job ${job.id} completed`);
});

documentWorker.on('failed', (job, err) => {
  console.error(`[worker] Job ${job?.id} failed: ${err.message}`);
});

// ── Initial sync queue ────────────────────────────────────────────────────────

export interface InitialSyncJob {
  tenantId: string;
  lexwareApiKey: string;
}

export const initialSyncQueue = new Queue<InitialSyncJob>('initial-sync', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 20 },
  },
});

const initialSyncWorker = new Worker<InitialSyncJob>(
  'initial-sync',
  async (job) => {
    console.log(`[initial-sync] Starting for tenant ${job.data.tenantId}`);
    await runInitialSync(job.data.tenantId, job.data.lexwareApiKey);
  },
  { connection, concurrency: 2 },
);

initialSyncWorker.on('completed', (job) => {
  console.log(`[initial-sync] Job ${job.id} complete for tenant ${job.data.tenantId}`);
});

initialSyncWorker.on('failed', (job, err) => {
  console.error(`[initial-sync] Job ${job?.id} failed: ${err.message}`);
});

// ── Resume-classification queue ───────────────────────────────────────────────

export interface ResumeJob {
  exceptionId: string;
  tenantId: string;
}

export const resumeQueue = new Queue<ResumeJob>('resume-classification', {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
});

const resumeWorker = new Worker<ResumeJob>(
  'resume-classification',
  async (job) => {
    console.log(`[resume] Processing exception ${job.data.exceptionId}`);
    await processResumeJob(job.data.exceptionId, job.data.tenantId);
  },
  { connection, concurrency: 3 },
);

resumeWorker.on('completed', (job) => {
  console.log(`[resume] Job ${job.id} — exception ${job.data.exceptionId} resolved`);
});

resumeWorker.on('failed', (job, err) => {
  console.error(`[resume] Job ${job?.id} failed: ${err.message}`);
});
