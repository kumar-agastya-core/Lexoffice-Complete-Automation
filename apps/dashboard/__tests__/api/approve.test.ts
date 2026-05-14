import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/app/lib/db', () => ({
  getException: vi.fn(),
  resolveException: vi.fn(),
}));

vi.mock('@/app/lib/auth', () => ({
  requireAuth: vi.fn().mockReturnValue(null),
  getApiKey: vi.fn().mockReturnValue('test-api-key'),
}));

vi.mock('@/app/lib/lexware', () => ({
  approveVoucher: vi.fn(),
}));

import { POST } from '@/app/api/exceptions/[id]/approve/route';
import { getException, resolveException } from '@/app/lib/db';
import { approveVoucher } from '@/app/lib/lexware';

const mockGetException = getException as ReturnType<typeof vi.fn>;
const mockResolve = resolveException as ReturnType<typeof vi.fn>;
const mockApprove = approveVoucher as ReturnType<typeof vi.fn>;

const AWAITING_EXCEPTION = {
  id: 'ex-uuid',
  status: 'awaiting_approval',
  payload: {
    lexwareDraftVoucherId: 'draft-voucher-uuid',
    lexwareDeeplink: 'https://app.lexware.de/permalink/vouchers/edit/draft-voucher-uuid',
    triggerReasons: ['unknown_vendor'],
  },
  sessions: [],
};

function makeRequest() {
  return new Request('http://localhost/api/exceptions/ex-uuid/approve', { method: 'POST' });
}

describe('POST /api/exceptions/[id]/approve', () => {
  beforeEach(() => {
    mockGetException.mockResolvedValue(AWAITING_EXCEPTION);
    mockApprove.mockResolvedValue({ success: true });
    mockResolve.mockResolvedValue(undefined);
  });
  afterEach(() => vi.clearAllMocks());

  it('returns 404 when exception not found', async () => {
    mockGetException.mockResolvedValue(null);
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 'missing' }) });
    expect(res.status).toBe(404);
  });

  it('returns 409 when exception is not awaiting_approval', async () => {
    mockGetException.mockResolvedValue({ ...AWAITING_EXCEPTION, status: 'pending' });
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 'ex-uuid' }) });
    expect(res.status).toBe(409);
    const data = await res.json() as any;
    expect(data.error).toContain('pending');
  });

  it('returns 422 when no voucherId on exception', async () => {
    mockGetException.mockResolvedValue({
      ...AWAITING_EXCEPTION,
      payload: { ...AWAITING_EXCEPTION.payload, lexwareDraftVoucherId: null },
    });
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 'ex-uuid' }) });
    expect(res.status).toBe(422);
  });

  it('calls approveVoucher with correct voucherId and apiKey', async () => {
    await POST(makeRequest(), { params: Promise.resolve({ id: 'ex-uuid' }) });
    expect(mockApprove).toHaveBeenCalledWith('draft-voucher-uuid', 'test-api-key');
  });

  it('returns 502 when Lexware API fails', async () => {
    mockApprove.mockResolvedValue({ success: false, error: 'API error 409' });
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 'ex-uuid' }) });
    expect(res.status).toBe(502);
  });

  it('resolves exception in DB on success', async () => {
    await POST(makeRequest(), { params: Promise.resolve({ id: 'ex-uuid' }) });
    expect(mockResolve).toHaveBeenCalledWith('ex-uuid', 'draft-voucher-uuid');
  });

  it('returns success with voucherId and deeplink', async () => {
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 'ex-uuid' }) });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.voucherId).toBe('draft-voucher-uuid');
    expect(data.deeplink).toContain('draft-voucher-uuid');
  });

  it('409 retry flow: approveVoucher called once (retry is internal to approveVoucher)', async () => {
    // approveVoucher in lexware.ts handles 409 retry internally via writeWithRetry
    // Here we just assert the route calls it once and propagates the result
    mockApprove.mockResolvedValue({ success: true });
    await POST(makeRequest(), { params: Promise.resolve({ id: 'ex-uuid' }) });
    expect(mockApprove).toHaveBeenCalledTimes(1);
  });
});
