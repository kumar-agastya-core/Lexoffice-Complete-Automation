import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@lexware/client', () => ({
  LexwareClient: vi.fn(),
}));

import { POST } from '@/app/api/onboarding/validate/route';
import { LexwareClient } from '@lexware/client';

const MockClient = LexwareClient as ReturnType<typeof vi.fn>;

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/onboarding/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/onboarding/validate', () => {
  let mockRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRequest = vi.fn();
    MockClient.mockImplementation(() => ({ request: mockRequest }));
  });
  afterEach(() => vi.clearAllMocks());

  it('returns 400 when apiKey is missing', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.valid).toBe(false);
  });

  it('returns valid: true with profile data on success', async () => {
    mockRequest.mockResolvedValue({
      companyName: 'Test GmbH',
      vatRegistrationId: 'DE123456789',
      taxType: 'gross',
      smallBusiness: false,
    });
    const res = await POST(makeRequest({ apiKey: 'valid-key' }));
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.valid).toBe(true);
    expect(data.companyName).toBe('Test GmbH');
    expect(data.vatId).toBe('DE123456789');
  });

  it('returns valid: false when profile returns null (invalid key)', async () => {
    mockRequest.mockResolvedValue(null);
    const res = await POST(makeRequest({ apiKey: 'bad-key' }));
    const data = await res.json() as any;
    expect(data.valid).toBe(false);
  });

  it('returns 401-like valid:false on 401 error', async () => {
    mockRequest.mockRejectedValue(new Error('HTTP error! status: 401'));
    const res = await POST(makeRequest({ apiKey: 'invalid-key' }));
    const data = await res.json() as any;
    expect(data.valid).toBe(false);
    expect(data.error).toContain('Invalid API key');
  });

  it('returns 502 on network error', async () => {
    mockRequest.mockRejectedValue(new Error('Network failure'));
    const res = await POST(makeRequest({ apiKey: 'some-key' }));
    expect(res.status).toBe(502);
  });

  it('never logs or returns the API key', async () => {
    mockRequest.mockResolvedValue({ companyName: 'Co', vatRegistrationId: 'DE000000000' });
    const res = await POST(makeRequest({ apiKey: 'super-secret-key-12345' }));
    const text = await res.text();
    expect(text).not.toContain('super-secret-key-12345');
  });
});
