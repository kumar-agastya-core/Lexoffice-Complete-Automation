import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { makeLexwareOfficeRequest } from '../helper.js';
import { trim } from '../utils.js';

// In-memory cache for data that never changes between API calls
let _categoriesCache: unknown[] | null = null;
let _countriesCache: unknown[] | null = null;

export function registerReferenceTools(server: McpServer): void {
	// ── Connection check ───────────────────────────────────────────────────────

	server.tool(
		'check-connection',
		'Verify API connection. Returns company name, VAT ID, status.',
		{},
		async () => {
			const profile = await makeLexwareOfficeRequest<any>('/v1/profile');
			if (!profile) {
				return { content: [{ type: 'text', text: 'Connection failed. Check LEXWARE_OFFICE_API_KEY environment variable.' }] };
			}
			const name = profile.companyName ?? profile.organizationId ?? '(unknown)';
			const vat = profile.vatRegistrationId ?? 'not set';
			return {
				content: [{
					type: 'text',
					text: `Connection OK.\nCompany: ${name}\nVAT ID: ${vat}\nUser ID: ${profile.userId ?? '(unknown)'}`,
				}],
			};
		},
	);

	// ── Posting categories (cached) ────────────────────────────────────────────

	server.tool(
		'list-posting-categories',
		'Get posting categories (cached). Use "Zu prüfen" when uncertain.',
		{ type: z.enum(['income', 'outgo']).optional() },
		async ({ type }) => {
			if (!_categoriesCache) {
				const data = await makeLexwareOfficeRequest<any[]>('/v1/posting-categories');
				if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve posting categories' }] };
				_categoriesCache = data;
			}
			const filtered = type ? _categoriesCache.filter((c: any) => c.type === type) : _categoriesCache;
			const trimmed = filtered.map(c => trim('posting-category', c));
			return { content: [{ type: 'text', text: `Posting categories:\n\n${JSON.stringify(trimmed, null, 2)}` }] };
		},
	);

	// ── Countries (cached) ─────────────────────────────────────────────────────

	server.tool(
		'list-countries',
		'List countries with EU tax classification (cached). de/intraCommunity/thirdPartyCountry.',
		{ taxClassification: z.enum(['de', 'intraCommunity', 'thirdPartyCountry']).optional() },
		async ({ taxClassification }) => {
			if (!_countriesCache) {
				const data = await makeLexwareOfficeRequest<any[]>('/v1/countries');
				if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve countries' }] };
				_countriesCache = data;
			}
			const filtered = taxClassification
				? _countriesCache.filter((c: any) => c.taxClassification === taxClassification)
				: _countriesCache;
			return { content: [{ type: 'text', text: `Countries:\n\n${JSON.stringify(filtered, null, 2)}` }] };
		},
	);

	// ── Profile ────────────────────────────────────────────────────────────────

	server.tool(
		'get-profile',
		'Get company profile — name, address, VAT ID, tax settings.',
		{},
		async () => {
			const data = await makeLexwareOfficeRequest<any>('/v1/profile');
			if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve profile' }] };
			return { content: [{ type: 'text', text: `Company profile:\n\n${JSON.stringify(data, null, 2)}` }] };
		},
	);

	// ── Payment conditions ─────────────────────────────────────────────────────

	server.tool(
		'get-payment-conditions',
		'List payment conditions. Use returned IDs when creating invoices.',
		{},
		async () => {
			const data = await makeLexwareOfficeRequest<any>('/v1/payment-conditions');
			if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve payment conditions' }] };
			return { content: [{ type: 'text', text: `Payment conditions:\n\n${JSON.stringify(data, null, 2)}` }] };
		},
	);

	server.tool(
		'list-payment-conditions',
		'Alias for get-payment-conditions.',
		{},
		async () => {
			const data = await makeLexwareOfficeRequest<any>('/v1/payment-conditions');
			if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve payment conditions' }] };
			return { content: [{ type: 'text', text: `Payment conditions:\n\n${JSON.stringify(data, null, 2)}` }] };
		},
	);

	// ── Print layouts ──────────────────────────────────────────────────────────

	server.tool(
		'list-print-layouts',
		'List print layouts. Use returned IDs when creating invoices.',
		{},
		async () => {
			const data = await makeLexwareOfficeRequest<any>('/v1/print-layouts');
			if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve print layouts' }] };
			return { content: [{ type: 'text', text: `Print layouts:\n\n${JSON.stringify(data, null, 2)}` }] };
		},
	);
}
