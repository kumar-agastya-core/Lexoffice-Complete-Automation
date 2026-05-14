import { describe, it, expect } from 'vitest';
import { scoreComplexity } from '../processor/complexity-scorer.js';
import type { ExtractedDocument } from '../processor/pdf-extractor.js';
import type { FingerprintMatch } from '../processor/fingerprint-matcher.js';
import type { DocumentType, TaxTypeHint } from '../processor/document-classifier.js';

function baseDoc(overrides: Partial<ExtractedDocument> = {}): ExtractedDocument {
  return {
    rawText: 'Rechnung 05.04.2026 Gesamt 100,00',
    cleanText: 'Rechnung 05.04.2026 Gesamt 100,00',
    vatId: 'DE123456789',
    iban: null,
    invoiceNumber: 'RE-001',
    invoiceDate: '2026-04-05',
    dueDate: '2026-04-05',
    totalGrossAmount: 100,
    totalTaxAmount: 15.97,
    taxRateRows: [{ rate: 19, net: 84.03, tax: 15.97, gross: 100 }],
    pageCount: 1,
    textSignals: [],
    ...overrides,
  };
}

function knownFingerprint(): FingerprintMatch {
  return {
    matched: true,
    fingerprintId: 'fp-uuid',
    vendorName: 'Test Vendor GmbH',
    documentTypeRule: { documentType: 'purchase_invoice', processingStrategy: 'single', splitConfig: null },
    classificationExamples: [],
  };
}

function unknownFingerprint(): FingerprintMatch {
  return {
    matched: false,
    fingerprintId: null,
    vendorName: null,
    documentTypeRule: null,
    classificationExamples: [],
  };
}

function score(
  docOverrides: Partial<ExtractedDocument> = {},
  fp: FingerprintMatch = knownFingerprint(),
  docType: DocumentType = 'purchase_invoice',
  taxHint: TaxTypeHint = 'gross',
) {
  return scoreComplexity({
    doc: baseDoc(docOverrides),
    fingerprint: fp,
    documentType: docType,
    taxTypeHint: taxHint,
  });
}

describe('TRIGGER_1 — unknown_vendor', () => {
  it('fires when fingerprint not matched', () => {
    const result = score({}, unknownFingerprint());
    expect(result.triggers.map((t) => t.id)).toContain('unknown_vendor');
  });

  it('does not fire when fingerprint matched', () => {
    const result = score({}, knownFingerprint());
    expect(result.triggers.map((t) => t.id)).not.toContain('unknown_vendor');
  });

  it('is severity warning', () => {
    const result = score({}, unknownFingerprint());
    const t = result.triggers.find((x) => x.id === 'unknown_vendor')!;
    expect(t.severity).toBe('warning');
  });
});

describe('TRIGGER_2 — foreign_eu_vendor', () => {
  it('fires when taxTypeHint is externalService13b', () => {
    const result = score({}, knownFingerprint(), 'purchase_invoice', 'externalService13b');
    expect(result.triggers.map((t) => t.id)).toContain('foreign_eu_vendor');
  });

  it('is severity blocking', () => {
    const result = score({}, knownFingerprint(), 'purchase_invoice', 'externalService13b');
    const t = result.triggers.find((x) => x.id === 'foreign_eu_vendor')!;
    expect(t.severity).toBe('blocking');
  });

  it('does not fire for gross tax hint', () => {
    const result = score({}, knownFingerprint(), 'purchase_invoice', 'gross');
    expect(result.triggers.map((t) => t.id)).not.toContain('foreign_eu_vendor');
  });
});

describe('TRIGGER_3 — loan_deductions_detected', () => {
  it('fires when documentType is loan_aware_settlement', () => {
    const result = score({}, knownFingerprint(), 'loan_aware_settlement');
    expect(result.triggers.map((t) => t.id)).toContain('loan_deductions_detected');
  });

  it('has referenceDocs', () => {
    const result = score({}, knownFingerprint(), 'loan_aware_settlement');
    const t = result.triggers.find((x) => x.id === 'loan_deductions_detected')!;
    expect(t.referenceDocs).toHaveLength(1);
  });

  it('is severity blocking', () => {
    const result = score({}, knownFingerprint(), 'loan_aware_settlement');
    const t = result.triggers.find((x) => x.id === 'loan_deductions_detected')!;
    expect(t.severity).toBe('blocking');
  });
});

describe('TRIGGER_4 — cross_period_data', () => {
  it('fires when rawText has dates from multiple months', () => {
    const result = score({
      rawText: 'Datum 05.04.2026 bis 15.05.2026 Gesamt 100,00',
    });
    expect(result.triggers.map((t) => t.id)).toContain('cross_period_data');
  });

  it('does not fire when single month', () => {
    const result = score({
      rawText: 'Datum 05.04.2026 Gesamt 100,00',
    });
    expect(result.triggers.map((t) => t.id)).not.toContain('cross_period_data');
  });
});

describe('TRIGGER_5 — mixed_payment_methods', () => {
  it('fires for pos_monthly_summary with EC-Karte and Bar', () => {
    const result = score(
      { rawText: 'Umsatz EC-Karte 500,00 Bar 200,00 Gesamt 700,00' },
      knownFingerprint(),
      'pos_monthly_summary',
    );
    expect(result.triggers.map((t) => t.id)).toContain('mixed_payment_methods');
  });

  it('does not fire for purchase_invoice even with EC-Karte and Bar', () => {
    const result = score(
      { rawText: 'EC-Karte Bar payment text' },
      knownFingerprint(),
      'purchase_invoice',
    );
    expect(result.triggers.map((t) => t.id)).not.toContain('mixed_payment_methods');
  });

  it('does not fire for pos_monthly_summary with only EC-Karte', () => {
    const result = score(
      { rawText: 'EC-Karte 500,00' },
      knownFingerprint(),
      'pos_monthly_summary',
    );
    expect(result.triggers.map((t) => t.id)).not.toContain('mixed_payment_methods');
  });
});

describe('TRIGGER_6 — amount_reconciliation_failure', () => {
  it('fires when tax rows sum differs from total by more than €0.05', () => {
    const result = score({
      totalGrossAmount: 200,
      taxRateRows: [{ rate: 19, net: 84.03, tax: 15.97, gross: 100 }], // sum = 100, stated = 200
    });
    expect(result.triggers.map((t) => t.id)).toContain('amount_reconciliation_failure');
  });

  it('does not fire when amounts match within €0.05', () => {
    const result = score({
      totalGrossAmount: 100.00,
      taxRateRows: [{ rate: 19, net: 84.03, tax: 15.97, gross: 100 }],
    });
    expect(result.triggers.map((t) => t.id)).not.toContain('amount_reconciliation_failure');
  });

  it('does not fire when no tax rows', () => {
    const result = score({ taxRateRows: [], totalGrossAmount: 500 });
    expect(result.triggers.map((t) => t.id)).not.toContain('amount_reconciliation_failure');
  });
});

describe('TRIGGER_7 — high_value_document', () => {
  it('fires when totalGrossAmount > 5000', () => {
    const result = score({ totalGrossAmount: 5001 });
    expect(result.triggers.map((t) => t.id)).toContain('high_value_document');
  });

  it('does not fire at exactly 5000', () => {
    const result = score({ totalGrossAmount: 5000 });
    expect(result.triggers.map((t) => t.id)).not.toContain('high_value_document');
  });

  it('is severity warning', () => {
    const result = score({ totalGrossAmount: 9999 });
    const t = result.triggers.find((x) => x.id === 'high_value_document')!;
    expect(t.severity).toBe('warning');
  });
});

describe('scoreComplexity — aggregate', () => {
  it('score equals trigger count', () => {
    const result = score({}, unknownFingerprint(), 'purchase_invoice', 'externalService13b');
    expect(result.score).toBe(result.triggers.length);
  });

  it('requiresClarification true when score >= 1', () => {
    const result = score({}, unknownFingerprint());
    expect(result.requiresClarification).toBe(true);
  });

  it('requiresClarification false when no triggers', () => {
    const result = score({ totalGrossAmount: 100, taxRateRows: [{ rate: 19, net: 84.03, tax: 15.97, gross: 100 }] }, knownFingerprint());
    expect(result.requiresClarification).toBe(false);
  });
});
