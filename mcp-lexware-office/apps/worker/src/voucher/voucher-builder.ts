import type { ClassificationResult, VoucherPayload, VoucherBuildResult } from '../types.js';
import type { ExtractedDocument } from '../processor/pdf-extractor.js';
import type { FingerprintMatch } from '../processor/fingerprint-matcher.js';
import type { MathVerificationResult } from '../classifier/math-verifier.js';

const ZU_PRUEFEN = '8d2e71c6-09d5-439a-a295-a9e71661afcd';
const MATH_FAIL_REMARK_PREFIX = 'MATH VERIFICATION FAILED:';

export function buildVoucherPayloads(
  result: ClassificationResult,
  extracted: ExtractedDocument,
  fingerprint: FingerprintMatch,
  mathResult: MathVerificationResult,
): VoucherBuildResult {
  const contactId = fingerprint.matched && fingerprint.fingerprintId
    ? (fingerprint as any).contactId as string | undefined
    : undefined;

  const passLabel = `pass:${result.passUsed}`;
  const period = extracted.invoiceDate ?? 'unknown-date';
  const confidence = result.confidence.toFixed(2);

  if (result.kind === 'purchase_invoice') {
    const status = resolveStatus(result.confidence, mathResult);
    const remark = buildRemark('purchase_invoice', period, confidence, passLabel, mathResult);

    const payload: VoucherPayload = {
      type: result.data.voucherType,
      voucherStatus: status,
      voucherDate: extracted.invoiceDate,
      dueDate: extracted.dueDate,
      voucherNumber: extracted.invoiceNumber,
      totalGrossAmount: extracted.totalGrossAmount,
      totalTaxAmount: extracted.totalTaxAmount,
      taxType: result.data.taxType,
      ...(contactId ? { contactId } : { useCollectiveContact: true }),
      voucherItems: result.data.lineItems.map((li) => ({
        amount: li.grossAmount,
        taxAmount: li.taxAmount,
        taxRatePercent: li.taxRatePercent,
        categoryId: mathResult.passed ? li.categoryId : ZU_PRUEFEN,
      })),
      remark,
    };

    return { payloads: [payload] };
  }

  if (result.kind === 'settlement') {
    const payloads: VoucherPayload[] = [];
    let loanFlagNote: string | undefined;

    for (const [idx, sv] of result.data.vouchers.entries()) {
      const status = resolveStatus(result.confidence, mathResult);
      const isRevenue = sv.voucherType === 'salesinvoice';
      const remark = buildRemark('settlement', period, confidence, passLabel, mathResult, sv.description);

      payloads.push({
        type: sv.voucherType,
        voucherStatus: status,
        voucherDate: extracted.invoiceDate,
        taxType: sv.taxType,
        // Revenue vouchers always use collective contact; fee vouchers use vendor contactId if known
        ...(isRevenue || !contactId
          ? { useCollectiveContact: sv.useCollectiveContact !== false ? true : false }
          : { contactId }),
        voucherItems: sv.lineItems.map((li) => ({
          amount: li.grossAmount,
          taxAmount: li.taxAmount,
          taxRatePercent: li.taxRatePercent,
          categoryId: mathResult.passed ? li.categoryId : ZU_PRUEFEN,
        })),
        remark: idx === 0 ? remark : `[AUTO] ${sv.description} | ${period}`,
      });
    }

    if (result.data.loanRepaymentDetected) {
      loanFlagNote =
        `LOAN REPAYMENT DETECTED — amount: €${result.data.loanAmount ?? 'unknown'}. ` +
        'Manual journal entry required. See exception_queue for details.';
    }

    return { payloads, loanFlagNote };
  }

  // clarification_needed: build one unchecked placeholder
  const payload: VoucherPayload = {
    type: 'purchaseinvoice',
    voucherStatus: 'unchecked',
    voucherDate: extracted.invoiceDate,
    totalGrossAmount: extracted.totalGrossAmount,
    taxType: 'gross',
    useCollectiveContact: true,
    voucherItems: [
      {
        amount: extracted.totalGrossAmount ?? 0,
        taxAmount: extracted.totalTaxAmount ?? 0,
        taxRatePercent: 19,
        categoryId: ZU_PRUEFEN,
      },
    ],
    remark: `AUTOMATION HOLD — clarification needed: ${result.data.reason}`,
  };

  return { payloads: [payload] };
}

function resolveStatus(
  confidence: number,
  math: MathVerificationResult,
): 'open' | 'unchecked' {
  if (!math.passed) return 'unchecked';
  if (confidence < 0.75) return 'unchecked';
  return 'open';
}

function buildRemark(
  docType: string,
  period: string,
  confidence: string,
  passLabel: string,
  math: MathVerificationResult,
  extra?: string,
): string {
  const parts = [`[AUTO] ${docType}`, period, `confidence: ${confidence}`, passLabel];
  if (extra) parts.push(extra);
  const base = parts.join(' | ');
  if (!math.passed) {
    return `${MATH_FAIL_REMARK_PREFIX} calculated €${math.calculatedGross}, stated €${math.statedGross} | ${base}`;
  }
  return base;
}
