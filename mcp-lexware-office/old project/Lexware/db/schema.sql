-- Lexware local database schema
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── contacts ──────────────────────────────────────────────────────────────────
-- Full mirror of Lexware contacts. Rebuilt fresh on every run.
CREATE TABLE IF NOT EXISTS contacts (
    id              TEXT    PRIMARY KEY,   -- Lexware UUID
    name            TEXT    NOT NULL,      -- company name or "First Last"
    vat_id          TEXT,                  -- vatRegistrationId (Umsatzsteuer-ID)
    tax_number      TEXT,                  -- Steuernummer
    street          TEXT,
    zip             TEXT,
    city            TEXT,
    country_code    TEXT    DEFAULT 'DE',
    email           TEXT,
    phone           TEXT,
    role_customer   INTEGER DEFAULT 0,     -- 1 if contact has customer role
    role_vendor     INTEGER DEFAULT 1,     -- 1 if contact has vendor role
    version         INTEGER DEFAULT 0,     -- Lexware optimistic lock version
    last_synced_at  TEXT,                  -- ISO-8601 timestamp
    raw_json        TEXT                   -- full Lexware response (cached)
);

CREATE INDEX IF NOT EXISTS idx_contacts_name       ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_vat_id     ON contacts(vat_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tax_number ON contacts(tax_number);
CREATE INDEX IF NOT EXISTS idx_contacts_zip        ON contacts(zip);

-- ── posting_categories ────────────────────────────────────────────────────────
-- Mirror of Lexware posting categories. Rebuilt fresh on every run.
-- type is either 'income' or 'outgo'.
CREATE TABLE IF NOT EXISTS posting_categories (
    id               TEXT    PRIMARY KEY,   -- Lexware UUID
    name             TEXT    NOT NULL,
    type             TEXT    NOT NULL,      -- income | outgo
    split_allowed    INTEGER DEFAULT 1,     -- 1 = mixed tax rates allowed
    group_name       TEXT,
    contact_required INTEGER DEFAULT 0,     -- 1 = contactId mandatory
    last_synced_at   TEXT                   -- ISO-8601 timestamp
);

CREATE INDEX IF NOT EXISTS idx_categories_type ON posting_categories(type);
CREATE INDEX IF NOT EXISTS idx_categories_name ON posting_categories(name);
