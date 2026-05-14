import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { makeLexwareOfficeRequest, makeLexwareOfficeWriteRequest, makeLexwareOfficeWriteWithRetry, paginateAll } from '../helper.js';
import { writeErrorResponse, trim } from '../utils.js';
import { VOUCHER_TAX_TYPES, voucherItemSchema } from '../schemas.js';

const TAX_TYPE_DESC = 'gross/net/vatfree/constructionService13b/externalService13b/intraCommunitySupply/photovoltaicEquipment';

export function registerVoucherTools(server: McpServer): void {
	server.tool(
		'get-vouchers',
		'Get a page of bookkeeping vouchers. For all pages use list-all-vouchers.',
		{
			voucherType: z
				.array(z.enum(['purchaseinvoice', 'purchasecreditnote', 'salesinvoice', 'salescreditnote']))
				.optional()
				.default(['purchaseinvoice', 'purchasecreditnote', 'salesinvoice', 'salescreditnote']),
			voucherStatus: z
				.array(z.enum(['unchecked', 'open', 'paid', 'paidoff', 'voided', 'transferred', 'sepadebit']))
				.optional()
				.default(['unchecked', 'open', 'paid', 'paidoff', 'voided', 'transferred', 'sepadebit']),
			contactId: z.string().uuid().optional(),
			dateFrom: z.string().optional().describe('yyyy-MM-dd'),
			dateTo: z.string().optional().describe('yyyy-MM-dd'),
			page: z.number().min(0).optional().default(0),
			size: z.number().min(1).max(250).optional().default(250),
		},
		async ({ voucherType, voucherStatus, contactId, dateFrom, dateTo, page, size }) => {
			const params = new URLSearchParams({
				voucherType: voucherType.join(','),
				voucherStatus: voucherStatus.join(','),
				page: String(page),
				size: String(size),
			});
			if (contactId) params.append('contactId', contactId);
			if (dateFrom) params.append('dateFrom', dateFrom);
			if (dateTo) params.append('dateTo', dateTo);
			const data = await makeLexwareOfficeRequest<any>(`/v1/voucherlist?${params.toString()}`);
			const vouchers = data?.content;
			if (!vouchers || vouchers.length === 0) {
				return { content: [{ type: 'text', text: 'No vouchers found' }] };
			}
			const trimmed = vouchers.map((v: unknown) => trim('voucher-list', v));
			return {
				content: [{
					type: 'text',
					text: `${data.totalElements} vouchers total (page ${page}, showing ${vouchers.length}):\n\n${JSON.stringify(trimmed, null, 2)}`,
				}],
			};
		},
	);

	server.tool(
		'list-all-vouchers',
		'Fetch all bookkeeping vouchers. May be slow for large accounts.',
		{
			voucherType: z
				.array(z.enum(['purchaseinvoice', 'purchasecreditnote', 'salesinvoice', 'salescreditnote']))
				.optional()
				.default(['purchaseinvoice', 'purchasecreditnote', 'salesinvoice', 'salescreditnote']),
			voucherStatus: z
				.array(z.enum(['unchecked', 'open', 'paid', 'paidoff', 'voided', 'transferred', 'sepadebit']))
				.optional()
				.default(['unchecked', 'open']),
			contactId: z.string().uuid().optional(),
			dateFrom: z.string().optional().describe('yyyy-MM-dd'),
			dateTo: z.string().optional().describe('yyyy-MM-dd'),
		},
		async ({ voucherType, voucherStatus, contactId, dateFrom, dateTo }) => {
			const params = new URLSearchParams({
				voucherType: voucherType.join(','),
				voucherStatus: voucherStatus.join(','),
			});
			if (contactId) params.append('contactId', contactId);
			if (dateFrom) params.append('dateFrom', dateFrom);
			if (dateTo) params.append('dateTo', dateTo);
			const all = await paginateAll<unknown>('/v1/voucherlist', params, 250);
			if (!all) return { content: [{ type: 'text', text: 'Failed to retrieve vouchers' }] };
			const trimmed = all.map(v => trim('voucher-list', v));
			return {
				content: [{
					type: 'text',
					text: `All vouchers (${all.length} total):\n\n${JSON.stringify(trimmed, null, 2)}`,
				}],
			};
		},
	);

	server.tool(
		'get-voucher-details',
		'Get bookkeeping voucher details by ID.',
		{ id: z.string().uuid() },
		async ({ id }) => {
			const data = await makeLexwareOfficeRequest<any>(`/v1/vouchers/${id}`);
			if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve voucher data' }] };
			return { content: [{ type: 'text', text: `Voucher details:\n\n${JSON.stringify(trim('voucher', data), null, 2)}` }] };
		},
	);

	server.tool(
		'create-voucher',
		'Create a bookkeeping voucher. Use list-posting-categories for categoryId.',
		{
			type: z.enum(['purchaseinvoice', 'purchasecreditnote', 'salesinvoice', 'salescreditnote']).describe(
				'purchaseinvoice/purchasecreditnote/salesinvoice/salescreditnote',
			),
			voucherStatus: z.enum(['open', 'unchecked']).optional().default('open').describe(
				'"open"=unpaid, "unchecked"=needs review',
			),
			voucherDate: z.string().describe('yyyy-MM-dd'),
			voucherNumber: z.string().optional().describe("Supplier's invoice number"),
			dueDate: z.string().optional().describe('yyyy-MM-dd'),
			contactId: z.string().uuid().optional().describe('Contact UUID (Lieferant/Kunde)'),
			useCollectiveContact: z.boolean().optional().default(false),
			remark: z.string().optional(),
			taxType: z.enum(VOUCHER_TAX_TYPES).describe(TAX_TYPE_DESC),
			voucherItems: z.array(voucherItemSchema).min(1),
		},
		async (params) => {
			const totalGrossAmount = params.voucherItems.reduce((s, i) => s + i.amount, 0);
			const totalTaxAmount = params.voucherItems.reduce((s, i) => s + i.taxAmount, 0);
			const result = await makeLexwareOfficeWriteRequest<any>('/v1/vouchers', 'POST', {
				...params,
				totalGrossAmount,
				totalTaxAmount,
			});
			if (!result || !result.ok) {
				return { content: [{ type: 'text', text: writeErrorResponse(result && !result.ok ? result : null) }] };
			}
			const id = (result.data as any)?.id ?? '';
			return {
				content: [{
					type: 'text',
					text: `Voucher created:\nhttps://app.lexware.de/permalink/vouchers/view/${id}\n\n${JSON.stringify(trim('voucher', result.data), null, 2)}`,
				}],
			};
		},
	);

	server.tool(
		'update-voucher',
		'Update a bookkeeping voucher. On 409 auto-fetches and retries once.',
		{
			id: z.string().uuid(),
			version: z.number().int().describe('From get-voucher-details'),
			type: z.enum(['purchaseinvoice', 'purchasecreditnote', 'salesinvoice', 'salescreditnote']),
			voucherStatus: z.enum(['open', 'unchecked']).optional(),
			voucherDate: z.string().describe('yyyy-MM-dd'),
			voucherNumber: z.string().optional(),
			dueDate: z.string().optional().describe('yyyy-MM-dd'),
			contactId: z.string().uuid().optional(),
			useCollectiveContact: z.boolean().optional(),
			remark: z.string().optional(),
			taxType: z.enum(VOUCHER_TAX_TYPES),
			voucherItems: z.array(voucherItemSchema).min(1),
		},
		async ({ id, ...body }) => {
			const totalGrossAmount = body.voucherItems.reduce((s, i) => s + i.amount, 0);
			const totalTaxAmount = body.voucherItems.reduce((s, i) => s + i.taxAmount, 0);

			// Preserve existing file attachments — Lexware silently drops PDFs if files[] is omitted on PUT
			const current = await makeLexwareOfficeRequest<any>(`/v1/vouchers/${id}`);
			const existingFiles: Array<{ id: string }> = current?.files?.map((f: any) => ({ id: f.id })) ?? [];

			const payload = { ...body, totalGrossAmount, totalTaxAmount, ...(existingFiles.length > 0 && { files: existingFiles }) };

			const result = await makeLexwareOfficeWriteWithRetry<any>(
				`/v1/vouchers/${id}`,
				'PUT',
				payload,
				async () => makeLexwareOfficeRequest<any>(`/v1/vouchers/${id}`),
			);

			if (!result || !result.ok) {
				return { content: [{ type: 'text', text: writeErrorResponse(result && !result.ok ? result : null) }] };
			}
			return {
				content: [{
					type: 'text',
					text: `Voucher updated:\nhttps://app.lexware.de/permalink/vouchers/view/${id}\n\n${JSON.stringify(trim('voucher', result.data), null, 2)}`,
				}],
			};
		},
	);

	server.tool(
		'batch-create-vouchers',
		'Create up to 50 vouchers in sequence. Failures reported per-item.',
		{
			vouchers: z.array(z.object({
				type: z.enum(['purchaseinvoice', 'purchasecreditnote', 'salesinvoice', 'salescreditnote']),
				voucherStatus: z.enum(['open', 'unchecked']).optional().default('open'),
				voucherDate: z.string(),
				voucherNumber: z.string().optional(),
				dueDate: z.string().optional(),
				contactId: z.string().uuid().optional(),
				taxType: z.enum(VOUCHER_TAX_TYPES),
				remark: z.string().optional(),
				voucherItems: z.array(voucherItemSchema).min(1),
			})).min(1).max(50).describe('Array of voucher specs — max 50 per batch'),
		},
		async ({ vouchers }) => {
			const results: Array<{ index: number; status: 'created' | 'failed'; id?: string; error?: string }> = [];

			for (let i = 0; i < vouchers.length; i++) {
				const v = vouchers[i];
				const totalGrossAmount = v.voucherItems.reduce((s, item) => s + item.amount, 0);
				const totalTaxAmount = v.voucherItems.reduce((s, item) => s + item.taxAmount, 0);
				const result = await makeLexwareOfficeWriteRequest<any>('/v1/vouchers', 'POST', {
					...v,
					totalGrossAmount,
					totalTaxAmount,
				});
				if (!result || !result.ok) {
					results.push({ index: i, status: 'failed', error: writeErrorResponse(result && !result.ok ? result : null) });
				} else {
					results.push({ index: i, status: 'created', id: (result.data as any)?.id });
				}
			}

			const created = results.filter(r => r.status === 'created').length;
			const failed = results.filter(r => r.status === 'failed').length;
			return {
				content: [{
					type: 'text',
					text: `Batch complete: ${created} created, ${failed} failed.\n\n${JSON.stringify(results, null, 2)}`,
				}],
			};
		},
	);
}
