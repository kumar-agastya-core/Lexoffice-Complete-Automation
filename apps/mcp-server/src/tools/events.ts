import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { makeLexwareOfficeRequest, makeLexwareOfficeWriteRequest, makeLexwareOfficeDeleteRequest } from '../helper.js';
import { writeErrorResponse, verifyWebhookHmac } from '../utils.js';
import { EVENT_TYPES } from '../schemas.js';

export function registerEventTools(server: McpServer): void {
	// ── Event subscriptions ────────────────────────────────────────────────────

	server.tool(
		'list-event-subscriptions',
		'List all active webhook event subscriptions.',
		{},
		async () => {
			const data = await makeLexwareOfficeRequest<any>('/v1/event-subscriptions');
			if (!data) return { content: [{ type: 'text', text: 'Failed to retrieve event subscriptions' }] };
			return { content: [{ type: 'text', text: `Event subscriptions:\n\n${JSON.stringify(data, null, 2)}` }] };
		},
	);

	server.tool(
		'get-event-subscription',
		'Get a webhook event subscription by ID.',
		{ id: z.string().uuid() },
		async ({ id }) => {
			const data = await makeLexwareOfficeRequest<any>(`/v1/event-subscriptions/${id}`);
			if (!data) return { content: [{ type: 'text', text: `Failed to retrieve event subscription ${id}` }] };
			return { content: [{ type: 'text', text: `Event subscription:\n\n${JSON.stringify(data, null, 2)}` }] };
		},
	);

	server.tool(
		'create-event-subscription',
		'Subscribe to a Lexware webhook event. POSTs to callbackUrl on event.',
		{
			eventType: z.enum(EVENT_TYPES),
			callbackUrl: z.string().url().describe('HTTPS endpoint'),
		},
		async ({ eventType, callbackUrl }) => {
			const result = await makeLexwareOfficeWriteRequest<any>('/v1/event-subscriptions', 'POST', { eventType, callbackUrl });
			if (!result || !result.ok) {
				return { content: [{ type: 'text', text: writeErrorResponse(result && !result.ok ? result : null) }] };
			}
			return { content: [{ type: 'text', text: `Event subscription created:\n\n${JSON.stringify(result.data, null, 2)}` }] };
		},
	);

	server.tool(
		'delete-event-subscription',
		'Delete a webhook event subscription.',
		{ id: z.string().uuid() },
		async ({ id }) => {
			const result = await makeLexwareOfficeDeleteRequest(`/v1/event-subscriptions/${id}`);
			if (!result) return { content: [{ type: 'text', text: 'Network error deleting event subscription' }] };
			if (!result.ok) return { content: [{ type: 'text', text: writeErrorResponse(result) }] };
			return { content: [{ type: 'text', text: `Event subscription ${id} deleted.` }] };
		},
	);

	// ── Webhook signature verification ─────────────────────────────────────────

	server.tool(
		'verify-webhook-signature',
		'Verify HMAC-SHA256 signature of an incoming Lexware webhook payload.',
		{
			payload: z.string().describe('Raw request body'),
			signature: z.string().describe('X-Lx-Signature header value'),
			secret: z.string().describe('Webhook signing secret'),
		},
		async ({ payload, signature, secret }) => {
			const valid = verifyWebhookHmac(payload, signature, secret);
			return {
				content: [{
					type: 'text',
					text: valid
						? 'Signature valid. Payload is authentic.'
						: 'Signature INVALID. Do not process this payload — it may be tampered or from an unknown source.',
				}],
			};
		},
	);
}
