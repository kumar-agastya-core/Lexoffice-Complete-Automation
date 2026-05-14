import { logger } from './logger.js';

const LEXWARE_OFFICE_API_KEY = process.env.LEXWARE_OFFICE_API_KEY ?? process.env.LEXWARE_API_KEY;
if (!LEXWARE_OFFICE_API_KEY) {
	logger.error('Error: LEXWARE_OFFICE_API_KEY or LEXWARE_API_KEY environment variable is required');
	process.exit(1);
}

const LEXWARE_API_BASE = 'https://api.lexware.io';
const USER_AGENT = 'mcp-lexware-office/0.6.0';

// ── Rate limiter — token bucket at 1.1 s gap (hard limit: 2 req/s) ──────────

const MIN_INTERVAL_MS = 1100;
let lastRequestAt = 0;

async function rateLimit(): Promise<void> {
	const now = Date.now();
	const wait = MIN_INTERVAL_MS - (now - lastRequestAt);
	if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
	lastRequestAt = Date.now();
}

/** Reset rate limit state — for use in unit tests only. */
export function resetRateLimitForTesting(): void {
	lastRequestAt = 0;
}

// ── Exponential backoff for 429 Too Many Requests ────────────────────────────

const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 2000;

async function withRetry<T>(fn: () => Promise<Response>): Promise<Response> {
	let delay = BACKOFF_BASE_MS;
	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		await rateLimit();
		const response = await fn();
		if (response.status !== 429) return response;
		if (attempt === MAX_RETRIES) return response;
		logger.log(`Rate limited (429) — retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
		await new Promise(resolve => setTimeout(resolve, delay));
		delay = Math.min(delay * 2, 32000);
	}
	// unreachable but satisfies TypeScript
	return fn();
}

// ── Shared auth headers ──────────────────────────────────────────────────────

function authHeaders(extra?: Record<string, string>): Record<string, string> {
	return {
		'User-Agent': USER_AGENT,
		Accept: 'application/json',
		Authorization: `Bearer ${LEXWARE_OFFICE_API_KEY}`,
		...extra,
	};
}

// ── Paginate all pages of a list endpoint ────────────────────────────────────

export async function paginateAll<T>(
	basePath: string,
	params: URLSearchParams,
	pageSize = 250,
): Promise<T[] | null> {
	const all: T[] = [];
	let page = 0;
	let isLast = false;
	while (!isLast) {
		params.set('page', String(page));
		params.set('size', String(pageSize));
		const data = await makeLexwareOfficeRequest<{ content: T[]; last: boolean }>(
			`${basePath}?${params.toString()}`,
		);
		if (!data) return null;
		all.push(...(data.content ?? []));
		isLast = data.last ?? true;
		page++;
	}
	return all;
}

// ── Public request helpers ───────────────────────────────────────────────────

export async function makeLexwareOfficeRequest<T>(path: string): Promise<T | null> {
	const url = `${LEXWARE_API_BASE}${path}`;
	logger.log('Making Lexware Office request', { url });

	try {
		const response = await withRetry(() => fetch(url, { headers: authHeaders() }));
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const json = await response.json();
		logger.log('Lexware Office response', { json });
		return json as T;
	} catch (error) {
		logger.error('Error making Lexware Office request', { error });
		return null;
	}
}

export async function makeLexwareOfficeFileRequest(
	path: string,
	accept: 'application/pdf' | 'application/xml',
): Promise<{ data: Buffer; mimeType: string } | null> {
	const url = `${LEXWARE_API_BASE}${path}`;
	logger.log('Making Lexware Office file request', { url });

	try {
		const response = await withRetry(() =>
			fetch(url, { headers: authHeaders({ Accept: accept }) }),
		);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const contentType = response.headers.get('Content-Type') ?? accept;
		const mimeType = contentType.split(';')[0].trim();
		const arrayBuffer = await response.arrayBuffer();
		const data = Buffer.from(arrayBuffer);
		logger.log('Lexware Office file response received', { mimeType, bytes: data.length });
		return { data, mimeType };
	} catch (error) {
		logger.error('Error making Lexware Office file request', { error });
		return null;
	}
}

export type WriteResult<T> =
	| { ok: true; data: T }
	| { ok: false; status: number; error: unknown };

export async function makeLexwareOfficeWriteRequest<T>(
	path: string,
	method: 'POST' | 'PUT',
	body: unknown,
): Promise<WriteResult<T> | null> {
	const url = `${LEXWARE_API_BASE}${path}`;
	logger.log('Making Lexware Office write request', { url, method });

	try {
		const response = await withRetry(() =>
			fetch(url, {
				method,
				headers: authHeaders({ 'Content-Type': 'application/json' }),
				body: JSON.stringify(body),
			}),
		);

		let responseBody: unknown;
		try {
			responseBody = await response.json();
		} catch {
			responseBody = null;
		}

		if (!response.ok) {
			logger.error('Lexware Office write request failed', {
				status: response.status,
				error: responseBody,
			});
			return { ok: false, status: response.status, error: responseBody };
		}

		logger.log('Lexware Office write response', { status: response.status });
		return { ok: true, data: responseBody as T };
	} catch (error) {
		logger.error('Error making Lexware Office write request', { error });
		return null;
	}
}

export async function makeLexwareOfficeDeleteRequest(
	path: string,
): Promise<{ ok: true } | { ok: false; status: number; error: unknown } | null> {
	const url = `${LEXWARE_API_BASE}${path}`;
	logger.log('Making Lexware Office DELETE request', { url });

	try {
		const response = await withRetry(() =>
			fetch(url, { method: 'DELETE', headers: authHeaders() }),
		);
		if (response.status === 204) return { ok: true };
		let responseBody: unknown;
		try { responseBody = await response.json(); } catch { responseBody = null; }
		logger.error('Lexware Office DELETE request failed', { status: response.status, error: responseBody });
		return { ok: false, status: response.status, error: responseBody };
	} catch (error) {
		logger.error('Error making Lexware Office DELETE request', { error });
		return null;
	}
}

export async function makeLexwareOfficeFileUploadRequest<T>(
	path: string,
	file: { buffer: Buffer; fileName: string; mimeType: string },
): Promise<WriteResult<T> | null> {
	const url = `${LEXWARE_API_BASE}${path}`;
	const boundary = `----LexwareBoundary${Date.now().toString(16)}`;
	const CRLF = '\r\n';

	const partHeader = Buffer.from(
		`--${boundary}${CRLF}` +
		`Content-Disposition: form-data; name="file"; filename="${file.fileName}"${CRLF}` +
		`Content-Type: ${file.mimeType}${CRLF}` +
		CRLF,
	);
	const partFooter = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
	const body = Buffer.concat([partHeader, file.buffer, partFooter]);

	const headers = {
		'User-Agent': USER_AGENT,
		'Accept': 'application/json',
		'Authorization': `Bearer ${LEXWARE_OFFICE_API_KEY}`,
		'Content-Type': `multipart/form-data; boundary=${boundary}`,
		'Content-Length': String(body.length),
	};

	logger.log('Making Lexware Office file upload request', { url, fileName: file.fileName, mimeType: file.mimeType, bytes: file.buffer.length });

	try {
		const response = await withRetry(() =>
			fetch(url, { method: 'POST', headers, body }),
		);

		let responseBody: unknown;
		try {
			responseBody = await response.json();
		} catch {
			responseBody = null;
		}

		if (!response.ok) {
			logger.error('Lexware Office file upload failed', { status: response.status, error: responseBody });
			return { ok: false, status: response.status, error: responseBody };
		}

		logger.log('Lexware Office file upload response', { status: response.status });
		return { ok: true, data: responseBody as T };
	} catch (error) {
		logger.error('Error making Lexware Office file upload request', { error });
		return null;
	}
}

// ── Optimistic-lock write with auto-retry on 409 ─────────────────────────────
// On 409: fetches the resource, merges the incoming payload with the fresh version,
// and retries the PUT exactly once.

export async function makeLexwareOfficeWriteWithRetry<T>(
	path: string,
	method: 'POST' | 'PUT',
	body: Record<string, unknown>,
	fetchFreshVersion?: () => Promise<Record<string, unknown> | null>,
): Promise<WriteResult<T> | null> {
	const result = await makeLexwareOfficeWriteRequest<T>(path, method, body);

	if (
		result &&
		!result.ok &&
		result.status === 409 &&
		method === 'PUT' &&
		fetchFreshVersion
	) {
		logger.log('409 conflict on PUT — re-fetching and retrying once', { path });
		const fresh = await fetchFreshVersion();
		if (!fresh) return result;
		const merged = { ...body, version: fresh.version };
		return makeLexwareOfficeWriteRequest<T>(path, method, merged);
	}

	return result;
}
