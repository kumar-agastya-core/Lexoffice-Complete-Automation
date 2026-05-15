# Local Development Guide

## Quick start (5 steps)

### 1. Copy and fill env file
```bash
cp .env.local.example .env.local
```
Fill in at minimum:
- `POSTGRES_PASSWORD` — any string (e.g. `devpassword123`)
- `MASTER_ENCRYPTION_KEY` — 64 hex chars: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `DASHBOARD_SECRET` — your local login password (any string)
- `ANTHROPIC_API_KEY` — from console.anthropic.com

### 2. Start infrastructure (Postgres + Redis in Docker)
```bash
make dev-infra    # starts postgres:5432 + redis:6379 in Docker
make dev-migrate  # applies the full DB schema
```

### 3. Install dependencies (first time only)
```bash
pnpm install
cp .env.local apps/dashboard/.env.local   # Next.js reads from its own directory
```

### 4. Start the worker (Terminal 1)
```bash
cd apps/worker
pnpm dev
```
Worker runs at http://localhost:3001 with hot reload via Node `--watch`.

### 5. Start the dashboard (Terminal 2)
```bash
cd apps/dashboard
pnpm dev
```
Dashboard runs at http://localhost:3000 with Next.js Turbopack hot reload.

## Open the app

Go to **http://localhost:3000** — log in with your `DASHBOARD_SECRET`, then complete onboarding at `/onboarding`.

## Useful commands

| Command | What it does |
|---|---|
| `make dev-health` | Check if worker, dashboard, postgres, redis are all running |
| `make dev-db` | Open psql shell against local DB |
| `make dev-reset` | Wipe DB and start fresh |
| `make dev-down` | Stop postgres + redis containers |
| `make dev-help` | Print full setup instructions |
| `make logs-worker` (Docker only) | Stream worker logs (use terminal output for local dev) |

## Two ways to run

| Mode | Command | When to use |
|---|---|---|
| **Local dev** (this guide) | `make dev-infra` + `pnpm dev` in each app | When building or testing UI changes — hot reload |
| **Full Docker** (production-like) | `make up` + `make migrate` | When testing the final built product |

## DB useful queries (run inside `make dev-db`)

```sql
-- See your tenant
SELECT id, company_name, slug, inbound_email, setup_complete FROM tenant_profiles;

-- See recent exceptions
SELECT id, status, reason, created_at FROM exception_queue ORDER BY created_at DESC LIMIT 10;

-- See learned vendor rules
SELECT vendor_name, category_id, usage_count FROM vendor_fingerprints ORDER BY usage_count DESC;

-- Reset a tenant (start onboarding fresh)
DELETE FROM tenant_profiles WHERE slug = 'your-slug';
```

## Environment notes

- `.env.local` at repo root → loaded by the worker via `--env-file` flag in `pnpm dev`
- `apps/dashboard/.env.local` → loaded by Next.js automatically
- Keep them in sync: if you change `.env.local`, run `cp .env.local apps/dashboard/.env.local`
- Never commit either file
