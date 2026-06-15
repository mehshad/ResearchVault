#!/bin/sh
# ResearchVault — first-time setup script
# Run as a user with Docker and sudo privileges.
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

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
section "Checking prerequisites"

command -v docker  >/dev/null 2>&1 || error "Docker is not installed. Install it from https://docs.docker.com/get-docker/"
docker compose version >/dev/null 2>&1 || error "Docker Compose v2 is required. Update Docker Desktop or install the plugin."

info "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
info "Docker Compose $(docker compose version --short)"

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

# PostgreSQL data is stored in Docker named volumes (pg-data, pg-demo-data) —
# managed by Docker, not the host filesystem. Use `docker compose down -v` to wipe them.
UPLOADS_DATA_DIR="${UPLOADS_DATA_DIR:-./data/uploads}"
mkdir -p "$UPLOADS_DATA_DIR"
info "Uploads data    → $UPLOADS_DATA_DIR"
info "PostgreSQL data → Docker named volumes (pg-data, pg-demo-data)"

# ── 4. Build & start ──────────────────────────────────────────────────────────
section "Building and starting ResearchVault"

# Pull base images for both databases
docker compose pull postgres postgres-demo

# Build BOTH app images — app-demo runs the seed on first start, so it must be
# rebuilt whenever migrations or seed data change.
info "Building production app..."
docker compose build app
info "Building demo app..."
docker compose build app-demo

docker compose up -d

# ── 5. Health check ───────────────────────────────────────────────────────────
section "Waiting for the app to be ready"

# The app is fronted by nginx on port 80 (not port 5000 which is internal-only).
NGINX_PORT=80
RETRIES=40
i=0
until curl -sf "http://localhost:${NGINX_PORT}/api/health/database" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge "$RETRIES" ]; then
    printf "\n"
    error "App did not become healthy after ${RETRIES} attempts. Run 'docker compose logs app' to investigate."
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
    warn "Demo app didn't respond in time — it may still be seeding. Check: docker compose logs app-demo"
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
info "To view logs:       docker compose logs -f"
info "To view demo logs:  docker compose logs -f app-demo"
info "To stop:            docker compose down"
info "To update later:    git pull && docker compose build app app-demo && docker compose up -d"
