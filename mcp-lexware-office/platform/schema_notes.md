# Schema Design Notes

## Row-Level Security

Every tenant-scoped table has `workspace_id`. The application middleware resolves the current `workspace_id` from the session JWT before every query and injects it as a bound parameter — no query runs without a workspace scope.

PostgreSQL RLS policies are a second enforcement layer: if application code has a bug that omits the `workspace_id` filter, RLS rejects the query. The service role (used by the backend) bypasses RLS; the `anon` and `authenticated` Supabase roles are fully restricted.

`lexware_connections` has a `USING (false)` policy — no frontend client ever reads this table directly. API keys flow only through the backend service role, decrypted in memory, destroyed after the agent session ends.

For agency accounts, client workspace isolation follows the same pattern: queries against `client_workspaces` require that `agency_workspace_id` belongs to the caller's workspace. Clients never log in; their data is accessed exclusively through the agency's authenticated session.

## API Key Encryption

Algorithm: **AES-256-GCM** (authenticated encryption — ciphertext is tamper-proof).

Key derivation: `HKDF(sha256, server_master_secret, salt=workspace_id, info="lexware-api-key")` → 32-byte derived key per workspace. The master secret never leaves the backend environment. Compromising one workspace's derived key does not expose others.

Storage: `encrypted_api_key` (base64 ciphertext + auth tag) and `encryption_iv` (base64 random 12-byte IV) stored in `lexware_connections`. The IV is unique per encryption operation — two encryptions of the same key produce different ciphertexts.

Lifecycle:
1. User POSTs plaintext key to `/api/lexware/connect`
2. Backend derives workspace key via HKDF, encrypts, stores ciphertext
3. Plaintext is zeroed from memory immediately after encryption
4. On agent call: backend decrypts in-process, passes to Lexware HTTP client, key never serialized or logged
5. Frontend never receives the key after the initial save

## Per-Workspace vs Shared Tables

| Table | Scope | Notes |
|-------|-------|-------|
| `users` | Shared (platform-wide) | User identity independent of workspace |
| `workspaces` | Per-tenant | One row per subscription |
| `workspace_members` | Per-workspace | Links users to workspaces with roles |
| `client_workspaces` | Per-agency-workspace | Agency sub-accounts |
| `lexware_connections` | Per-workspace or per-client | Isolated API key per connection |
| `usage_events` | Per-workspace | Metering events |
| `usage_monthly` | Per-workspace | Aggregated counters for fast limit checks |
| `usage_topups` | Per-workspace | Purchased top-up packs |
| `conversations` | Per-workspace | Chat history |
| `messages` | Per-conversation | Message thread |
| `audit_log` | Per-workspace | Immutable action log |

## Agency Client Data Isolation

An agency workspace can have up to N client sub-workspaces (unlimited on `buchhalter` plan). Each client workspace is completely isolated:

- Own `lexware_connections` row → own Lexware account and API key
- Own conversation history scoped to `client_workspace_id`
- Own audit log scoped to `client_workspace_id`
- Own rules DB (SQLite, separate `DB_PATH` per client, managed by Python microservice)
- Usage draws from the agency's `usage_monthly` pool, tracked per-client in `client_workspaces.actions_used_this_month`

No query for Client A can return data for Client B. The `client_workspace_id` foreign key constraint ensures orphaned records are impossible.

The invite flow: `client_workspaces.invite_token` is a cryptographically random token (32 bytes, hex-encoded). It expires in 7 days (`invite_expires_at`). When the client accepts, `invite_accepted_at` is set and the token is nulled out. The client connects their own Lexware API key through the accept flow — this creates the `lexware_connections` row linked to `client_workspace_id`.
