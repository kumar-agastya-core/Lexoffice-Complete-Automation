import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.MASTER_ENCRYPTION_KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

vi.mock('@lexware/client', async (importOriginal) => {
  const real = await importOriginal<typeof import('@lexware/client')>();
  return {
    ...real,
    LexwareClient: vi.fn().mockImplementation(() => ({
      request: vi.fn().mockResolvedValue({ companyName: 'Test GmbH', vatRegistrationId: 'DE123456789' }),
    })),
  };
});

vi.mock('@lexware/db', () => ({
  query: vi.fn(),
}));

// DO NOT mock @lexware/crypto so encryption is tested for real
import { POST } from '@/app/api/onboarding/create/route';
import { query } from '@lexware/db';

const mockQuery = query as ReturnType<typeof vi.fn>;

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/onboarding/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/onboarding/create', () => {
  beforeEach(() => {
    // First query: slug uniqueness check → no matches
    // Second query: INSERT → returns tenantId
    // Third query: INSERT initial_sync_progress
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // slug check
      .mockResolvedValueOnce({ rows: [{ id: 'new-tenant-uuid' }] }) // INSERT tenant
      .mockResolvedValueOnce({ rows: [] }); // INSERT progress
  });
  afterEach(() => vi.clearAllMocks());

  it('returns tenantId and inboundEmail on success', async () => {
    const res = await POST(makeRequest({ apiKey: 'valid-key', businessTypeId: 'gastronomy' }));
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.tenantId).toBe('new-tenant-uuid');
    expect(data.slug).toBeTruthy();
    expect(data.inboundEmail).toContain('@');
  });

  it('generates URL-safe slug from company name', async () => {
    const res = await POST(makeRequest({ apiKey: 'valid-key', businessTypeId: 'retail' }));
    const data = await res.json() as any;
    expect(data.slug).toMatch(/^[a-z0-9-]+$/);
    expect(data.slug.length).toBeLessThanOrEqual(20);
  });

  it('slug is max 20 chars for long company names', async () => {
    const { LexwareClient } = await import('@lexware/client');
    (LexwareClient as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      request: vi.fn().mockResolvedValue({ companyName: 'Sehr Langer Firmenname GmbH & Co. KG' }),
    }));
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'uuid-2' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await POST(makeRequest({ apiKey: 'valid-key', businessTypeId: 'other' }));
    const data = await res.json() as any;
    expect(data.slug.length).toBeLessThanOrEqual(20);
  });

  it('appends suffix when slug is taken', async () => {
    mockQuery.mockReset(); // override beforeEach setup with slug-taken scenario
    mockQuery
      .mockResolvedValueOnce({ rows: [{ slug: 'test-gmbh' }] }) // slug check → taken
      .mockResolvedValueOnce({ rows: [{ id: 'uuid-3' }] })      // INSERT tenant
      .mockResolvedValueOnce({ rows: [] });                      // INSERT progress
    const res = await POST(makeRequest({ apiKey: 'valid-key', businessTypeId: 'it_consulting' }));
    const data = await res.json() as any;
    // Should have suffix -2
    expect(data.slug).not.toBe('test-gmbh');
    expect(data.slug).toMatch(/-2$/);
  });

  it('calls encryptSecret (INSERT contains encrypted key, not plaintext)', async () => {
    await POST(makeRequest({ apiKey: 'my-secret-api-key', businessTypeId: 'gastronomy' }));
    const insertCall = mockQuery.mock.calls[1]; // second call = INSERT
    const insertParams = insertCall[1] as string[];
    // The API key stored must NOT be the plaintext
    expect(insertParams).not.toContain('my-secret-api-key');
    // The encrypted value should be a base64 string
    const encryptedParam = insertParams.find((p) => typeof p === 'string' && p.length > 40 && !p.includes('GmbH'));
    expect(encryptedParam).toBeTruthy();
  });

  it('returns 400 for missing businessTypeId', async () => {
    const res = await POST(makeRequest({ apiKey: 'key' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid businessTypeId', async () => {
    const res = await POST(makeRequest({ apiKey: 'key', businessTypeId: 'invalid-type' }));
    expect(res.status).toBe(400);
  });
});
