FROM node:22-slim AS base
RUN npm install -g pnpm@10 --no-update-notifier \
    && apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS installer
WORKDIR /app
# Copy workspace manifests first for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/lexware-client/package.json packages/lexware-client/
COPY packages/db/package.json             packages/db/
COPY packages/crypto/package.json         packages/crypto/
COPY apps/worker/package.json             apps/worker/
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM installer AS builder
COPY packages/ packages/
COPY apps/worker/ apps/worker/
RUN pnpm --filter '@lexware/client' build \
    && pnpm --filter '@lexware/db' build \
    && pnpm --filter '@lexware/crypto' build \
    && pnpm --filter '@lexware/worker' build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Production deps only
COPY --from=installer /app/node_modules ./node_modules
COPY --from=installer /app/pnpm-workspace.yaml ./
COPY --from=installer /app/package.json ./

# Built package artifacts + manifests
COPY --from=builder /app/packages/lexware-client/dist   ./packages/lexware-client/dist
COPY --from=builder /app/packages/lexware-client/package.json ./packages/lexware-client/package.json
COPY --from=builder /app/packages/db/dist               ./packages/db/dist
COPY --from=builder /app/packages/db/package.json       ./packages/db/package.json
COPY --from=builder /app/packages/db/schema.sql         ./packages/db/schema.sql
COPY --from=builder /app/packages/crypto/dist           ./packages/crypto/dist
COPY --from=builder /app/packages/crypto/package.json   ./packages/crypto/package.json

# Worker build output
COPY --from=builder /app/apps/worker/dist               ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json       ./apps/worker/package.json

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/worker/dist/index.js"]
