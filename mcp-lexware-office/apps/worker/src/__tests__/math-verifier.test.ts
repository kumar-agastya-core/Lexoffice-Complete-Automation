import { describe, it, expect } from 'vitest';
import { verifyMath } from '../classifier/math-verifier.js';
import type { ClassificationResult } from '../types.js';
import type { ExtractedDocument } from '../processor/pdf-extractor.js';

function makeExtracted(overrides: Partial<ExtractedDocument> = {}): ExtractedDocument {
  return {
    rawText: '',
    cleanText: '',
    vatId: null,
    iban: null,
    invoiceNumber: null,
    invoiceDate: null,
    dueDate: null,
    totalGrossAmount: 119,
    totalTaxAmount: 19,
    taxRateRows: [],
    pageCount: 1,
    textSignals: [],
    ...overrides,
  };
}

function makePurchaseResult(overrides: Partial<{
  grossAmount: number;
  taxAmount: number;
  taxRatePercent: number;
  confidence: number;
}> = {}): ClassificationResult {
  const { grossAmount = 119, taxAmount = 19, taxRatePercent = 19, confidence = 0.9 } = overrides;
  return {
    kind: 'purchase_invoice',
    passUsed: 1,
    confidence,
    data: {
      voucherType: 'purchaseinvoice',
      taxType: 'gross',
      overallConfidence: confidence,
      lineItems: [
        {
          description: 'Test item',
          grossAmount,
          taxAmount,
          taxRatePercent,
          categoryId: 'cat-uuid-1',
          confidence,
        },
      ],
    },
  };
}

describe('verifyMath — purchase invoice', () => {
  it('passes when amounts match exactly', () => {
    const result = makePurchaseResult({ grossAmount: 119, taxAmount: 19, taxRatePercent: 19 });
    const extracted = makeExtracted({ totalGrossAmount: 119, totalTaxAmount: 19 });
    const math = verifyMath(result, extracted);
    expect(math.passed).toBe(true);
    expect(math.difference).toBeCloseTo(0);
  });

  it('passes when gross differs by €0.04 (within tolerance)', () => {
    const result = makePurchaseResult({ grossAmount: 119.04, taxAmount: 19, taxRatePercent: 19 });
    const extracted = makeExtracted({ totalGrossAmount: 119 });
    const math = verifyMath(result, extracted);
    expect(math.passed).toBe(true);
  });

  it('fails when gross sum differs by > €0.05', () => {
    const result = makePurchaseResult({ grossAmount: 200, taxAmount: 31.93, taxRatePercent: 19 });
    const extracted = makeExtracted({ totalGrossAmount: 119 });
    const math = verifyMath(result, extracted);
    expect(math.passed).toBe(false);
    expect(math.difference).toBeGreaterThan(0.05);
  });

  it('fails when tax calculation is wrong', () => {
    // 19% of net 100 = 19, but we say taxAmount = 50
    const result = makePurchaseResult({ grossAmount: 150, taxAmount: 50, taxRatePercent: 19 });
    const extracted = makeExtracted({ totalGrossAmount: 150 });
    const math = verifyMath(result, extracted);
    expect(math.taxCalculationCheck).toBe(false);
    expect(math.passed).toBe(false);
  });

  it('passes with 0% tax rate and zero tax amount', () => {
    const result = makePurchaseResult({ grossAmount: 100, taxAmount: 0, taxRatePercent: 0 });
    const extracted = makeExtracted({ totalGrossAmount: 100 });
    const math = verifyMath(result, extracted);
    expect(math.passed).toBe(true);
    expect(math.taxCalculationCheck).toBe(true);
  });

  it('passes for credit note — negative gross handled', () => {
    const result: ClassificationResult = {
      kind: 'purchase_invoice',
      passUsed: 1,
      confidence: 0.9,
      data: {
        voucherType: 'purchasecreditnote',
        taxType: 'gross',
        overallConfidence: 0.9,
        lineItems: [
          { grossAmount: 119, taxAmount: 19, taxRatePercent: 19, categoryId: 'cat-1', confidence: 0.9 },
        ],
      },
    };
    const extracted = makeExtracted({ totalGrossAmount: 119 });
    const math = verifyMath(result, extracted);
    expect(math.passed).toBe(true);
  });
});

describe('verifyMath — settlement multi-voucher', () => {
  it('passes when all voucher line items are internally consistent', () => {
    const result: ClassificationResult = {
      kind: 'settlement',
      passUsed: 1,
      confidence: 0.85,
      data: {
        overallConfidence: 0.85,
        vouchers: [
          {
            description: 'Revenue',
            voucherType: 'salesinvoice',
            taxType: 'gross',
            lineItems: [
              { label: 'Sales', grossAmount: 1190, taxAmount: 80.67, taxRatePercent: 7, categoryId: 'cat-1' },
            ],
          },
          {
            description: 'Fees',
            voucherType: 'purchaseinvoice',
            taxType: 'gross',
            lineItems: [
              { label: 'Service fee', grossAmount: 119, taxAmount: 19, taxRatePercent: 19, categoryId: 'cat-2' },
            ],
          },
        ],
      },
    };
    // totalGrossAmount = sum of all line items = 1190 + 119 = 1309
    const extracted = makeExtracted({ totalGrossAmount: 1309 });
    const math = verifyMath(result, extracted);
    expect(math.calculatedGross).toBeCloseTo(1309);
  });
});
