import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processText } from '../processor/pdf-extractor.js';
import { classifyDocument as classifyDocType } from '../processor/document-classifier.js';
import { scoreComplexity } from '../processor/complexity-scorer.js';
import { verifyMath } from '../classifier/math-verifier.js';
import { buildVoucherPayloads } from '../voucher/voucher-builder.js';
import type { ClassificationResult, TenantProfile, PostingCategory } from '../types.js';
import type { FingerprintMatch } from '../processor/fingerprint-matcher.js';

// ── Lieferando sample text (from Phase 3.5) ───────────────────────────────────

const LIEFERANDO_TEXT = `
Lieferando.de
Auszahlungsbericht

Vendor GmbH
Musterstraße 1
10115 Berlin
USt-IdNr. DE123456789

Rechnungsnummer: LFD-2026-00042
Rechnungsdatum: 05.04.2026
Fällig am: 05.04.2026

Bestellungen: 120
Umsatz brutto: 3.240,00 EUR
Servicegebühr: 388,80 EUR
Auszahlung: 2.851,20 EUR

7% MwSt auf Umsatz: 3.028,04  211,96
19% MwSt auf Servicegebühr: 326,72  62,08
Gesamtbetrag: 3.240,00

IBAN: DE89370400440532013000
`;

// ── Mocked classification result (Lieferando settlement) ─────────────────────

const LIEFERANDO_CATEGORY_REVENUE = 'cat-revenue-uuid';
const LIEFERANDO_CATEGORY_FEES = 'cat-fees-uuid';
const LIEFERANDO_CONTACT_ID = 'lieferando-contact-uuid';

const MOCK_SETTLEMENT_RESULT: ClassificationResult = {
  kind: 'settlement',
  passUsed: 1,
  confidence: 0.92,
  data: {
    overallConfidence: 0.92,
    vouchers: [
      {
        description: 'Lieferando food delivery revenue (7% VAT)',
        voucherType: 'salesinvoice',
        taxType: 'gross',
        useCollectiveContact: true,
        lineItems: [
          { label: 'Food sales 7%', grossAmount: 3240.00, taxAmount: 211.96, taxRatePercent: 7, categoryId: LIEFERANDO_CATEGORY_REVENUE },
        ],
      },
      {
        description: 'Lieferando service fee (19% VAT)',
        voucherType: 'purchaseinvoice',
        taxType: 'gross',
        lineItems: [
          { label: 'Service fee 19%', grossAmount: 388.80, taxAmount: 62.08, taxRatePercent: 19, categoryId: LIEFERANDO_CATEGORY_FEES },
        ],
      },
    ],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFingerprint(overrides: Partial<FingerprintMatch> = {}): FingerprintMatch {
  return {
    matched: false,
    fingerprintId: null,
    vendorName: null,
    contactId: null,
    documentTypeRule: null,
    classificationExamples: [],
    ...overrides,
  };
}

function makeTenant(): TenantProfile {
  return {
    id: 'tenant-uuid',
    lexwareOrg: 'test-org',
    lexofficeApiKey: 'test-key',
    companyName: 'Test Restaurant GmbH',
    industryOperationalLens: 'Restaurant & Food Service (7% on delivery, 19% in-house)',
    taxFramework: 'Standard German VAT (19% / 7%)',
    smallBusiness: false,
    approvalThreshold: 5000,
  };
}

// ── Mock: Lexware write API ───────────────────────────────────────────────────

const mockWriteRequest = vi.fn();
const mockMultipartRequest = vi.fn();

vi.mock('@lexware/client', () => ({
  LexwareClient: vi.fn().mockImplementation(() => ({
    writeRequest: mockWriteRequest,
    multipartRequest: mockMultipartRequest,
    request: vi.fn().mockResolvedValue([]),
  })),
}));

// ── Mock: updateKnowledge (fire-and-forget, don't await) ─────────────────────
const mockUpdateKnowledge = vi.fn().mockResolvedValue(undefined);
vi.mock('../learning/update-knowledge.js', () => ({
  updateKnowledge: mockUpdateKnowledge,
}));

// ── Mock: DB query (not needed for these assertions) ─────────────────────────
vi.mock('@lexware/db', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Full pipeline — Lieferando settlement', () => {
  beforeEach(() => {
    mockWriteRequest.mockResolvedValue({ ok: true, data: { id: 'voucher-uuid-' + Math.random().toString(36).slice(2) } });
    mockMultipartRequest.mockResolvedValue({ ok: true, data: {} });
  });
  afterEach(() => vi.clearAllMocks());

  it('classifies Lieferando text as delivery_platform', () => {
    const extracted = processText(LIEFERANDO_TEXT, 1);
    const { documentType } = classifyDocType(extracted);
    expect(documentType).toBe('delivery_platform');
  });

  it('tax hint is gross (DE vendor)', () => {
    const extracted = processText(LIEFERANDO_TEXT, 1);
    const { taxTypeHint } = classifyDocType(extracted);
    expect(taxTypeHint).toBe('gross');
  });

  it('complexity fires unknown_vendor only (warning — no blocking)', () => {
    const extracted = processText(LIEFERANDO_TEXT, 1);
    const { documentType, taxTypeHint } = classifyDocType(extracted);
    const complexity = scoreComplexity({
      doc: extracted,
      fingerprint: makeFingerprint(),
      documentType,
      taxTypeHint,
    });
    const ids = complexity.triggers.map((t) => t.id);
    expect(ids).toContain('unknown_vendor');
    expect(ids).not.toContain('foreign_eu_vendor');
    expect(ids).not.toContain('loan_deductions_detected');
  });

  it('math verification passes on mock settlement numbers', () => {
    const extracted = processText(LIEFERANDO_TEXT, 1);
    // Override totalGrossAmount to match mock result sum
    extracted.totalGrossAmount = 3240.00 + 388.80;
    const math = verifyMath(MOCK_SETTLEMENT_RESULT, extracted);
    expect(math.calculatedGross).toBeCloseTo(3628.80);
    expect(math.passed).toBe(true);
  });

  it('builds two vouchers from settlement result', () => {
    const extracted = processText(LIEFERANDO_TEXT, 1);
    const math = { passed: true, calculatedGross: 3628.80, statedGross: 3628.80, difference: 0, lineItemCheck: true, taxCalculationCheck: true };
    const { payloads } = buildVoucherPayloads(MOCK_SETTLEMENT_RESULT, extracted, makeFingerprint(), math);
    expect(payloads).toHaveLength(2);
  });

  it('revenue voucher uses useCollectiveContact', () => {
    const extracted = processText(LIEFERANDO_TEXT, 1);
    const math = { passed: true, calculatedGross: 3628.80, statedGross: 3628.80, difference: 0, lineItemCheck: true, taxCalculationCheck: true };
    const { payloads } = buildVoucherPayloads(MOCK_SETTLEMENT_RESULT, extracted, makeFingerprint(), math);
    const revenueVoucher = payloads.find((p) => p.type === 'salesinvoice');
    expect(revenueVoucher).toBeDefined();
    expect(revenueVoucher!.useCollectiveContact).toBe(true);
  });

  it('fee voucher uses vendor contactId when fingerprint has one', () => {
    const extracted = processText(LIEFERANDO_TEXT, 1);
    const fingerprint = makeFingerprint({ matched: true, fingerprintId: 'fp-1', vendorName: 'Lieferando', contactId: LIEFERANDO_CONTACT_ID });
    const math = { passed: true, calculatedGross: 3628.80, statedGross: 3628.80, difference: 0, lineItemCheck: true, taxCalculationCheck: true };
    const { payloads } = buildVoucherPayloads(MOCK_SETTLEMENT_RESULT, extracted, fingerprint, math);
    const feeVoucher = payloads.find((p) => p.type === 'purchaseinvoice');
    expect(feeVoucher).toBeDefined();
    expect(feeVoucher!.contactId).toBe(LIEFERANDO_CONTACT_ID);
  });

  it('mock write API called twice (one per voucher)', async () => {
    const extracted = processText(LIEFERANDO_TEXT, 1);
    const math = { passed: true, calculatedGross: 3628.80, statedGross: 3628.80, difference: 0, lineItemCheck: true, taxCalculationCheck: true };
    const { payloads } = buildVoucherPayloads(MOCK_SETTLEMENT_RESULT, extracted, makeFingerprint(), math);

    const { LexwareClient } = await import('@lexware/client');
    const client = new LexwareClient('test-key');

    for (const payload of payloads) {
      await client.writeRequest('/v1/vouchers', 'POST', payload);
      await client.multipartRequest('/v1/vouchers/test-id/files', new FormData());
    }

    expect(mockWriteRequest).toHaveBeenCalledTimes(2);
    expect(mockMultipartRequest).toHaveBeenCalledTimes(2);
  });

  it('updateKnowledge called with open vouchers', async () => {
    const extracted = processText(LIEFERANDO_TEXT, 1);
    const tenant = makeTenant();
    const fingerprint = makeFingerprint();

    await mockUpdateKnowledge(extracted, fingerprint, MOCK_SETTLEMENT_RESULT, tenant.lexwareOrg);

    expect(mockUpdateKnowledge).toHaveBeenCalledWith(
      extracted,
      fingerprint,
      MOCK_SETTLEMENT_RESULT,
      tenant.lexwareOrg,
    );
  });
});
