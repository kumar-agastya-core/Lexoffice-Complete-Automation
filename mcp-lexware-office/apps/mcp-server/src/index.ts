import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { logger } from './logger.js';
import { makeLexwareOfficeRequest } from './helper.js';
import { registerVoucherTools } from './tools/vouchers.js';
import { registerInvoiceTools } from './tools/invoices.js';
import { registerContactTools } from './tools/contacts.js';
import { registerArticleTools } from './tools/articles.js';
import { registerSalesDocumentTools } from './tools/sales-documents.js';
import { registerPursueTools } from './tools/pursue.js';
import { registerFileTools } from './tools/files.js';
import { registerReferenceTools } from './tools/reference.js';
import { registerPaymentTools } from './tools/payments.js';
import { registerEventTools } from './tools/events.js';

const VERSION = '0.6.0';

const server = new McpServer({
	name: 'lexware-office',
	version: VERSION,
});

// ── Tool groups ───────────────────────────────────────────────────────────────

registerVoucherTools(server);
registerInvoiceTools(server);
registerContactTools(server);
registerArticleTools(server);
registerSalesDocumentTools(server);
registerPursueTools(server);
registerFileTools(server);
registerReferenceTools(server);
registerPaymentTools(server);
registerEventTools(server);

// ── MCP Resources — live data exposed as readable context ─────────────────────

server.resource(
	'posting-categories',
	'lexware://posting-categories',
	async (uri) => {
		const data = await makeLexwareOfficeRequest<unknown>('/v1/posting-categories');
		return {
			contents: [{
				uri: uri.href,
				mimeType: 'application/json',
				text: JSON.stringify(data ?? [], null, 2),
			}],
		};
	},
);

server.resource(
	'countries',
	'lexware://countries',
	async (uri) => {
		const data = await makeLexwareOfficeRequest<unknown>('/v1/countries');
		return {
			contents: [{
				uri: uri.href,
				mimeType: 'application/json',
				text: JSON.stringify(data ?? [], null, 2),
			}],
		};
	},
);

server.resource(
	'profile',
	'lexware://profile',
	async (uri) => {
		const data = await makeLexwareOfficeRequest<unknown>('/v1/profile');
		return {
			contents: [{
				uri: uri.href,
				mimeType: 'application/json',
				text: JSON.stringify(data ?? {}, null, 2),
			}],
		};
	},
);

// ── MCP Prompts — pre-built workflows ────────────────────────────────────────

server.prompt(
	'process-invoice',
	'Full workflow: extract data from an invoice PDF, find or create the vendor contact, determine the tax type, and post the voucher to Lexware.',
	{ filePath: z.string().describe('Absolute path to the invoice PDF') },
	({ filePath }) => ({
		messages: [{
			role: 'user',
			content: {
				type: 'text',
				text: `Process the invoice PDF at: ${filePath}

Steps:
1. Extract text and identify: vendor name, invoice number, date, total amount, tax amount, §13b or EU VAT indicators
2. Search for the vendor using get-contacts. If not found, create with create-contact.
3. Determine taxType: gross (normal DE), constructionService13b (§13b Bauleistung), externalService13b (§13b Fremdleistung), intraCommunitySupply (EU B2B, non-DE EU VAT ID), vatfree (§19 UStG)
4. Use list-posting-categories to select the appropriate category
5. Create the voucher with create-voucher. Use unchecked status if amount > €5000 or tax type is ambiguous.
6. Attach the PDF using upload-file-to-voucher.
7. Report: voucher ID, amount, category, tax type, vendor name, and deeplink.`,
			},
		}],
	}),
);

server.prompt(
	'create-dunnings-for-overdue',
	'Find all overdue invoices and create dunning notices for them.',
	{},
	() => ({
		messages: [{
			role: 'user',
			content: {
				type: 'text',
				text: `Find all overdue invoices and create dunning notices. Today is ${new Date().toISOString().slice(0, 10)}.

Steps:
1. Call get-invoices with status=["overdue"] to find all overdue invoices
2. For each overdue invoice, check how many days overdue (dueDate vs today)
3. Use pursue-invoice-to-dunning:
   - >30 days overdue: set dunningFeeNetAmount=10.00 and finalize=true
   - ≤30 days overdue: finalize=false (draft for review)
4. Report: table of dunnings created with invoice ID, amount, days overdue, dunning ID and deeplink.`,
			},
		}],
	}),
);

server.prompt(
	'monthly-spending-report',
	'Generate a spending report for a given month grouped by posting category.',
	{
		year: z.string().describe('Year e.g. "2026"'),
		month: z.string().describe('Month number e.g. "03" for March'),
	},
	({ year, month }) => {
		const dateFrom = `${year}-${month.padStart(2, '0')}-01`;
		const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
		const dateTo = `${year}-${month.padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
		return {
			messages: [{
				role: 'user',
				content: {
					type: 'text',
					text: `Generate a spending report for ${year}-${month.padStart(2, '0')} (${dateFrom} to ${dateTo}).

Steps:
1. Call list-all-vouchers with voucherType=["purchaseinvoice"], dateFrom=${dateFrom}, dateTo=${dateTo}
2. Call list-posting-categories to get category names by ID
3. Group vouchers by categoryId, sum amounts per category
4. Present results as a table: Category | Total Amount | # Invoices | Top Vendors
5. Show grand total and month-over-month note if possible.`,
				},
			}],
		};
	},
);

server.prompt(
	'invoice-client',
	'Create a sales invoice for a client with line items.',
	{
		clientName: z.string().describe('Client name to search for'),
		description: z.string().describe('What was delivered/performed'),
		amount: z.string().describe('Total amount in EUR'),
	},
	({ clientName, description, amount }) => ({
		messages: [{
			role: 'user',
			content: {
				type: 'text',
				text: `Create a sales invoice for: ${clientName}
Service/goods: ${description}
Amount: €${amount}

Steps:
1. Search for the client using get-contacts with name="${clientName}"
2. If not found, create with create-contact (customer role)
3. Call list-payment-conditions to find the default payment term
4. Call list-print-layouts to get the default layout ID
5. Create the invoice with create-invoice using the client's contactId
6. Report: invoice ID, amount, due date, and deeplink.`,
			},
		}],
	}),
);

// ── Server startup ────────────────────────────────────────────────────────────

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	logger.log(`Lexware Office MCP Server v${VERSION} running on stdio`);
}

main().catch((error) => {
	logger.error('Fatal error in main():', { error });
	process.exit(1);
});
