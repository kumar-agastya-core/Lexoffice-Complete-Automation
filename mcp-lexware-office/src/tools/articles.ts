import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { makeLexwareOfficeRequest, makeLexwareOfficeWriteRequest, makeLexwareOfficeWriteWithRetry, makeLexwareOfficeDeleteRequest, paginateAll } from '../helper.js';
import { writeErrorResponse, trim } from '../utils.js';

export function registerArticleTools(server: McpServer): void {
	server.tool(
		'get-articles',
		'Get a page of articles. For all pages use list-all-articles.',
		{
			articleNumber: z.string().optional(),
			name: z.string().optional().describe('Substring on article name'),
			type: z.enum(['PRODUCT', 'SERVICE']).optional(),
			page: z.number().min(0).optional().default(0),
			size: z.number().min(25).max(250).optional().default(250).describe('Min 25 (API req)'),
		},
		async ({ articleNumber, name, type, page, size }) => {
			const params = new URLSearchParams({ page: String(page), size: String(size) });
			if (articleNumber) params.append('articleNumber', articleNumber);
			if (name) params.append('name', name);
			if (type) params.append('type', type);
			const data = await makeLexwareOfficeRequest<any>(`/v1/articles?${params.toString()}`);
			if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve articles' }] };
			const content = Array.isArray(data.content) ? data.content.map((a: unknown) => trim('article-list', a)) : data;
			return { content: [{ type: 'text', text: `Articles:\n\n${JSON.stringify(content, null, 2)}` }] };
		},
	);

	server.tool(
		'list-all-articles',
		'Fetch all articles across all pages.',
		{
			type: z.enum(['PRODUCT', 'SERVICE']).optional(),
		},
		async ({ type }) => {
			const params = new URLSearchParams({ size: '250' });
			if (type) params.append('type', type);
			const all = await paginateAll<unknown>('/v1/articles', params, 250);
			if (!all) return { content: [{ type: 'text', text: 'Failed to retrieve articles' }] };
			const trimmed = all.map(a => trim('article-list', a));
			return {
				content: [{
					type: 'text',
					text: `All articles (${all.length} total):\n\n${JSON.stringify(trimmed, null, 2)}`,
				}],
			};
		},
	);

	server.tool(
		'get-article-details',
		'Get article details by ID.',
		{ id: z.string().uuid() },
		async ({ id }) => {
			const data = await makeLexwareOfficeRequest<any>(`/v1/articles/${id}`);
			if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve article data' }] };
			return { content: [{ type: 'text', text: `Article details:\n\n${JSON.stringify(trim('article', data), null, 2)}` }] };
		},
	);

	server.tool(
		'create-article',
		'Create a new article (product or service).',
		{
			title: z.string(),
			type: z.enum(['PRODUCT', 'SERVICE']).describe('PRODUCT/SERVICE'),
			unitName: z.string().optional().describe('Stück/Stunden/kg'),
			articleNumber: z.string().optional(),
			description: z.string().optional(),
			netPrice: z.number().describe('Net EUR/unit'),
			taxRate: z.number().describe('0/7/19'),
			leadingPrice: z.enum(['NET', 'GROSS']).optional().default('NET'),
		},
		async ({ title, type, unitName, articleNumber, description, netPrice, taxRate, leadingPrice }) => {
			const result = await makeLexwareOfficeWriteRequest<any>('/v1/articles', 'POST', {
				title,
				type,
				...(unitName ? { unitName } : {}),
				...(articleNumber ? { articleNumber } : {}),
				...(description ? { description } : {}),
				price: { netPrice, leadingPrice, taxRate },
			});
			if (!result || !result.ok) {
				return { content: [{ type: 'text', text: writeErrorResponse(result && !result.ok ? result : null) }] };
			}
			return { content: [{ type: 'text', text: `Article created:\n\n${JSON.stringify(trim('article', result.data), null, 2)}` }] };
		},
	);

	server.tool(
		'update-article',
		'Update an article. On 409 conflict auto-fetches and retries once.',
		{
			id: z.string().uuid(),
			version: z.number().int().describe('From get-article-details'),
			title: z.string().optional(),
			type: z.enum(['PRODUCT', 'SERVICE']).optional(),
			unitName: z.string().optional(),
			articleNumber: z.string().optional(),
			description: z.string().optional(),
			netPrice: z.number().optional(),
			taxRate: z.number().optional().describe('0/7/19'),
			leadingPrice: z.enum(['NET', 'GROSS']).optional(),
		},
		async ({ id, version, title, type, unitName, articleNumber, description, netPrice, taxRate, leadingPrice }) => {
			const body: Record<string, unknown> = { version };
			if (title !== undefined) body.title = title;
			if (type !== undefined) body.type = type;
			if (unitName !== undefined) body.unitName = unitName;
			if (articleNumber !== undefined) body.articleNumber = articleNumber;
			if (description !== undefined) body.description = description;
			if (netPrice !== undefined || taxRate !== undefined || leadingPrice !== undefined) {
				body.price = {
					...(netPrice !== undefined ? { netPrice } : {}),
					...(taxRate !== undefined ? { taxRate } : {}),
					...(leadingPrice !== undefined ? { leadingPrice } : {}),
				};
			}

			const result = await makeLexwareOfficeWriteWithRetry<any>(
				`/v1/articles/${id}`,
				'PUT',
				body,
				async () => makeLexwareOfficeRequest<any>(`/v1/articles/${id}`),
			);

			if (!result || !result.ok) {
				return { content: [{ type: 'text', text: writeErrorResponse(result && !result.ok ? result : null) }] };
			}
			return { content: [{ type: 'text', text: `Article updated:\n\n${JSON.stringify(trim('article', result.data), null, 2)}` }] };
		},
	);

	server.tool(
		'delete-article',
		'Delete an article permanently. Cannot be undone.',
		{ id: z.string().uuid() },
		async ({ id }) => {
			const result = await makeLexwareOfficeDeleteRequest(`/v1/articles/${id}`);
			if (!result) return { content: [{ type: 'text', text: 'Network error deleting article' }] };
			if (!result.ok) return { content: [{ type: 'text', text: writeErrorResponse(result) }] };
			return { content: [{ type: 'text', text: `Article ${id} deleted.` }] };
		},
	);
}
