# Lexware Automation

A headless bookkeeping automation platform for German businesses using Lexware Office. Forward an invoice PDF to your assigned email address — the system extracts the data, classifies it against German tax rules (§13b, §19 UStG, EU VAT), and posts the voucher to Lexware automatically. Documents that need human input appear in a web exception tray with one-click approval.

## Architecture

```
  Postmark Inbound Email      SumUp / Hello Cash Upload
         │                              │
         └──────────────┬───────────────┘
                        ▼
                ┌───────────────┐
                │    Worker     │  :3001
                │  BullMQ +     │  extract → classify → post
                │  Express      │  10-step pipeline per document
                └───────┬───────┘
                        │  jobs / results
                ┌───────▼───────┐     ┌────────────────┐
                │     Redis     │◄────│   Dashboard    │  :3000
                │  (job queue)  │     │  Exception Tray│
                └───────────────┘     │  Integrations  │
                        │             └───────┬────────┘
                        ▼                     │
             ┌──────────────────────┐         │
             │  PostgreSQL +        │◄────────┘
             │  pgvector            │  tenants, exceptions, embeddings
             └──────────┬───────────┘
                        │
                        ▼
                Lexware Office API
```

## Quick Start (6 steps)

### Step 1 — Prerequisites
- Docker 24+ and Docker Compose v2
- Lexware Office account with API key ([app.lexware.de/addons/public-api](https://app.lexware.de/addons/public-api))
- Anthropic API key (document classification)
- OpenAI API key (semantic search embeddings — optional but recommended)

### Step 2 — Clone and configure
```bash
git clone https://github.com/your-org/lexware-automation
cd lexware-automation
cp .env.example .env.production
# Edit .env.production — fill in all required values (see table below)
```

### Step 3 — Generate secrets
```bash
make generate-key    # paste output into MASTER_ENCRYPTION_KEY
# Set DASHBOARD_SECRET to any long random string (same command works)
```

### Step 4 — Start services
```bash
make up
# Wait ~60 seconds for all services to become healthy
make health          # should show status: "ok" for both services
```

### Step 5 — Complete onboarding
1. Open **http://localhost:3000/onboarding**
2. Enter your Lexware API key — validated live
3. Select your business type
4. Wait for initial sync (~30 seconds)
5. Note your assigned inbound email address

### Step 6 — Send your first invoice
```
Forward any invoice PDF to: your-slug@bills.yourdomain.com
```
Within 60 seconds the voucher appears in Lexware Office.
Exceptions (if any): **http://localhost:3000/exceptions**

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | ✅ | PostgreSQL password |
| `MASTER_ENCRYPTION_KEY` | ✅ | 64 hex chars — encrypts all stored API keys. `make generate-key` |
| `DASHBOARD_SECRET` | ✅ | Bearer token for all dashboard API routes |
| `ANTHROPIC_API_KEY` | ✅ | Claude API key for document classification |
| `OPENAI_API_KEY` | recommended | For pgvector embeddings (semantic vendor matching) |
| `INBOUND_EMAIL_DOMAIN` | ✅ | Domain for tenant email addresses, e.g. `bills.example.com` |
| `POSTMARK_WEBHOOK_TOKEN` | ✅ | HMAC token from Postmark inbound stream settings |
| `WORKER_PUBLIC_URL` | ✅ | HTTPS URL of worker for webhook callbacks |
| `NEXT_PUBLIC_APP_URL` | ✅ | Public URL of the dashboard |
| `LEXWARE_API_KEY` | optional | Single-tenant fallback (skips onboarding) |

See `.env.example` for the full list with descriptions.

---

## Configuring Postmark Inbound Email

1. Create a [Postmark](https://postmarkapp.com) account and server
2. Go to **Message Streams → Inbound**
3. Set Webhook URL: `https://your-worker-url/webhook/inbound-email`
4. Point your domain MX records to Postmark's inbound addresses
5. Copy the webhook token into `POSTMARK_WEBHOOK_TOKEN`

---

## Integrations

Upload monthly reports at **http://localhost:3000/integrations**:

| Integration | What it does |
|---|---|
| **SumUp** | Parses Abrechnungsbericht PDF → revenue voucher (7%/19%) + fee voucher (§13b EU) |
| **Hello Cash** | Parses Umsatzübersicht → separate vouchers for card and cash revenue |

---

## Common Operations

```bash
make logs-worker       # watch document processing live
make logs-dashboard    # watch dashboard requests
make shell-db          # psql shell for debugging
make restart-worker    # rebuild + restart worker
make migrate           # re-apply schema changes (idempotent)
make health            # check status of both services
```

---

## Troubleshooting

**`init-db` fails with "already exists"**
Normal on restarts — all schema statements use `IF NOT EXISTS`. Safe to ignore.

**Worker crashes on startup**
Check `DATABASE_URL` is reachable. Verify `MASTER_ENCRYPTION_KEY` is exactly 64 hex characters (`make generate-key`).

**Postmark webhook returns 401**
Verify `POSTMARK_WEBHOOK_TOKEN` matches exactly what Postmark sends in the `X-Postmark-Signature` header.

**Lexware API 429 during initial sync**
Expected. The worker respects the 1.1s rate limit — sync completes automatically in 2–3 minutes for large accounts.

**Dashboard shows "No exceptions — all documents processed automatically ✓"**
This is the happy path. Every document was classified and posted without human input.
