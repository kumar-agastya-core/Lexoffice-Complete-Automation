import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/app/lib/db', () => ({
  getSyncProgress: vi.fn(),
}));

import { GET } from '@/app/api/onboarding/sync-progress/route';
import { getSyncProgress } from '@/app/lib/db';

const mockGetProgress = getSyncProgress as ReturnType<typeof vi.fn>;

function makeRequest(tenantId?: string) {
  const url = tenantId
    ? `http://localhost/api/onboarding/sync-progress?tenantId=${tenantId}`
    : 'http://localhost/api/onboarding/sync-progress';
  return new Request(url);
}

const BASE_PROGRESS = {
  tenant_id: 'tenant-uuid',
  contacts_synced: 0,
  fingerprints_created: 0,
  categories_cached: 0,
  vouchers_learned: 0,
  error_message: null,
  started_at: null,
  completed_at: null,
};

describe('GET /api/onboarding/sync-progress', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns 400 when tenantId is missing', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it('returns 404 when progress not found', async () => {
    mockGetProgress.mockResolvedValue(null);
    const res = await GET(makeRequest('unknown-id'));
    expect(res.status).toBe(404);
  });

  it('returns pending status', async () => {
    mockGetProgress.mockResolvedValue({ ...BASE_PROGRESS, status: 'pending' });
    const res = await GET(makeRequest('tenant-uuid'));
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe('pending');
  });

  it('returns running status with progress counts', async () => {
    mockGetProgress.mockResolvedValue({
      ...BASE_PROGRESS,
      status: 'running',
      contacts_synced: 42,
      categories_cached: 80,
    });
    const res = await GET(makeRequest('tenant-uuid'));
    const data = await res.json() as any;
    expect(data.status).toBe('running');
    expect(data.contacts_synced).toBe(42);
    expect(data.categories_cached).toBe(80);
  });

  it('returns complete status', async () => {
    mockGetProgress.mockResolvedValue({
      ...BASE_PROGRESS,
      status: 'complete',
      contacts_synced: 150,
      categories_cached: 90,
      vouchers_learned: 200,
      completed_at: '2026-05-13T10:00:00Z',
    });
    const res = await GET(makeRequest('tenant-uuid'));
    const data = await res.json() as any;
    expect(data.status).toBe('complete');
    expect(data.vouchers_learned).toBe(200);
    expect(data.completed_at).toBeTruthy();
  });

  it('returns failed status with error message', async () => {
    mockGetProgress.mockResolvedValue({
      ...BASE_PROGRESS,
      status: 'failed',
      error_message: 'API rate limit exceeded',
    });
    const res = await GET(makeRequest('tenant-uuid'));
    const data = await res.json() as any;
    expect(data.status).toBe('failed');
    expect(data.error_message).toBe('API rate limit exceeded');
  });

  it('returns 500 on DB error', async () => {
    mockGetProgress.mockRejectedValue(new Error('DB connection failed'));
    const res = await GET(makeRequest('tenant-uuid'));
    expect(res.status).toBe(500);
  });
});
