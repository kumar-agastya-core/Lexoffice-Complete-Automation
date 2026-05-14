# Agent Loop Architecture

The web platform replaces Claude Desktop + MCP stdio transport with a server-side agent loop. The agent logic is identical; the invocation layer changes.

---

## Full Flow: POST /api/agent/chat

```
Browser
  │
  │  POST /api/agent/chat
  │  { message, conversation_id, client_workspace_id }
  ▼
Fastify backend (Node.js)
  │
  ├─ 1. Auth middleware: validates JWT → workspace_id, user_id, role
  │
  ├─ 2. Context load
  │     ├─ Load workspace: plan, limits, account_type
  │     ├─ Load lexware_connection for workspace or client_workspace
  │     │   └─ Decrypt API key (AES-256-GCM) → in-memory string
  │     ├─ Load last 20 messages from conversations/messages tables
  │     └─ Load or create conversation row
  │
  ├─ 3. Usage check
  │     ├─ Query usage_monthly for current month
  │     ├─ Add topup_actions_remaining from usage_topups
  │     ├─ If actions_used >= limit → 429 with upgrade CTA body
  │     ├─ If cost >= 80% cap → switch model to Haiku for this request
  │     └─ If cost >= 100% cap → 429 with "try again tomorrow" body
  │
  ├─ 4. Build Anthropic request
  │     ├─ system: CLAUDE.md system prompt (adapted — no MCP references)
  │     │   + vendor_rules.md content (injected per workspace)
  │     │   + current date, workspace business_type
  │     ├─ tools[]: all 74 TS tools + all 22 Python tools as Anthropic tool specs
  │     ├─ messages[]: conversation history + new user message
  │     └─ model: claude-sonnet-4-6 (or haiku if cost cap near)
  │
  ├─ 5. Call Anthropic API (streaming)
  │     └─ Stream events to browser via SSE as they arrive
  │
  ├─ 6. Tool execution loop
  │     ├─ On tool_use block from Anthropic:
  │     │   ├─ TypeScript tools: execute inline (same logic as MCP tools,
  │     │   │   called as regular async functions, using decrypted API key)
  │     │   ├─ Python tools: POST to internal Python microservice
  │     │   │   http://localhost:8001/tool/{tool_name}
  │     │   │   body: { "args": {...}, "db_path": "/data/workspaces/{workspace_id}/lexware.db" }
  │     │   └─ Emit tool_use + tool_result events to SSE stream
  │     └─ Append tool_result blocks to messages, loop back to step 5
  │
  ├─ 7. Final text response
  │     ├─ Stream text delta events to browser
  │     └─ Emit done event: { conversation_id, actions_used: 1 }
  │
  ├─ 8. Persist
  │     ├─ Save user message + assistant messages + tool_use/result to messages table
  │     ├─ Update conversations.last_message_at
  │     ├─ Insert usage_events row (event_type='action', tokens_used, anthropic_cost_eur)
  │     ├─ UPSERT usage_monthly (increment actions_used, total_tokens, total_cost_eur)
  │     └─ Insert audit_log row for each Lexware write tool that succeeded
  │
  └─ 9. Zero sensitive data
        └─ Decrypted API key discarded — never written to DB, never logged
```

---

## Python Microservice

The Python MCP server (`mcp_tools.py`) is refactored to also expose an HTTP interface using FastAPI. It runs as a sidecar process on the same Railway deployment.

**Internal only** — not exposed to the public internet. The Node.js backend reaches it at `http://localhost:8001`.

**Endpoints:**

```
POST /tool/extract-pdf-text         { file_b64: string, filename: string }
POST /tool/detect-tax-type          { text: string, vat_id: string }
POST /tool/calculate-vat-split      { gross: number, rate: number }
POST /tool/calculate-bill-split     { total: number, splits: number[] }
POST /tool/get-rule                 { vendor_name: string, db_path: string }
POST /tool/add-rule                 { vendor_name: string, rule: object, db_path: string }
POST /tool/list-rules               { db_path: string }
POST /tool/delete-rule              { vendor_name: string, db_path: string }
POST /tool/get-vendor-history       { contact_id: string, db_path: string }
POST /tool/update-vendor-history    { contact_id: string, category_id: string, db_path: string }
POST /tool/check-duplicate          { contact_id: string, amount: number, date: string, invoice_number: string, db_path: string }
POST /tool/check-settlement-processed { settlement_id: string, db_path: string }
POST /tool/log-processed-settlement { settlement_id: string, data: object, db_path: string }
POST /tool/parse-settlement-csv     { file_b64: string }
POST /tool/validate-settlement-math { rows: object[], stated_total: number }
POST /tool/get-transaction-rule     { transaction_type: string, db_path: string }
POST /tool/add-transaction-rule     { transaction_type: string, rule: object, db_path: string }
POST /tool/get-business-config      { db_path: string }
POST /tool/set-business-config      { config: object, db_path: string }
POST /tool/run-initial-setup        { db_path: string, lexware_api_key: string }
POST /tool/calibrate                { db_path: string }
```

Each request includes `db_path` pointing to the workspace's isolated SQLite DB at `/data/workspaces/{workspace_id}/lexware.db`. The Python service never manages DB paths — Node.js resolves the path and passes it per request.

---

## Tool Call Error Handling

On tool execution error:
1. Backend catches the exception
2. Wraps it: `{ "error": true, "message": "Lexware API returned 422: Invalid taxType" }`
3. Sends this as the `tool_result` back to Anthropic — not as a hard failure
4. Anthropic reads the error and decides whether to retry with corrected params, explain to user, or escalate
5. If Anthropic instructs the user to fix something, that explanation is streamed as text
6. Hard failures (Python service unreachable, DB corrupt) surface as `503` to the browser

---

## PDF Upload Flow

```
Browser → POST /api/agent/upload (multipart PDF)
       → Fastify validates mime type (application/pdf only), size (max 20 MB)
       → Uploads to Supabase Storage: bucket=pdfs, path=workspaces/{workspace_id}/{uuid}.pdf
       → Returns { file_id: uuid, expires_at: +24h }

Next chat message:
       → User references file_id in message
       → Backend downloads PDF from Supabase Storage into memory (never to disk)
       → Base64-encodes buffer
       → Injects as "document" block in Anthropic message (vision/document API)
       → After tool call completes: Supabase Storage object deleted
       → file_id invalidated

No PDF content is stored in the platform DB.
Raw invoice data extracted by Claude exists only in the conversation messages table.
```

---

## SSE Event Format

```typescript
// Text token
{ "type": "text_delta", "text": "Voucher erstellt:" }

// Tool starting
{ "type": "tool_use", "id": "call_abc", "tool": "create-voucher", "input": { "type": "purchaseinvoice", ... } }

// Tool completed
{ "type": "tool_result", "id": "call_abc", "tool": "create-voucher", "output": { "id": "lexware-uuid", ... } }

// Tool error
{ "type": "tool_result", "id": "call_abc", "tool": "create-voucher", "error": "Validation error (422): ..." }

// Stream complete
{ "type": "done", "conversation_id": "uuid", "message_id": "uuid", "actions_used": 1, "actions_remaining": 157 }

// Usage warning (appended when actions_used >= 90% of limit)
{ "type": "usage_warning", "actions_used": 181, "actions_limit": 200, "upgrade_url": "/billing" }
```

---

## Context Window Management

Conversation history is limited to the last 20 messages before sending to Anthropic. If a conversation is longer, older messages are summarised: a background job runs after each conversation exceeds 20 messages and prepends a `[SUMMARY]` assistant message that compresses the earlier context.

The system prompt is prompt-cached via `cache_control: {"type": "ephemeral"}` — the CLAUDE.md content, tool definitions, and category rules are cached across requests from the same workspace, reducing cost for repeat messages.

Per-workspace posting categories are fetched from Lexware once per session and injected into the system prompt cache key. Cache TTL matches Anthropic's 5-minute ephemeral window for active sessions.
