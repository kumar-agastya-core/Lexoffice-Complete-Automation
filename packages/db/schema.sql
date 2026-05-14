-- Lexware Automation Platform — PostgreSQL + pgvector schema
-- Requires: CREATE EXTENSION IF NOT EXISTS vector;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Tenants ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_profiles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lexware_org   TEXT NOT NULL UNIQUE,
  company_name  TEXT NOT NULL,
  vat_id        TEXT,
  business_type TEXT,
  approval_threshold NUMERIC(12,2) NOT NULL DEFAULT 5000.00,
  setup_complete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Vendor fingerprints (learned per tenant) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS vendor_fingerprints (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
  vendor_name     TEXT NOT NULL,
  lexware_contact_id TEXT,
  category_id     TEXT,
  tax_type        TEXT,
  split_json      JSONB,
  always_unchecked BOOLEAN NOT NULL DEFAULT FALSE,
  usage_count     INTEGER NOT NULL DEFAULT 0,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, vendor_name)
);

-- ── Classification examples (pgvector for semantic search) ───────────────────

CREATE TABLE IF NOT EXISTS classification_examples (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
  text_snippet    TEXT NOT NULL,
  embedding       VECTOR(1536) NOT NULL,
  category_id     TEXT NOT NULL,
  tax_type        TEXT NOT NULL,
  voucher_type    TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'manual',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON classification_examples
  USING ivfflat (embedding vector_cosine_ops);

-- ── Document type rules ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_type_rules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
  rule_key        TEXT NOT NULL,
  category_id     TEXT NOT NULL,
  tax_type        TEXT NOT NULL,
  voucher_type    TEXT NOT NULL DEFAULT 'purchaseinvoice',
  match_json      JSONB,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, rule_key)
);

-- ── Exception queue (items needing human review) ──────────────────────────────

CREATE TABLE IF NOT EXISTS exception_queue (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
  job_id          TEXT,
  reason          TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'resolved', 'dismissed')),
  resolved_by     TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Special accounts (per-tenant overrides) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS special_accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
  account_name    TEXT NOT NULL,
  lexware_category_id TEXT NOT NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, account_name)
);

-- ── Clarification sessions (multi-turn ambiguity resolution) ─────────────────

CREATE TABLE IF NOT EXISTS clarification_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
  job_id          TEXT,
  question        TEXT NOT NULL,
  context_json    JSONB,
  answer          TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'answered', 'timed_out')),
  asked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at     TIMESTAMPTZ
);

-- ── Integration sync state ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integration_sync_state (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
  integration     TEXT NOT NULL,
  last_synced_at  TIMESTAMPTZ,
  cursor          TEXT,
  metadata        JSONB,
  UNIQUE (tenant_id, integration)
);

-- ── Posting categories cache (TTL: 24 hours per tenant) ──────────────────────

CREATE TABLE IF NOT EXISTS posting_categories_cache (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenant_profiles(id) ON DELETE CASCADE,
  categories      JSONB NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id)
);

-- ── pg_trgm extension (required for fuzzy vendor name matching) ──────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Phase 5 schema additions ──────────────────────────────────────────────────

-- Expand exception_queue status enum and add reference_docs storage
ALTER TABLE exception_queue DROP CONSTRAINT IF EXISTS exception_queue_status_check;
ALTER TABLE exception_queue ADD CONSTRAINT exception_queue_status_check
  CHECK (status IN ('pending', 'resolved', 'dismissed', 'awaiting_approval'));
ALTER TABLE exception_queue ADD COLUMN IF NOT EXISTS reference_docs JSONB DEFAULT '[]';

-- ── Phase 6 — Multi-tenant onboarding ─────────────────────────────────────────

ALTER TABLE tenant_profiles
  ADD COLUMN IF NOT EXISTS lexoffice_api_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS lexoffice_api_key_hash       TEXT,
  ADD COLUMN IF NOT EXISTS inbound_email                TEXT,
  ADD COLUMN IF NOT EXISTS slug                         TEXT,
  ADD COLUMN IF NOT EXISTS industry_operational_lens    TEXT,
  ADD COLUMN IF NOT EXISTS setup_step                   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lexware_voucher_webhook_id   TEXT,
  ADD COLUMN IF NOT EXISTS lexware_payment_webhook_id   TEXT;

-- unique slug index (not a constraint so we can add it safely)
CREATE UNIQUE INDEX IF NOT EXISTS tenant_profiles_slug_idx ON tenant_profiles (slug)
  WHERE slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS initial_sync_progress (
  tenant_id           UUID PRIMARY KEY REFERENCES tenant_profiles(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'running', 'complete', 'failed')),
  contacts_synced     INTEGER NOT NULL DEFAULT 0,
  fingerprints_created INTEGER NOT NULL DEFAULT 0,
  categories_cached   INTEGER NOT NULL DEFAULT 0,
  vouchers_learned    INTEGER NOT NULL DEFAULT 0,
  error_message       TEXT,
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ
);

-- ── Phase 7 — Resume flow + integrations ──────────────────────────────────────

ALTER TABLE exception_queue
  ADD COLUMN IF NOT EXISTS original_file_base64 TEXT,
  ADD COLUMN IF NOT EXISTS original_mime_type   TEXT DEFAULT 'application/pdf';
