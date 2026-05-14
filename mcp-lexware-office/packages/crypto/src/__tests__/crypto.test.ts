import { describe, it, expect, beforeAll } from 'vitest';

// Must set before importing module
process.env.MASTER_ENCRYPTION_KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

import {
  encryptSecret,
  decryptSecret,
  hashApiKey,
  verifyHmacSignature,
} from '../index.js';

describe('encryptSecret / decryptSecret', () => {
  it('round-trip returns the original string', () => {
    const original = 'sk-lexware-supersecret-api-key-12345';
    const encrypted = encryptSecret(original);
    expect(decryptSecret(encrypted)).toBe(original);
  });

  it('round-trip works for unicode strings', () => {
    const original = 'Schlüssel mit Ümlauten und €';
    expect(decryptSecret(encryptSecret(original))).toBe(original);
  });

  it('two encryptions of the same string produce different ciphertexts (IV randomness)', () => {
    const secret = 'same-input-every-time';
    const a = encryptSecret(secret);
    const b = encryptSecret(secret);
    expect(a).not.toBe(b);
  });

  it('tampered ciphertext throws on decrypt', () => {
    const encrypted = encryptSecret('sensitive-api-key');
    const buf = Buffer.from(encrypted, 'base64');
    // Flip a byte in the ciphertext portion (after IV + authTag)
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString('base64');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('missing MASTER_ENCRYPTION_KEY throws', () => {
    const saved = process.env.MASTER_ENCRYPTION_KEY;
    delete process.env.MASTER_ENCRYPTION_KEY;
    expect(() => encryptSecret('test')).toThrow('MASTER_ENCRYPTION_KEY');
    process.env.MASTER_ENCRYPTION_KEY = saved;
  });
});

describe('hashApiKey', () => {
  it('is deterministic — same input produces same hash', () => {
    const key = 'lexware-api-key-abc123';
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it('different inputs produce different hashes', () => {
    expect(hashApiKey('key-a')).not.toBe(hashApiKey('key-b'));
  });

  it('returns 64-char hex string (SHA-256)', () => {
    expect(hashApiKey('any-key')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verifyHmacSignature', () => {
  it('returns true for valid signature', () => {
    const { createHmac } = require('crypto');
    const secret = 'webhook-secret';
    const payload = '{"eventType":"voucher.created"}';
    const sig = createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifyHmacSignature(payload, sig, secret)).toBe(true);
  });

  it('returns false for wrong secret', () => {
    const { createHmac } = require('crypto');
    const payload = '{"eventType":"voucher.created"}';
    const sig = createHmac('sha256', 'correct-secret').update(payload).digest('hex');
    expect(verifyHmacSignature(payload, sig, 'wrong-secret')).toBe(false);
  });

  it('returns false for tampered payload', () => {
    const { createHmac } = require('crypto');
    const secret = 'secret';
    const payload = '{"eventType":"voucher.created"}';
    const sig = createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifyHmacSignature(payload + '!', sig, secret)).toBe(false);
  });
});
