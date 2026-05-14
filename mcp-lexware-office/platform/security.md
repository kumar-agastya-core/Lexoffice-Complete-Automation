# Security Architecture

---

## API Key Encryption

**Algorithm:** AES-256-GCM

AES-256-GCM is authenticated encryption: it provides confidentiality (ciphertext unreadable without key) and integrity (ciphertext tampering detected). It is the standard for secrets-at-rest in SaaS applications and is validated by NIST SP 800-38D.

**Key derivation:**

```
master_secret  ← environment variable ENCRYPTION_MASTER_SECRET (32 bytes, random, never changes)
derived_key    ← HKDF(hash=SHA-256, ikm=master_secret, salt=workspace_id, info="lexware-api-key", length=32)
```

One derived key per workspace. Compromising one workspace's derived key exposes only that workspace — the master secret is not derivable from the derived key. Workspace UUID as salt means key material is unique per tenant even if two workspaces had the same API key.

**Encryption:**

```typescript
const iv = crypto.randomBytes(12);                          // 12-byte random IV per encryption
const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);
const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
const authTag = cipher.getAuthTag();                        // 16-byte GCM auth tag
const ciphertext = Buffer.concat([encrypted, authTag]).toString('base64');
```

Stored in DB: `encrypted_api_key = ciphertext (base64)`, `encryption_iv = iv.toString('base64')`.

**Lifecycle:**

1. User submits plaintext key via HTTPS → arrives at Fastify backend
2. Backend derives workspace key, encrypts, stores ciphertext
3. Plaintext key `Buffer.fill(0)` zeroed immediately after encryption
4. DB never sees plaintext; logs never see plaintext; no serialization
5. On agent call: decrypt in-process → pass to Lexware HTTP client as `Authorization: Bearer`
6. HTTP client holds key only for the duration of the request
7. After agent session ends: key variable goes out of scope, GC reclaims

**Frontend never receives the key after save.** `GET /api/lexware/status` returns only `{ connected: true, company_name, last_verified_at }` — never the key or any part of it.

---

## Row-Level Security

**Primary enforcement:** Every SQL query in the backend is parameterized with `workspace_id` resolved from the authenticated JWT. No query runs without a workspace scope. The `workspace_id` claim in the JWT is signed and cannot be forged.

**Secondary enforcement (PostgreSQL RLS):** Supabase RLS policies enforce the same isolation at the database level. If application code has a bug that omits the `workspace_id` filter, the DB rejects the query for the `authenticated` role. The service role (backend) bypasses RLS — this is intentional, as the primary enforcement is in middleware.

**`lexware_connections` protection:** A `USING (false)` RLS policy blocks all direct access from the `authenticated` role. The table is only accessible via service role. Frontend clients can never read encrypted keys, even if they bypass the API.

**Agency isolation:** A query scoped to `agency_workspace_id = X` can only see client workspaces that belong to workspace X. Client A's rules DB path is `/data/workspaces/{agency_id}/clients/{clientA_id}/lexware.db` — distinct from Client B's path at the filesystem level, enforced by the Python microservice.

---

## Session Security

**Access tokens:** JWT, 1 hour expiry, signed with RS256 (asymmetric — public key available for verification without the private key).

**Refresh tokens:** 30-day expiry, stored as a SHA-256 hash in Redis (Upstash). On every refresh:
1. Backend validates token hash exists in Redis
2. Issues new access token
3. **Rotates** refresh token — old token deleted, new token issued
4. If old token is used after rotation → detect token reuse → invalidate entire session family

**Session invalidation:**
- On password change: all active sessions for the user are invalidated (delete all refresh tokens for user from Redis)
- On logout: specific refresh token deleted
- On email change: email verification required, access token claims re-issued

**JWT claims:** `{ sub: user_id, workspace_id, role, exp, iat }` — workspace resolved at login time. If user is removed from workspace while session is active, the next authenticated request returns `403` (membership checked on every request, not just at login).

---

## DSGVO Compliance

### 1. AV-Vertrag (Auftragsverarbeitungsvertrag)

At workspace creation, an AV-Vertrag is auto-generated and presented for electronic acceptance. The signed copy (with timestamp, user IP, workspace ID) is stored in Supabase Storage as a PDF and emailed to the workspace owner. The AV-Vertrag covers:
- Data processed: invoice PDFs, vendor names, amounts, VAT IDs — all from user's own Lexware account
- Purpose: automated bookkeeping
- Processing location: EU (Frankfurt)
- Sub-processors: Anthropic (AI inference), Stripe (payments), Supabase (database + storage), Railway (compute)

### 2. Data Deletion

When a workspace is deactivated (subscription cancelled or expired):
- `workspaces.is_active` → false immediately
- All agent access revoked immediately
- Workspace data retained for 30 days (dispute resolution window)
- After 30 days: automated deletion job removes all rows in `workspace_members`, `client_workspaces`, `lexware_connections`, `usage_events`, `usage_monthly`, `usage_topups`, `conversations`, `messages`, `audit_log` for that workspace
- `workspaces` row: anonymized (name → `[deleted]`, owner_id → null)
- SQLite rules DB at `/data/workspaces/{id}/` directory: deleted recursively
- Supabase Storage bucket `pdfs/{workspace_id}/`: purged
- User row in `users` table: retained only if user has other active workspaces; otherwise anonymized

Data deletion request (DSGVO Art. 17): `/api/account/delete` triggers immediate deactivation and shortens the 30-day window to 72 hours.

### 3. Server Location: EU Frankfurt

All compute and data storage runs in **AWS eu-central-1 (Frankfurt)**:
- Supabase: Frankfurt region (https://supabase.com/docs/guides/platform/regions)
- Railway: Frankfurt deployment region
- Upstash Redis: Frankfurt region
- Vercel Edge: EU-first routing via Frankfurt PoP

No data leaves the EU during processing. Anthropic API calls are the only cross-border transfer (US servers). This is covered by Anthropic's EU Standard Contractual Clauses (SCCs), referenced in our AV-Vertrag.

### 4. Anthropic EU Data Processing Agreement

Anthropic's DPA (Data Processing Addendum) is signed as part of commercial API usage. Key terms:
- Anthropic does not use API request data to train models (API users are opted out by default)
- Data retention: Anthropic retains API inputs/outputs for 30 days for trust & safety purposes only
- Transfer mechanism: EU Standard Contractual Clauses (Module 2: Controller → Processor)
- Reference: https://www.anthropic.com/legal/privacy

Invoice PDFs sent to the Anthropic API contain invoice data (amounts, vendor names, VAT IDs) from the user's own Lexware account. Under DSGVO, the user is the data controller; we are the processor; Anthropic is a sub-processor. This chain is fully documented in the AV-Vertrag presented at signup.

### 5. No Raw Lexware Data Stored on Platform

The platform is architected as a **passthrough agent** — it does not replicate or cache Lexware account data:
- Lexware API calls are made in real-time using the user's own key, on behalf of the user
- API responses are consumed by the agent and discarded after the tool call
- Only `audit_log` stores outcomes: action type, Lexware resource UUID, amount, success/fail
- The audit log contains no customer PII (names, addresses, bank details)
- Conversation `messages` table stores the chat transcript (which may contain invoice data quoted by the agent). This is equivalent to email — the user's own data in their own account

This architecture means a breach of our platform DB does not expose any Lexware invoice data, contact lists, or financial records — only audit summaries and chat transcripts.
