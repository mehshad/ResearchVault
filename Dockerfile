# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

# NODE_ENV=development ensures npm installs devDependencies (vite, esbuild…)
RUN NODE_ENV=development npm install --legacy-peer-deps

COPY . .

RUN NODE_ENV=development npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache postgresql-client && apk upgrade --no-cache

WORKDIR /app

COPY package*.json ./
RUN NODE_ENV=production npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/shared ./shared

RUN mkdir -p /data/uploads && mkdir -p /var/log/app

EXPOSE 5000

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
