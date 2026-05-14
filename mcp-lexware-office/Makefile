.PHONY: up down logs build test migrate shell-db generate-key health

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
