# ── Stage 1: build & prune ────────────────────────────────────────────────────
# Node-gyp (needed by better-sqlite3 and other native addons) requires Python
# and build tools.  We install and compile everything here, then prune dev
# dependencies so that only production modules are carried into Stage 2.
# This avoids re-running npm install (and node-gyp) in the runtime stage where
# build tools are not available.
FROM node:22-alpine AS builder

# python3, make, g++ are required by node-gyp to compile native addons
# (better-sqlite3, bufferutil, etc.).  They are only needed at build time.
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./

# Full install (dev + prod) so vite, esbuild, drizzle-kit, tsx all work.
# Native addons (better-sqlite3 …) are compiled here with the build tools above.
RUN NODE_ENV=development npm install --legacy-peer-deps

COPY . .

# Compile the client bundle and transpile the server entry point.
RUN NODE_ENV=development npm run build

# Prune devDependencies in-place so the node_modules we copy across is
# production-only.  esbuild's native binary is a build-time artefact — remove it.
RUN npm prune --omit=dev && \
    rm -rf node_modules/esbuild/bin node_modules/.bin/esbuild

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine

# postgresql-client  — psql for migration runner (postgres mode)
# apk upgrade        — pull in any OS security patches
RUN apk add --no-cache postgresql-client && apk upgrade --no-cache

WORKDIR /app

# Copy the already-compiled, already-pruned node_modules from Stage 1.
# No npm install runs here, so no Python / build tools are needed.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist        ./dist
COPY --from=builder /app/migrations  ./migrations
COPY --from=builder /app/shared      ./shared
COPY package*.json ./

RUN mkdir -p /data/uploads && mkdir -p /var/log/app

EXPOSE 5000

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
