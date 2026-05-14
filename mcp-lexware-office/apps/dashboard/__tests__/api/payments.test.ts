import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/app/lib/auth', () => ({
  requireAuth: vi.fn().mockReturnValue(null),
  getApiKey: vi.fn().mockReturnValue('test-api-key'),
}));

vi.mock('@/app/lib/lexware', () => ({
  getPaymentStatus: vi.fn(),
}));

import { GET } from '@/app/api/payments/[voucherId]/route';
import { getPaymentStatus } from '@/app/lib/lexware';
import { requireAuth } from '@/app/lib/auth';

const mockGetPayment = getPaymentStatus as ReturnType<typeof vi.fn>;
const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;

function makeRequest(voucherId = 'voucher-uuid') {
  return new Request(`http://localhost/api/payments/${voucherId}`);
}

describe('GET /api/payments/[voucherId]', () => {
  beforeEach(() => {
    mockRequireAuth.mockReturnValue(null);
  });
  afterEach(() => vi.clearAllMocks());

  it('returns 401 without auth', async () => {
    mockRequireAuth.mockReturnValue(Response.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await GET(makeRequest(), { params: Promise.resolve({ voucherId: 'v-1' }) });
    expect(res.status).toBe(401);
  });

  it('returns payment status for balanced voucher', async () => {
    mockGetPayment.mockResolvedValue({
      paymentStatus: 'balanced',
      openAmount: '0.00',
      voucherStatus: 'paid',
      deeplink: 'https://app.lexware.de/permalink/vouchers/view/v-1',
    });
    const res = await GET(makeRequest('v-1'), { params: Promise.resolve({ voucherId: 'v-1' }) });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.paymentStatus).toBe('balanced');
    expect(data.openAmount).toBe('0.00');
  });

  it('returns openRevenue status for unpaid sales invoice', async () => {
    mockGetPayment.mockResolvedValue({
      paymentStatus: 'openRevenue',
      openAmount: '119.00',
      voucherStatus: 'open',
      deeplink: 'https://app.lexware.de/...',
    });
    const res = await GET(makeRequest('v-2'), { params: Promise.resolve({ voucherId: 'v-2' }) });
    const data = await res.json() as any;
    expect(data.paymentStatus).toBe('openRevenue');
  });

  it('returns openExpense status for unpaid purchase invoice', async () => {
    mockGetPayment.mockResolvedValue({
      paymentStatus: 'openExpense',
      openAmount: '458.90',
      voucherStatus: 'open',
      deeplink: 'https://app.lexware.de/...',
    });
    const res = await GET(makeRequest('v-3'), { params: Promise.resolve({ voucherId: 'v-3' }) });
    const data = await res.json() as any;
    expect(data.paymentStatus).toBe('openExpense');
  });

  it('returns deeplink in response', async () => {
    mockGetPayment.mockResolvedValue({
      paymentStatus: 'balanced',
      openAmount: '0.00',
      voucherStatus: 'paid',
      deeplink: 'https://app.lexware.de/permalink/vouchers/view/voucher-uuid',
    });
    const res = await GET(makeRequest(), { params: Promise.resolve({ voucherId: 'voucher-uuid' }) });
    const data = await res.json() as any;
    expect(data.deeplink).toContain('voucher-uuid');
  });

  it('returns 500 when Lexware client throws', async () => {
    mockGetPayment.mockRejectedValue(new Error('network error'));
    const res = await GET(makeRequest(), { params: Promise.resolve({ voucherId: 'v-err' }) });
    expect(res.status).toBe(500);
  });

  it('calls getPaymentStatus with correct voucherId and apiKey', async () => {
    mockGetPayment.mockResolvedValue({ paymentStatus: 'balanced', openAmount: '0.00', voucherStatus: 'paid', deeplink: '' });
    await GET(makeRequest('specific-id'), { params: Promise.resolve({ voucherId: 'specific-id' }) });
    expect(mockGetPayment).toHaveBeenCalledWith('specific-id', 'test-api-key');
  });
});
