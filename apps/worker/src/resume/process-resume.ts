import { getExceptionWithFile, query } from '@lexware/db';
import { LexwareClient } from '@lexware/client';
import { decryptSecret } from '@lexware/crypto';
import { getTenantById } from '@lexware/db';
import { extractPdfText } from '../processor/pdf-extractor.js';
import { classifyDocument as classifyDocType } from '../processor/document-classifier.js';
import { matchFingerprint } from '../processor/fingerprint-matcher.js';
import { classifyDocument } from '../classifier/classify.js';
import type { ClarificationContext } from '../classifier/classify.js';
import { AnthropicClassifier } from '../classifier/anthropic-client.js';
import { verifyMath } from '../classifier/math-verifier.js';
import { buildVoucherPayloads } from '../voucher/voucher-builder.js';
import { getPostingCategories } from '../categories.js';
import type { TenantProfile } from '../types.js';

async function getDecryptedApiKey(tenantId: string): Promise<string> {
  const tenant = await getTenantById(tenantId);
  if (tenant?.lexoffice_api_key_encrypted) {
    try {
      return decryptSecret(tenant.lexoffice_api_key_encrypted);
    } catch {
      // Fallback to env var
    }
  }
  return process.env.LEXWARE_OFFICE_API_KEY ?? process.env.LEXWARE_API_KEY ?? '';
}

async function buildTenantProfile(tenantId: string, apiKey: string): Promise<TenantProfile> {
  const row = await getTenantById(tenantId).catch(() => null);
  return {
    id: tenantId,
    lexwareOrg: row?.lexware_org ?? tenantId,
    lexofficeApiKey: apiKey,
    companyName: row?.company_name ?? 'Unknown',
    industryOperationalLens: row?.industry_operational_lens ?? 'General Business',
    taxFramework: 'Standard German VAT (19% / 7%)',
    smallBusiness: false,
    approvalThreshold: row?.approval_threshold ?? 5000,
  };
}

export async function extractTextFromReferenceDocs(
  referenceDocs: Array<{ base64: string; filename?: string }>,
): Promise<string | undefined> {
  if (!referenceDocs.length) return undefined;
  const texts: string[] = [];
  for (const doc of referenceDocs) {
    try {
      const buf = Buffer.from(doc.base64, 'base64');
      const extracted = await extractPdfText(buf);
      texts.push(`[${doc.filename ?? 'reference'}]\n${extracted.cleanText.slice(0, 800)}`);
    } catch {
      // Skip unreadable docs
    }
  }
  return texts.length > 0 ? texts.join('\n\n---\n\n') : undefined;
}

export async function processResumeJob(exceptionId: string, tenantId: string): Promise<void> {
  // Step 1: Load exception data + original file
  const exceptionData = await getExceptionWithFile(exceptionId);
  if (!exceptionData) throw new Error(`Exception ${exceptionId} not found or has no stored file`);

  const { exception, sessions, fileBuffer, mimeType } = exceptionData;

  // Step 2: Build clarification context
  const answeredSessions = sessions.filter((s) => s.answer !== null);
  const referenceDocText = exception.reference_docs?.length
    ? await extractTextFromReferenceDocs(exception.reference_docs)
    : undefined;

  const clarificationContext: ClarificationContext = {
    answeredQuestions: answeredSessions.map((s) => ({
      triggerId: s.context_json?.triggerId ?? s.id,
      question: s.question,
      answer: s.answer!,
    })),
    referenceDocText,
  };

  // Step 3: Re-run pipeline with clarification context
  const apiKey = await getDecryptedApiKey(tenantId);
  const lexwareClient = new LexwareClient(apiKey);
  const tenant = await buildTenantProfile(tenantId, apiKey);

  const extracted = await extractPdfText(fileBuffer);
  const { documentType, taxTypeHint } = classifyDocType(extracted);
  const fingerprint = await matchFingerprint(extracted, tenant.lexwareOrg);

  const anthropicClient = new AnthropicClassifier(process.env.ANTHROPIC_API_KEY ?? '');
  const postingCategories = await getPostingCategories(tenant.lexwareOrg, lexwareClient);

  const classificationResult = await classifyDocument(
    extracted,
    fingerprint,
    documentType,
    taxTypeHint,
    tenant,
    postingCategories,
    fileBuffer,
    anthropicClient,
    clarificationContext,
  );

  // Step 4: Math verification
  const mathResult = verifyMath(classificationResult, extracted);

  // Step 5: Update draft or create fresh vouchers
  const payload = exception.payload as {
    lexwareDraftVoucherId?: string | null;
    [k: string]: unknown;
  };
  const draftVoucherId = payload.lexwareDraftVoucherId ?? null;
  const { payloads } = buildVoucherPayloads(classificationResult, extracted, fingerprint, mathResult);

  if (draftVoucherId && mathResult.passed && classificationResult.confidence >= 0.75) {
    // Try to update existing draft to open
    try {
      const current = await lexwareClient.request<{ version: number; [k: string]: unknown }>(
        `/v1/vouchers/${draftVoucherId}`,
      );
      if (current) {
        const primaryPayload = payloads[0];
        await lexwareClient.writeWithRetry(
          `/v1/vouchers/${draftVoucherId}`,
          'PUT',
          { ...primaryPayload, version: current.version, voucherStatus: 'open' },
          async () => lexwareClient.request<Record<string, unknown>>(`/v1/vouchers/${draftVoucherId}`),
        );
        console.log(`[resume] Updated draft ${draftVoucherId} to open`);
      }
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 404) {
        console.log(`[resume] Draft ${draftVoucherId} not found — creating fresh vouchers`);
        await createFreshVouchers(payloads, fileBuffer, mimeType, lexwareClient);
      } else {
        throw err;
      }
    }
  } else {
    await createFreshVouchers(payloads, fileBuffer, mimeType, lexwareClient);
  }

  // Step 6: Mark exception resolved
  await query(
    `UPDATE exception_queue SET status = 'resolved', resolved_at = NOW() WHERE id = $1`,
    [exceptionId],
  );

  // ── Learning loop ───────────────────────────────────────────────────────────
  const clarificationAnswer = answeredSessions[0]?.answer ?? '';
  try {
    const { extractAndSaveRule } = await import('../learning/extract-and-save-rule.js');
    await extractAndSaveRule({
      userAnswer: clarificationAnswer,
      classificationResult,
      extracted,
      tenantId: tenantId,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    });
  } catch (err) {
    console.warn('[learning] extractAndSaveRule failed (non-fatal):', err);
  }

  console.log(`[resume] Exception ${exceptionId} resolved`);
}

async function createFreshVouchers(
  payloads: ReturnType<typeof buildVoucherPayloads>['payloads'],
  fileBuffer: Buffer,
  mimeType: string,
  client: LexwareClient,
): Promise<void> {
  for (const payload of payloads) {
    const result = await client.writeRequest<{ id: string }>('/v1/vouchers', 'POST', payload);
    if (result?.ok) {
      const formData = new FormData();
      formData.append('file', new Blob([fileBuffer], { type: mimeType }), 'invoice.pdf');
      await client.multipartRequest(`/v1/vouchers/${result.data.id}/files`, formData);
    }
  }
}
