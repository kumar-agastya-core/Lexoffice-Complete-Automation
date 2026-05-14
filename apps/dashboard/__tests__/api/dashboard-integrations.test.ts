import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/app/lib/auth', () => ({
  requireAuth: vi.fn().mockReturnValue(null),
  getTenantId: vi.fn().mockReturnValue('test-tenant'),
  getApiKey: vi.fn().mockReturnValue('test-key'),
}));

// Mock global fetch (worker HTTP calls)
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { POST as sumupPOST } from '@/app/api/integrations/sumup/upload/route';
import { POST as helloCashPOST } from '@/app/api/integrations/hellocash/upload/route';

function makeFormRequest(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return new Request('http://localhost/api/integrations/sumup/upload', {
    method: 'POST',
    body: fd,
  });
}

function makePdfFile(name: string): File {
  const content = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF magic
  return new File([content], name, { type: 'application/pdf' });
}

describe('POST /api/integrations/sumup/upload', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('returns 415 for non-PDF files', async () => {
    const csvFile = new File(['data'], 'report.txt', { type: 'text/plain' });
    const res = await sumupPOST(makeFormRequest(csvFile));
    expect(res.status).toBe(415);
  });

  it('proxies to worker and returns queued count', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ queued: 2, hasLoan: false, period: '2026-04-01 – 2026-04-30' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const res = await sumupPOST(makeFormRequest(makePdfFile('sumup.pdf')));
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.queued).toBe(2);
  });

  it('returns hasLoan flag correctly', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ queued: 2, hasLoan: true, period: '2026-04-01 – 2026-04-30' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const res = await sumupPOST(makeFormRequest(makePdfFile('sumup.pdf')));
    const data = await res.json() as any;
    expect(data.hasLoan).toBe(true);
  });

  it('returns 502 when worker fails', async () => {
    mockFetch.mockResolvedValue(
      new Response('Processing failed', { status: 500 }),
    );
    const res = await sumupPOST(makeFormRequest(makePdfFile('sumup.pdf')));
    expect(res.status).toBe(502);
  });
});

describe('POST /api/integrations/hellocash/upload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('proxies to worker and returns kassenbuchEntries count', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ queued: 2, kassenbuchEntries: 5, period: '2026-04-01 – 2026-04-30' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const pdfReq = new Request('http://localhost/api/integrations/hellocash/upload', {
      method: 'POST',
      body: (() => { const fd = new FormData(); fd.append('file', makePdfFile('hc.pdf')); return fd; })(),
    });
    const res = await helloCashPOST(pdfReq);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.kassenbuchEntries).toBe(5);
  });
});
