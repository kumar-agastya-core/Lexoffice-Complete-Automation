-- ══════════════════════════════════════════════════════════════════════════════
-- LexwareAI Platform — PostgreSQL Schema
-- Multi-tenant SaaS: Solo / Team / Agency account types
-- ══════════════════════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- trigram indexes for name search

-- ── USERS AND AUTH ────────────────────────────────────────────────────────────

CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT UNIQUE NOT NULL,
  name                TEXT,
  password_hash       TEXT,
  email_verified      BOOLEAN DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT now(),
  last_login_at       TIMESTAMPTZ,
  preferred_language  TEXT DEFAULT 'de'
);

-- ── WORKSPACES ────────────────────────────────────────────────────────────────
-- One workspace per Solo/Team/Agency account.
-- Agency workspaces spawn client_workspaces (sub-accounts).

CREATE TABLE workspaces (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  account_type            TEXT NOT NULL CHECK (account_type IN ('solo','team','agency')),
  owner_id                UUID NOT NULL REFERENCES users(id),
  created_at              TIMESTAMPTZ DEFAULT now(),
  is_active               BOOLEAN DEFAULT true,

  -- Billing
  stripe_customer_id      TEXT UNIQUE,
  stripe_subscription_id  TEXT UNIQUE,
  plan                    TEXT NOT NULL DEFAULT 'starter'
    CHECK (plan IN ('starter','solo','profi','business','buchhalter')),
  plan_started_at         TIMESTAMPTZ,
  plan_ends_at            TIMESTAMPTZ,
  billing_period          TEXT DEFAULT 'monthly' CHECK (billing_period IN ('monthly','annual')),

  -- Usage limits (set by application on plan change, not computed at query time)
  monthly_actions_limit   INTEGER NOT NULL DEFAULT 50,
  monthly_pdfs_limit      INTEGER NOT NULL DEFAULT 10,
  max_lexware_accounts    INTEGER NOT NULL DEFAULT 1,
  max_team_members        INTEGER NOT NULL DEFAULT 1,
  max_client_workspaces   INTEGER DEFAULT NULL,  -- NULL = unlimited (buchhalter)

  -- White-label (agency only, requires add-on)
  white_label_enabled     BOOLEAN DEFAULT false,
  white_label_domain      TEXT,
  white_label_logo_url    TEXT,
  white_label_brand_name  TEXT
);

-- Plan limits (enforced at application level, mirrored in monthly_actions_limit etc.):
-- starter:    50 actions,    10 PDFs,  1 Lexware account, 1 user
-- solo:       200 actions,   50 PDFs,  1 Lexware account, 1 user
-- profi:      600 actions,  999 PDFs,  1 Lexware account, 1 user
-- business:  2000 actions,  999 PDFs,  3 accounts,        3 users
-- buchhalter:10000 actions, 999 PDFs,  1 account,         unlimited client workspaces

-- ── TEAM MEMBERS ─────────────────────────────────────────────────────────────

CREATE TABLE workspace_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  role          TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner','admin','member','viewer')),
  invited_at    TIMESTAMPTZ DEFAULT now(),
  joined_at     TIMESTAMPTZ,
  is_active     BOOLEAN DEFAULT true,
  UNIQUE(workspace_id, user_id)
);

-- Role permissions:
-- owner:  all permissions including billing and workspace deletion
-- admin:  all permissions except billing
-- member: use agent, view history, manage rules
-- viewer: view history and reports only (read-only)

-- ── CLIENT WORKSPACES (agency only) ──────────────────────────────────────────
-- Each agency workspace can have multiple isolated client sub-workspaces.
-- Each client has their own Lexware connection and rules DB.

CREATE TABLE client_workspaces (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_name           TEXT NOT NULL,
  client_email          TEXT,
  business_type         TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  is_active             BOOLEAN DEFAULT true,

  -- Invite system: client clicks link to connect their own Lexware API key
  invite_token          TEXT UNIQUE,
  invite_expires_at     TIMESTAMPTZ,
  invite_accepted_at    TIMESTAMPTZ,

  -- Monthly usage tracking (draws from agency workspace pool)
  actions_used_this_month  INTEGER DEFAULT 0,
  pdfs_used_this_month     INTEGER DEFAULT 0
);

-- ── LEXWARE CONNECTIONS ───────────────────────────────────────────────────────
-- Stores one Lexware API connection per workspace or client workspace.
-- API keys are encrypted with AES-256-GCM before storage.

CREATE TABLE lexware_connections (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Exactly one of these must be set
  workspace_id              UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  client_workspace_id       UUID REFERENCES client_workspaces(id) ON DELETE CASCADE,
  CHECK (
    (workspace_id IS NOT NULL AND client_workspace_id IS NULL) OR
    (workspace_id IS NULL AND client_workspace_id IS NOT NULL)
  ),

  -- API key stored encrypted — plaintext only in memory during agent calls
  encrypted_api_key         TEXT NOT NULL,
  encryption_iv             TEXT NOT NULL,   -- random 12-byte IV, base64-encoded

  -- Company info synced from Lexware on connection
  lexware_company_name      TEXT,
  lexware_vat_id            TEXT,
  lexware_organisation_id   TEXT,

  -- Connection health
  last_verified_at          TIMESTAMPTZ,
  is_active                 BOOLEAN DEFAULT true,
  connection_error          TEXT,

  created_at                TIMESTAMPTZ DEFAULT now()
);

-- ── USAGE METERING ────────────────────────────────────────────────────────────

CREATE TABLE usage_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL REFERENCES workspaces(id),
  client_workspace_id  UUID REFERENCES client_workspaces(id),
  user_id              UUID REFERENCES users(id),

  event_type           TEXT NOT NULL CHECK (event_type IN ('action','pdf')),
  action_description   TEXT,
  tokens_used          INTEGER,
  anthropic_cost_eur   NUMERIC(10,6),

  created_at           TIMESTAMPTZ DEFAULT now()
);

-- Fast running totals — updated on every event via application logic
CREATE TABLE usage_monthly (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id),
  year_month       TEXT NOT NULL,  -- 'YYYY-MM', e.g. '2026-04'
  actions_used     INTEGER DEFAULT 0,
  pdfs_used        INTEGER DEFAULT 0,
  total_tokens     INTEGER DEFAULT 0,
  total_cost_eur   NUMERIC(10,4) DEFAULT 0,
  UNIQUE(workspace_id, year_month)
);

-- ── ACTION TOP-UPS ────────────────────────────────────────────────────────────

CREATE TABLE usage_topups (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id             UUID NOT NULL REFERENCES workspaces(id),
  topup_type               TEXT NOT NULL CHECK (topup_type IN ('actions','pdfs')),
  quantity                 INTEGER NOT NULL,
  price_eur                NUMERIC(8,2) NOT NULL,
  stripe_payment_intent_id TEXT UNIQUE,
  purchased_at             TIMESTAMPTZ DEFAULT now(),
  expires_at               TIMESTAMPTZ,  -- end of billing month
  used                     INTEGER DEFAULT 0
);

-- Top-up pricing:
-- actions_100: €9.00  (€0.09/action)
-- actions_250: €19.00 (€0.076/action)
-- pdfs_50:     €7.00
-- pdfs_100:    €12.00

-- ── CONVERSATION HISTORY ──────────────────────────────────────────────────────

CREATE TABLE conversations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID NOT NULL REFERENCES workspaces(id),
  client_workspace_id  UUID REFERENCES client_workspaces(id),
  user_id              UUID NOT NULL REFERENCES users(id),
  title                TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  last_message_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('user','assistant','tool_use','tool_result')),
  content           TEXT NOT NULL,
  tool_name         TEXT,
  usage_event_id    UUID REFERENCES usage_events(id),
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ── AUDIT LOG ─────────────────────────────────────────────────────────────────

CREATE TABLE audit_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id),
  client_workspace_id   UUID REFERENCES client_workspaces(id),
  user_id               UUID REFERENCES users(id),

  action                TEXT NOT NULL,   -- e.g. 'voucher.created', 'contact.updated'
  lexware_resource_type TEXT,            -- e.g. 'voucher', 'contact', 'invoice'
  lexware_resource_id   TEXT,            -- Lexware UUID
  amount_eur            NUMERIC(12,2),   -- monetary amount if applicable

  success               BOOLEAN NOT NULL,
  error_message         TEXT,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- ── INDEXES ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_workspace_members_workspace  ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user       ON workspace_members(user_id);
CREATE INDEX idx_client_workspaces_agency     ON client_workspaces(agency_workspace_id);
CREATE INDEX idx_lexware_connections_ws       ON lexware_connections(workspace_id);
CREATE INDEX idx_usage_events_workspace       ON usage_events(workspace_id, created_at DESC);
CREATE INDEX idx_usage_monthly_workspace      ON usage_monthly(workspace_id, year_month);
CREATE INDEX idx_messages_conversation        ON messages(conversation_id, created_at);
CREATE INDEX idx_conversations_workspace      ON conversations(workspace_id, last_message_at DESC);
CREATE INDEX idx_audit_workspace              ON audit_log(workspace_id, created_at DESC);
CREATE INDEX idx_audit_client_workspace       ON audit_log(client_workspace_id, created_at DESC);
CREATE INDEX idx_users_email                  ON users(email);
CREATE INDEX idx_workspaces_owner             ON workspaces(owner_id);

-- ── ROW-LEVEL SECURITY ────────────────────────────────────────────────────────
-- Applied as a second enforcement layer. Primary enforcement is in application middleware.
-- Service role (backend) bypasses RLS. Anon/authenticated roles are restricted.

ALTER TABLE workspaces          ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_workspaces   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lexware_connections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_monthly       ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log           ENABLE ROW LEVEL SECURITY;

-- Workspace members can only see their own workspace
CREATE POLICY workspace_isolation ON workspaces
  USING (id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() AND is_active = true
  ));

-- All workspace-scoped tables follow the same pattern
CREATE POLICY workspace_member_isolation ON workspace_members
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members wm2
    WHERE wm2.user_id = auth.uid() AND wm2.is_active = true
  ));

CREATE POLICY conversations_isolation ON conversations
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() AND is_active = true
  ));

CREATE POLICY messages_isolation ON messages
  USING (conversation_id IN (
    SELECT c.id FROM conversations c
    JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
    WHERE wm.user_id = auth.uid() AND wm.is_active = true
  ));

CREATE POLICY audit_log_isolation ON audit_log
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() AND is_active = true
  ));

-- lexware_connections: never directly accessible by frontend — service role only
CREATE POLICY lexware_connections_deny_all ON lexware_connections
  USING (false);
