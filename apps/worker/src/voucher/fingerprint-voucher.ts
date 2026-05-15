import type { FingerprintMatch } from '../processor/fingerprint-matcher.js';
import type { ExtractedDocument } from '../processor/pdf-extractor.js';
import type { VoucherPayload } from '../types.js';

export function buildVoucherFromFingerprint(
  fingerprint: FingerprintMatch,
  extracted: ExtractedDocument,
): { payloads: VoucherPayload[]; source: 'tier1' } {
  const examples = fingerprint.classificationExamples;

  // Find dominant categoryId (most frequent, first on tie)
  const countMap = new Map<string, number>();
  for (const ex of examples) {
    countMap.set(ex.targetCategoryUuid, (countMap.get(ex.targetCategoryUuid) ?? 0) + 1);
  }

  let dominantCategoryId = examples[0]?.targetCategoryUuid ?? '8d2e71c6-09d5-439a-a295-a9e71661afcd';
  let maxCount = 0;
  for (const [catId, count] of countMap) {
    if (count > maxCount) {
      maxCount = count;
      dominantCategoryId = catId;
    }
  }

  // Build voucher items from tax rate rows or single fallback
  let voucherItems: VoucherPayload['voucherItems'];
  if (extracted.taxRateRows.length > 0) {
    voucherItems = extracted.taxRateRows.map((row) => ({
      amount: row.gross,
      taxAmount: row.tax,
      taxRatePercent: row.rate,
      categoryId: dominantCategoryId,
    }));
  } else {
    voucherItems = [
      {
        amount: extracted.totalGrossAmount ?? 0,
        taxAmount: extracted.totalTaxAmount ?? 0,
        taxRatePercent: 19,
        categoryId: dominantCategoryId,
      },
    ];
  }

  const payload: VoucherPayload = {
    type: 'purchaseinvoice',
    voucherStatus: 'open',
    voucherDate: extracted.invoiceDate ?? null,
    dueDate: extracted.dueDate ?? null,
    voucherNumber: extracted.invoiceNumber ?? null,
    totalGrossAmount: extracted.totalGrossAmount ?? null,
    totalTaxAmount: extracted.totalTaxAmount ?? null,
    taxType: 'gross',
    ...(fingerprint.contactId
      ? { contactId: fingerprint.contactId }
      : { useCollectiveContact: true }),
    voucherItems,
    remark: '[TIER1] Auto-posted from vendor fingerprint | confidence: 0.99',
  };

  return { payloads: [payload], source: 'tier1' };
}
