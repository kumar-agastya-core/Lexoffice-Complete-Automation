import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { makeLexwareOfficeRequest } from '../helper.js';

export function registerPaymentTools(server: McpServer): void {
	// ── Payment status ─────────────────────────────────────────────────────────

	server.tool(
		'get-payment-status',
		'Get payment status for a voucher — openAmount, paymentStatus (balanced/openRevenue/openExpense), paidDate.',
		{ voucherId: z.string().uuid() },
		async ({ voucherId }) => {
			const data = await makeLexwareOfficeRequest<any>(`/v1/payments/${voucherId}`);
			if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve payment status' }] };
			return { content: [{ type: 'text', text: `Payment status:\n\n${JSON.stringify(data, null, 2)}` }] };
		},
	);

	// ── Recurring templates (read-only) ────────────────────────────────────────

	server.tool(
		'get-recurring-templates',
		'List recurring invoice templates (Wiederkehrende Vorlagen) — read-only, Lexware manages execution.',
		{
			page: z.number().min(0).optional().default(0),
			size: z.number().min(1).max(250).optional().default(250),
		},
		async ({ page, size }) => {
			const data = await makeLexwareOfficeRequest<any>(`/v1/recurring-templates?page=${page}&size=${size}`);
			if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve recurring templates' }] };
			return { content: [{ type: 'text', text: `Recurring templates:\n\n${JSON.stringify(data, null, 2)}` }] };
		},
	);

	server.tool(
		'get-recurring-template-details',
		'Get details of a single recurring invoice template by its ID.',
		{ id: z.string().uuid() },
		async ({ id }) => {
			const data = await makeLexwareOfficeRequest<any>(`/v1/recurring-templates/${id}`);
			if (!data) return { content: [{ type: 'text', text: `Failed to retrieve recurring template ${id}` }] };
			return { content: [{ type: 'text', text: `Recurring template:\n\n${JSON.stringify(data, null, 2)}` }] };
		},
	);
}
