import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { makeLexwareOfficeRequest, makeLexwareOfficeFileRequest, makeLexwareOfficeFileUploadRequest } from '../helper.js';
import { writeErrorResponse } from '../utils.js';

const MIME_MAP: Record<string, string> = {
	pdf: 'application/pdf',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	xml: 'application/xml',
};

function extToMime(name: string): string {
	const ext = name.split('.').pop()?.toLowerCase() ?? '';
	return MIME_MAP[ext] ?? 'application/octet-stream';
}

async function resolveFileInput(params: {
	filePath?: string;
	fileBase64?: string;
	fileName?: string;
}): Promise<{ buffer: Buffer; fileName: string; mimeType: string } | { error: string }> {
	if (params.fileBase64) {
		const buffer = Buffer.from(params.fileBase64, 'base64');
		const fileName = params.fileName ?? 'document.pdf';
		return { buffer, fileName, mimeType: extToMime(fileName) };
	}
	if (params.filePath) {
		try {
			const buffer = await readFile(params.filePath);
			const fileName = basename(params.filePath);
			return { buffer, fileName, mimeType: extToMime(fileName) };
		} catch (err) {
			return { error: `Failed to read file at "${params.filePath}": ${err instanceof Error ? err.message : String(err)}` };
		}
	}
	return { error: 'Either filePath or fileBase64 must be provided' };
}

export function registerFileTools(server: McpServer): void {
	server.tool(
		'get-file',
		'Download a file (PDF or XML) by file ID.',
		{
			id: z.string().uuid().describe('File ID from voucher/invoice details'),
			format: z.enum(['pdf', 'xml']).optional().default('pdf'),
		},
		async ({ id, format }) => {
			const accept = format === 'xml' ? 'application/xml' : 'application/pdf';
			const fileData = await makeLexwareOfficeFileRequest(`/v1/files/${id}`, accept);
			if (!fileData) return { content: [{ type: 'text', text: 'Failed to retrieve file' }] };
			return {
				content: [{
					type: 'resource',
					resource: {
						uri: `lexware://files/${id}`,
						mimeType: fileData.mimeType,
						blob: fileData.data.toString('base64'),
					},
				}],
			};
		},
	);

	server.tool(
		'upload-file-to-voucher',
		'Attach PDF or image to a voucher. Use filePath or fileBase64+fileName.',
		{
			voucherId: z.string().uuid(),
			filePath: z.string().optional().describe('Local filesystem path (or fileBase64)'),
			fileBase64: z.string().optional().describe('Base64 content (or filePath)'),
			fileName: z.string().optional().describe('Required with fileBase64'),
		},
		async ({ voucherId, filePath, fileBase64, fileName }) => {
			const file = await resolveFileInput({ filePath, fileBase64, fileName });
			if ('error' in file) return { content: [{ type: 'text', text: file.error }] };

			const result = await makeLexwareOfficeFileUploadRequest<{ voucherId: string; id: string }>(
				`/v1/vouchers/${voucherId}/files`,
				file,
			);

			if (!result || !result.ok) {
				return { content: [{ type: 'text', text: writeErrorResponse(result && !result.ok ? result : null) }] };
			}
			return {
				content: [{
					type: 'text',
					text: `File "${file.fileName}" attached to voucher ${voucherId}.\nFile ID: ${(result.data as any)?.id ?? 'unknown'}\nhttps://app.lexware.de/permalink/vouchers/view/${voucherId}`,
				}],
			};
		},
	);

	server.tool(
		'upload-file',
		'Upload PDF/image/XRechnung XML. Returns file ID. Use filePath or fileBase64+fileName.',
		{
			filePath: z.string().optional().describe('Local filesystem path (or fileBase64)'),
			fileBase64: z.string().optional().describe('Base64 content (or filePath)'),
			fileName: z.string().optional().describe('Required with fileBase64'),
		},
		async ({ filePath, fileBase64, fileName }) => {
			const file = await resolveFileInput({ filePath, fileBase64, fileName });
			if ('error' in file) return { content: [{ type: 'text', text: file.error }] };

			const result = await makeLexwareOfficeFileUploadRequest<{ id: string }>('/v1/files?type=voucher', file);

			if (!result || !result.ok) {
				return { content: [{ type: 'text', text: writeErrorResponse(result && !result.ok ? result : null) }] };
			}
			return {
				content: [{
					type: 'text',
					text: `File uploaded. ID: ${(result.data as any)?.id ?? 'unknown'}\n\n${JSON.stringify(result.data, null, 2)}`,
				}],
			};
		},
	);
}
