import type { ExtractedDocument } from './pdf-extractor.js';

export type DocumentType =
  | 'purchase_invoice'
  | 'purchase_credit_note'
  | 'settlement'
  | 'pos_monthly_summary'
  | 'loan_aware_settlement'
  | 'delivery_platform';

export type TaxTypeHint =
  | 'gross'
  | 'vatfree'
  | 'constructionService13b'
  | 'externalService13b'
  | 'intraCommunitySupply';

export interface ClassificationResult {
  documentType: DocumentType;
  taxTypeHint: TaxTypeHint;
}

const EU_VAT_PREFIXES = [
  'AT','BE','BG','CY','CZ','DK','EE','FI','FR','GR','HR','HU',
  'IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK',
];

function hasSignal(signals: string[], keyword: string): boolean {
  return signals.includes(keyword);
}

function hasAllSignals(signals: string[], keywords: string[]): boolean {
  return keywords.every((k) => signals.includes(k));
}

export function classifyDocument(doc: ExtractedDocument): ClassificationResult {
  const s = doc.textSignals;

  // ── Document type (priority order) ─────────────────────────────────────────

  let documentType: DocumentType = 'purchase_invoice';

  if (hasSignal(s, 'gutschrift')) {
    documentType = 'purchase_credit_note';
  } else if (
    hasSignal(s, 'bestellungen') &&
    (hasSignal(s, 'lieferando') || hasSignal(s, 'takeaway'))
  ) {
    // delivery_platform before settlement — Lieferando reports contain both signal sets
    documentType = 'delivery_platform';
  } else if (hasSignal(s, 'darlehensabzüge') || hasSignal(s, 'sofortfinanzierung')) {
    documentType = 'loan_aware_settlement';
  } else if (hasAllSignals(s, ['umsatzübersicht', 'kassenbuch'])) {
    documentType = 'pos_monthly_summary';
  } else if (hasAllSignals(s, ['auszahlung', 'servicegebühr'])) {
    documentType = 'settlement';
  }

  // ── Tax type hint ───────────────────────────────────────────────────────────

  let taxTypeHint: TaxTypeHint = 'gross';

  if (hasSignal(s, '§19') || hasSignal(s, 'kleinunternehmer')) {
    taxTypeHint = 'vatfree';
  } else if (hasSignal(s, '§13b') && hasSignal(s, 'bauleistung')) {
    taxTypeHint = 'constructionService13b';
  } else if (hasSignal(s, 'innergemeinschaftlich')) {
    taxTypeHint = 'intraCommunitySupply';
  } else if (doc.vatId) {
    const prefix = doc.vatId.slice(0, 2);
    const isEU = EU_VAT_PREFIXES.includes(prefix);
    // EU vendor with zero VAT shown → §13b external service
    const hasZeroVat = doc.taxRateRows.some((r) => r.rate === 0) || doc.totalTaxAmount === 0;
    if (isEU && hasZeroVat) {
      taxTypeHint = 'externalService13b';
    }
  }

  return { documentType, taxTypeHint };
}
