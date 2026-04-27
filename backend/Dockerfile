# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy manifests first for layer-cache efficiency
COPY package*.json ./
RUN npm ci

# Build TypeScript → dist/
COPY . .
RUN npm run build

# ── Stage 2: production runner ───────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

ENV NODE_ENV=production

# Production deps only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Prebuilt migration SQL files (needed by drizzle-kit migrate at startup)
COPY --from=builder /app/src/db/migrations ./src/db/migrations
COPY --from=builder /app/drizzle.config.* ./ 2>/dev/null || true

# Keys directory is mounted as a volume — just ensure it exists with correct owner
RUN mkdir -p keys && chown -R appuser:appgroup /app

USER appuser
EXPOSE 3000

# Lightweight healthcheck — hits /health which returns 200 quickly
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
