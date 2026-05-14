import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the DB layer before importing route handler
vi.mock('@/app/lib/db', () => ({
  getExceptions: vi.fn(),
}));

vi.mock('@/app/lib/auth', () => ({
  requireAuth: vi.fn(),
  getTenantId: vi.fn().mockReturnValue('test-tenant'),
}));

import { GET } from '@/app/api/exceptions/route';
import { getExceptions } from '@/app/lib/db';
import { requireAuth } from '@/app/lib/auth';

const mockGetExceptions = getExceptions as ReturnType<typeof vi.fn>;
const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;

function makeRequest(url = 'http://localhost/api/exceptions') {
  return new Request(url);
}

describe('GET /api/exceptions', () => {
  beforeEach(() => {
    mockRequireAuth.mockReturnValue(null); // auth passes
    mockGetExceptions.mockResolvedValue({ rows: [], total: 0 });
  });
  afterEach(() => vi.clearAllMocks());

  it('returns 401 when requireAuth returns a response', async () => {
    mockRequireAuth.mockReturnValue(Response.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('returns empty list when no exceptions', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.exceptions).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.page).toBe(1);
  });

  it('passes status=pending by default', async () => {
    await GET(makeRequest());
    expect(mockGetExceptions).toHaveBeenCalledWith('test-tenant', 'pending', 1, 20);
  });

  it('passes status=all when requested', async () => {
    await GET(makeRequest('http://localhost/api/exceptions?status=all'));
    expect(mockGetExceptions).toHaveBeenCalledWith('test-tenant', 'all', 1, 20);
  });

  it('passes status=resolved when requested', async () => {
    await GET(makeRequest('http://localhost/api/exceptions?status=resolved'));
    expect(mockGetExceptions).toHaveBeenCalledWith('test-tenant', 'resolved', 1, 20);
  });

  it('defaults unknown status to pending', async () => {
    await GET(makeRequest('http://localhost/api/exceptions?status=bogus'));
    expect(mockGetExceptions).toHaveBeenCalledWith('test-tenant', 'pending', 1, 20);
  });

  it('respects page parameter', async () => {
    await GET(makeRequest('http://localhost/api/exceptions?page=3'));
    expect(mockGetExceptions).toHaveBeenCalledWith('test-tenant', 'pending', 3, 20);
  });

  it('respects pageSize parameter', async () => {
    await GET(makeRequest('http://localhost/api/exceptions?pageSize=50'));
    expect(mockGetExceptions).toHaveBeenCalledWith('test-tenant', 'pending', 1, 50);
  });

  it('caps pageSize at 100', async () => {
    await GET(makeRequest('http://localhost/api/exceptions?pageSize=999'));
    expect(mockGetExceptions).toHaveBeenCalledWith('test-tenant', 'pending', 1, 100);
  });

  it('returns 500 when DB throws', async () => {
    mockGetExceptions.mockRejectedValue(new Error('DB down'));
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
  });

  it('returns correct pagination metadata', async () => {
    mockGetExceptions.mockResolvedValue({
      rows: [{ id: 'ex-1', status: 'pending', payload: {}, created_at: new Date().toISOString() }],
      total: 42,
    });
    const res = await GET(makeRequest('http://localhost/api/exceptions?page=2&pageSize=10'));
    const data = await res.json() as any;
    expect(data.total).toBe(42);
    expect(data.page).toBe(2);
    expect(data.pageSize).toBe(10);
    expect(data.exceptions).toHaveLength(1);
  });
});
