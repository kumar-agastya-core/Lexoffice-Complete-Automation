# Wave 1: Fehlende Read-Tools – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 14 neue read-only MCP-Tools für alle fehlenden Lexware-Office-Dokumenttypen implementieren.

**Architecture:** Alle Tools folgen dem bestehenden Muster in `src/index.ts`: Zod-Schema → `makeLexwareOfficeRequest` → strukturierte Textantwort. Keine neuen Dateien, keine neue Abstraktionsschicht. Listen-Tools nutzen `/v1/voucherlist` mit `voucherType`-Filter; Detail-Tools nutzen den jeweiligen Typ-Endpunkt direkt.

**Tech Stack:** TypeScript, Zod, `@modelcontextprotocol/sdk`, Lexware Office REST API

---

## Files

- Modify: `src/index.ts` — 14 neue `server.tool(...)` Registrierungen hinzufügen

---

### Task 1: `get-quotations` + `get-quotation-details`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: `get-quotations` implementieren**

Füge nach dem letzten bestehenden Tool (vor `async function main()`) ein:

```typescript
server.tool(
	'get-quotations',
	'Get a list of quotations (Angebote) from Lexware Office',
	{
		status: z
			.array(z.enum(['draft', 'open', 'accepted', 'rejected', 'voided']))
			.optional()
			.default(['draft', 'open', 'accepted', 'rejected', 'voided']),
		page: z.number().min(0).optional().default(0).describe('page number to retrieve; starts at 0'),
		size: z.number().min(1).max(250).optional().default(250).describe('number of results per page'),
	},
	async ({ status, page, size }) => {
		const url = `/v1/voucherlist?voucherType=quotation&voucherStatus=${status.join(',')}&page=${page}&size=${size}`;
		const data = await makeLexwareOfficeRequest<any>(url);
		const vouchers = data?.content;

		if (!vouchers || vouchers.length === 0) {
			return { content: [{ type: 'text', text: 'No quotations found' }] };
		}

		return {
			content: [{
				type: 'text',
				text: `There are ${data.totalElements} quotations in total (showing ${vouchers.length} on page ${page}):\n\n${JSON.stringify(vouchers, null, 2)}`,
			}],
		};
	},
);
```

- [ ] **Step 2: `get-quotation-details` implementieren**

```typescript
server.tool(
	'get-quotation-details',
	'Get details of a quotation (Angebot) from Lexware Office by its ID',
	{
		id: z.string().uuid().describe('The ID of the quotation'),
	},
	async ({ id }) => {
		const data = await makeLexwareOfficeRequest<any>(`/v1/quotations/${id}`);

		if (!data) {
			return { content: [{ type: 'text', text: 'Failed to retrieve quotation data' }] };
		}

		return {
			content: [{ type: 'text', text: `Quotation details:\n\n${JSON.stringify(data, null, 2)}` }],
		};
	},
);
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: keine TypeScript-Fehler, `build/index.js` wird erzeugt.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add get-quotations and get-quotation-details tools"
```

---

### Task 2: `get-credit-notes` + `get-credit-note-details`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: `get-credit-notes` implementieren**

```typescript
server.tool(
	'get-credit-notes',
	'Get a list of credit notes (Gutschriften) from Lexware Office',
	{
		status: z
			.array(z.enum(['draft', 'open', 'paid', 'voided']))
			.optional()
			.default(['draft', 'open', 'paid', 'voided']),
		page: z.number().min(0).optional().default(0).describe('page number to retrieve; starts at 0'),
		size: z.number().min(1).max(250).optional().default(250).describe('number of results per page'),
	},
	async ({ status, page, size }) => {
		const url = `/v1/voucherlist?voucherType=creditnote&voucherStatus=${status.join(',')}&page=${page}&size=${size}`;
		const data = await makeLexwareOfficeRequest<any>(url);
		const vouchers = data?.content;

		if (!vouchers || vouchers.length === 0) {
			return { content: [{ type: 'text', text: 'No credit notes found' }] };
		}

		return {
			content: [{
				type: 'text',
				text: `There are ${data.totalElements} credit notes in total (showing ${vouchers.length} on page ${page}):\n\n${JSON.stringify(vouchers, null, 2)}`,
			}],
		};
	},
);
```

- [ ] **Step 2: `get-credit-note-details` implementieren**

```typescript
server.tool(
	'get-credit-note-details',
	'Get details of a credit note (Gutschrift) from Lexware Office by its ID',
	{
		id: z.string().uuid().describe('The ID of the credit note'),
	},
	async ({ id }) => {
		const data = await makeLexwareOfficeRequest<any>(`/v1/credit-notes/${id}`);

		if (!data) {
			return { content: [{ type: 'text', text: 'Failed to retrieve credit note data' }] };
		}

		return {
			content: [{ type: 'text', text: `Credit note details:\n\n${JSON.stringify(data, null, 2)}` }],
		};
	},
);
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: keine TypeScript-Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add get-credit-notes and get-credit-note-details tools"
```

---

### Task 3: `get-order-confirmations` + `get-delivery-notes` (je List + Detail)

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: `get-order-confirmations` implementieren**

```typescript
server.tool(
	'get-order-confirmations',
	'Get a list of order confirmations (Auftragsbestätigungen) from Lexware Office',
	{
		status: z
			.array(z.enum(['draft', 'open', 'fulfilled', 'voided']))
			.optional()
			.default(['draft', 'open', 'fulfilled', 'voided']),
		page: z.number().min(0).optional().default(0).describe('page number to retrieve; starts at 0'),
		size: z.number().min(1).max(250).optional().default(250).describe('number of results per page'),
	},
	async ({ status, page, size }) => {
		const url = `/v1/voucherlist?voucherType=orderconfirmation&voucherStatus=${status.join(',')}&page=${page}&size=${size}`;
		const data = await makeLexwareOfficeRequest<any>(url);
		const vouchers = data?.content;

		if (!vouchers || vouchers.length === 0) {
			return { content: [{ type: 'text', text: 'No order confirmations found' }] };
		}

		return {
			content: [{
				type: 'text',
				text: `There are ${data.totalElements} order confirmations in total (showing ${vouchers.length} on page ${page}):\n\n${JSON.stringify(vouchers, null, 2)}`,
			}],
		};
	},
);
```

- [ ] **Step 2: `get-order-confirmation-details` implementieren**

```typescript
server.tool(
	'get-order-confirmation-details',
	'Get details of an order confirmation (Auftragsbestätigung) from Lexware Office by its ID',
	{
		id: z.string().uuid().describe('The ID of the order confirmation'),
	},
	async ({ id }) => {
		const data = await makeLexwareOfficeRequest<any>(`/v1/order-confirmations/${id}`);

		if (!data) {
			return { content: [{ type: 'text', text: 'Failed to retrieve order confirmation data' }] };
		}

		return {
			content: [{ type: 'text', text: `Order confirmation details:\n\n${JSON.stringify(data, null, 2)}` }],
		};
	},
);
```

- [ ] **Step 3: `get-delivery-notes` implementieren**

```typescript
server.tool(
	'get-delivery-notes',
	'Get a list of delivery notes (Lieferscheine) from Lexware Office',
	{
		status: z
			.array(z.enum(['draft', 'open', 'fulfilled', 'voided']))
			.optional()
			.default(['draft', 'open', 'fulfilled', 'voided']),
		page: z.number().min(0).optional().default(0).describe('page number to retrieve; starts at 0'),
		size: z.number().min(1).max(250).optional().default(250).describe('number of results per page'),
	},
	async ({ status, page, size }) => {
		const url = `/v1/voucherlist?voucherType=deliverynote&voucherStatus=${status.join(',')}&page=${page}&size=${size}`;
		const data = await makeLexwareOfficeRequest<any>(url);
		const vouchers = data?.content;

		if (!vouchers || vouchers.length === 0) {
			return { content: [{ type: 'text', text: 'No delivery notes found' }] };
		}

		return {
			content: [{
				type: 'text',
				text: `There are ${data.totalElements} delivery notes in total (showing ${vouchers.length} on page ${page}):\n\n${JSON.stringify(vouchers, null, 2)}`,
			}],
		};
	},
);
```

- [ ] **Step 4: `get-delivery-note-details` implementieren**

```typescript
server.tool(
	'get-delivery-note-details',
	'Get details of a delivery note (Lieferschein) from Lexware Office by its ID',
	{
		id: z.string().uuid().describe('The ID of the delivery note'),
	},
	async ({ id }) => {
		const data = await makeLexwareOfficeRequest<any>(`/v1/delivery-notes/${id}`);

		if (!data) {
			return { content: [{ type: 'text', text: 'Failed to retrieve delivery note data' }] };
		}

		return {
			content: [{ type: 'text', text: `Delivery note details:\n\n${JSON.stringify(data, null, 2)}` }],
		};
	},
);
```

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: keine TypeScript-Fehler.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts
git commit -m "feat: add get-order-confirmations and get-delivery-notes tools"
```

---

### Task 4: `get-down-payment-invoice-details` + `get-profile` + `list-print-layouts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: `get-down-payment-invoice-details` implementieren**

```typescript
server.tool(
	'get-down-payment-invoice-details',
	'Get details of a down payment invoice (Anzahlungsrechnung) from Lexware Office by its ID',
	{
		id: z.string().uuid().describe('The ID of the down payment invoice'),
	},
	async ({ id }) => {
		const data = await makeLexwareOfficeRequest<any>(`/v1/down-payment-invoices/${id}`);

		if (!data) {
			return { content: [{ type: 'text', text: 'Failed to retrieve down payment invoice data' }] };
		}

		return {
			content: [{ type: 'text', text: `Down payment invoice details:\n\n${JSON.stringify(data, null, 2)}` }],
		};
	},
);
```

- [ ] **Step 2: `get-profile` implementieren**

```typescript
server.tool(
	'get-profile',
	'Get the company profile (Unternehmensprofil) from Lexware Office, including company name, address, tax settings, and contact information',
	{},
	async () => {
		const data = await makeLexwareOfficeRequest<any>('/v1/profile');

		if (!data) {
			return { content: [{ type: 'text', text: 'Failed to retrieve profile data' }] };
		}

		return {
			content: [{ type: 'text', text: `Company profile:\n\n${JSON.stringify(data, null, 2)}` }],
		};
	},
);
```

- [ ] **Step 3: `list-print-layouts` implementieren**

```typescript
server.tool(
	'list-print-layouts',
	'Retrieve available print layouts (Drucklayouts) from Lexware Office. Use these IDs when creating invoices or other documents to control the visual appearance.',
	{},
	async () => {
		const data = await makeLexwareOfficeRequest<any>('/v1/print-layouts');

		if (!data) {
			return { content: [{ type: 'text', text: 'Failed to retrieve print layouts' }] };
		}

		return {
			content: [{ type: 'text', text: `Print layouts:\n\n${JSON.stringify(data, null, 2)}` }],
		};
	},
);
```

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: keine TypeScript-Fehler.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: add get-down-payment-invoice-details, get-profile, list-print-layouts tools"
```

---

### Task 5: `get-recurring-templates` + `get-articles` + `get-article-details`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: `get-recurring-templates` implementieren**

```typescript
server.tool(
	'get-recurring-templates',
	'Get a list of recurring invoice templates (Wiederkehrende Vorlagen) from Lexware Office',
	{
		page: z.number().min(0).optional().default(0).describe('page number to retrieve; starts at 0'),
		size: z.number().min(1).max(250).optional().default(250).describe('number of results per page'),
	},
	async ({ page, size }) => {
		const data = await makeLexwareOfficeRequest<any>(`/v1/recurring-templates?page=${page}&size=${size}`);

		if (!data) {
			return { content: [{ type: 'text', text: 'Failed to retrieve recurring templates' }] };
		}

		return {
			content: [{ type: 'text', text: `Recurring templates:\n\n${JSON.stringify(data, null, 2)}` }],
		};
	},
);
```

- [ ] **Step 2: `get-articles` implementieren**

```typescript
server.tool(
	'get-articles',
	'Get a list of articles (Artikel/Produkte) from Lexware Office with optional filters',
	{
		articleNumber: z.string().optional().describe('Filter by article number (Artikelnummer)'),
		name: z.string().optional().describe('Filter by article name (substring search)'),
		type: z.enum(['PRODUCT', 'SERVICE']).optional().describe('Filter by article type'),
		page: z.number().min(0).optional().default(0).describe('page number to retrieve; starts at 0'),
		size: z.number().min(1).max(250).optional().default(250).describe('number of results per page'),
	},
	async ({ articleNumber, name, type, page, size }) => {
		const params = new URLSearchParams({ page: String(page), size: String(size) });
		if (articleNumber) params.append('articleNumber', articleNumber);
		if (name) params.append('name', name);
		if (type) params.append('type', type);

		const data = await makeLexwareOfficeRequest<any>(`/v1/articles?${params.toString()}`);

		if (!data) {
			return { content: [{ type: 'text', text: 'Failed to retrieve articles' }] };
		}

		return {
			content: [{ type: 'text', text: `Articles:\n\n${JSON.stringify(data, null, 2)}` }],
		};
	},
);
```

- [ ] **Step 3: `get-article-details` implementieren**

```typescript
server.tool(
	'get-article-details',
	'Get details of an article (Artikel/Produkt) from Lexware Office by its ID',
	{
		id: z.string().uuid().describe('The ID of the article'),
	},
	async ({ id }) => {
		const data = await makeLexwareOfficeRequest<any>(`/v1/articles/${id}`);

		if (!data) {
			return { content: [{ type: 'text', text: 'Failed to retrieve article data' }] };
		}

		return {
			content: [{ type: 'text', text: `Article details:\n\n${JSON.stringify(data, null, 2)}` }],
		};
	},
);
```

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: keine TypeScript-Fehler.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: add get-recurring-templates, get-articles, get-article-details tools"
```

---

### Task 6: Version bump + PR

**Files:**
- Modify: `package.json` — version `0.3.0` → `0.4.0`
- Modify: `src/index.ts` — version im `McpServer`-Konstruktor anpassen

- [ ] **Step 1: Version in `package.json` aktualisieren**

In `package.json` ändern:
```json
"version": "0.4.0"
```

- [ ] **Step 2: Version in `src/index.ts` aktualisieren**

Zeile 33 in `src/index.ts` ändern:
```typescript
const server = new McpServer({
	name: 'lexware-office',
	version: '0.4.0',
});
```

- [ ] **Step 3: Final build**

```bash
npm run build
```

Expected: keine TypeScript-Fehler.

- [ ] **Step 4: Commit**

```bash
git add package.json src/index.ts
git commit -m "chore: bump version to 0.4.0 for Wave 1 release"
```

- [ ] **Step 5: Push + PR erstellen**

```bash
git push origin claude/angry-morse
```

Dann PR auf GitHub erstellen: `si0nDE/mcp-lexware-office`, Base: `main`, Head: `claude/angry-morse`.

PR-Titel: `feat: Wave 1 — add 14 read-only tools for all missing document types`

---

## Hinweis: voucherType-Strings

Die `voucherType`-Strings für den `/v1/voucherlist`-Endpunkt (`quotation`, `creditnote`, `orderconfirmation`, `deliverynote`) sind die wahrscheinlichsten Werte basierend auf dem API-Muster. Falls ein List-Tool `No ... found` zurückgibt obwohl Daten vorhanden sind, den tatsächlichen `voucherType`-String in der Lexware-API-Doku unter [voucherlist](https://developers.lexware.io/docs/#Lexware%20Office-api-documentation) verifizieren.
