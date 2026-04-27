# ── Stage 1: build Vite app ──────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy manifests for layer caching
COPY package*.json ./
RUN npm ci

# VITE_API_URL is injected at build time so the JS bundle contains the correct
# backend URL.  Pass via docker build --build-arg VITE_API_URL=https://api.example.com
# or compose build arg.  Falls back to /api/v1 (served via nginx proxy on the same host).
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL

COPY . .
RUN npm run build          # tsc + vite build → dist/

# ── Stage 2: serve with nginx ────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our SPA-aware nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy Vite build output
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
