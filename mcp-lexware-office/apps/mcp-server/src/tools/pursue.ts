import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { makeLexwareOfficeRequest, makeLexwareOfficeWriteRequest } from '../helper.js';
import { writeErrorResponse, extractSalesDocFields } from '../utils.js';

const shippingTypeEnum = z.enum(['service', 'delivery', 'serviceperiod', 'deliveryperiod']);

async function postDocument(
	targetPath: string,
	source: any,
	shippingDate?: string,
	shippingType?: string,
): Promise<{ ok: true; id: string; data: unknown } | { ok: false; error: string }> {
	const fields = extractSalesDocFields(source);
	if (!fields.shippingConditions) {
		fields.shippingConditions = {
			shippingDate: shippingDate ?? (source.voucherDate as string),
			shippingType: shippingType ?? 'service',
		};
	}
	const body = { ...fields, totalPrice: { currency: 'EUR' } };
	const result = await makeLexwareOfficeWriteRequest<any>(targetPath, 'POST', body);
	if (!result || !result.ok) {
		return { ok: false, error: writeErrorResponse(result && !result.ok ? result : null) };
	}
	return { ok: true, id: (result.data as any)?.id ?? '', data: result.data };
}

export function registerPursueTools(server: McpServer): void {
	server.tool(
		'pursue-to-invoice',
		'Convert an open quotation or order confirmation into a finalized invoice.',
		{
			sourceId: z.string().uuid(),
			sourceType: z.enum(['quotation', 'order-confirmation']),
			shippingDate: z.string().optional().describe('ISO 8601; defaults to source voucherDate'),
			shippingType: shippingTypeEnum.optional().default('service'),
		},
		async ({ sourceId, sourceType, shippingDate, shippingType }) => {
			const sourcePath = sourceType === 'quotation' ? '/v1/quotations' : '/v1/order-confirmations';
			const source = await makeLexwareOfficeRequest<any>(`${sourcePath}/${sourceId}`);
			if (!source) return { content: [{ type: 'text', text: `Failed to retrieve ${sourceType} ${sourceId}` }] };
			if (source.voucherStatus !== 'open') {
				return { content: [{ type: 'text', text: `${sourceType} status is "${source.voucherStatus}" — must be "open".` }] };
			}
			const res = await postDocument('/v1/invoices?finalize=true', source, shippingDate, shippingType);
			if (!res.ok) return { content: [{ type: 'text', text: res.error }] };
			return {
				content: [{
					type: 'text',
					text: `Invoice created from ${sourceType} ${sourceId}:\nhttps://app.lexware.de/permalink/invoices/view/${res.id}\n\n${JSON.stringify(res.data, null, 2)}`,
				}],
			};
		},
	);

	server.tool(
		'pursue-quotation-to-order',
		'Convert an open quotation into an order confirmation.',
		{
			quotationId: z.string().uuid(),
			shippingDate: z.string().optional().describe('ISO 8601 — falls back to quotation voucherDate'),
			shippingType: shippingTypeEnum.optional().default('service'),
		},
		async ({ quotationId, shippingDate, shippingType }) => {
			const source = await makeLexwareOfficeRequest<any>(`/v1/quotations/${quotationId}`);
			if (!source) return { content: [{ type: 'text', text: `Failed to retrieve quotation ${quotationId}` }] };
			if (source.voucherStatus !== 'open') {
				return { content: [{ type: 'text', text: `Quotation status is "${source.voucherStatus}" — must be "open".` }] };
			}
			const res = await postDocument('/v1/order-confirmations?finalize=true', source, shippingDate, shippingType);
			if (!res.ok) return { content: [{ type: 'text', text: res.error }] };
			return {
				content: [{
					type: 'text',
					text: `Order confirmation created from quotation ${quotationId}:\nhttps://app.lexware.de/permalink/order-confirmations/view/${res.id}\n\n${JSON.stringify(res.data, null, 2)}`,
				}],
			};
		},
	);

	server.tool(
		'pursue-order-to-delivery',
		'Convert an open order confirmation into a delivery note.',
		{
			orderConfirmationId: z.string().uuid(),
			shippingDate: z.string().optional(),
			shippingType: shippingTypeEnum.optional().default('delivery'),
		},
		async ({ orderConfirmationId, shippingDate, shippingType }) => {
			const source = await makeLexwareOfficeRequest<any>(`/v1/order-confirmations/${orderConfirmationId}`);
			if (!source) return { content: [{ type: 'text', text: `Failed to retrieve order confirmation ${orderConfirmationId}` }] };
			if (source.voucherStatus !== 'open') {
				return { content: [{ type: 'text', text: `Order confirmation status is "${source.voucherStatus}" — must be "open".` }] };
			}
			const res = await postDocument('/v1/delivery-notes?finalize=true', source, shippingDate, shippingType);
			if (!res.ok) return { content: [{ type: 'text', text: res.error }] };
			return {
				content: [{
					type: 'text',
					text: `Delivery note created from order ${orderConfirmationId}:\nhttps://app.lexware.de/permalink/delivery-notes/view/${res.id}\n\n${JSON.stringify(res.data, null, 2)}`,
				}],
			};
		},
	);

	server.tool(
		'pursue-delivery-to-invoice',
		'Convert an open delivery note (Lieferschein) into a finalized invoice.',
		{
			deliveryNoteId: z.string().uuid(),
			shippingDate: z.string().optional().describe('ISO 8601; defaults to delivery note voucherDate'),
			shippingType: shippingTypeEnum.optional().default('delivery'),
		},
		async ({ deliveryNoteId, shippingDate, shippingType }) => {
			const source = await makeLexwareOfficeRequest<any>(`/v1/delivery-notes/${deliveryNoteId}`);
			if (!source) return { content: [{ type: 'text', text: `Failed to retrieve delivery note ${deliveryNoteId}` }] };
			if (source.voucherStatus !== 'open') {
				return { content: [{ type: 'text', text: `Delivery note status is "${source.voucherStatus}" — must be "open".` }] };
			}
			const res = await postDocument('/v1/invoices?finalize=true', source, shippingDate, shippingType);
			if (!res.ok) return { content: [{ type: 'text', text: res.error }] };
			return {
				content: [{
					type: 'text',
					text: `Invoice created from delivery note ${deliveryNoteId}:\nhttps://app.lexware.de/permalink/invoices/view/${res.id}\n\n${JSON.stringify(res.data, null, 2)}`,
				}],
			};
		},
	);

	server.tool(
		'pursue-invoice-to-credit-note',
		'Reverse a finalized invoice by creating a credit note.',
		{ invoiceId: z.string().uuid() },
		async ({ invoiceId }) => {
			const source = await makeLexwareOfficeRequest<any>(`/v1/invoices/${invoiceId}`);
			if (!source) return { content: [{ type: 'text', text: `Failed to retrieve invoice ${invoiceId}` }] };
			const res = await postDocument('/v1/credit-notes', source);
			if (!res.ok) return { content: [{ type: 'text', text: res.error }] };
			return {
				content: [{
					type: 'text',
					text: `Credit note created from invoice ${invoiceId}:\nhttps://app.lexware.de/permalink/credit-notes/view/${res.id}\n\n${JSON.stringify(res.data, null, 2)}`,
				}],
			};
		},
	);

	server.tool(
		'pursue-invoice-to-dunning',
		'Create a dunning (Mahnung) for an overdue invoice.',
		{
			invoiceId: z.string().uuid(),
			voucherDate: z.string().optional().describe('ISO 8601; defaults to today'),
			title: z.string().max(25).optional().default('Mahnung'),
			introduction: z.string().max(2000).optional(),
			remark: z.string().max(2000).optional(),
			dunningFeeNetAmount: z.number().optional().describe('Net EUR; omit for no fee'),
			finalize: z.boolean().optional().default(false).describe('true = open, false = draft'),
		},
		async ({ invoiceId, voucherDate, title, introduction, remark, dunningFeeNetAmount, finalize }) => {
			const invoice = await makeLexwareOfficeRequest<any>(`/v1/invoices/${invoiceId}`);
			if (!invoice) return { content: [{ type: 'text', text: `Failed to retrieve invoice ${invoiceId}` }] };

			const date = voucherDate ?? new Date().toISOString().replace(/\.\d{3}Z$/, '.000+00:00');
			const lineItems = dunningFeeNetAmount !== undefined
				? [{
					type: 'custom',
					name: 'Mahngebühr',
					quantity: 1,
					unitName: 'Stück',
					unitPrice: { currency: 'EUR', netAmount: dunningFeeNetAmount, taxRatePercentage: 0 },
					discountPercentage: 0,
				}]
				: [];

			const queryParams = new URLSearchParams({ precedingSalesVoucherId: invoiceId });
			if (finalize) queryParams.append('finalize', 'true');

			const body = {
				voucherDate: date,
				taxConditions: invoice.taxConditions ?? { taxType: 'net' },
				address: invoice.address,
				lineItems,
				shippingConditions: invoice.shippingConditions ?? { shippingDate: date, shippingType: 'service' },
				...(title ? { title } : {}),
				...(introduction ? { introduction } : {}),
				...(remark ? { remark } : {}),
				totalPrice: { currency: 'EUR' },
			};

			const result = await makeLexwareOfficeWriteRequest<any>(`/v1/dunnings?${queryParams.toString()}`, 'POST', body);
			if (!result || !result.ok) {
				return { content: [{ type: 'text', text: writeErrorResponse(result && !result.ok ? result : null) }] };
			}
			const id = (result.data as any)?.id ?? '';
			const action = finalize ? 'created and finalized' : 'created as draft';
			return {
				content: [{
					type: 'text',
					text: `Dunning ${action} for invoice ${invoiceId}:\nhttps://app.lexware.de/permalink/dunnings/view/${id}\n\n${JSON.stringify(result.data, null, 2)}`,
				}],
			};
		},
	);

	server.tool(
		'pursue-dunning',
		'Escalate an existing dunning to the next level.',
		{
			dunningId: z.string().uuid(),
			title: z.string().max(25).optional().default('2. Mahnung'),
			introduction: z.string().max(2000).optional(),
			remark: z.string().max(2000).optional(),
			dunningFeeNetAmount: z.number().optional().describe('Net EUR fee for this level'),
			finalize: z.boolean().optional().default(false).describe('true = open, false = draft'),
		},
		async ({ dunningId, title, introduction, remark, dunningFeeNetAmount, finalize }) => {
			const dunning = await makeLexwareOfficeRequest<any>(`/v1/dunnings/${dunningId}`);
			if (!dunning) return { content: [{ type: 'text', text: `Failed to retrieve dunning ${dunningId}` }] };

			const precedingSalesVoucherId = dunning.precedingSalesVoucherId ?? dunning.relatedVouchers?.[0]?.id;
			if (!precedingSalesVoucherId) {
				return { content: [{ type: 'text', text: 'Could not determine the original invoice ID from this dunning. Use pursue-invoice-to-dunning with the original invoice ID instead.' }] };
			}

			const date = new Date().toISOString().replace(/\.\d{3}Z$/, '.000+00:00');
			const lineItems = dunningFeeNetAmount !== undefined
				? [{
					type: 'custom',
					name: 'Mahngebühr',
					quantity: 1,
					unitName: 'Stück',
					unitPrice: { currency: 'EUR', netAmount: dunningFeeNetAmount, taxRatePercentage: 0 },
					discountPercentage: 0,
				}]
				: [];

			const queryParams = new URLSearchParams({ precedingSalesVoucherId });
			if (finalize) queryParams.append('finalize', 'true');

			const body = {
				voucherDate: date,
				taxConditions: dunning.taxConditions,
				address: dunning.address,
				lineItems,
				shippingConditions: dunning.shippingConditions ?? { shippingDate: date, shippingType: 'service' },
				...(title ? { title } : {}),
				...(introduction ? { introduction } : {}),
				...(remark ? { remark } : {}),
				totalPrice: { currency: 'EUR' },
			};

			const result = await makeLexwareOfficeWriteRequest<any>(`/v1/dunnings?${queryParams.toString()}`, 'POST', body);
			if (!result || !result.ok) {
				return { content: [{ type: 'text', text: writeErrorResponse(result && !result.ok ? result : null) }] };
			}
			const id = (result.data as any)?.id ?? '';
			const action = finalize ? 'created and finalized' : 'created as draft';
			return {
				content: [{
					type: 'text',
					text: `Escalated dunning ${action}:\nhttps://app.lexware.de/permalink/dunnings/view/${id}\n\n${JSON.stringify(result.data, null, 2)}`,
				}],
			};
		},
	);

	server.tool(
		'finalize-document',
		'Transition any sales document draft → open. Prefer finalize=true at create.',
		{
			documentId: z.string().uuid(),
			documentType: z.enum(['quotation', 'order-confirmation', 'invoice', 'credit-note', 'delivery-note']),
		},
		async ({ documentId, documentType }) => {
			const endpointMap: Record<string, string> = {
				'quotation': '/v1/quotations',
				'order-confirmation': '/v1/order-confirmations',
				'invoice': '/v1/invoices',
				'credit-note': '/v1/credit-notes',
				'delivery-note': '/v1/delivery-notes',
			};
			const basePath = endpointMap[documentType];
			const deeplinkSlug = documentType === 'order-confirmation' ? 'order-confirmations'
				: documentType === 'credit-note' ? 'credit-notes'
				: documentType === 'delivery-note' ? 'delivery-notes'
				: `${documentType}s`;

			const current = await makeLexwareOfficeRequest<any>(`${basePath}/${documentId}`);
			if (!current) return { content: [{ type: 'text', text: `Failed to retrieve ${documentType} ${documentId}` }] };

			if (current.voucherStatus === 'open') {
				return {
					content: [{
						type: 'text',
						text: `Document ${documentId} is already open.\nhttps://app.lexware.de/permalink/${deeplinkSlug}/view/${documentId}`,
					}],
				};
			}

			const fields = extractSalesDocFields(current);
			if (!fields.shippingConditions) {
				fields.shippingConditions = { shippingDate: current.voucherDate as string, shippingType: 'service' };
			}
			const body = { ...fields, totalPrice: { currency: 'EUR' } };
			const result = await makeLexwareOfficeWriteRequest<any>(`${basePath}?finalize=true`, 'POST', body);

			if (!result || !result.ok) {
				return { content: [{ type: 'text', text: writeErrorResponse(result && !result.ok ? result : null) }] };
			}

			const newId = (result.data as any)?.id ?? '';
			return {
				content: [{
					type: 'text',
					text: `Document finalized.\nOriginal draft ID: ${documentId}\nNew open ID: ${newId}\nhttps://app.lexware.de/permalink/${deeplinkSlug}/view/${newId}\n\n${JSON.stringify(result.data, null, 2)}`,
				}],
			};
		},
	);
}
