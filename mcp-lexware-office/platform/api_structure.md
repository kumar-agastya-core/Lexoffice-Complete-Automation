# Platform API Structure

Base URL: `https://api.lexwareai.de`  
Auth: JWT Bearer token in `Authorization` header.  
All timestamps: ISO 8601 UTC. All amounts: EUR.

---

## AUTH ENDPOINTS

### POST /api/auth/signup
Auth required: no

Request:
```json
{ "email": "string", "password": "string", "name": "string", "account_type": "solo|team|agency" }
```
Response `201`:
```json
{ "user": { "id": "uuid", "email": "string" }, "workspace": { "id": "uuid", "plan": "starter" } }
```
Errors: `400` invalid email/password, `409` email already registered

---

### POST /api/auth/login
Auth required: no

Request: `{ "email": "string", "password": "string" }`  
Response `200`:
```json
{ "access_token": "string", "refresh_token": "string", "expires_in": 3600, "workspace_id": "uuid" }
```
Errors: `401` invalid credentials, `403` email not verified

---

### POST /api/auth/logout
Auth required: yes  
Role: any

Request: `{ "refresh_token": "string" }`  
Response `204`

---

### POST /api/auth/refresh
Auth required: no

Request: `{ "refresh_token": "string" }`  
Response `200`: `{ "access_token": "string", "expires_in": 3600 }`  
Errors: `401` token expired or already rotated

---

### POST /api/auth/verify-email
Auth required: no

Request: `{ "token": "string" }`  
Response `200`: `{ "verified": true }`  
Errors: `400` invalid or expired token

---

### POST /api/auth/forgot-password
Auth required: no

Request: `{ "email": "string" }`  
Response `200`: `{ "message": "If this email exists, a reset link was sent." }` (always 200 — no user enumeration)

---

### POST /api/auth/reset-password
Auth required: no

Request: `{ "token": "string", "password": "string" }`  
Response `200`: `{ "message": "Password updated." }`  
Errors: `400` invalid/expired token, `422` password too weak

---

## WORKSPACE ENDPOINTS

### GET /api/workspace
Auth required: yes  
Role: any

Response `200`:
```json
{
  "id": "uuid",
  "name": "string",
  "account_type": "solo|team|agency",
  "plan": "starter|solo|profi|business|buchhalter",
  "billing_period": "monthly|annual",
  "plan_ends_at": "ISO8601",
  "usage": {
    "actions_used": 42,
    "actions_limit": 200,
    "pdfs_used": 5,
    "pdfs_limit": 50,
    "topup_actions_remaining": 0
  },
  "member_count": 1,
  "lexware_connected": true
}
```

---

### PUT /api/workspace
Auth required: yes  
Role: admin or owner

Request: `{ "name": "string" }`  
Response `200`: updated workspace object  
Errors: `403` insufficient role

---

### GET /api/workspace/members
Auth required: yes  
Role: any

Response `200`:
```json
{
  "members": [
    { "id": "uuid", "user_id": "uuid", "email": "string", "name": "string", "role": "owner|admin|member|viewer", "joined_at": "ISO8601" }
  ]
}
```

---

### POST /api/workspace/members/invite
Auth required: yes  
Role: admin or owner

Request: `{ "email": "string", "role": "admin|member|viewer" }`  
Response `201`: `{ "invite_id": "uuid", "expires_at": "ISO8601" }`  
Errors: `403` insufficient role, `409` user already member, `422` team member limit reached

---

### DELETE /api/workspace/members/:userId
Auth required: yes  
Role: admin or owner (owner cannot remove self)

Response `204`  
Errors: `403` insufficient role, `404` member not found, `422` cannot remove workspace owner

---

## LEXWARE CONNECTION ENDPOINTS

### POST /api/lexware/connect
Auth required: yes  
Role: owner

Request: `{ "api_key": "string", "client_workspace_id": "uuid|null" }`  
Action: Encrypts key, calls Lexware `/v1/profile` to verify, stores company info.  
Response `201`:
```json
{ "id": "uuid", "lexware_company_name": "string", "lexware_vat_id": "string", "verified_at": "ISO8601" }
```
Errors: `401` Lexware rejected key, `422` connection already exists for this workspace

---

### GET /api/lexware/status
Auth required: yes  
Role: any

Response `200`:
```json
{ "connected": true, "lexware_company_name": "string", "last_verified_at": "ISO8601", "connection_error": null }
```

---

### DELETE /api/lexware/disconnect
Auth required: yes  
Role: owner

Response `204`

> **Warning:** This permanently deletes the encrypted API key. The user must re-enter their key to reconnect.

---

### POST /api/lexware/test
Auth required: yes  
Role: any

Request: `{ "api_key": "string" }`  
Action: Tests connection without saving. Key is never stored.  
Response `200`: `{ "valid": true, "company_name": "string", "vat_id": "string" }`  
Errors: `401` Lexware rejected key

---

## CLIENT WORKSPACE ENDPOINTS (agency only)

### GET /api/clients
Auth required: yes  
Role: any  
Workspace type: agency only

Response `200`:
```json
{
  "clients": [
    {
      "id": "uuid", "client_name": "string", "client_email": "string",
      "business_type": "string", "is_active": true,
      "lexware_connected": true,
      "actions_used_this_month": 42, "pdfs_used_this_month": 3,
      "invite_pending": false, "created_at": "ISO8601"
    }
  ]
}
```

---

### POST /api/clients
Auth required: yes  
Role: admin or owner  
Workspace type: agency only

Request: `{ "client_name": "string", "client_email": "string", "business_type": "string" }`  
Response `201`: `{ "id": "uuid", "client_name": "string", "invite_token": "string", "invite_expires_at": "ISO8601" }`  
Errors: `422` client workspace limit reached

---

### GET /api/clients/:id
Auth required: yes  
Role: any  
Workspace type: agency only

Response `200`: full client workspace object including Lexware connection status and usage stats.

---

### PUT /api/clients/:id
Auth required: yes  
Role: admin or owner

Request: `{ "client_name": "string", "client_email": "string", "business_type": "string" }`  
Response `200`: updated client workspace object

---

### DELETE /api/clients/:id
Auth required: yes  
Role: owner

Action: Sets `is_active = false`. Does not delete data (retained for 30 days per DSGVO).  
Response `204`

---

### POST /api/clients/:id/invite
Auth required: yes  
Role: admin or owner

Action: Generates a new invite token, sends email to `client_email`.  
Response `200`: `{ "invite_token": "string", "invite_expires_at": "ISO8601" }`

---

### POST /api/clients/accept-invite/:token
Auth required: no

Request: `{ "api_key": "string" }`  
Action: Validates token, encrypts and stores API key, sets `invite_accepted_at`.  
Response `200`: `{ "message": "Connected. Your Buchhalter now has access." }`  
Errors: `404` invalid token, `410` token expired

---

## AGENT ENDPOINTS

### POST /api/agent/chat
Auth required: yes  
Role: member or above

Request:
```json
{
  "conversation_id": "uuid|null",
  "message": "string",
  "client_workspace_id": "uuid|null"
}
```

Action:
1. Creates conversation if `conversation_id` is null
2. Checks usage limits — returns `429` if exhausted
3. Calls Anthropic API with full tool list + conversation history
4. Executes tool calls (TypeScript tools directly, Python tools via internal HTTP)
5. Streams response via SSE

Response: `text/event-stream`
```
data: {"type":"text_delta","text":"Voucher erstellt..."}
data: {"type":"tool_use","tool":"create-voucher","input":{...}}
data: {"type":"tool_result","tool":"create-voucher","output":{...}}
data: {"type":"done","conversation_id":"uuid","actions_used":1}
```

Errors: `402` no Lexware connection, `429` usage limit reached (body includes upgrade CTA), `503` Anthropic unavailable

---

### POST /api/agent/upload
Auth required: yes  
Role: member or above

Request: `multipart/form-data` — field `file` (PDF, max 20 MB)  
Action: Uploads to Supabase Storage, returns file reference for use in next chat message.  
Response `201`: `{ "file_id": "uuid", "filename": "string", "size_bytes": 12345, "expires_at": "ISO8601" }`

---

### GET /api/agent/conversations
Auth required: yes  
Role: any

Query params: `?page=0&size=20&client_workspace_id=uuid`  
Response `200`:
```json
{
  "conversations": [
    { "id": "uuid", "title": "string", "created_at": "ISO8601", "last_message_at": "ISO8601" }
  ],
  "total": 42
}
```

---

### GET /api/agent/conversations/:id
Auth required: yes  
Role: any

Response `200`:
```json
{
  "id": "uuid", "title": "string",
  "messages": [
    { "id": "uuid", "role": "user|assistant|tool_use|tool_result", "content": "string", "created_at": "ISO8601" }
  ]
}
```
Errors: `404` not found, `403` not in workspace

---

### DELETE /api/agent/conversations/:id
Auth required: yes  
Role: member or above

Response `204`  
Errors: `403` viewer role cannot delete

---

## USAGE ENDPOINTS

### GET /api/usage/current
Auth required: yes  
Role: any

Response `200`:
```json
{
  "year_month": "2026-04",
  "actions_used": 42, "actions_limit": 200,
  "pdfs_used": 5, "pdfs_limit": 50,
  "topup_actions_remaining": 100,
  "topup_pdfs_remaining": 0,
  "anthropic_cost_eur": "3.24",
  "anthropic_cost_cap_eur": "16.00",
  "warning": null
}
```

---

### GET /api/usage/history
Auth required: yes  
Role: any

Query params: `?months=6`  
Response `200`: `{ "history": [{ "year_month": "2026-04", "actions_used": 42, "pdfs_used": 5, "total_cost_eur": "3.24" }] }`

---

### POST /api/usage/topup
Auth required: yes  
Role: admin or owner

Request: `{ "topup_type": "actions_100|actions_250|pdfs_50|pdfs_100" }`  
Action: Creates Stripe PaymentIntent for one-time purchase.  
Response `200`: `{ "stripe_client_secret": "string", "amount_eur": "9.00", "quantity": 100 }`

---

## BILLING ENDPOINTS

### GET /api/billing/plans
Auth required: no

Response `200`: full plan matrix with pricing, limits, and feature flags.

---

### POST /api/billing/subscribe
Auth required: yes  
Role: owner

Request: `{ "plan": "solo|profi|business|buchhalter", "billing_period": "monthly|annual", "stripe_payment_method_id": "string" }`  
Response `200`: `{ "subscription_id": "string", "status": "active", "plan_ends_at": "ISO8601" }`

---

### PUT /api/billing/plan
Auth required: yes  
Role: owner

Request: `{ "plan": "string", "billing_period": "monthly|annual" }`  
Action: Upgrades or downgrades via Stripe proration.  
Response `200`: updated workspace billing object

---

### POST /api/billing/cancel
Auth required: yes  
Role: owner

Request: `{ "reason": "string" }` (optional, for churn analytics)  
Action: Cancels Stripe subscription at period end. Workspace stays active until `plan_ends_at`.  
Response `200`: `{ "cancels_at": "ISO8601", "message": "Subscription will end on..." }`

---

### GET /api/billing/invoices
Auth required: yes  
Role: admin or owner

Response `200`: `{ "invoices": [{ "id": "string", "amount_eur": "29.00", "status": "paid", "pdf_url": "string", "created_at": "ISO8601" }] }`

---

### POST /api/billing/webhook
Auth required: no (Stripe signature verification required)

Action: Handles Stripe events: `customer.subscription.updated`, `customer.subscription.deleted`, `payment_intent.succeeded`, `invoice.payment_failed`.  
Response: always `200` with `{ "received": true }` (Stripe retries on non-200).

---

## AUDIT ENDPOINTS

### GET /api/audit
Auth required: yes  
Role: member or above

Query params: `?page=0&size=50&client_workspace_id=uuid&from=2026-04-01&to=2026-04-30&action=voucher.created`  
Response `200`:
```json
{
  "entries": [
    {
      "id": "uuid", "action": "voucher.created",
      "lexware_resource_type": "voucher", "lexware_resource_id": "uuid",
      "amount_eur": "458.90", "success": true,
      "user_email": "string", "created_at": "ISO8601"
    }
  ],
  "total": 284
}
```

---

### GET /api/audit/export
Auth required: yes  
Role: admin or owner

Query params: same as GET /api/audit (no pagination — full export)  
Response: `text/csv` with `Content-Disposition: attachment; filename="audit-2026-04.csv"`
