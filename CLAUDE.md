# CLAUDE.md — Universal Lexware MCP Bookkeeper Agent
# Complete build reference — read this at the start of every session

---

## 1. WHAT WE ARE BUILDING

A fully autonomous AI bookkeeper agent that controls 100% of Lexware via the API. The agent lives in Claude Desktop / Claude Code, connects to Lexware through MCP servers, and can handle any bookkeeping task a human bookkeeper would handle — without asking unnecessary questions.

**The goal:** Drop a PDF or type a natural language instruction → the agent executes the full operation in Lexware, reports what it did, and learns for next time. Human only involved for approval-threshold items and genuinely ambiguous edge cases.

**Works for any business:** restaurant, e-commerce, consulting, construction, retail, services — any German business using Lexware Office. The agent learns each business's vendors, categories, and patterns through use. No hardcoded rules on installation.

---

## 2. ARCHITECTURE

### Two MCP servers running simultaneously

```
Claude Desktop / Claude Code
        |
        |-- MCP Server 1: TypeScript (mcp-lexware-office)
        |   |-- All Lexware REST API tools (read + WRITE)
        |   |-- Rate limiting: 1.1s between requests
        |   `-- Transport: stdio
        |
        `-- MCP Server 2: Python (lexware-tools)
            |-- PDF text extraction + boilerplate stripping
            |-- Rules DB (SQLite) — vendor rules, split rules, learned categories
            |-- Settlement CSV parser (any platform)
            |-- Split-voucher calculation logic
            `-- Duplicate detection + audit log
```

### Claude Desktop config (claude_desktop_config.json)
```json
{
  "mcpServers": {
    "lexware": {
      "command": "npx",
      "args": ["-y", "@your-org/mcp-lexware-office"],
      "env": { "LEXWARE_OFFICE_API_KEY": "YOUR_KEY_HERE" }
    },
    "lexware-tools": {
      "command": "python",
      "args": ["/path/to/lexware-tools/mcp_tools.py"],
      "env": {
        "LEXWARE_API_KEY": "YOUR_KEY_HERE",
        "DB_PATH": "/path/to/lexware-tools/db/lexware.db"
      }
    }
  }
}
```

### TypeScript server (this repo)
- MCP protocol wiring, Docker packaging, TypeScript types, rate limiting
- All Lexware REST API tools — reads AND writes
- Language: TypeScript + Node.js 22+

### Python server (lexware-tools companion)
- `lexware_client.py` — Lexware REST client, rate limiting, backoff
- `db.py` — SQLite helpers
- `mcp_tools.py` — MCP server: PDF processing, rules engine, settlement parsing

---

## 3. LEXWARE API — COMPLETE REFERENCE

### Base URL
```
https://api.lexware.io/v1/
```
Authentication: `Authorization: Bearer {API_KEY}` on every request.
Responses: JSON. All amounts in EUR only.

### Rate Limits
- Hard limit: 2 requests/second (token bucket algorithm)
- Our target: 1 req/sec (1.1s gap) — never approach the hard limit
- On HTTP 429: exponential backoff — 2s, 4s, 8s, 16s, 32s — max 5 retries
- Voucher detail fetches in loops: use 1.2s gap

### Paging
- Params: `page` (0-indexed) + `size` (max 250)
- Response: `{ content: [...], last: bool, totalElements: int }`
- Always paginate until `last: true`

### Optimistic Locking
- All PUT operations require current `version` field from prior GET
- Version mismatch → HTTP 409 → GET again, merge, retry

### Date Formats
- Voucher dates (write): `yyyy-MM-dd` e.g. `2026-04-05`
- DateTime fields (read): `yyyy-MM-ddTHH:mm:ss.SSSXXX` e.g. `2026-04-05T00:00:00.000+02:00`

---

### ENDPOINT GROUP 1: Vouchers `/v1/vouchers`
Bookkeeping vouchers — core of all purchase/sales recording.

**Voucher types:**
- `purchaseinvoice` — incoming vendor invoice (Eingangsrechnung)
- `purchasecreditnote` — incoming credit note from vendor
- `salesinvoice` — outgoing revenue declaration
- `salescreditnote` — outgoing credit note to customer

**Tax types (taxType field):**
- `gross` — amounts include VAT (normal German invoice)
- `net` — amounts are net, VAT added on top
- `vatfree` — Kleinunternehmer §19 UStG or steuerfrei
- `constructionService13b` — §13b Bauleistungen (construction reverse charge)
- `externalService13b` — §13b Fremdleistungen (external service reverse charge)
- `intraCommunitySupply` — innergemeinschaftliche Lieferung (EU B2B)
- `photovoltaicEquipment` — photovoltaic installations

**Voucher status (writable: open, unchecked only):**
- `open` — finalized, unpaid
- `unchecked` — created but needs review / missing data
- `paid` / `paidoff` / `voided` / `transferred` / `sepadebit` (read-only via API)

**POST /v1/vouchers — Create voucher (open status)**
```json
{
  "type": "purchaseinvoice",
  "voucherStatus": "open",
  "voucherNumber": "337193272",
  "voucherDate": "2026-04-05",
  "dueDate": "2026-04-05",
  "totalGrossAmount": 458.90,
  "totalTaxAmount": 73.27,
  "taxType": "gross",
  "contactId": "uuid-of-contact",
  "useCollectiveContact": false,
  "voucherItems": [
    {
      "amount": 417.01,
      "taxAmount": 66.58,
      "taxRatePercent": 19,
      "categoryId": "uuid-of-category"
    },
    {
      "amount": 41.89,
      "taxAmount": 6.69,
      "taxRatePercent": 19,
      "categoryId": "uuid-of-category-2"
    }
  ],
  "remark": "Vendor invoice remark"
}
```

For `unchecked` status: voucherNumber, voucherDate, totalGrossAmount, totalTaxAmount, voucherItems all optional.

**PUT /v1/vouchers/{id} — Update voucher**
Same payload as POST + required `version` field. Can finalize unchecked→open.
Cannot change status to paid/voided via API.

**GET /v1/vouchers/{id}** — Retrieve full voucher detail
**GET /v1/vouchers?voucherNumber={n}** — Filter by number (deprecated — use voucherlist)

**POST /v1/vouchers/{id}/files — Attach PDF to voucher**
Content-Type: multipart/form-data. Field name: `file`. Returns `{ voucherId, id }`.

**Deeplinks:**
- View: `https://app.lexware.de/permalink/vouchers/view/{id}`
- Edit: `https://app.lexware.de/permalink/vouchers/edit/{id}`

**Supported tax rates for voucherItems:** 0%, 5%, 7%, 16%, 19%

---

### ENDPOINT GROUP 2: Voucherlist `/v1/voucherlist`
Fast index for all vouchers — use for filtering, reporting, reconciliation.

**GET /v1/voucherlist** — filter params:
- `voucherType` — comma-separated types or `any`
- `voucherStatus` — comma-separated statuses or `any`
- `contactId` — filter by contact UUID
- `voucherNumber` — exact match
- `dateFrom` / `dateTo` — filter by voucherDate (yyyy-MM-dd)
- `createdDateFrom` / `createdDateTo`
- `updatedDateFrom` / `updatedDateTo`
- `sort` — e.g. `voucherDate,ASC`

**voucherType → full detail endpoint mapping:**
- `salesinvoice`, `salescreditnote`, `purchaseinvoice`, `purchasecreditnote` → `/v1/vouchers/{id}`
- `invoice`, `creditnote` → `/v1/invoices/{id}` or `/v1/credit-notes/{id}`
- `quotation` → `/v1/quotations/{id}`
- `orderconfirmation` → `/v1/order-confirmations/{id}`
- `deliverynote` → `/v1/delivery-notes/{id}`
- `downpaymentinvoice` → `/v1/down-payment-invoices/{id}`

**voucherStatus values:**
draft, open, overdue, paid, paidoff, voided, transferred, sepadebit, accepted, rejected, unchecked

---

### ENDPOINT GROUP 3: Invoices `/v1/invoices`
Outgoing sales invoices (Ausgangsrechnungen) with full line items.

**POST /v1/invoices** — Create invoice
```json
{
  "voucherDate": "2026-04-05",
  "address": {
    "name": "Acme GmbH",
    "street": "Musterstraße 1",
    "city": "Berlin",
    "zip": "10115",
    "countryCode": "DE"
  },
  "lineItems": [
    {
      "type": "custom",
      "name": "Consulting Service",
      "quantity": 10,
      "unitName": "Stunden",
      "unitPrice": {
        "currency": "EUR",
        "netAmount": 150.00,
        "grossAmount": 178.50,
        "taxRatePercentage": 19.0
      },
      "discountPercentage": 0,
      "lineItemAmount": 1785.00
    }
  ],
  "taxConditions": { "taxType": "net" },
  "paymentConditions": { "paymentTermLabelTemplate": "...", "paymentTermDuration": 30 },
  "printLayoutId": "uuid",
  "introduction": "optional intro (max 2000 chars)",
  "remark": "optional closing remark (max 2000 chars)",
  "title": "optional title (max 25 chars)"
}
```

**POST /v1/invoices/{id}/pursue** — Convert to next document type
**GET /v1/invoices/{id}/file** — Download rendered PDF (Aug 2025 endpoint)
**GET /v1/invoices/{id}** — Retrieve invoice

Text field limits: introduction/remark=2000, title=25, lineItemName=255, lineItemDescription=2000.
Max line items per sales voucher: check Lexware docs (typically 500).

**Deeplink:** `https://app.lexware.de/permalink/invoices/view/{id}`

---

### ENDPOINT GROUP 4: Quotations `/v1/quotations`
Sales quotations (Angebote).

**POST /v1/quotations** — Create (same structure as invoices)
**POST /v1/quotations/{id}/pursue** — Convert to order confirmation or invoice
**GET /v1/quotations/{id}/file** — Download PDF
**GET /v1/quotations/{id}** — Retrieve

Status values: `draft`, `open`, `accepted`, `rejected`, `voided`

**Deeplinks:**
- View: `https://app.lexware.de/permalink/quotations/view/{id}`
- Edit: `https://app.lexware.de/permalink/quotations/edit/{id}`

---

### ENDPOINT GROUP 5: Order Confirmations `/v1/order-confirmations`
Auftragsbestätigungen.

**POST /v1/order-confirmations** — Create directly
**POST /v1/order-confirmations/{id}/pursue** — Convert to invoice or delivery note
**GET /v1/order-confirmations/{id}/file** — Download PDF
**GET /v1/order-confirmations/{id}** — Retrieve

Status: `draft`, `open`, `voided`

**Deeplinks:**
- View: `https://app.lexware.de/permalink/order-confirmations/view/{id}`
- Edit: `https://app.lexware.de/permalink/order-confirmations/edit/{id}`

---

### ENDPOINT GROUP 6: Credit Notes `/v1/credit-notes`
Outgoing credit notes (Gutschriften) for sales reversals.

**POST /v1/credit-notes** — Create (same structure as invoices)
**POST /v1/credit-notes/{id}/pursue** — Pursue from invoice
**GET /v1/credit-notes/{id}/file** — Download PDF
**GET /v1/credit-notes/{id}** — Retrieve

---

### ENDPOINT GROUP 7: Delivery Notes `/v1/delivery-notes`
Lieferscheine.

**POST /v1/delivery-notes** — Create
**POST /v1/delivery-notes/{id}/pursue** — Convert to invoice
**GET /v1/delivery-notes/{id}/file** — Download PDF
**GET /v1/delivery-notes/{id}** — Retrieve

Status: `draft`, `open`, `voided`

**Deeplinks:**
- View: `https://app.lexware.de/permalink/delivery-notes/view/{id}`
- Edit: `https://app.lexware.de/permalink/delivery-notes/edit/{id}`

---

### ENDPOINT GROUP 8: Dunnings `/v1/dunnings`
Mahnungen — payment reminders for overdue invoices.

**POST /v1/dunnings?precedingSalesVoucherId={invoice_id}** — Create dunning
- `precedingSalesVoucherId` query parameter is MANDATORY
- Contact IDs of invoice and dunning must match
- Tax conditions must match the referenced invoice
- Always created in `draft` status
- Can include custom line items (dunning fee, interest)
```json
{
  "voucherDate": "2026-04-20",
  "lineItems": [
    {
      "type": "custom",
      "name": "Mahngebühr",
      "quantity": 1,
      "unitName": "Stück",
      "unitPrice": { "currency": "EUR", "netAmount": 10.00, "grossAmount": 10.00, "taxRatePercentage": 0 },
      "discountPercentage": 0,
      "lineItemAmount": 10.00
    }
  ],
  "taxConditions": { "taxType": "net" },
  "introduction": "Wir bitten Sie...",
  "remark": "Sollten Sie bereits...",
  "title": "Mahnung"
}
```

**POST /v1/dunnings/{id}/pursue** — Pursue to next dunning level
**GET /v1/dunnings/{id}/file** — Download dunning PDF
**GET /v1/dunnings/{id}** — Retrieve

**Deeplinks:**
- View: `https://app.lexware.de/permalink/dunnings/view/{id}`
- Edit: `https://app.lexware.de/permalink/dunnings/edit/{id}`

---

### ENDPOINT GROUP 9: Down Payment Invoices `/v1/down-payment-invoices`
Abschlagsrechnungen — READ-ONLY, created automatically by Lexware.

**GET /v1/down-payment-invoices/{id}** — Retrieve
**GET /v1/down-payment-invoices/{id}/file** — Download PDF

---

### ENDPOINT GROUP 10: Contacts `/v1/contacts`
Vendors and customers.

**POST /v1/contacts** — Create contact
```json
{
  "version": 0,
  "roles": { "vendor": {}, "customer": {} },
  "company": {
    "name": "Vendor GmbH",
    "vatRegistrationId": "DE123456789",
    "taxNumber": "optional",
    "allowTaxFreeInvoices": false,
    "contactPersons": [
      { "salutation": "Herr", "firstName": "Max", "lastName": "Mustermann", "primary": true }
    ]
  },
  "addresses": {
    "billing": [{ "street": "Musterstraße 1", "zip": "10115", "city": "Berlin", "countryCode": "DE" }]
  },
  "emailAddresses": { "business": ["info@vendor.de"] },
  "phoneNumbers": { "business": ["+49 30 12345678"] }
}
```

**GET /v1/contacts/{id}** — Retrieve contact
**PUT /v1/contacts/{id}** — Update contact (requires current version)
**GET /v1/contacts** — Filter:
- `name` — supports wildcards e.g. `Vendor*`
- `email` — filter by email address
- `number` — contact number
- `customer=true/false` / `vendor=true/false`
- `page` + `size` (max 250)

Deeplink (Jan 2025): `https://app.lexware.de/permalink/contacts/view/{id}`

---

### ENDPOINT GROUP 11: Articles `/v1/articles`
Products and services catalogue.

**POST /v1/articles** — Create article
```json
{
  "title": "Consulting per Hour",
  "type": "SERVICE",
  "unitName": "Stunden",
  "articleNumber": "SVC-001",
  "price": {
    "netPrice": 150.00,
    "leadingPrice": "NET",
    "taxRate": 19
  }
}
```

**GET /v1/articles/{id}** — Retrieve
**PUT /v1/articles/{id}** — Update (requires version)
**DELETE /v1/articles/{id}** — Delete (returns 204)
**GET /v1/articles** — Filter: `articleNumber`, `gtin`, `type` (PRODUCT/SERVICE)

Valid tax rates for articles: 0, 7, 19

---

### ENDPOINT GROUP 12: Files `/v1/files`
Generic file upload/download.

**POST /v1/files** — Upload file
Content-Type: multipart/form-data. Returns `{ "id": "uuid" }`.
Supports: PDF, images, XML (e-invoices in XRechnung format).

**GET /v1/files/{id}** — Download file by ID

Note (Aug 2025): `documentFileId` properties in sales vouchers are deprecated.
Use `/file` subresource directly on each sales voucher endpoint instead.

---

### ENDPOINT GROUP 13: Posting Categories `/v1/posting-categories`
Buchungskategorien.

**GET /v1/posting-categories** — List all categories
- `type` filter: `income` or `outgo`

Key properties: `id`, `name`, `type`, `groupName`, `splitAllowed`, `contactRequired`

**The Zu prüfen catch-all UUID (hardcode this one only):**
`8d2e71c6-09d5-439a-a295-a9e71661afcd`
Use when category cannot be determined with confidence.

---

### ENDPOINT GROUP 14: Payment Conditions `/v1/payment-conditions`
Zahlungsbedingungen.

**GET /v1/payment-conditions** — List all
Returns: `id`, `paymentTermLabelTemplate`, `paymentTermDuration`, `paymentDiscountConditions`, `organizationDefault`.

---

### ENDPOINT GROUP 15: Print Layouts `/v1/print-layouts`
Document templates with company branding.

**GET /v1/print-layouts** — List all available layouts
Returns: `id`, `name`, `default` boolean.

---

### ENDPOINT GROUP 16: Payments `/v1/payments`
Payment status of vouchers — READ-ONLY.

**GET /v1/payments/{voucherId}** — Get payment status
Returns: `openAmount`, `paymentStatus` (balanced/openRevenue/openExpense), `voucherStatus`, `paidDate`, `paymentItems[]`.

paymentItemType values: `manualPayment`, `cashDiscount`, `irrecoverableReceivable`

---

### ENDPOINT GROUP 17: Countries `/v1/countries`
Country list with EU tax classification.

**GET /v1/countries** — List all countries
- `taxClassification` filter: `de` (Germany), `intraCommunity` (EU), `thirdPartyCountry` (non-EU)

Cache this at startup — never changes. Use for automatic §13b and EU supply detection.

---

### ENDPOINT GROUP 18: Profile `/v1/profile`
Your own company data.

**GET /v1/profile** — Returns company name, VAT ID, address, businessFeatures, distanceSalesPrinciple, userId.
Use to populate "your company" data on outgoing invoices.

---

### ENDPOINT GROUP 19: Recurring Templates `/v1/recurring-templates`
READ-ONLY access to recurring invoice templates.

**GET /v1/recurring-templates/{id}** — Get one template
**GET /v1/recurring-templates** — List all (sort by `nextExecutionDate`)
Properties: `id`, `name`, `nextExecutionDate`, `recurringInterval`, `retroactiveInvoice` (new Aug 2025).

Deeplink (edit): `https://app.lexware.de/permalink/recurring-templates/edit/{id}`

---

### ENDPOINT GROUP 20: Event Subscriptions `/v1/event-subscriptions`
Webhooks — real-time event notifications.

**POST /v1/event-subscriptions** — Subscribe
```json
{
  "eventType": "voucher.created",
  "callbackUrl": "https://your-server.com/webhook"
}
```

**GET /v1/event-subscriptions/{id}** — Get one subscription
**GET /v1/event-subscriptions** — List all
**DELETE /v1/event-subscriptions/{id}** — Remove

**All available event types:**
```
voucher.created / voucher.changed / voucher.deleted
invoice.created / invoice.changed / invoice.deleted / invoice.status.changed
quotation.created / quotation.changed / quotation.deleted / quotation.status.changed
order-confirmation.created / order-confirmation.changed / order-confirmation.deleted / order-confirmation.status.changed
credit-note.created / credit-note.changed / credit-note.deleted / credit-note.status.changed
delivery-note.created / delivery-note.changed / delivery-note.deleted / delivery-note.status.changed
dunning.created / dunning.changed / dunning.deleted
down-payment-invoice.created / down-payment-invoice.changed / down-payment-invoice.deleted / down-payment-invoice.status.changed
recurring-template.created / recurring-template.changed / recurring-template.deleted
payment.changed
contact.created / contact.changed
token.revoked
```

Webhook payload contains: `eventType`, `resourceId`, `createdDate`.
Verify authenticity via HMAC signature in request headers.
Dead subscriptions (404 callback) auto-unsubscribe after retry strategy.

---

## 4. AGENT BEHAVIOR RULES (NEVER VIOLATE)

```
RULE 1 — ACT FIRST, REPORT AFTER
Never ask permission to read data.
For writes: execute unless amount > approval_threshold or action is destructive.

RULE 2 — ONE QUESTION MAXIMUM per task
Only if you genuinely cannot proceed.
Never ask what the user wants — infer it from context.
Never ask for data you can fetch from the API.
When you must ask: ask the single most blocking question only.

RULE 3 — TOOL CHAIN FREELY
Call as many tools as needed. Read → Reason → Act → Report.
Never ask between steps.

RULE 4 — CHECK RULES DB BEFORE REASONING
Call get_rule() before any categorisation decision.
Rule exists → use it, zero reasoning, zero tokens.
Rule missing → reason, then add_rule() after for next time.

RULE 5 — SELF-CORRECT ON API ERRORS
Read the error message carefully.
Adjust payload and retry once.
Only escalate to user if second attempt also fails.
Explain errors in plain language when escalating.

RULE 6 — ALWAYS POST AS UNCHECKED IF:
- Amount > configured approval_threshold (default: €5,000)
- Math check fails (tax amounts don't add up within ±€0.05)
- Duplicate suspected but not confirmed
- Tax type genuinely ambiguous
Then NOTIFY user — do not ask permission first.

RULE 7 — SUMMARISE ACTIONS CLEARLY
After every task report:
- What was done (voucher IDs, amounts, categories)
- Any anomalies or flags
- Deeplink to Lexware where applicable
- What rule was learned (if new pattern)

RULE 8 — GERMAN TAX AWARENESS
§13b constructionService13b: Bauleistungen — supplier shows €0 VAT, buyer self-assesses
§13b externalService13b: Fremdleistungen — same, different service type
§13b trigger keywords: Bauleistung, Bauarbeiten, Gerüst, Reinigung (building context), Montage
EU intraCommunitySupply: non-DE EU VAT ID + zero VAT on invoice
Kleinunternehmer vatfree: §19 UStG keyword present on invoice
Always check vendor VAT ID prefix before applying §13b or intraCommunitySupply
Delivery food (food platforms): 7% VAT (Lebensmittellieferung, §12 Abs.2 Nr.1 UStG)
Restaurant in-house dining: 19% VAT (Dienstleistung)
Tips (Trinkgelder): vatfree — kein umsatzsteuerlicher Leistungsaustausch

RULE 9 — NEVER HALLUCINATE IDs
Always call search_contacts() or list_categories() to get real UUIDs.
Never guess or invent contact IDs or category IDs.
If contact not found → create it, report you did.
Only hardcoded UUID allowed: Zu prüfen = 8d2e71c6-09d5-439a-a295-a9e71661afcd

RULE 10 — LEARN CONTINUOUSLY
After every successful categorisation:
- Call update_vendor_history(contact_id, category_id)
- If high confidence (or user confirmed): call add_rule()
- Report: "Rule saved — next [vendor] invoice will be instant"
```

---

## 5. ESCALATION LADDER

| Situation | Agent action | Human needed? |
|-----------|-------------|---------------|
| Known vendor, hard rule match | Execute immediately, no confirmation | Never |
| Known vendor, learned category (usage ≥ 3) | Auto-apply, report | Never |
| New vendor, Claude confident | Create contact, select category, post | Never |
| New vendor, ambiguous category | Post unchecked + ask ONE question | Once |
| Amount > approval threshold | Post unchecked, notify | Review only |
| Math check fails | Post unchecked, explain discrepancy | Review only |
| API error (4xx) | Self-correct, retry once | Only if retry fails |
| Truly ambiguous intent | Ask ONE specific blocking question | Once |
| Destructive action (delete / overwrite finalized) | State what it would do, ask explicit confirmation | Always |

---

## 6. COMPLETE MCP TOOL LIST

### Group A — Reads (zero risk, call freely)
```
search_contacts(name, vat_id, iban, email, role)
get_contact(id)
list_vouchers(type, status, contact_id, date_from, date_to, sort)
get_voucher(id)
get_payment_status(voucher_id)
list_invoices(status, contact_id, date_from, date_to)
get_invoice(id)
list_quotations(status, contact_id)
get_quotation(id)
list_order_confirmations(status)
get_order_confirmation(id)
list_credit_notes(status)
get_credit_note(id)
list_delivery_notes(status)
get_delivery_note(id)
list_dunnings()
get_dunning(id)
list_categories(type)
get_categories_by_group(group_name)
list_articles(filter)
get_article(id)
list_payment_conditions()
list_print_layouts()
get_profile()
get_countries(tax_classification)
list_recurring_templates()
check_duplicate(contact_id, amount, date, invoice_number)
get_rule(key)
list_rules()
get_vendor_history(contact_id)
check_settlement_processed(settlement_id)
get_business_config()
```

### Group B — Creates & Posts (execute and report, no pre-confirmation unless threshold)
```
create_voucher(type, contact_id, items, tax_type, status, remark, pdf_path)
create_split_vouchers(splits[], contact_id, pdf_path)
update_voucher(id, version, fields)
create_contact(name, vat_id, iban, roles, address)
update_contact(id, version, fields)
create_invoice(contact_id, items, payment_condition_id, print_layout_id, date)
create_quotation(contact_id, items, valid_until, print_layout_id)
create_order_confirmation(contact_id, items, print_layout_id)
create_credit_note(contact_id, items, original_invoice_id)
create_delivery_note(contact_id, items)
create_dunning(preceding_invoice_id, line_items, date)
create_article(title, type, unit_name, price, tax_rate)
update_article(id, version, fields)
attach_pdf_to_voucher(voucher_id, file_path)
upload_file(file_path)
add_rule(key, rule_data)
update_vendor_history(contact_id, category_id, voucher_type)
log_processed_settlement(settlement_id, data)
subscribe_to_event(event_type, callback_url)
set_business_config(business_type, approval_threshold, notes)
run_initial_setup()
```

### Group C — Pursue Chain (multi-step, plan before executing)
```
pursue_quotation_to_order(quotation_id)
pursue_quotation_to_invoice(quotation_id)
pursue_order_to_invoice(order_confirmation_id)
pursue_order_to_delivery(order_confirmation_id)
pursue_invoice_to_credit_note(invoice_id, amount)
pursue_invoice_to_dunning(invoice_id)
```

### Group D — Local Computation (zero API cost, zero tokens)
```
extract_pdf_text(file_path)             -> cleaned text, boilerplate stripped
parse_settlement_csv(file_path)         -> structured rows[]
calculate_vat_split(gross, rate)        -> {net, vat, gross}
calculate_bill_split(total, splits[])   -> amounts[]
reconcile_bank(bank_rows[], vouchers[]) -> {matches[], unmatched[]}
aggregate_by_category(vouchers[], from, to) -> report{}
strip_pdf_boilerplate(text)             -> text truncated at stop words
```

### Group E — Destructive (always confirm with user)
```
delete_article(id)
delete_event_subscription(id)
delete_rule(key)
```

---

## 7. RULES ENGINE — 9 RULE TABLES (SQLite)

### Priority order (first match wins):
```
extraction_rules → vendor_rules → country_tax_cache → amount_rules
→ transaction_type_rules → contact_category_history → Claude reasoning
```

### Table 1: vendor_rules
```sql
CREATE TABLE vendor_rules (
  vendor_name TEXT PRIMARY KEY,
  category_id TEXT,
  tax_type TEXT,
  split_json TEXT,          -- JSON: [{pct:60, category_id:'uuid'}, ...]
  approval_threshold REAL,
  always_unchecked BOOLEAN DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP
);
```
Starts empty. Populated by the agent as it learns from real invoices.

### Table 2: customer_rules
```sql
CREATE TABLE customer_rules (
  customer_name TEXT PRIMARY KEY,
  payment_condition_id TEXT,
  print_layout_id TEXT,
  discount_pct REAL DEFAULT 0,
  dunning_level1_days INTEGER DEFAULT 14,
  dunning_level2_days INTEGER DEFAULT 28,
  dunning_level3_days INTEGER DEFAULT 42
);
```

### Table 3: country_tax_cache
```sql
CREATE TABLE country_tax_cache (
  country_code TEXT PRIMARY KEY,
  tax_classification TEXT,  -- 'de', 'intraCommunity', 'thirdPartyCountry'
  cached_at TIMESTAMP
);
```
Populated on startup via GET /v1/countries. Static data — cache forever.

### Table 4: amount_rules
```sql
CREATE TABLE amount_rules (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  auto_approve_below REAL DEFAULT 500.00,
  always_unchecked_above REAL DEFAULT 5000.00,
  zero_tax_alert BOOLEAN DEFAULT 1
);
```

### Table 5: transaction_type_rules (for settlement CSV processing)
```sql
CREATE TABLE transaction_type_rules (
  transaction_type TEXT PRIMARY KEY,
  category_id TEXT,
  tax_type TEXT,
  voucher_type TEXT,   -- 'purchaseinvoice' or 'salesinvoice'
  notes TEXT
);
```
Starts empty. Use add-transaction-rule to configure mappings after first settlement.

### Table 6: contact_category_history (learned categories)
```sql
CREATE TABLE contact_category_history (
  contact_id TEXT,
  category_id TEXT,
  voucher_type TEXT,
  tax_type TEXT,
  usage_count INTEGER DEFAULT 1,
  last_used_at TEXT,
  PRIMARY KEY (contact_id, category_id, voucher_type)
);
```
Auto-applied when `usage_count >= 3` and no hard vendor_rule exists.

### Table 7: extraction_rules (PDF pre-processing)
```sql
CREATE TABLE extraction_rules (
  vendor_name TEXT PRIMARY KEY,
  stop_words_json TEXT,       -- strip text below these keywords
  max_pages INTEGER DEFAULT 99,
  invoice_number_regex TEXT   -- extract without Claude if known format
);
```
Global stop words (strip everything after): `Zahlungsbedingungen`, `AGB`, `Allgemeine Geschäftsbedingungen`, `Bankverbindung`, `Haftungsausschluss`

### Table 8: processed_settlements (duplicate guard for CSV settlements)
```sql
CREATE TABLE processed_settlements (
  settlement_id TEXT PRIMARY KEY,
  processed_at TIMESTAMP,
  voucher_ids_json TEXT,
  total_amount REAL
);
```

### Table 9: business_config (one-row configuration per installation)
```sql
CREATE TABLE business_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  business_type TEXT,
  company_name TEXT,
  vat_id TEXT,
  approval_threshold REAL DEFAULT 5000.00,
  currency TEXT DEFAULT 'EUR',
  setup_complete BOOLEAN DEFAULT 0,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```
Written by `run-initial-setup` and `set-business-config`. Read at session start.

---

## 8. AGENT REASONING — DOCUMENT PROCESSING

The agent reasons about each business's documents using the rules that business has configured and what it has learned through use.

**No scenarios are hardcoded.** When processing any document:

1. Call `get-business-config` to understand the business context
2. Call `extract-pdf-text` to extract invoice content
3. Call `get-rule(vendor_name)` — if rule found, apply it directly (0 tokens)
4. Call `detect-tax-type(text, vat_id)` to determine correct tax treatment
5. Call `list-posting-categories` and reason about the best category
6. Create the voucher, attach the PDF, update vendor history, save the rule

For settlement CSVs: call `parse-settlement-csv` → returns raw structured data → agent resolves each transaction type against `get-transaction-rule` → creates vouchers → `log-processed-settlement`.

For multi-voucher splits: extract amounts → calculate with `calculate-bill-split` → create one voucher per line item with appropriate category.

The agent accumulates rules as it works. After 10–15 invoices, most vendors have hard rules and processing becomes instant.

---

## 9. GERMAN TAX QUICK REFERENCE

| Situation | taxType | VAT rate | Notes |
|-----------|---------|----------|-------|
| Normal German vendor invoice | gross | 19% | Standard |
| Food delivery via Lieferando | gross | 7% | §12 Abs.2 Nr.1 UStG |
| Restaurant in-house service | gross | 19% | Dienstleistung |
| Tips (Trinkgelder) | vatfree | 0% | Kein Leistungsaustausch |
| Kleinunternehmer (§19 UStG) | vatfree | 0% | Look for §19 on invoice |
| EU supplier B2B (non-DE EU VAT ID) | intraCommunitySupply | 0% | |
| Construction services (Bauleistung) | constructionService13b | 0% supplier | Buyer self-assesses |
| External services §13b | externalService13b | 0% supplier | Buyer self-assesses |
| Lieferando/German Amazon fees | gross | 19% | DE company, NOT §13b |
| Amazon EU service fees | externalService13b | 0% | Luxembourg entity |
| Photovoltaic equipment | photovoltaicEquipment | special | §12 Abs.3 UStG |

**EU VAT ID country prefixes → intraCommunitySupply:**
AT, BE, BG, CY, CZ, DK, EE, FI, FR, GR, HR, HU, IE, IT, LT, LU, LV, MT, NL, PL, PT, RO, SE, SI, SK
Exception: GB → thirdPartyCountry (post-Brexit since Jan 2021)

**Supported taxRatePercent values:** 0, 5, 7, 16, 19
(5% and 16% were COVID relief rates valid only Jul–Dec 2020)

---

## 10. TOKEN OPTIMIZATION STRATEGY

### Cost tiers (cheapest to most expensive):
1. **Pure rule hit** — 0 tokens. Known vendor + known category. Direct API execution.
2. **Extraction-only call** — ~1,200 tokens. Vendor cached, category from DB, only extract invoice data.
3. **Combined call** — ~4,000–5,000 tokens. New vendor or new category. Extract + classify in one call.
4. **Cold call (no optimization)** — 5,000–16,000 tokens. Full unstripped text + full category list.

### Key optimizations:
- Strip PDF boilerplate before Claude sees it → saves 3,000–8,000 tokens
- Send only relevant category group, not all 80+ categories → saves 2,000–4,000 tokens
- Vendor cache: after usage_count ≥ 3 skip Claude category reasoning entirely
- Hard vendor rules: bypass Claude completely for known patterns
- Pre-scan VAT ID and IBAN from raw text before any Claude call

### Target after 2 months:
- 80%+ invoices: zero Claude reasoning (pure rule + API execution = 0 tokens)
- 15%: extraction-only call (~1,200 tokens)
- 5%: combined call for genuinely new vendors or patterns

---

## 11. WHAT THE AGENT CANNOT DO (HONEST LIMITS)

1. **Update finalized sales invoices** — once closed, cannot edit. Suggest credit note instead.
2. **Create recurring templates** — API read-only for recurring. Can list and alert on missing invoices.
3. **Payroll (Lohnbuchhaltung)** — not in Lexware public API scope.
4. **Year-end closing entries (Jahresabschluss)** — prepare data and draft, but do not auto-post.
5. **Multi-currency conversion** — detect foreign amounts and apply ECB rate, but confirm with user.
6. **Delete contacts** — Lexware API has no contact DELETE endpoint.
7. **Access finalized document XML** — only PDF download available, not structured data.

---

## 12. ONBOARDING A NEW BUSINESS

Any business can install and use this agent. No pre-configuration required.

### Step 1: Set API key
Add `LEXWARE_OFFICE_API_KEY` (TypeScript server) and `LEXWARE_API_KEY` (Python server) to the Claude Desktop config or `.env` file.

### Step 2: Run initial setup (one command)
The agent calls `run-initial-setup` automatically on first use, or you can trigger it manually:
```
"Set up my Lexware account"
```
This tool:
1. Creates all database tables
2. Fetches company name and VAT ID from `GET /v1/profile`
3. Pulls all contacts from Lexware into the local DB
4. Pulls all posting categories into the local DB
5. Returns a summary: contacts synced, categories available, ready status

### Step 3: Identify your business type
The agent asks one question:
> "What type of business are you? (e.g. restaurant, e-commerce, consulting, construction, retail, services)"

This is stored in `business_config.business_type` and used to bias category suggestions. It does not insert any hardcoded rules.

### Step 4: Process your first invoice
Drop a PDF or type an instruction. The agent reasons about the document, picks categories from your Lexware account, creates the voucher, and saves the rule.

### Step 5: Rules accumulate automatically
Each processed invoice adds to the rules DB. After 10–15 invoices, most vendors are instant (0 Claude tokens).

**No manual rule seeding required. No pre-populated vendor lists.**

---

## 13. SETUP INSTRUCTIONS

### Prerequisites
- Node.js 22+ (TypeScript MCP server)
- Python 3.10+ (Python MCP server)
- Docker (optional, for packaging)
- Claude Desktop installed
- Lexware API key from: https://app.lexware.de/addons/public-api

### Step 1: Install the TypeScript server
```bash
git clone https://github.com/YOUR-USERNAME/mcp-lexware-office
cd mcp-lexware-office
npm install
npm run build
```

### Step 2: Set up the Python server
```bash
cd /path/to/lexware-tools
pip install mcp pdfplumber python-dotenv
python mcp_tools.py   # verify it starts without errors
```

### Step 3: Configure Claude Desktop
Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

Add both MCP servers with your API key. Both servers need `LEXWARE_API_KEY` set to the same key.

### Step 4: Run initial setup
Open Claude Desktop and type:
```
Set up my Lexware account
```
The agent calls `run-initial-setup`, syncs contacts and categories, and confirms ready.

### Step 5: Tell the agent your business type
```
I run a consulting business
```
Stored in DB. Agent now biases category reasoning accordingly.

### Step 6: Process your first invoice
Drop a PDF into the chat or type an instruction. The agent handles everything.

---

## 14. CODING CONVENTIONS FOR CLAUDE CODE

- Always follow existing tool pattern in `src/tools/` directory exactly
- Rate limit: enforce 1.1s between ALL Lexware API calls (all endpoints share the limit)
- Optimistic locking: for any PUT, always GET first to get current version, then merge
- Never hardcode category UUIDs in code — fetch from API or rules DB
- Only hardcoded UUID allowed: Zu prüfen = `8d2e71c6-09d5-439a-a295-a9e71661afcd`
- Always attach PDFs to vouchers after creating — never leave vouchers without source document
- Settlements: always call check-settlement-processed before creating any vouchers
- When in doubt about tax type: post as unchecked with remark explaining the ambiguity
- Test mode: `make test-pdf PDF=path/to/invoice.pdf` — never posts to Lexware

---

## 15. QUICK REFERENCE — API ERROR CODES

| HTTP Code | Meaning | Action |
|-----------|---------|--------|
| 200 | OK | Success |
| 201 | Created | Resource created, check Location header for URI |
| 204 | No Content | Success (DELETE) |
| 400 | Bad Request | Fix payload — check required fields |
| 401 | Unauthorized | API key invalid or expired |
| 404 | Not Found | UUID doesn't exist in this organisation |
| 406 | Not Acceptable | Invalid date format or unsupported Accept header |
| 409 | Conflict | Optimistic locking — GET resource, merge, retry |
| 422 | Unprocessable | Business logic error — read error message carefully (common: wrong taxType/taxAmount) |
| 429 | Too Many Requests | Rate limit hit — exponential backoff then retry |
| 500 | Server Error | Lexware internal error — retry after 5s, then report |

---

*Last updated: April 2026*
*Build status: Universal — works for any German business using Lexware Office*
*Architecture: TypeScript MCP (Lexware API) + Python MCP (PDF + Rules DB)*
