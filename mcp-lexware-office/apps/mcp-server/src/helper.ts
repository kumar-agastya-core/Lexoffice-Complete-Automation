import { LexwareClient } from '@lexware/client';
import type { WriteResult } from '@lexware/client';
import { logger } from './logger.js';

export type { WriteResult };

const LEXWARE_OFFICE_API_KEY = process.env.LEXWARE_OFFICE_API_KEY ?? process.env.LEXWARE_API_KEY;
if (!LEXWARE_OFFICE_API_KEY) {
	logger.error('Error: LEXWARE_OFFICE_API_KEY or LEXWARE_API_KEY environment variable is required');
	process.exit(1);
}

const client = new LexwareClient(LEXWARE_OFFICE_API_KEY, logger);

export function resetRateLimitForTesting(): void {
	client.resetRateLimiter();
}

export async function makeLexwareOfficeRequest<T>(path: string): Promise<T | null> {
	return client.request<T>(path);
}

export async function makeLexwareOfficeFileRequest(
	path: string,
	accept: 'application/pdf' | 'application/xml',
): Promise<{ data: Buffer; mimeType: string } | null> {
	return client.fileRequest(path, accept);
}

export async function makeLexwareOfficeWriteRequest<T>(
	path: string,
	method: 'POST' | 'PUT',
	body: unknown,
): Promise<WriteResult<T> | null> {
	return client.writeRequest<T>(path, method, body);
}

export async function makeLexwareOfficeDeleteRequest(
	path: string,
): Promise<{ ok: true } | { ok: false; status: number; error: unknown } | null> {
	return client.deleteRequest(path);
}

export async function makeLexwareOfficeFileUploadRequest<T>(
	path: string,
	file: { buffer: Buffer; fileName: string; mimeType: string },
): Promise<WriteResult<T> | null> {
	return client.fileUpload<T>(path, file);
}

export async function makeLexwareOfficeWriteWithRetry<T>(
	path: string,
	method: 'POST' | 'PUT',
	body: Record<string, unknown>,
	fetchFreshVersion?: () => Promise<Record<string, unknown> | null>,
): Promise<WriteResult<T> | null> {
	return client.writeWithRetry<T>(path, method, body, fetchFreshVersion);
}

export async function paginateAll<T>(
	basePath: string,
	params: URLSearchParams,
	pageSize = 250,
): Promise<T[] | null> {
	return client.paginateAll<T>(basePath, params, pageSize);
}
