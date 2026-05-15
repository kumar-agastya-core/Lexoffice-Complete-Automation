.PHONY: up down logs build test migrate shell-db generate-key health dev-infra dev-migrate dev-down dev-reset dev-help dev-health dev-db

# Start all services in the background
up:
	docker compose --env-file .env.production up -d

# Stop all services (keeps volumes intact)
down:
	docker compose down

# Stream logs from all services
logs:
	docker compose logs -f

# Stream logs from one service — usage: make logs-worker
logs-%:
	docker compose logs -f $*

# Rebuild and restart a single service — usage: make restart-worker
restart-%:
	docker compose up -d --build $*

# Run all tests locally
test:
	pnpm -r test

# Apply latest schema changes (idempotent — safe to run multiple times)
migrate:
	docker compose run --rm init-db

# Open a psql shell against the running database
shell-db:
	docker compose exec postgres psql -U lexware -d lexware

# Generate a new MASTER_ENCRYPTION_KEY (run once at deployment)
generate-key:
	@node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Build all Docker images without cache
build:
	docker compose build --no-cache

# Check health of running services
health:
	@echo "=== Worker ===" && curl -s http://localhost:3001/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3001/health
	@echo "=== Dashboard ===" && curl -s http://localhost:3000/api/health | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3000/api/health

# ── Local development (hot reload) ────────────────────────────────────────────

# Start only infrastructure (Postgres + Redis) for local dev
dev-infra:
	docker compose -f docker-compose.dev.yml --env-file .env.local up -d
	@echo "⏳ Waiting for Postgres to be healthy..."
	@docker compose -f docker-compose.dev.yml exec postgres sh -c 'until pg_isready -U lexware; do sleep 1; done'
	@echo "✅ Infrastructure ready — Postgres on :5432, Redis on :6379"

# Apply schema against local dev DB
dev-migrate:
	docker compose -f docker-compose.dev.yml --env-file .env.local run --rm init-db
	@echo "✅ Schema applied to local dev DB"

# Stop local dev infrastructure
dev-down:
	docker compose -f docker-compose.dev.yml down

# Wipe local dev DB and start fresh
dev-reset:
	docker compose -f docker-compose.dev.yml down -v
	$(MAKE) dev-infra
	$(MAKE) dev-migrate
	@echo "✅ Local dev DB reset complete"

# Show dev setup instructions
dev-help:
	@echo ""
	@echo "═══════════════════════════════════════════"
	@echo "  LOCAL DEV SETUP"
	@echo "═══════════════════════════════════════════"
	@echo ""
	@echo "1. Copy env file:"
	@echo "   cp .env.local.example .env.local"
	@echo "   # Fill in ANTHROPIC_API_KEY and MASTER_ENCRYPTION_KEY"
	@echo ""
	@echo "2. Start infrastructure:"
	@echo "   make dev-infra"
	@echo ""
	@echo "3. Apply schema:"
	@echo "   make dev-migrate"
	@echo ""
	@echo "4. Install dependencies (first time only):"
	@echo "   pnpm install"
	@echo ""
	@echo "5. Copy env to dashboard:"
	@echo "   cp .env.local apps/dashboard/.env.local"
	@echo ""
	@echo "6. Start worker (terminal 1):"
	@echo "   cd apps/worker && pnpm dev"
	@echo ""
	@echo "7. Start dashboard (terminal 2):"
	@echo "   cd apps/dashboard && pnpm dev"
	@echo ""
	@echo "8. Open browser:"
	@echo "   http://localhost:3000"
	@echo "═══════════════════════════════════════════"
	@echo ""

# Health check for local dev (no Docker worker/dashboard)
dev-health:
	@echo "=== Worker (local) ===" && curl -s http://localhost:3001/health 2>/dev/null || echo "❌ Worker not running — start with: cd apps/worker && pnpm dev"
	@echo "=== Dashboard (local) ===" && curl -s http://localhost:3000/api/health 2>/dev/null || echo "❌ Dashboard not running — start with: cd apps/dashboard && pnpm dev"
	@echo "=== Postgres ===" && docker compose -f docker-compose.dev.yml exec postgres pg_isready -U lexware 2>/dev/null && echo "✅ Postgres healthy" || echo "❌ Postgres not running — start with: make dev-infra"
	@echo "=== Redis ===" && docker compose -f docker-compose.dev.yml exec redis redis-cli ping 2>/dev/null || echo "❌ Redis not running — start with: make dev-infra"

# Open psql shell against local dev DB
dev-db:
	docker compose -f docker-compose.dev.yml exec postgres psql -U lexware -d lexware
