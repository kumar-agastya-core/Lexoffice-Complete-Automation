import express from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  documentQueue,
  documentWorker,
  initialSyncQueue,
  resumeQueue,
} from './queue.js';
import type { DocumentJob } from './queue.js';
import { query, closePool, getTenantBySlug } from '@lexware/db';
import { verifyHmacSignature } from '@lexware/crypto';
import { extractPdfText } from './processor/pdf-extractor.js';
import { parseSumUpReport } from './integrations/sumup-parser.js';
import { sumupToDocumentJobs } from './integrations/sumup-to-jobs.js';
import { parseHelloCashReport } from './integrations/hellocash-parser.js';
import { helloCashToDocumentJobs } from './integrations/hellocash-to-jobs.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const WEBHOOK_TOKEN = process.env.POSTMARK_WEBHOOK_TOKEN;

const app = express();
app.use(express.json({ limit: '50mb' }));

// Track last completed job time for health reporting
let lastProcessedAt: string | null = null;
documentWorker.on('completed', () => {
  lastProcessedAt = new Date().toISOString();
});

// ── Postmark inbound email ─────────────────────────────────────────────────────

function verifyPostmarkToken(req: express.Request): boolean {
  if (!WEBHOOK_TOKEN) return true;
  const incoming = req.headers['x-postmark-signature'] as string | undefined;
  if (!incoming) return false;
  const body = JSON.stringify(req.body);
  const expected = createHmac('sha256', WEBHOOK_TOKEN).update(body).digest('hex');
  try {
    const a = Buffer.from(incoming);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

interface PostmarkAttachment {
  Name: string;
  Content: string;
  ContentType: string;
  ContentLength: number;
}

interface PostmarkInboundPayload {
  From?: string;
  Subject?: string;
  Attachments?: PostmarkAttachment[];
  OriginalRecipient?: string;
  ToFull?: Array<{ Email: string; Name: string }>;
  [key: string]: unknown;
}

app.post('/webhook/inbound-email', async (req, res) => {
  if (!verifyPostmarkToken(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  res.status(200).json({ ok: true });

  const payload = req.body as PostmarkInboundPayload;
  const attachments = payload.Attachments ?? [];
  const pdfs = attachments.filter(
    (a) => a.ContentType === 'application/pdf' || a.Name?.toLowerCase().endsWith('.pdf'),
  );

  if (pdfs.length === 0) {
    console.log('[webhook] No PDF attachments in inbound email');
    return;
  }

  const originalRecipient = (payload.OriginalRecipient ?? payload.ToFull?.[0]?.Email ?? '') as string;
  const slug = originalRecipient.split('@')[0]?.toLowerCase() ?? '';
  const tenantRow = slug ? await getTenantBySlug(slug) : null;
  if (!tenantRow) {
    console.warn(`[webhook] No tenant found for slug "${slug}" from ${originalRecipient}`);
    return;
  }
  const tenantId = tenantRow.id;

  for (const pdf of pdfs) {
    const fileBuffer = Buffer.from(pdf.Content, 'base64');
    const job: DocumentJob = {
      tenantId,
      fileBuffer,
      mimeType: pdf.ContentType ?? 'application/pdf',
      source: 'email',
      receivedAt: new Date().toISOString(),
    };
    await documentQueue.add(`email-${Date.now()}`, job, {
      jobId: `${tenantId}:email:${Date.now()}`,
    });
    console.log(`[webhook] Queued PDF "${pdf.Name}" for tenant ${tenantId}`);
  }
});

// ── Lexware event webhooks ─────────────────────────────────────────────────────

interface LexwareWebhookPayload {
  eventType: string;
  resourceId: string;
  createdDate: string;
}

export function verifyLexwareSignature(body: string, signature: string | undefined): boolean {
  const secret = process.env.LEXWARE_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signature) return false;
  return verifyHmacSignature(body, signature, secret);
}

app.post('/webhook/lexware', async (req, res) => {
  const rawBody = JSON.stringify(req.body);
  const signature = req.headers['x-lx-signature'] as string | undefined;

  if (!verifyLexwareSignature(rawBody, signature)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  res.status(200).json({ ok: true });

  const payload = req.body as LexwareWebhookPayload;
  const { eventType, resourceId } = payload;

  console.log(`[lexware-webhook] ${eventType} — resource ${resourceId}`);

  if (eventType === 'voucher.created') {
    console.log(`[lexware-webhook] voucher.created: ${resourceId} — logged for Phase 7`);
    return;
  }

  if (eventType === 'payment.changed') {
    try {
      await query(
        `UPDATE exception_queue
            SET payload = jsonb_set(
                  COALESCE(payload, '{}'::jsonb),
                  '{paymentChangedAt}',
                  to_jsonb(NOW()::text)
                )
          WHERE payload->>'lexwareDraftVoucherId' = $1
             OR payload->>'resolvedVoucherId' = $1`,
        [resourceId],
      );
      console.log(`[lexware-webhook] payment.changed: updated exception_queue for ${resourceId}`);
    } catch (err) {
      console.error('[lexware-webhook] payment.changed DB update failed:', err);
    }
    return;
  }

  console.log(`[lexware-webhook] Unhandled eventType: ${eventType}`);
});

// ── Integration upload endpoints ──────────────────────────────────────────────

app.post('/integrations/sumup', express.raw({ type: 'application/pdf', limit: '10mb' }), async (req, res) => {
  const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? 'default';
  try {
    const buffer: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
    const extracted = await extractPdfText(buffer);
    const data = parseSumUpReport(extracted.rawText);
    const jobs = sumupToDocumentJobs(data, tenantId, buffer);

    for (const job of jobs) {
      await documentQueue.add('integration-sumup', job);
    }

    res.json({
      queued: jobs.length,
      hasLoan: data.hasLoanRepayment,
      period: `${data.period.from} – ${data.period.to}`,
      gross: data.grossTransactions,
      fees: data.processingFees,
    });
  } catch (err) {
    console.error('[integrations/sumup]', err);
    res.status(500).json({ error: 'Processing failed' });
  }
});

app.post('/integrations/hellocash', express.raw({ type: ['application/pdf', 'text/csv'], limit: '10mb' }), async (req, res) => {
  const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? 'default';
  try {
    const buffer: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
    const extracted = await extractPdfText(buffer);
    const data = parseHelloCashReport(extracted.rawText);
    const jobs = helloCashToDocumentJobs(data, tenantId, buffer);

    for (const job of jobs) {
      await documentQueue.add('integration-hellocash', job);
    }

    res.json({
      queued: jobs.length,
      kassenbuchEntries: data.kassenbuchEntries.length,
      period: `${data.period.from} – ${data.period.to}`,
    });
  } catch (err) {
    console.error('[integrations/hellocash]', err);
    res.status(500).json({ error: 'Processing failed' });
  }
});

// ── Universal document upload ──────────────────────────────────────────────────

app.post('/document/upload', express.raw({ type: 'application/pdf', limit: '20mb' }), async (req, res) => {
  const tenantId = req.headers['x-tenant-id'] as string | undefined;
  if (!tenantId) {
    res.status(400).json({ error: 'x-tenant-id header required' });
    return;
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    res.status(400).json({ error: 'PDF body required' });
    return;
  }
  const job: DocumentJob = {
    tenantId,
    fileBuffer: req.body,
    mimeType: 'application/pdf',
    source: 'upload',
    receivedAt: new Date().toISOString(),
  };
  const jobId = `${tenantId}:upload:${Date.now()}`;
  await documentQueue.add(jobId, job, { jobId });
  console.log(`[upload] Queued document for tenant ${tenantId}, size ${req.body.length} bytes`);
  res.status(200).json({ ok: true, jobId });
});

// ── Health ─────────────────────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  const uptime = Math.floor(process.uptime());

  // DB check with 2s timeout
  let dbStatus: 'connected' | 'error' = 'error';
  try {
    await Promise.race([
      query('SELECT 1'),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    dbStatus = 'connected';
  } catch { /* remain error */ }

  // Redis check — if queue getJobCounts succeeds, Redis is alive
  let redisStatus: 'connected' | 'error' = 'error';
  let queueCounts = { waiting: 0, active: 0, completed: 0, failed: 0 };
  let resumeCounts = { waiting: 0, active: 0 };
  let syncCounts = { waiting: 0, active: 0 };
  try {
    const [docCounts, res2, sync2] = await Promise.all([
      documentQueue.getJobCounts('waiting', 'active', 'completed', 'failed'),
      resumeQueue.getJobCounts('waiting', 'active'),
      initialSyncQueue.getJobCounts('waiting', 'active'),
    ]);
    queueCounts = {
      waiting: docCounts.waiting ?? 0,
      active: docCounts.active ?? 0,
      completed: docCounts.completed ?? 0,
      failed: docCounts.failed ?? 0,
    };
    resumeCounts = { waiting: res2.waiting ?? 0, active: res2.active ?? 0 };
    syncCounts = { waiting: sync2.waiting ?? 0, active: sync2.active ?? 0 };
    redisStatus = 'connected';
  } catch { /* remain error */ }

  const status = dbStatus === 'connected' && redisStatus === 'connected'
    ? 'ok'
    : dbStatus === 'error' && redisStatus === 'error'
      ? 'error'
      : 'degraded';

  res.status(status === 'error' ? 503 : 200).json({
    status,
    uptime,
    db: dbStatus,
    redis: redisStatus,
    queues: {
      documentProcessing: queueCounts,
      resumeClassification: resumeCounts,
      initialSync: syncCounts,
    },
    lastProcessedAt,
  });
});

// ── Server startup & graceful shutdown ────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`[worker] Express server listening on port ${PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received — draining queue...`);
  server.close();

  try {
    await documentWorker.pause();
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 30_000);
      documentWorker.once('drained', () => { clearTimeout(timeout); resolve(); });
    });
    await documentWorker.close();
    await documentQueue.close();
    await resumeQueue.close();
    await initialSyncQueue.close();
    await closePool();
    console.log('[worker] Shutdown complete');
  } catch (err) {
    console.error('[worker] Shutdown error:', err);
  }
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
