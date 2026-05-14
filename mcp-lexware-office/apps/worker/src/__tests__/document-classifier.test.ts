import { describe, it, expect } from 'vitest';
import { classifyDocument } from '../processor/document-classifier.js';
import type { ExtractedDocument } from '../processor/pdf-extractor.js';

function makeDoc(overrides: Partial<ExtractedDocument> = {}): ExtractedDocument {
  return {
    rawText: '',
    cleanText: '',
    vatId: null,
    iban: null,
    invoiceNumber: null,
    invoiceDate: null,
    dueDate: null,
    totalGrossAmount: null,
    totalTaxAmount: null,
    taxRateRows: [],
    pageCount: 1,
    textSignals: [],
    ...overrides,
  };
}

describe('classifyDocument — document types', () => {
  it('defaults to purchase_invoice', () => {
    const { documentType } = classifyDocument(makeDoc());
    expect(documentType).toBe('purchase_invoice');
  });

  it('detects purchase_credit_note from gutschrift signal', () => {
    const { documentType } = classifyDocument(makeDoc({ textSignals: ['gutschrift'] }));
    expect(documentType).toBe('purchase_credit_note');
  });

  it('detects settlement from auszahlung + servicegebühr', () => {
    const { documentType } = classifyDocument(
      makeDoc({ textSignals: ['auszahlung', 'servicegebühr'] }),
    );
    expect(documentType).toBe('settlement');
  });

  it('does NOT detect settlement with only auszahlung', () => {
    const { documentType } = classifyDocument(makeDoc({ textSignals: ['auszahlung'] }));
    expect(documentType).toBe('purchase_invoice');
  });

  it('detects pos_monthly_summary from umsatzübersicht + kassenbuch', () => {
    const { documentType } = classifyDocument(
      makeDoc({ textSignals: ['umsatzübersicht', 'kassenbuch'] }),
    );
    expect(documentType).toBe('pos_monthly_summary');
  });

  it('detects loan_aware_settlement from darlehensabzüge', () => {
    const { documentType } = classifyDocument(
      makeDoc({ textSignals: ['darlehensabzüge'] }),
    );
    expect(documentType).toBe('loan_aware_settlement');
  });

  it('detects loan_aware_settlement from sofortfinanzierung', () => {
    const { documentType } = classifyDocument(
      makeDoc({ textSignals: ['sofortfinanzierung'] }),
    );
    expect(documentType).toBe('loan_aware_settlement');
  });

  it('detects delivery_platform from bestellungen + lieferando', () => {
    const { documentType } = classifyDocument(
      makeDoc({ textSignals: ['bestellungen', 'lieferando'] }),
    );
    expect(documentType).toBe('delivery_platform');
  });

  it('detects delivery_platform from bestellungen + takeaway', () => {
    const { documentType } = classifyDocument(
      makeDoc({ textSignals: ['bestellungen', 'takeaway'] }),
    );
    expect(documentType).toBe('delivery_platform');
  });
});

describe('classifyDocument — tax type hints', () => {
  it('defaults to gross', () => {
    const { taxTypeHint } = classifyDocument(makeDoc());
    expect(taxTypeHint).toBe('gross');
  });

  it('detects vatfree from §19 signal', () => {
    const { taxTypeHint } = classifyDocument(makeDoc({ textSignals: ['§19'] }));
    expect(taxTypeHint).toBe('vatfree');
  });

  it('detects vatfree from kleinunternehmer', () => {
    const { taxTypeHint } = classifyDocument(
      makeDoc({ textSignals: ['kleinunternehmer'] }),
    );
    expect(taxTypeHint).toBe('vatfree');
  });

  it('detects constructionService13b from §13b + bauleistung', () => {
    const { taxTypeHint } = classifyDocument(
      makeDoc({ textSignals: ['§13b', 'bauleistung'] }),
    );
    expect(taxTypeHint).toBe('constructionService13b');
  });

  it('detects intraCommunitySupply from innergemeinschaftlich', () => {
    const { taxTypeHint } = classifyDocument(
      makeDoc({ textSignals: ['innergemeinschaftlich'] }),
    );
    expect(taxTypeHint).toBe('intraCommunitySupply');
  });

  it('detects externalService13b for EU VAT + zero tax', () => {
    const { taxTypeHint } = classifyDocument(
      makeDoc({
        vatId: 'LU12345678',
        totalTaxAmount: 0,
        taxRateRows: [{ rate: 0, net: 100, tax: 0, gross: 100 }],
      }),
    );
    expect(taxTypeHint).toBe('externalService13b');
  });

  it('does NOT detect externalService13b for DE VAT', () => {
    const { taxTypeHint } = classifyDocument(
      makeDoc({
        vatId: 'DE123456789',
        totalTaxAmount: 0,
        taxRateRows: [{ rate: 0, net: 100, tax: 0, gross: 100 }],
      }),
    );
    expect(taxTypeHint).toBe('gross');
  });
});
