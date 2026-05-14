import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@lexware/db', () => ({
  query: vi.fn(),
}));

import { GET } from '@/app/api/health/route';
import { query } from '@lexware/db';

const mockQuery = query as ReturnType<typeof vi.fn>;

describe('GET /api/health', () => {
  afterEach(() => vi.clearAllMocks());

  it('returns 200 with status: ok when DB is connected', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe('ok');
    expect(data.db).toBe('connected');
  });

  it('returns 503 with status: degraded when DB fails', async () => {
    mockQuery.mockRejectedValue(new Error('Connection refused'));
    const res = await GET();
    expect(res.status).toBe(503);
    const data = await res.json() as any;
    expect(data.status).toBe('degraded');
    expect(data.db).toBe('error');
  });

  it('response body contains all required fields', async () => {
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    const res = await GET();
    const data = await res.json() as any;
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('db');
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('uptime');
    expect(data).toHaveProperty('timestamp');
    expect(typeof data.uptime).toBe('number');
    expect(typeof data.timestamp).toBe('string');
  });
});
