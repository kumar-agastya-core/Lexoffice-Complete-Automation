# Technology Stack Decisions

---

## BACKEND

### Runtime: Node.js 22+

Node.js 22 is already the runtime for the MCP TypeScript server. Using it for the web backend means the Lexware API client code (`helper.ts`, all tool files) can be imported directly — no rewrite, no duplication. The tool functions already exist as plain async functions; they just need a different invocation layer. Native `fetch`, `crypto.createCipheriv`, and `import.meta.dirname` are all available without polyfills at Node 22. Node 22 is LTS until April 2027.

### Framework: Fastify

Fastify is 2–3× faster than Express on raw throughput benchmarks and has first-class TypeScript support via `@fastify/type-provider-zod`. Its plugin system enforces explicit dependency declarations (no implicit global state), which makes the codebase easier to test and audit. SSE (Server-Sent Events for streaming agent responses) is simpler in Fastify than in Express — the `reply.raw` stream API is well-documented and doesn't require hacks. Schema validation is built-in via JSON Schema / Zod, meaning request validation happens before handlers run rather than inside them.

### Language: TypeScript throughout

The MCP server is already TypeScript. The Zod schemas in `schemas.ts` can be shared between backend and frontend via a `packages/shared` workspace. End-to-end type safety means the tool input/output types are verified from Anthropic tool call through execution to DB insert. TypeScript also enables strict null checks that prevent the "undefined is not a function" class of runtime errors common in financial applications.

### Database: Supabase (PostgreSQL)

Supabase provides PostgreSQL with built-in row-level security, realtime subscriptions, and an auth layer — all three of which this platform needs. Using Supabase instead of raw PostgreSQL saves significant infrastructure work: auth (email/password, magic link, JWT issuance) is handled out of the box; RLS is a first-class feature with a UI for policy management; Supabase Storage handles PDF uploads with S3-compatible API. The Frankfurt region (`eu-central-1`) satisfies DSGVO server location requirements. Supabase's service role bypasses RLS, so the backend can do admin operations without fighting its own policies.

### File Storage: Supabase Storage

Invoice PDFs upload here temporarily. The path convention `pdfs/{workspace_id}/{uuid}.pdf` naturally enforces workspace isolation at the storage layer. Files are deleted immediately after the agent processes them — no long-term PDF storage on the platform. Supabase Storage sits in the same Frankfurt region as the database. Pre-signed URLs for downloads expire in 60 seconds — no permanent public URLs for financial documents.

### Cache: Upstash Redis

Upstash Redis is serverless Redis — pay per request, no idle cost, Frankfurt region. Used for: usage counters (sub-millisecond limit checks before every agent action), refresh token storage (SHA-256 hashes with 30-day TTL), rate limiting (per-IP and per-workspace request throttling via `@upstash/ratelimit`), and the usage warning email deduplication flag. Upstash's REST API means no persistent connection pool — works correctly in Railway's environment where long-lived connections cause problems.

### Queue: Upstash QStash

QStash is a serverless message queue. Used for: async PDF processing (agency bulk uploads queued overnight), usage warning emails (fire-and-forget), Stripe webhook retry handling. QStash guarantees at-least-once delivery with exponential backoff — webhooks that fail due to transient errors are retried automatically. The alternative (BullMQ with Redis) requires a persistent Redis connection and a separate worker process; QStash eliminates both.

### Hosting: Railway

Railway supports multiple services in one project — the Node.js backend and Python FastAPI sidecar deploy together with shared internal networking. Railway's `$PORT` environment variable is standard; `localhost:8001` for the Python sidecar is set as an internal service URL. Frankfurt region is available. Railway builds from Dockerfile by default, which means the same multi-stage Dockerfile from the MCP server repo (Node 22 Alpine) is reused with minor additions. Automatic deploy on git push to main. No cold starts (unlike Vercel serverless for backend workloads that need persistent connections).

---

## PYTHON MICROSERVICE

The existing `mcp_tools.py` is refactored to expose the same 22 tools via FastAPI HTTP endpoints instead of (or in addition to) MCP stdio. The core tool logic does not change — only the invocation layer changes. FastAPI is chosen because:
- Already Python, minimal additional dependency
- Auto-generates OpenAPI spec for the Node.js backend to type-check against
- Uvicorn ASGI server handles concurrent requests without blocking
- Health check endpoint (`GET /health`) integrates with Railway's healthcheck

The Python service runs on `localhost:8001` inside the Railway project. It is never exposed to the public internet — only the Node.js backend reaches it via internal HTTP.

---

## FRONTEND

### Framework: Next.js 14 App Router

Next.js 14 App Router provides React Server Components for fast initial page loads without shipping unnecessary JavaScript, and Client Components for interactive elements like the chat interface. The App Router's streaming support (`<Suspense>` boundaries) pairs well with SSE — partial content renders while the agent streams. Next.js handles routing, middleware (JWT validation at the edge), and image optimization out of the box. It is the de-facto standard for TypeScript React applications.

### UI: Tailwind CSS + shadcn/ui

shadcn/ui provides accessible, unstyled-but-styled components (Dialog, Select, Table, Toast) that work with Radix UI primitives. Components are copied into the project rather than installed as a package — full control, no black-box dependencies, easy to modify for white-label theming. Tailwind handles all custom styles. The combination is battle-tested for B2B SaaS dashboards and produces small bundle sizes because Tailwind purges unused classes.

### Hosting: Vercel

Next.js is built by Vercel — deployment is `git push` with zero config. Vercel's Frankfurt edge network serves the frontend closest to German users. Preview deployments on every PR enable QA before merge. Vercel's Edge Middleware runs JWT validation at the CDN layer before requests reach the origin — this means unauthenticated requests are rejected before consuming any backend resources. Vercel automatically provides SSL, domain management, and Core Web Vitals analytics.

### Auth: Supabase Auth

Supabase Auth is already part of the Supabase project — no additional service. It handles email/password signup, magic link login, JWT issuance with custom claims (workspace_id, role), and refresh token rotation. The `@supabase/ssr` package handles cookie-based session management in Next.js App Router correctly (no client-side localStorage exposure). Email templates (verification, password reset) are customizable for white-label scenarios.

### Payments: Stripe

Stripe is the only practical choice for EU SaaS: DSGVO-compliant, supports SEPA Direct Debit (the default payment method in Germany alongside credit card), handles VAT for EU B2B (Stripe Tax), and has a robust subscription API for the multi-plan model. Stripe's webhook system is used for subscription lifecycle events. The `stripe` Node.js SDK is type-safe. Stripe's test mode allows full end-to-end payment testing without real charges.

### i18n: next-intl

German is the primary language. English support is required for non-German users and for the white-label clients of international Buchhalter firms. `next-intl` integrates natively with Next.js App Router — server components can access translations without client-side hydration cost. Translation files live in `messages/{de,en}.json`. URL-based locale switching (`/de/dashboard`, `/en/dashboard`) is optional — cookie-based locale detection is simpler for a German-first product.

---

## MONITORING

### Error tracking: Sentry

Sentry captures unhandled exceptions in both Node.js backend and Next.js frontend, with full stack traces and request context. Source maps uploaded on deploy. Sentry's performance monitoring captures slow API routes and agent calls. The Sentry Frankfurt data region satisfies DSGVO. Free tier covers the expected error volume at launch; Pro tier adds alerting rules and team assignments.

### Uptime: Better Uptime

Simple HTTP uptime monitoring with SMS/email/Slack alerts. Monitors `/api/health` on the backend and the Vercel frontend. 1-minute check interval. Status page at `status.lexwareai.de` (Better Uptime public status page) — transparent incident communication builds trust with bookkeeping customers who depend on the tool for real financial operations.

### Logs: Railway built-in + structured JSON

The backend uses structured JSON logging (same `MCP_LOG_FORMAT=json` pattern from the MCP server). Railway streams logs to its built-in log viewer with search. For persistent log storage beyond Railway's 7-day retention, logs are forwarded to Logtail (BetterStack) via Railway's log drain — €0 for the first 1 GB/month.

---

## INFRASTRUCTURE SUMMARY

```
Internet
  │
  ├─ Vercel Frankfurt (Next.js frontend + edge middleware)
  │
  └─ Railway Frankfurt (backend project)
       ├─ Node.js service (Fastify, port 3000)
       │   ├─ Connects to: Supabase (PostgreSQL + Storage)
       │   ├─ Connects to: Upstash Redis
       │   ├─ Connects to: Upstash QStash
       │   ├─ Connects to: Stripe API
       │   ├─ Connects to: Anthropic API
       │   └─ Connects to: localhost:8001 (Python sidecar)
       │
       └─ Python FastAPI service (port 8001, internal only)
           ├─ Uses: /data/workspaces/ (Railway persistent volume)
           └─ Connects to: Anthropic API (for PDF extraction)
```

All external services (Supabase, Upstash, Stripe, Anthropic) are accessed over HTTPS from within the Railway project. No service is exposed except Vercel (frontend) and Railway's public URL for the Node.js backend. The Python service is internal-only.
