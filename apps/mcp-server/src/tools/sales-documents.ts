import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { makeLexwareOfficeRequest, paginateAll } from '../helper.js';
import { invoiceSchema, quotationSchema, dunningSchema } from '../schemas.js';
import { handleSalesDocumentRequest, handleDunningRequest, registerFileDownloadTool, trim } from '../utils.js';

function registerListTool(
	server: McpServer,
	toolName: string,
	description: string,
	voucherType: string,
	statusEnum: [string, ...string[]],
) {
	server.tool(
		toolName,
		description,
		{
			status: z.array(z.enum(statusEnum as [string, ...string[]])).optional().default(statusEnum),
			page: z.number().min(0).optional().default(0),
			size: z.number().min(1).max(250).optional().default(250),
		},
		async ({ status, page, size }) => {
			const data = await makeLexwareOfficeRequest<any>(
				`/v1/voucherlist?voucherType=${voucherType}&voucherStatus=${(status as string[]).join(',')}&page=${page}&size=${size}`,
			);
			const vouchers = data?.content;
			if (!vouchers || vouchers.length === 0) return { content: [{ type: 'text', text: `No ${voucherType}s found` }] };
			const trimmed = vouchers.map((v: unknown) => trim('invoice-list', v));
			return { content: [{ type: 'text', text: `${data.totalElements} total (page ${page}):\n\n${JSON.stringify(trimmed, null, 2)}` }] };
		},
	);
}

function registerListAllTool(
	server: McpServer,
	toolName: string,
	description: string,
	voucherType: string,
	statusEnum: [string, ...string[]],
) {
	server.tool(
		toolName,
		description,
		{
			status: z.array(z.enum(statusEnum as [string, ...string[]])).optional().default(statusEnum),
		},
		async ({ status }) => {
			const params = new URLSearchParams({
				voucherType,
				voucherStatus: (status as string[]).join(','),
			});
			const all = await paginateAll<unknown>('/v1/voucherlist', params, 250);
			if (!all) return { content: [{ type: 'text', text: `Failed to retrieve ${voucherType}s` }] };
			const trimmed = all.map(v => trim('invoice-list', v));
			return { content: [{ type: 'text', text: `All ${voucherType}s (${all.length} total):\n\n${JSON.stringify(trimmed, null, 2)}` }] };
		},
	);
}

export function registerSalesDocumentTools(server: McpServer): void {
	// ── Quotations ─────────────────────────────────────────────────────────────

	registerListTool(server, 'get-quotations', 'Get a page of quotations (Angebote).', 'quotation', ['draft', 'open', 'accepted', 'rejected', 'voided']);
	registerListAllTool(server, 'list-all-quotations', 'Fetch all quotations across all pages.', 'quotation', ['draft', 'open', 'accepted', 'rejected', 'voided']);

	server.tool(
		'get-quotation-details',
		'Get quotation details by ID.',
		{ id: z.string().uuid() },
		async ({ id }) => {
			const data = await makeLexwareOfficeRequest<any>(`/v1/quotations/${id}`);
			if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve quotation' }] };
			return { content: [{ type: 'text', text: `Quotation:\n\n${JSON.stringify(data, null, 2)}` }] };
		},
	);

	server.tool(
		'create-quotation',
		'Create a quotation. finalize=true (default) creates in open status.',
		{ ...quotationSchema, finalize: z.boolean().optional().default(true) },
		async ({ finalize, ...params }) =>
			handleSalesDocumentRequest(params, finalize ? '/v1/quotations?finalize=true' : '/v1/quotations', 'Quotation', 'quotations', 'quotation'),
	);

	registerFileDownloadTool(server, 'download-quotation-file', 'Download PDF for a finalized quotation.', (id) => `/v1/quotations/${id}/file`);

	// ── Order Confirmations ────────────────────────────────────────────────────

	registerListTool(server, 'get-order-confirmations', 'Get a page of order confirmations (Auftragsbestätigungen).', 'orderconfirmation', ['draft', 'open', 'voided']);
	registerListAllTool(server, 'list-all-order-confirmations', 'Fetch all order confirmations across all pages.', 'orderconfirmation', ['draft', 'open', 'voided']);

	server.tool(
		'get-order-confirmation-details',
		'Get details of an order confirmation (Auftragsbestätigung) by its ID.',
		{ id: z.string().uuid() },
		async ({ id }) => {
			const data = await makeLexwareOfficeRequest<any>(`/v1/order-confirmations/${id}`);
			if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve order confirmation' }] };
			return { content: [{ type: 'text', text: `Order confirmation:\n\n${JSON.stringify(data, null, 2)}` }] };
		},
	);

	server.tool(
		'create-order-confirmation',
		'Create an order confirmation. finalize=true (default) = open status.',
		{ ...invoiceSchema, finalize: z.boolean().optional().default(true) },
		async ({ finalize, ...params }) =>
			handleSalesDocumentRequest(params, finalize ? '/v1/order-confirmations?finalize=true' : '/v1/order-confirmations', 'Order confirmation', 'order-confirmations'),
	);

	registerFileDownloadTool(server, 'download-order-confirmation-file', 'Download PDF for a finalized order confirmation.', (id) => `/v1/order-confirmations/${id}/file`);

	// ── Credit Notes ───────────────────────────────────────────────────────────

	registerListTool(server, 'get-credit-notes', 'Get a page of credit notes (Gutschriften).', 'creditnote', ['draft', 'open', 'paid', 'voided']);
	registerListAllTool(server, 'list-all-credit-notes', 'Fetch all credit notes across all pages.', 'creditnote', ['draft', 'open', 'paid', 'voided']);

	server.tool(
		'get-credit-note-details',
		'Get details of a credit note (Gutschrift) by its ID.',
		{ id: z.string().uuid() },
		async ({ id }) => {
			const data = await makeLexwareOfficeRequest<any>(`/v1/credit-notes/${id}`);
			if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve credit note' }] };
			return { content: [{ type: 'text', text: `Credit note:\n\n${JSON.stringify(data, null, 2)}` }] };
		},
	);

	server.tool(
		'create-credit-note',
		'Create a new credit note (Gutschrift) to reverse a sales invoice.',
		invoiceSchema,
		async (params) => handleSalesDocumentRequest(params, '/v1/credit-notes', 'Credit note', 'credit-notes'),
	);

	registerFileDownloadTool(server, 'download-credit-note-file', 'Download PDF for a finalized credit note.', (id) => `/v1/credit-notes/${id}/file`);

	// ── Delivery Notes ─────────────────────────────────────────────────────────

	registerListTool(server, 'get-delivery-notes', 'Get a page of delivery notes (Lieferscheine).', 'deliverynote', ['draft', 'open', 'voided']);
	registerListAllTool(server, 'list-all-delivery-notes', 'Fetch all delivery notes across all pages.', 'deliverynote', ['draft', 'open', 'voided']);

	server.tool(
		'get-delivery-note-details',
		'Get details of a delivery note (Lieferschein) by its ID.',
		{ id: z.string().uuid() },
		async ({ id }) => {
			const data = await makeLexwareOfficeRequest<any>(`/v1/delivery-notes/${id}`);
			if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve delivery note' }] };
			return { content: [{ type: 'text', text: `Delivery note:\n\n${JSON.stringify(data, null, 2)}` }] };
		},
	);

	server.tool(
		'create-delivery-note',
		'Create a delivery note. finalize=true (default) creates in open status.',
		{ ...invoiceSchema, finalize: z.boolean().optional().default(true) },
		async ({ finalize, ...params }) =>
			handleSalesDocumentRequest(params, finalize ? '/v1/delivery-notes?finalize=true' : '/v1/delivery-notes', 'Delivery note', 'delivery-notes'),
	);

	registerFileDownloadTool(server, 'download-delivery-note-file', 'Download PDF for a finalized delivery note.', (id) => `/v1/delivery-notes/${id}/file`);

	// ── Dunnings ───────────────────────────────────────────────────────────────

	server.tool(
		'get-dunning-details',
		'Get dunning details by ID.',
		{ id: z.string().uuid() },
		async ({ id }) => {
			const data = await makeLexwareOfficeRequest<any>(`/v1/dunnings/${id}`);
			if (!data) return { content: [{ type: 'text', text: `Failed to retrieve dunning ${id}` }] };
			return { content: [{ type: 'text', text: `Dunning:\n\n${JSON.stringify(data, null, 2)}` }] };
		},
	);

	server.tool(
		'create-dunning',
		'Create a dunning draft. taxConditions must match the invoice.',
		dunningSchema,
		async (params) => handleDunningRequest(params, false),
	);

	server.tool(
		'finalize-dunning',
		'Create and immediately finalize a dunning notice (Mahnung).',
		dunningSchema,
		async (params) => handleDunningRequest(params, true),
	);

	registerFileDownloadTool(server, 'download-dunning-file', 'Download PDF for a finalized dunning notice.', (id) => `/v1/dunnings/${id}/file`);

	// ── Down Payment Invoices (read-only) ──────────────────────────────────────

	server.tool(
		'get-down-payment-invoice-details',
		'Get down payment invoice details — read-only, auto-created.',
		{ id: z.string().uuid() },
		async ({ id }) => {
			const data = await makeLexwareOfficeRequest<any>(`/v1/down-payment-invoices/${id}`);
			if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve down payment invoice' }] };
			return { content: [{ type: 'text', text: `Down payment invoice:\n\n${JSON.stringify(data, null, 2)}` }] };
		},
	);

	registerFileDownloadTool(server, 'download-down-payment-invoice-file', 'Download PDF for a down payment invoice.', (id) => `/v1/down-payment-invoices/${id}/file`);
}
