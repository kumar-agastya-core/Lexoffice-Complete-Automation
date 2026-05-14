import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

// Mock the logger before importing helper
vi.mock('../logger.js', () => ({
	logger: { log: vi.fn(), error: vi.fn() },
}));

// Set env var before import
process.env.LEXWARE_OFFICE_API_KEY = 'test-key-for-unit-tests';

const {
	makeLexwareOfficeRequest,
	makeLexwareOfficeWriteRequest,
	makeLexwareOfficeDeleteRequest,
	makeLexwareOfficeFileUploadRequest,
	makeLexwareOfficeWriteWithRetry,
	paginateAll,
	resetRateLimitForTesting,
} = await import('../helper.js');

describe('makeLexwareOfficeRequest', () => {
	beforeEach(() => {
		resetRateLimitForTesting();
		vi.stubGlobal('fetch', vi.fn());
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns parsed JSON on 200', async () => {
		const mockData = { id: 'abc', name: 'Test' };
		(fetch as any).mockResolvedValueOnce(
			new Response(JSON.stringify(mockData), { status: 200 }),
		);
		const result = await makeLexwareOfficeRequest('/v1/test');
		expect(result).toEqual(mockData);
	});

	it('returns null on network error', async () => {
		(fetch as any).mockRejectedValueOnce(new Error('network failure'));
		const result = await makeLexwareOfficeRequest('/v1/test');
		expect(result).toBeNull();
	});

	it('returns null on non-ok HTTP status', async () => {
		(fetch as any).mockResolvedValueOnce(new Response('{}', { status: 404 }));
		const result = await makeLexwareOfficeRequest('/v1/test');
		expect(result).toBeNull();
	});

	it('retries on 429 up to MAX_RETRIES times', async () => {
		const mockFetch = vi.fn()
			.mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
			.mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

		vi.stubGlobal('fetch', mockFetch);
		vi.useFakeTimers();

		const promise = makeLexwareOfficeRequest('/v1/test');
		await vi.runAllTimersAsync();
		const result = await promise;

		expect(result).toEqual({ ok: true });
		expect(mockFetch).toHaveBeenCalledTimes(3);

		vi.useRealTimers();
	});

	it('sends correct Authorization header', async () => {
		(fetch as any).mockResolvedValueOnce(
			new Response(JSON.stringify({}), { status: 200 }),
		);
		await makeLexwareOfficeRequest('/v1/test');
		const callArgs = (fetch as any).mock.calls[0];
		expect(callArgs[1].headers['Authorization']).toBe('Bearer test-key-for-unit-tests');
	});
});

describe('makeLexwareOfficeWriteRequest', () => {
	beforeEach(() => {
		resetRateLimitForTesting();
		vi.stubGlobal('fetch', vi.fn());
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns ok:true with data on 200', async () => {
		const responseData = { id: 'new-id', version: 1 };
		(fetch as any).mockResolvedValueOnce(
			new Response(JSON.stringify(responseData), { status: 200 }),
		);
		const result = await makeLexwareOfficeWriteRequest('/v1/vouchers', 'POST', { type: 'purchaseinvoice' });
		expect(result).toEqual({ ok: true, data: responseData });
	});

	it('returns ok:false with status on 4xx', async () => {
		const errorBody = { message: 'Bad request' };
		(fetch as any).mockResolvedValueOnce(
			new Response(JSON.stringify(errorBody), { status: 400 }),
		);
		const result = await makeLexwareOfficeWriteRequest('/v1/vouchers', 'POST', {});
		expect(result).toMatchObject({ ok: false, status: 400 });
	});

	it('returns null on network error', async () => {
		(fetch as any).mockRejectedValueOnce(new Error('timeout'));
		const result = await makeLexwareOfficeWriteRequest('/v1/vouchers', 'POST', {});
		expect(result).toBeNull();
	});

	it('sends correct Authorization header', async () => {
		(fetch as any).mockResolvedValueOnce(
			new Response(JSON.stringify({}), { status: 200 }),
		);
		await makeLexwareOfficeWriteRequest('/v1/test', 'POST', {});
		const callArgs = (fetch as any).mock.calls[0];
		expect(callArgs[1].headers['Authorization']).toBe('Bearer test-key-for-unit-tests');
	});

	it('sends Content-Type: application/json', async () => {
		(fetch as any).mockResolvedValueOnce(
			new Response(JSON.stringify({}), { status: 200 }),
		);
		await makeLexwareOfficeWriteRequest('/v1/test', 'PUT', { version: 1 });
		const callArgs = (fetch as any).mock.calls[0];
		expect(callArgs[1].headers['Content-Type']).toBe('application/json');
	});
});

describe('makeLexwareOfficeDeleteRequest', () => {
	beforeEach(() => {
		resetRateLimitForTesting();
		vi.stubGlobal('fetch', vi.fn());
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns ok:true on 204', async () => {
		(fetch as any).mockResolvedValueOnce(new Response(null, { status: 204 }));
		const result = await makeLexwareOfficeDeleteRequest('/v1/articles/abc');
		expect(result).toEqual({ ok: true });
	});

	it('returns ok:false with status on non-204', async () => {
		(fetch as any).mockResolvedValueOnce(
			new Response(JSON.stringify({ message: 'Not found' }), { status: 404 }),
		);
		const result = await makeLexwareOfficeDeleteRequest('/v1/articles/missing');
		expect(result).toMatchObject({ ok: false, status: 404 });
	});

	it('returns null on network error', async () => {
		(fetch as any).mockRejectedValueOnce(new Error('network down'));
		const result = await makeLexwareOfficeDeleteRequest('/v1/articles/abc');
		expect(result).toBeNull();
	});

	it('uses DELETE method', async () => {
		(fetch as any).mockResolvedValueOnce(new Response(null, { status: 204 }));
		await makeLexwareOfficeDeleteRequest('/v1/articles/abc');
		const callArgs = (fetch as any).mock.calls[0];
		expect(callArgs[1].method).toBe('DELETE');
	});
});

describe('makeLexwareOfficeFileUploadRequest', () => {
	const testFile = { buffer: Buffer.from('fake-pdf'), fileName: 'test.pdf', mimeType: 'application/pdf' };

	beforeEach(() => {
		resetRateLimitForTesting();
		vi.stubGlobal('fetch', vi.fn());
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns ok:true with data on 201', async () => {
		const responseData = { id: 'file-uuid' };
		(fetch as any).mockResolvedValueOnce(
			new Response(JSON.stringify(responseData), { status: 201 }),
		);
		const result = await makeLexwareOfficeFileUploadRequest('/v1/files', testFile);
		expect(result).toEqual({ ok: true, data: responseData });
	});

	it('returns ok:false on 4xx', async () => {
		(fetch as any).mockResolvedValueOnce(
			new Response(JSON.stringify({ message: 'Too large' }), { status: 413 }),
		);
		const result = await makeLexwareOfficeFileUploadRequest('/v1/files', testFile);
		expect(result).toMatchObject({ ok: false, status: 413 });
	});

	it('returns null on network error', async () => {
		(fetch as any).mockRejectedValueOnce(new Error('upload failed'));
		const result = await makeLexwareOfficeFileUploadRequest('/v1/files', testFile);
		expect(result).toBeNull();
	});

	it('sets Content-Type header with multipart boundary and correct MIME type', async () => {
		(fetch as any).mockResolvedValueOnce(
			new Response(JSON.stringify({}), { status: 200 }),
		);
		await makeLexwareOfficeFileUploadRequest('/v1/files', testFile);
		const callArgs = (fetch as any).mock.calls[0];
		expect(callArgs[1].headers['Content-Type']).toMatch(/^multipart\/form-data; boundary=/);
	});
});

describe('makeLexwareOfficeWriteWithRetry', () => {
	beforeEach(() => {
		resetRateLimitForTesting();
		vi.stubGlobal('fetch', vi.fn());
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns result directly on success (no 409)', async () => {
		const responseData = { id: 'abc', version: 2 };
		(fetch as any).mockResolvedValueOnce(
			new Response(JSON.stringify(responseData), { status: 200 }),
		);
		const result = await makeLexwareOfficeWriteWithRetry('/v1/vouchers/abc', 'PUT', { version: 1 });
		expect(result).toEqual({ ok: true, data: responseData });
	});

	it('retries PUT on 409 with fresh version', async () => {
		const conflictBody = { message: 'Version conflict' };
		const successBody = { id: 'abc', version: 3 };

		(fetch as any)
			.mockResolvedValueOnce(new Response(JSON.stringify(conflictBody), { status: 409 }))
			.mockResolvedValueOnce(new Response(JSON.stringify(successBody), { status: 200 }));

		const fetchFresh = vi.fn().mockResolvedValueOnce({ id: 'abc', version: 2 });
		const result = await makeLexwareOfficeWriteWithRetry(
			'/v1/vouchers/abc',
			'PUT',
			{ version: 1, type: 'purchaseinvoice' },
			fetchFresh,
		);

		expect(fetchFresh).toHaveBeenCalledOnce();
		expect(result).toEqual({ ok: true, data: successBody });
		const secondCall = (fetch as any).mock.calls[1];
		const body = JSON.parse(secondCall[1].body);
		expect(body.version).toBe(2);
	});

	it('returns 409 result if no fetchFreshVersion provided', async () => {
		(fetch as any).mockResolvedValueOnce(
			new Response(JSON.stringify({ message: 'conflict' }), { status: 409 }),
		);
		const result = await makeLexwareOfficeWriteWithRetry('/v1/vouchers/abc', 'PUT', { version: 1 });
		expect(result).toMatchObject({ ok: false, status: 409 });
	});

	it('does not retry POST on 409', async () => {
		(fetch as any).mockResolvedValueOnce(
			new Response(JSON.stringify({ message: 'conflict' }), { status: 409 }),
		);
		const fetchFresh = vi.fn();
		const result = await makeLexwareOfficeWriteWithRetry(
			'/v1/vouchers',
			'POST',
			{ type: 'purchaseinvoice' },
			fetchFresh,
		);
		expect(fetchFresh).not.toHaveBeenCalled();
		expect(result).toMatchObject({ ok: false, status: 409 });
	});
});

describe('paginateAll', () => {
	beforeEach(() => {
		resetRateLimitForTesting();
		vi.stubGlobal('fetch', vi.fn());
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('fetches single page when last=true', async () => {
		(fetch as any).mockResolvedValueOnce(
			new Response(JSON.stringify({ content: [{ id: '1' }, { id: '2' }], last: true }), { status: 200 }),
		);
		const result = await paginateAll('/v1/voucherlist', new URLSearchParams());
		expect(result).toEqual([{ id: '1' }, { id: '2' }]);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('paginates across multiple pages until last=true', async () => {
		(fetch as any)
			.mockResolvedValueOnce(new Response(JSON.stringify({ content: [{ id: '1' }], last: false }), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ content: [{ id: '2' }], last: false }), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ content: [{ id: '3' }], last: true }), { status: 200 }));

		const result = await paginateAll('/v1/voucherlist', new URLSearchParams());
		expect(result).toHaveLength(3);
		expect(result).toEqual([{ id: '1' }, { id: '2' }, { id: '3' }]);
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it('returns null when a page fetch fails', async () => {
		(fetch as any).mockRejectedValueOnce(new Error('network failure'));
		const result = await paginateAll('/v1/voucherlist', new URLSearchParams());
		expect(result).toBeNull();
	});

	it('sets page and size params on each request', async () => {
		(fetch as any).mockResolvedValueOnce(
			new Response(JSON.stringify({ content: [], last: true }), { status: 200 }),
		);
		await paginateAll('/v1/voucherlist', new URLSearchParams({ voucherType: 'invoice' }), 50);
		const url = (fetch as any).mock.calls[0][0] as string;
		expect(url).toContain('page=0');
		expect(url).toContain('size=50');
		expect(url).toContain('voucherType=invoice');
	});
});

describe('verifyWebhookHmac (via utils)', () => {
	const secret = 'webhook-signing-secret';
	const payload = '{"eventType":"voucher.created","resourceId":"abc-123"}';

	it('returns true for valid signature', async () => {
		const { verifyWebhookHmac } = await import('../utils.js');
		const sig = createHmac('sha256', secret).update(payload).digest('hex');
		expect(verifyWebhookHmac(payload, sig, secret)).toBe(true);
	});

	it('returns false for wrong signature', async () => {
		const { verifyWebhookHmac } = await import('../utils.js');
		expect(verifyWebhookHmac(payload, 'deadbeef', secret)).toBe(false);
	});

	it('returns false for tampered payload', async () => {
		const { verifyWebhookHmac } = await import('../utils.js');
		const sig = createHmac('sha256', secret).update(payload).digest('hex');
		expect(verifyWebhookHmac(payload + '!', sig, secret)).toBe(false);
	});

	it('returns false for wrong secret', async () => {
		const { verifyWebhookHmac } = await import('../utils.js');
		const sig = createHmac('sha256', 'different-secret').update(payload).digest('hex');
		expect(verifyWebhookHmac(payload, sig, secret)).toBe(false);
	});
});

describe('writeErrorResponse (via utils)', () => {
	it('formats 409 correctly', async () => {
		const { writeErrorResponse } = await import('../utils.js');
		expect(writeErrorResponse({ status: 409, error: {} })).toContain('Version conflict');
	});

	it('formats 404 correctly', async () => {
		const { writeErrorResponse } = await import('../utils.js');
		expect(writeErrorResponse({ status: 404, error: {} })).toBe('Record not found.');
	});

	it('formats 422 with message', async () => {
		const { writeErrorResponse } = await import('../utils.js');
		expect(writeErrorResponse({ status: 422, error: { message: 'Invalid taxType' } })).toContain('Invalid taxType');
	});

	it('handles null result', async () => {
		const { writeErrorResponse } = await import('../utils.js');
		expect(writeErrorResponse(null)).toContain('network or server error');
	});
});
