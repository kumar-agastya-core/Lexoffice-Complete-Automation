import { createHash } from 'crypto';
import { query } from '@lexware/db';
import { LexwareClient } from '@lexware/client';
import type { ExtractedDocument } from '../processor/pdf-extractor.js';
import type { ComplexityResult } from '../processor/complexity-scorer.js';
import type { DocumentJob } from '../queue.js';

const ZU_PRUEFEN_CATEGORY = '8d2e71c6-09d5-439a-a295-a9e71661afcd';

export interface ExceptionRecord {
  id: string;
  tenantId: string;
  documentHash: string;
  lexwareDraftVoucherId: string | null;
  lexwareDeeplink: string | null;
  triggerReasons: string[];
  clarificationQuestions: Array<{ triggerId: string; question: string; severity: string }>;
  referenceDocsRequested: string[];
  executionPlan: unknown;
  status: 'pending';
}

export async function createException(
  job: DocumentJob,
  extracted: ExtractedDocument,
  complexity: ComplexityResult,
  lexwareClient: LexwareClient,
  tenantId: string,
): Promise<ExceptionRecord> {
  const fileBuffer = Buffer.isBuffer(job.fileBuffer)
    ? job.fileBuffer
    : Buffer.from(job.fileBuffer);

  const documentHash = createHash('sha256').update(fileBuffer).digest('hex');

  // Step 1: Create draft voucher in Lexware
  let draftVoucherId: string | null = null;
  let deeplink: string | null = null;

  const triggerIds = complexity.triggers.map((t) => t.id);
  const remark = `AUTOMATION HOLD — ${triggerIds.join(', ')}`;

  const voucherResult = await lexwareClient.writeRequest<{ id: string }>(
    '/v1/vouchers',
    'POST',
    {
      type: 'purchaseinvoice',
      voucherStatus: 'unchecked',
      voucherItems: [
        {
          categoryId: ZU_PRUEFEN_CATEGORY,
          ...(extracted.totalGrossAmount !== null
            ? { amount: extracted.totalGrossAmount }
            : {}),
        },
      ],
      remark,
    },
  );

  if (voucherResult?.ok) {
    draftVoucherId = voucherResult.data.id;
    deeplink = `https://app.lexware.de/permalink/vouchers/edit/${draftVoucherId}`;

    // Attach original PDF
    await lexwareClient.fileUpload(
      `/v1/vouchers/${draftVoucherId}/files`,
      {
        buffer: fileBuffer,
        fileName: `document-${documentHash.slice(0, 8)}.pdf`,
        mimeType: job.mimeType,
      },
    );
  }

  // Step 2: Build execution plan preview
  const executionPlan = {
    suggestedVoucherType: 'purchaseinvoice',
    extractedAmount: extracted.totalGrossAmount,
    extractedDate: extracted.invoiceDate,
    invoiceNumber: extracted.invoiceNumber,
    vatId: extracted.vatId,
    pendingTriggers: triggerIds,
    willProceedAfterClarification: true,
  };

  // Step 3: Insert into exception_queue
  const referenceDocsRequested = complexity.triggers
    .filter((t) => t.referenceDocs)
    .flatMap((t) => t.referenceDocs as string[]);

  const exceptionPayload = {
    documentHash,
    lexwareDraftVoucherId: draftVoucherId,
    lexwareDeeplink: deeplink,
    triggerReasons: triggerIds,
    clarificationQuestions: complexity.triggers.map((t) => ({
      triggerId: t.id,
      question: t.question,
      severity: t.severity,
    })),
    referenceDocsRequested,
    executionPlan,
    source: job.source,
    receivedAt: job.receivedAt,
  };

  const insertResult = await query<{ id: string }>(
    `INSERT INTO exception_queue (tenant_id, job_id, reason, payload, status)
     VALUES (
       (SELECT id FROM tenant_profiles WHERE lexware_org = $1 LIMIT 1),
       $2, $3, $4::jsonb, 'pending'
     )
     RETURNING id`,
    [
      tenantId,
      job.tenantId,
      remark,
      JSON.stringify(exceptionPayload),
    ],
  );

  const exceptionId = insertResult.rows[0]?.id ?? 'unknown';

  // Store original file for resume flow
  await query(
    `UPDATE exception_queue
        SET original_file_base64 = $1, original_mime_type = $2
      WHERE id = $3`,
    [fileBuffer.toString('base64'), job.mimeType, exceptionId],
  );

  // Step 4: Insert one clarification_session per blocking trigger
  const blockingTriggers = complexity.triggers.filter((t) => t.severity === 'blocking');
  for (const trigger of blockingTriggers) {
    await query(
      `INSERT INTO clarification_sessions
         (tenant_id, job_id, question, context_json, status)
       VALUES (
         (SELECT id FROM tenant_profiles WHERE lexware_org = $1 LIMIT 1),
         $2, $3, $4::jsonb, 'open'
       )`,
      [
        tenantId,
        job.tenantId,
        trigger.question,
        JSON.stringify({ triggerId: trigger.id, exceptionId, referenceDocs: trigger.referenceDocs ?? [] }),
      ],
    );
  }

  // Step 5: Return the exception record
  return {
    id: exceptionId,
    tenantId,
    documentHash,
    lexwareDraftVoucherId: draftVoucherId,
    lexwareDeeplink: deeplink,
    triggerReasons: triggerIds,
    clarificationQuestions: exceptionPayload.clarificationQuestions,
    referenceDocsRequested,
    executionPlan,
    status: 'pending',
  };
}
