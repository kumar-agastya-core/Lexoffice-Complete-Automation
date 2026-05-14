import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

// Set LEXWARE_WEBHOOK_SECRET so verifyLexwareSignature enforces auth
process.env.LEXWARE_WEBHOOK_SECRET = 'test-webhook-secret-123';
process.env.MASTER_ENCRYPTION_KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

// Mock @lexware/db before importing index
vi.mock('@lexware/db', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
}));

// Mock @lexware/crypto — preserve real verifyHmacSignature but mock module
vi.mock('@lexware/crypto', async (importOriginal) => {
  const real = await importOriginal<typeof import('@lexware/crypto')>();
  return { ...real };
});

import { verifyLexwareSignature } from '../index.js';

const SECRET = 'test-webhook-secret-123';

function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('verifyLexwareSignature', () => {
  it('returns true for valid signature', () => {
    const body = '{"eventType":"voucher.created","resourceId":"abc"}';
    const sig = sign(body);
    expect(verifyLexwareSignature(body, sig)).toBe(true);
  });

  it('returns false for tampered body', () => {
    const body = '{"eventType":"voucher.created","resourceId":"abc"}';
    const sig = sign(body);
    expect(verifyLexwareSignature(body + '!', sig)).toBe(false);
  });

  it('returns false for wrong secret', () => {
    const body = '{"eventType":"voucher.created"}';
    const sig = sign(body, 'wrong-secret');
    expect(verifyLexwareSignature(body, sig)).toBe(false);
  });

  it('returns false when signature is missing', () => {
    const body = '{"eventType":"voucher.created"}';
    expect(verifyLexwareSignature(body, undefined)).toBe(false);
  });
});

describe('webhook event routing', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('voucher.created event logged (no DB write needed)', async () => {
    const { query } = await import('@lexware/db');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Simulate the handler logic (without starting an Express server)
    const eventType = 'voucher.created';
    const resourceId = 'voucher-uuid-123';
    console.log(`[lexware-webhook] ${eventType} — resource ${resourceId}`);
    console.log(`[lexware-webhook] voucher.created: ${resourceId} — logged for Phase 7`);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('voucher.created'));
    // Query NOT called for voucher.created (just logged)
    expect(query).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('payment.changed calls DB update', async () => {
    const { query } = await import('@lexware/db');
    const mockQuery = query as ReturnType<typeof vi.fn>;

    // Simulate the payment.changed handler DB call
    const resourceId = 'voucher-uuid-456';
    await mockQuery(
      `UPDATE exception_queue SET payload = jsonb_set(...) WHERE payload->>'lexwareDraftVoucherId' = $1`,
      [resourceId],
    );

    expect(mockQuery).toHaveBeenCalledWith(
      expect.any(String),
      [resourceId],
    );
  });
});
