import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { makeLexwareOfficeRequest } from '../helper.js';
import { invoiceSchema } from '../schemas.js';
import { handleSalesDocumentRequest, registerFileDownloadTool, trim } from '../utils.js';

export function registerInvoiceTools(server: McpServer): void {
	server.tool(
		'get-invoices',
		'Get invoices via /v1/voucherlist. Use list-all-invoices on error.',
		{
			status: z
				.array(z.enum(['open', 'draft', 'paid', 'paidoff', 'voided']))
				.optional()
				.default(['open', 'draft', 'paid', 'paidoff', 'voided']),
			page: z.number().min(0).optional().default(0),
			size: z.number().min(1).max(250).optional().default(250),
		},
		async ({ status, page, size }) => {
			const url = `/v1/voucherlist?voucherType=invoice&voucherStatus=${status.join(',')}&page=${page}&size=${size}`;
			const data = await makeLexwareOfficeRequest<any>(url);
			const vouchers = data?.content;
			if (!vouchers || vouchers.length === 0) {
				return { content: [{ type: 'text', text: 'No invoices found. Try list-all-invoices.' }] };
			}
			const trimmed = vouchers.map((v: unknown) => trim('invoice-list', v));
			return {
				content: [{
					type: 'text',
					text: `${data.totalElements} invoices total (page ${page}, showing ${vouchers.length}):\n\n${JSON.stringify(trimmed, null, 2)}`,
				}],
			};
		},
	);

	server.tool(
		'list-all-invoices',
		'List invoices with full filter support. Reliable across all tiers.',
		{
			status: z
				.array(z.enum(['open', 'draft', 'paid', 'paidoff', 'voided', 'overdue', 'transferred']))
				.optional()
				.default(['open', 'draft', 'paid', 'paidoff', 'voided']),
			dateFrom: z.string().optional().describe('yyyy-MM-dd'),
			dateTo: z.string().optional().describe('yyyy-MM-dd'),
			contactId: z.string().uuid().optional(),
			page: z.number().min(0).optional().default(0),
			size: z.number().min(1).max(250).optional().default(250),
		},
		async ({ status, dateFrom, dateTo, contactId, page, size }) => {
			const params = new URLSearchParams({
				voucherType: 'invoice',
				voucherStatus: status.join(','),
				page: String(page),
				size: String(size),
			});
			if (dateFrom) params.append('voucherDateFrom', dateFrom);
			if (dateTo) params.append('voucherDateTo', dateTo);
			if (contactId) params.append('contactId', contactId);

			const data = await makeLexwareOfficeRequest<any>(`/v1/voucherlist?${params.toString()}`);
			const vouchers = data?.content;
			if (!vouchers || vouchers.length === 0) {
				return { content: [{ type: 'text', text: 'No invoices found' }] };
			}
			const trimmed = vouchers.map((v: unknown) => trim('invoice-list', v));
			return {
				content: [{
					type: 'text',
					text: `${data.totalElements} invoices total (page ${page}, showing ${vouchers.length}):\n\n${JSON.stringify(trimmed, null, 2)}`,
				}],
			};
		},
	);

	server.tool(
		'get-invoice-details',
		'Get invoice details by ID.',
		{ id: z.string().uuid() },
		async ({ id }) => {
			const data = await makeLexwareOfficeRequest<any>(`/v1/invoices/${id}`);
			if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve invoice data' }] };
			return { content: [{ type: 'text', text: `Invoice details:\n\n${JSON.stringify(trim('invoice', data), null, 2)}` }] };
		},
	);

	server.tool(
		'create-invoice',
		'Create a sales invoice draft. Use finalize-invoice to lock immediately.',
		invoiceSchema,
		async (params) => handleSalesDocumentRequest(params, '/v1/invoices', 'Invoice', 'invoices', 'invoice'),
	);

	server.tool(
		'finalize-invoice',
		'Create and finalize a sales invoice. Cannot be edited after.',
		invoiceSchema,
		async (params) => handleSalesDocumentRequest(params, '/v1/invoices?finalize=true', 'Invoice (finalized)', 'invoices', 'invoice'),
	);

	registerFileDownloadTool(
		server,
		'download-invoice-file',
		'Download the PDF for a finalized invoice (must be in open status).',
		(id) => `/v1/invoices/${id}/file`,
	);
}
