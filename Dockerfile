# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

# NODE_ENV=development ensures npm installs devDependencies (vite, esbuild…)
RUN NODE_ENV=development npm install --legacy-peer-deps

COPY . .

RUN NODE_ENV=development npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine

RUN apk add --no-cache postgresql-client && apk upgrade --no-cache

WORKDIR /app

COPY package*.json ./
# Install production dependencies only, then strip esbuild's native binary
# (esbuild is a build-time bundler; its binary is never executed at runtime)
RUN NODE_ENV=production npm install --omit=dev && \
    rm -rf node_modules/esbuild/bin node_modules/.bin/esbuild

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/shared ./shared

RUN mkdir -p /data/uploads && mkdir -p /var/log/app

EXPOSE 5000

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
