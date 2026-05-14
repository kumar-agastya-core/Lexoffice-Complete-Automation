import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.MASTER_ENCRYPTION_KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';

// All mock fns must be hoisted so vi.mock factories can capture them
const mocks = vi.hoisted(() => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
  getExceptionWithFile: vi.fn(),
  getTenantById: vi.fn().mockResolvedValue(null),
  extractPdfText: vi.fn(),
  classifyDocType: vi.fn().mockReturnValue({ documentType: 'purchase_invoice', taxTypeHint: 'gross' }),
  matchFingerprint: vi.fn().mockResolvedValue({
    matched: false, fingerprintId: null, vendorName: null, contactId: null,
    documentTypeRule: null, classificationExamples: [],
  }),
  classifyDocument: vi.fn(),
  verifyMath: vi.fn().mockReturnValue({
    passed: true, calculatedGross: 119, statedGross: 119, difference: 0,
    lineItemCheck: true, taxCalculationCheck: true,
  }),
  buildVoucherPayloads: vi.fn().mockReturnValue({
    payloads: [{ type: 'purchaseinvoice', voucherStatus: 'open', voucherItems: [], taxType: 'gross' }],
  }),
  updateKnowledge: vi.fn().mockResolvedValue(undefined),
  getPostingCategories: vi.fn().mockResolvedValue([]),
  clientRequest: vi.fn(),
  clientWrite: vi.fn(),
  clientWriteWithRetry: vi.fn().mockResolvedValue({ ok: true, data: { id: 'new-v-id' } }),
  clientMultipart: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@lexware/db', () => ({
  query: mocks.query,
  getExceptionWithFile: mocks.getExceptionWithFile,
  getTenantById: mocks.getTenantById,
}));

vi.mock('@lexware/crypto', async (importOriginal) => {
  const real = await importOriginal<typeof import('@lexware/crypto')>();
  return { ...real };
});

vi.mock('../processor/pdf-extractor.js', () => ({ extractPdfText: mocks.extractPdfText }));
vi.mock('../processor/document-classifier.js', () => ({ classifyDocument: mocks.classifyDocType }));
vi.mock('../processor/fingerprint-matcher.js', () => ({ matchFingerprint: mocks.matchFingerprint }));
vi.mock('../classifier/classify.js', () => ({ classifyDocument: mocks.classifyDocument }));
vi.mock('../classifier/math-verifier.js', () => ({ verifyMath: mocks.verifyMath }));
vi.mock('../voucher/voucher-builder.js', () => ({ buildVoucherPayloads: mocks.buildVoucherPayloads }));
vi.mock('../learning/update-knowledge.js', () => ({ updateKnowledge: mocks.updateKnowledge }));
vi.mock('../categories.js', () => ({ getPostingCategories: mocks.getPostingCategories }));
vi.mock('../classifier/anthropic-client.js', () => ({
  AnthropicClassifier: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('@lexware/client', () => ({
  LexwareClient: vi.fn().mockImplementation(() => ({
    request: mocks.clientRequest,
    writeRequest: mocks.clientWrite,
    writeWithRetry: mocks.clientWriteWithRetry,
    multipartRequest: mocks.clientMultipart,
  })),
}));

import { processResumeJob } from '../resume/process-resume.js';

// ── Test data ─────────────────────────────────────────────────────────────────

const FAKE_FILE_BUFFER = Buffer.from('fake-pdf-content');

const FAKE_EXCEPTION_DATA = {
  exception: {
    id: 'ex-uuid',
    tenant_id: 'tenant-uuid',
    payload: { lexwareDraftVoucherId: 'draft-v-uuid' },
    reference_docs: [],
    original_file_base64: FAKE_FILE_BUFFER.toString('base64'),
    original_mime_type: 'application/pdf',
    status: 'awaiting_approval',
  },
  sessions: [
    {
      id: 'sess-1',
      question: 'What type of expense is this?',
      context_json: { triggerId: 'unknown_vendor', exceptionId: 'ex-uuid' },
      answer: 'This is a marketing expense',
      status: 'answered',
    },
  ],
  fileBuffer: FAKE_FILE_BUFFER,
  mimeType: 'application/pdf',
};

const FAKE_EXTRACTED = {
  rawText: 'Invoice text', cleanText: 'Invoice text', vatId: 'DE123456789',
  iban: null, invoiceNumber: 'RE-001', invoiceDate: '2026-04-05',
  dueDate: null, totalGrossAmount: 119, totalTaxAmount: 19,
  taxRateRows: [{ rate: 19, net: 100, tax: 19, gross: 119 }],
  pageCount: 1, textSignals: [],
};

const FAKE_CLASSIFICATION = {
  kind: 'purchase_invoice',
  confidence: 0.9,
  passUsed: 1,
  data: {
    voucherType: 'purchaseinvoice', taxType: 'gross', overallConfidence: 0.9,
    lineItems: [{ grossAmount: 119, taxAmount: 19, taxRatePercent: 19, categoryId: 'cat-1', confidence: 0.9 }],
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('processResumeJob', () => {
  beforeEach(() => {
    mocks.getExceptionWithFile.mockResolvedValue(FAKE_EXCEPTION_DATA);
    mocks.extractPdfText.mockResolvedValue(FAKE_EXTRACTED);
    mocks.classifyDocument.mockResolvedValue(FAKE_CLASSIFICATION);
    mocks.clientRequest.mockResolvedValue({ id: 'draft-v-uuid', version: 1, voucherItems: [] });
    mocks.query.mockResolvedValue({ rows: [] });
  });
  afterEach(() => vi.clearAllMocks());

  it('loads file buffer from exception and re-extracts', async () => {
    await processResumeJob('ex-uuid', 'tenant-uuid');
    expect(mocks.getExceptionWithFile).toHaveBeenCalledWith('ex-uuid');
    expect(mocks.extractPdfText).toHaveBeenCalled();
    const extractArg = mocks.extractPdfText.mock.calls[0][0] as Buffer;
    expect(Buffer.isBuffer(extractArg)).toBe(true);
  });

  it('injects clarification context into classifyDocument call', async () => {
    await processResumeJob('ex-uuid', 'tenant-uuid');
    expect(mocks.classifyDocument).toHaveBeenCalled();
    const context = mocks.classifyDocument.mock.calls[0][8]; // 9th arg
    expect(context).toBeDefined();
    expect(context.answeredQuestions).toHaveLength(1);
    expect(context.answeredQuestions[0].triggerId).toBe('unknown_vendor');
    expect(context.answeredQuestions[0].answer).toBe('This is a marketing expense');
  });

  it('updates existing draft voucher when classification succeeds', async () => {
    await processResumeJob('ex-uuid', 'tenant-uuid');
    expect(mocks.clientWriteWithRetry).toHaveBeenCalledWith(
      `/v1/vouchers/draft-v-uuid`,
      'PUT',
      expect.objectContaining({ voucherStatus: 'open' }),
      expect.any(Function),
    );
  });

  it('creates new voucher when draft returns 404', async () => {
    mocks.clientRequest.mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404 }));
    mocks.clientWrite.mockResolvedValue({ ok: true, data: { id: 'new-voucher-uuid' } });
    await processResumeJob('ex-uuid', 'tenant-uuid');
    expect(mocks.clientWrite).toHaveBeenCalledWith('/v1/vouchers', 'POST', expect.any(Object));
  });

  it('marks exception resolved after success', async () => {
    await processResumeJob('ex-uuid', 'tenant-uuid');
    const resolveCall = mocks.query.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes("'resolved'"),
    );
    expect(resolveCall).toBeDefined();
    expect((resolveCall as unknown[])[1]).toContain('ex-uuid');
  });

  it('calls updateKnowledge after resolution', async () => {
    await processResumeJob('ex-uuid', 'tenant-uuid');
    await vi.waitFor(() => expect(mocks.updateKnowledge).toHaveBeenCalled(), { timeout: 1000 });
  });
});
