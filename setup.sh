#!/bin/sh
# ResearchVault — first-time setup script
# Supports Docker and Podman. Run as a user with container and sudo privileges.
set -e

BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

info()    { printf "${GREEN}[INFO]${RESET}  %s\n" "$*"; }
warn()    { printf "${YELLOW}[WARN]${RESET}  %s\n" "$*"; }
error()   { printf "${RED}[ERROR]${RESET} %s\n" "$*"; exit 1; }
section() { printf "\n${BOLD}==> %s${RESET}\n" "$*"; }

# ── 1. Container runtime ──────────────────────────────────────────────────────
section "Checking prerequisites"

# Source runtime detector — sets CONTAINER_CMD and COMPOSE_CMD
# shellcheck source=scripts/container-runtime.sh
. "$(dirname "$0")/scripts/container-runtime.sh"

info "Container runtime: ${CONTAINER_CMD} ($($CONTAINER_CMD --version | head -1))"
info "Compose command:   ${COMPOSE_CMD}"

# ── 2. Environment file ───────────────────────────────────────────────────────
section "Environment configuration"

if [ ! -f .env ]; then
  cp .env.example .env
  warn ".env created from .env.example — please review and set secure values before continuing."
  warn "  Edit .env now, then re-run this script."
  exit 0
fi

info ".env found."

# Load env vars for directory creation (handles spaces, quotes, CRLF)
while IFS= read -r line || [ -n "$line" ]; do
  # Strip carriage returns (Windows CRLF line endings)
  line="${line%$'\r'}"
  # Strip inline comments
  line="${line%%#*}"
  # Skip lines without =
  case "$line" in *=*) ;; *) continue ;; esac
  # Extract key and strip all whitespace from it
  key=$(printf '%s' "${line%%=*}" | tr -d ' \t\r')
  value="${line#*=}"
  # Skip empty or syntactically invalid keys
  case "$key" in
    ''|*[!A-Za-z0-9_]*) continue ;;
  esac
  # Strip surrounding quotes from value
  case "$value" in
    '"'*'"') value="${value#\"}"; value="${value%\"}" ;;
    "'"*"'") value="${value#\'}"; value="${value%\'}" ;;
  esac
  eval "$key=\$value" && export "$key"
done < .env

# ── 3. Data directories ───────────────────────────────────────────────────────
section "Creating data directories"

DB_TYPE="${DB_TYPE:-postgres}"

UPLOADS_DATA_DIR="${UPLOADS_DATA_DIR:-./data/uploads}"
mkdir -p "$UPLOADS_DATA_DIR"
info "Uploads data    → $UPLOADS_DATA_DIR"

if [ "$DB_TYPE" = "sqlite" ]; then
  SQLITE_DIR="${SQLITE_DATA_DIR:-./data/sqlite}"
  mkdir -p "$SQLITE_DIR"
  info "SQLite data     → $SQLITE_DIR (no separate DB container needed)"
else
  info "PostgreSQL data → container named volumes (pg-data, pg-demo-data)"
fi

# ── 4. Build & start ──────────────────────────────────────────────────────────
section "Building and starting ResearchVault"

# Choose compose override file based on DB_TYPE
if [ "$DB_TYPE" = "sqlite" ]; then
  COMPOSE_OVERRIDE="-f docker-compose.yml -f docker-compose.sqlite.yml"
  info "Database mode: SQLite (${COMPOSE_OVERRIDE})"
else
  COMPOSE_OVERRIDE=""
  info "Database mode: PostgreSQL"
  # Pull base images for both databases
  $COMPOSE_CMD $COMPOSE_OVERRIDE pull postgres postgres-demo
fi

# Build BOTH app images — app-demo runs the seed on first start, so it must be
# rebuilt whenever migrations or seed data change.
info "Building production app..."
$COMPOSE_CMD $COMPOSE_OVERRIDE build app
info "Building demo app..."
$COMPOSE_CMD $COMPOSE_OVERRIDE build app-demo

$COMPOSE_CMD $COMPOSE_OVERRIDE up -d

# ── 5. Health check ───────────────────────────────────────────────────────────
section "Waiting for the app to be ready"

NGINX_PORT=80
RETRIES=40
i=0
until curl -sf "http://localhost:${NGINX_PORT}/api/health/database" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge "$RETRIES" ]; then
    printf "\n"
    error "App did not become healthy after ${RETRIES} attempts. Run '${COMPOSE_CMD} logs app' to investigate."
  fi
  printf "."
  sleep 3
done
printf "\n"

# Also wait briefly for the demo app to finish seeding
DEMO_PORT="${DEMO_PORT:-8080}"
info "Waiting for demo app (port ${DEMO_PORT})..."
j=0
until curl -sf "http://localhost:${DEMO_PORT}/api/health/database" >/dev/null 2>&1; do
  j=$((j + 1))
  if [ "$j" -ge 20 ]; then
    warn "Demo app didn't respond in time — it may still be seeding. Check: ${COMPOSE_CMD} logs app-demo"
    break
  fi
  printf "."
  sleep 3
done
printf "\n"

APP_URL="${APP_URL:-http://localhost}"
DEMO_APP_URL="${DEMO_APP_URL:-http://localhost:${DEMO_PORT}}"

info "Production app → ${APP_URL}"
info "Demo app       → ${DEMO_APP_URL}  (or ${APP_URL}/demo)"
info ""
info "To view logs:       ${COMPOSE_CMD} logs -f"
info "To view demo logs:  ${COMPOSE_CMD} logs -f app-demo"
info "To stop:            ${COMPOSE_CMD} down"
info "To update later:    git pull && ${COMPOSE_CMD} build app app-demo && ${COMPOSE_CMD} up -d"
