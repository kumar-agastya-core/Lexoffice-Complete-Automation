import { describe, it, expect } from 'vitest';
import { buildVoucherPayloads } from '../voucher/voucher-builder.js';
import type { ClassificationResult } from '../types.js';
import type { ExtractedDocument } from '../processor/pdf-extractor.js';
import type { FingerprintMatch } from '../processor/fingerprint-matcher.js';
import type { MathVerificationResult } from '../classifier/math-verifier.js';

function baseExtracted(): ExtractedDocument {
  return {
    rawText: '',
    cleanText: '',
    vatId: 'DE123456789',
    iban: null,
    invoiceNumber: 'RE-001',
    invoiceDate: '2026-04-05',
    dueDate: '2026-05-05',
    totalGrossAmount: 119,
    totalTaxAmount: 19,
    taxRateRows: [{ rate: 19, net: 100, tax: 19, gross: 119 }],
    pageCount: 1,
    textSignals: [],
  };
}

function unknownFingerprint(): FingerprintMatch {
  return { matched: false, fingerprintId: null, vendorName: null, contactId: null, documentTypeRule: null, classificationExamples: [] };
}

function knownFingerprint(contactId = 'contact-uuid-123'): FingerprintMatch {
  return { matched: true, fingerprintId: 'fp-uuid', vendorName: 'Test Vendor', contactId, documentTypeRule: { documentType: 'purchase_invoice', processingStrategy: 'single', splitConfig: null }, classificationExamples: [] };
}

function passMath(): MathVerificationResult {
  return { passed: true, calculatedGross: 119, statedGross: 119, difference: 0, lineItemCheck: true, taxCalculationCheck: true };
}

function failMath(): MathVerificationResult {
  return { passed: false, calculatedGross: 200, statedGross: 119, difference: 81, lineItemCheck: true, taxCalculationCheck: false };
}

describe('buildVoucherPayloads — standard invoice', () => {
  const result: ClassificationResult = {
    kind: 'purchase_invoice',
    passUsed: 1,
    confidence: 0.9,
    data: {
      voucherType: 'purchaseinvoice',
      taxType: 'gross',
      overallConfidence: 0.9,
      lineItems: [{ grossAmount: 119, taxAmount: 19, taxRatePercent: 19, categoryId: 'cat-uuid-1', confidence: 0.9 }],
    },
  };

  it('produces single payload', () => {
    const { payloads } = buildVoucherPayloads(result, baseExtracted(), unknownFingerprint(), passMath());
    expect(payloads).toHaveLength(1);
  });

  it('status is open when math passes and confidence >= 0.75', () => {
    const { payloads } = buildVoucherPayloads(result, baseExtracted(), unknownFingerprint(), passMath());
    expect(payloads[0].voucherStatus).toBe('open');
  });

  it('status is unchecked when math fails', () => {
    const { payloads } = buildVoucherPayloads(result, baseExtracted(), unknownFingerprint(), failMath());
    expect(payloads[0].voucherStatus).toBe('unchecked');
    expect(payloads[0].remark).toContain('MATH VERIFICATION FAILED');
  });

  it('uses useCollectiveContact when no fingerprint contactId', () => {
    const { payloads } = buildVoucherPayloads(result, baseExtracted(), unknownFingerprint(), passMath());
    expect(payloads[0].useCollectiveContact).toBe(true);
    expect(payloads[0].contactId).toBeUndefined();
  });

  it('uses contactId when fingerprint has one', () => {
    const { payloads } = buildVoucherPayloads(result, baseExtracted(), knownFingerprint(), passMath());
    expect(payloads[0].contactId).toBe('contact-uuid-123');
    expect(payloads[0].useCollectiveContact).toBeUndefined();
  });

  it('sets categoryId to Zu prüfen when math fails', () => {
    const { payloads } = buildVoucherPayloads(result, baseExtracted(), unknownFingerprint(), failMath());
    expect(payloads[0].voucherItems[0].categoryId).toBe('8d2e71c6-09d5-439a-a295-a9e71661afcd');
  });

  it('remark contains [AUTO] prefix', () => {
    const { payloads } = buildVoucherPayloads(result, baseExtracted(), unknownFingerprint(), passMath());
    expect(payloads[0].remark).toMatch(/^\[AUTO\]/);
  });
});

describe('buildVoucherPayloads — settlement two-voucher', () => {
  const result: ClassificationResult = {
    kind: 'settlement',
    passUsed: 1,
    confidence: 0.85,
    data: {
      overallConfidence: 0.85,
      vouchers: [
        {
          description: 'Food delivery revenue',
          voucherType: 'salesinvoice',
          taxType: 'gross',
          useCollectiveContact: true,
          lineItems: [{ label: 'Sales', grossAmount: 1190, taxAmount: 80.67, taxRatePercent: 7, categoryId: 'cat-revenue' }],
        },
        {
          description: 'Service fees',
          voucherType: 'purchaseinvoice',
          taxType: 'gross',
          lineItems: [{ label: 'Fee', grossAmount: 119, taxAmount: 19, taxRatePercent: 19, categoryId: 'cat-fees' }],
        },
      ],
    },
  };

  it('produces two payloads', () => {
    const { payloads } = buildVoucherPayloads(result, baseExtracted(), unknownFingerprint(), passMath());
    expect(payloads).toHaveLength(2);
  });

  it('first payload is salesinvoice with useCollectiveContact', () => {
    const { payloads } = buildVoucherPayloads(result, baseExtracted(), unknownFingerprint(), passMath());
    expect(payloads[0].type).toBe('salesinvoice');
    expect(payloads[0].useCollectiveContact).toBe(true);
  });

  it('second payload is purchaseinvoice', () => {
    const { payloads } = buildVoucherPayloads(result, baseExtracted(), unknownFingerprint(), passMath());
    expect(payloads[1].type).toBe('purchaseinvoice');
  });
});

describe('buildVoucherPayloads — loan-detected settlement', () => {
  const result: ClassificationResult = {
    kind: 'settlement',
    passUsed: 2,
    confidence: 0.8,
    data: {
      overallConfidence: 0.8,
      loanRepaymentDetected: true,
      loanAmount: 500,
      vouchers: [
        {
          description: 'Net payout after loan deduction',
          voucherType: 'purchaseinvoice',
          taxType: 'gross',
          lineItems: [{ label: 'Payout', grossAmount: 500, taxAmount: 79.83, taxRatePercent: 19, categoryId: 'cat-1' }],
        },
      ],
    },
  };

  it('sets loanFlagNote when loan detected', () => {
    const { loanFlagNote } = buildVoucherPayloads(result, baseExtracted(), unknownFingerprint(), passMath());
    expect(loanFlagNote).toBeDefined();
    expect(loanFlagNote).toContain('LOAN REPAYMENT DETECTED');
    expect(loanFlagNote).toContain('500');
  });
});
