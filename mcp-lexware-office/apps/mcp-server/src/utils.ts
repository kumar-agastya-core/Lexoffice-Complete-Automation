import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'crypto';
import { makeLexwareOfficeRequest, makeLexwareOfficeWriteRequest, makeLexwareOfficeFileRequest } from './helper.js';

export type TextContent = { content: Array<{ type: 'text'; text: string }> };

export type TrimType =
	| 'contact' | 'contact-list'
	| 'voucher' | 'voucher-list'
	| 'invoice' | 'invoice-list'
	| 'article' | 'article-list'
	| 'posting-category' | 'quotation';

function pick(obj: any, keys: string[]): any {
	const result: any = {};
	for (const k of keys) {
		if (obj[k] !== undefined) result[k] = obj[k];
	}
	return result;
}

export function trim(type: TrimType, data: unknown): unknown {
	if (data === null || data === undefined) return data;
	const d = data as any;
	switch (type) {
		case 'contact': {
			const r: any = pick(d, ['id', 'version', 'roles', 'note']);
			if (d.company) r.company = pick(d.company, ['name', 'taxNumber', 'vatRegistrationId', 'allowTaxFreeInvoices']);
			if (d.person) r.person = pick(d.person, ['salutation', 'firstName', 'lastName']);
			if (d.addresses?.billing?.[0]) r.billingAddress = pick(d.addresses.billing[0], ['street', 'zip', 'city', 'countryCode']);
			if (d.emailAddresses?.business?.[0]) r.email = d.emailAddresses.business[0];
			if (d.phoneNumbers?.business?.[0]) r.phone = d.phoneNumbers.business[0];
			return r;
		}
		case 'contact-list':
			return pick(d, ['id', 'name', 'contactNumber', 'roles', 'email', 'companyName', 'firstName', 'lastName']);
		case 'voucher': {
			const r: any = pick(d, ['id', 'version', 'type', 'voucherStatus', 'voucherDate', 'voucherNumber', 'dueDate', 'taxType', 'totalGrossAmount', 'totalTaxAmount', 'contactId']);
			if (Array.isArray(d.voucherItems)) r.voucherItems = d.voucherItems.map((i: any) => pick(i, ['amount', 'taxAmount', 'taxRatePercent', 'categoryId']));
			if (Array.isArray(d.files)) r.files = d.files.map((f: any) => ({ id: f.id }));
			return r;
		}
		case 'voucher-list':
			return pick(d, ['id', 'voucherType', 'voucherStatus', 'voucherDate', 'voucherNumber', 'totalGrossAmount', 'contactId', 'dueDate']);
		case 'invoice':
		case 'quotation':
			return pick(d, ['id', 'voucherStatus', 'voucherDate', 'voucherNumber', 'address', 'lineItems', 'taxConditions', 'shippingConditions', 'totalPrice', 'paymentConditions', 'expirationDate', 'title', 'introduction', 'remark']);
		case 'invoice-list':
			return pick(d, ['id', 'voucherType', 'voucherStatus', 'voucherDate', 'voucherNumber', 'totalGrossAmount', 'contactId', 'dueDate']);
		case 'article':
			return pick(d, ['id', 'version', 'title', 'type', 'articleNumber', 'description', 'unitName', 'price']);
		case 'article-list': {
			const r: any = pick(d, ['id', 'title', 'type', 'articleNumber', 'unitName']);
			if (d.price) r.price = pick(d.price, ['netPrice', 'taxRate', 'leadingPrice']);
			return r;
		}
		case 'posting-category':
			return pick(d, ['id', 'name', 'type']);
		default:
			return data;
	}
}

export function writeErrorResponse(result: { status: number; error: unknown } | null): string {
	if (!result) return 'Request failed due to a network or server error.';
	if (result.status === 404) return 'Record not found.';
	if (result.status === 409) return 'Version conflict — please re-fetch the record and try again.';
	if (result.status === 401 || result.status === 403) return 'Authentication or permission error.';
	if (result.status === 422) {
		const msg = (result.error as any)?.message ?? JSON.stringify(result.error);
		return `Validation error (422): ${msg}`;
	}
	return `API error (${result.status}): ${JSON.stringify(result.error, null, 2)}`;
}

export function verifyWebhookHmac(payload: string, signature: string, secret: string): boolean {
	try {
		const expected = createHmac('sha256', secret).update(payload).digest('hex');
		const sigBuf = Buffer.from(signature);
		const expBuf = Buffer.from(expected);
		if (sigBuf.length !== expBuf.length) return false;
		return timingSafeEqual(sigBuf, expBuf);
	} catch {
		return false;
	}
}

function normalizeLineItems(lineItems: unknown): unknown {
	if (!Array.isArray(lineItems)) return lineItems;
	return lineItems.map((item: Record<string, unknown>) => {
		if (item.type === 'custom' || item.type === 'text') {
			const { id: _id, ...rest } = item;
			return rest;
		}
		return item;
	});
}

export async function handleSalesDocumentRequest(
	params: Record<string, unknown>,
	apiPath: string,
	label: string,
	deeplinkSlug: string,
	trimType?: TrimType,
): Promise<TextContent> {
	const body = { ...params, lineItems: normalizeLineItems(params.lineItems), totalPrice: { currency: 'EUR' } };
	const result = await makeLexwareOfficeWriteRequest<any>(apiPath, 'POST', body);

	if (!result || !result.ok) {
		return { content: [{ type: 'text', text: writeErrorResponse(result && !result.ok ? result : null) }] };
	}

	const id = (result.data as any)?.id ?? '';
	const deeplink = id
		? `\nView in Lexware: https://app.lexware.de/permalink/${deeplinkSlug}/view/${id}`
		: '';
	const data = trimType ? trim(trimType, result.data) : result.data;
	return {
		content: [{ type: 'text', text: `${label} created successfully:${deeplink}\n\n${JSON.stringify(data, null, 2)}` }],
	};
}

export async function handleDunningRequest(
	params: Record<string, unknown>,
	finalize: boolean,
): Promise<TextContent> {
	const { precedingSalesVoucherId, ...rest } = params;
	const queryParams = new URLSearchParams({
		precedingSalesVoucherId: precedingSalesVoucherId as string,
		...(finalize ? { finalize: 'true' } : {}),
	});
	const path = `/v1/dunnings?${queryParams.toString()}`;
	const body = { ...rest, lineItems: normalizeLineItems(rest.lineItems), totalPrice: { currency: 'EUR' } };
	const result = await makeLexwareOfficeWriteRequest<any>(path, 'POST', body);

	if (!result || !result.ok) {
		return { content: [{ type: 'text', text: writeErrorResponse(result && !result.ok ? result : null) }] };
	}

	const id = (result.data as any)?.id ?? '';
	const action = finalize ? 'created and finalized' : 'created as draft';
	const deeplink = id
		? `\nView in Lexware: https://app.lexware.de/permalink/dunnings/view/${id}`
		: '';

	return {
		content: [{ type: 'text', text: `Dunning ${action} successfully:${deeplink}\n\n${JSON.stringify(result.data, null, 2)}` }],
	};
}

export function extractSalesDocFields(doc: any): Record<string, unknown> {
	const fields: Record<string, unknown> = {};
	const copy = [
		'voucherDate', 'address', 'lineItems', 'taxConditions', 'paymentConditions',
		'shippingConditions', 'introduction', 'remark', 'title', 'printLayoutId',
		'language', 'expirationDate',
	];
	for (const key of copy) {
		if (doc[key] !== undefined) fields[key] = doc[key];
	}
	return fields;
}

export function registerFileDownloadTool(
	server: McpServer,
	toolName: string,
	description: string,
	apiPath: (id: string) => string,
): void {
	server.tool(
		toolName,
		description,
		{ id: z.string().uuid().describe('Document ID') },
		async ({ id }) => {
			const fileData = await makeLexwareOfficeFileRequest(apiPath(id), 'application/pdf');
			if (!fileData) {
				return { content: [{ type: 'text', text: `Failed to download file for ${id}` }] };
			}
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
}
