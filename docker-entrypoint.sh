#!/bin/sh
set -e

# ── Database type detection ────────────────────────────────────────────────────
# DB_TYPE is set explicitly in docker-compose.sqlite.yml; otherwise infer from URL.
_db_type="${DB_TYPE:-}"
if [ -z "$_db_type" ]; then
  case "${DATABASE_URL:-}" in
    sqlite:*) _db_type="sqlite" ;;
    mssql:*)  _db_type="mssql"  ;;
    Server=*|server=*) _db_type="mssql" ;;
    *)        _db_type="postgres" ;;
  esac
fi

if [ "$_db_type" = "sqlite" ]; then
  # ── SQLite mode ──────────────────────────────────────────────────────────────
  _sqlite_path="${DATABASE_URL#sqlite:}"
  _sqlite_dir="$(dirname "$_sqlite_path")"
  mkdir -p "$_sqlite_dir"
  echo "==> SQLite mode: database at ${_sqlite_path}"
  echo "==> Migrations will be applied by the app on startup (drizzle push)."

elif [ "$_db_type" = "mssql" ]; then
  # ── SQL Server mode ───────────────────────────────────────────────────────────
  # Extract host and port from mssql:// URL for the readiness probe.
  # For ADO.NET-style connection strings, rely on MSSQL_HOST / MSSQL_PORT env vars.
  if echo "${DATABASE_URL}" | grep -q "^mssql://"; then
    _mssql_host=$(echo "${DATABASE_URL}" | sed 's|mssql://[^@]*@\([^:/]*\).*|\1|')
    _mssql_port=$(echo "${DATABASE_URL}" | sed 's|.*:\([0-9]*\)/.*|\1|; /^[0-9]*$/!s/.*/1433/')
  else
    _mssql_host="${MSSQL_HOST:-sqlserver}"
    _mssql_port="${MSSQL_PORT:-1433}"
  fi

  echo "==> Waiting for SQL Server at ${_mssql_host}:${_mssql_port}..."
  # Use /dev/tcp (bash built-in) — nc is not available in node:alpine images.
  # Falls back to a node one-liner if /dev/tcp is not supported by the shell.
  _tcp_check() {
    if (echo "" > /dev/tcp/"${_mssql_host}"/"${_mssql_port}") 2>/dev/null; then
      return 0
    fi
    # fallback: node
    node -e "
      const net = require('net');
      const s = net.createConnection(${_mssql_port}, '${_mssql_host}');
      s.on('connect', () => { s.destroy(); process.exit(0); });
      s.on('error', () => process.exit(1));
    " 2>/dev/null
  }
  until _tcp_check; do
    sleep 3
  done
  echo "==> SQL Server port is open."
  # Give SQL Server a few extra seconds to finish its own startup sequence
  # (it accepts TCP before it's fully ready to serve queries).
  sleep 5
  echo "==> SQL Server is ready."
  echo "==> Note: run migrations/mssql/0001_initial_schema.sql manually on a fresh database."
  echo "==>       See migrations/mssql/README.md for instructions."

else
  # ── PostgreSQL mode ──────────────────────────────────────────────────────────
  DB_HOST="${DB_HOST:-postgres}"
  DB_USER="${DB_USER:-postgres}"

  echo "==> Waiting for PostgreSQL at ${DB_HOST}..."
  until pg_isready -h "${DB_HOST}" -U "${DB_USER}" > /dev/null 2>&1; do
    sleep 2
  done
  echo "==> PostgreSQL is ready."

  # Verify we can actually authenticate — pg_isready only checks TCP connectivity.
  if ! psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1; then
    echo "==> ERROR: Cannot authenticate to the database."
    echo "    Check that POSTGRES_PASSWORD in your .env matches the password the"
    echo "    postgres data volume was initialised with."
    echo "    To reset the password run:"
    echo "      docker compose exec postgres psql -U postgres -c \"ALTER USER postgres WITH PASSWORD 'postgres';\""
    exit 1
  fi
fi

if [ "$_db_type" = "sqlite" ]; then
  # SQLite: server/db.ts auto-applies migrations/sqlite/0001_schema.sql on startup.
  echo "==> SQLite: schema applied by app on startup — skipping psql migration loop."

elif [ "$_db_type" = "mssql" ]; then
  # SQL Server: schema must be applied manually before first run.
  # See migrations/mssql/0001_initial_schema.sql and migrations/mssql/README.md.
  echo "==> SQL Server: psql migration loop skipped — use sqlcmd with migrations/mssql/."

else

echo "==> Running database migrations..."
# Run each migration file in order using psql.
# Files use IF NOT EXISTS / IF EXISTS so they are safe to re-run.
for migration in \
    "migrations/0000_nappy_vivisector.sql" \
    "migrations/20250515114712_add_staff_id/migration.sql" \
    "migrations/20250515_update_roles.sql" \
    "migrations/rename_project_groups.sql" \
    "migrations/remove_principal_investigator_from_research_activities.sql" \
    "migrations/add-dmp-number.sql" \
    "migrations/20260525_add_entra_auth_columns.sql" \
    "migrations/20260525_manuscript_history_backfill_note.sql" \
    "migrations/20260609_update_scientists_schema.sql" \
    "migrations/20260609_user_scientist_link.sql" \
    "migrations/20260609_missing_tables.sql" \
    "migrations/20260609_add_missing_columns.sql" \
    "migrations/20260611_role_groups.sql" \
    "migrations/20260611_ownership_overrides.sql" \
    "migrations/20260615_publications_missing_columns.sql" \
    "migrations/20260615_ibc_missing_columns.sql" \
    "migrations/20260615_schema_sync.sql" \
    "migrations/20260616_global_app_settings.sql" \
    "migrations/20260616_align_constraint_names.sql" \
    "migrations/20260618_add_publication_author_attribution.sql" \
    "migrations/manual/2026-08-18-org-structure.sql" \
    "migrations/20260816_publication_authors_attribution.sql" \
    "migrations/20260817_publications_alternate_dois.sql" \
    "migrations/20260817_fix_column_types.sql" \
    "migrations/20260819_add_investigator_designation.sql" \
    "migrations/20260820_grant_lifecycle_consistency.sql" \
    "migrations/20260823_add_user_last_login.sql" \
    "migrations/20260824_add_publication_creator.sql" \
    "migrations/20260825_add_grant_master_fields.sql" \
    "migrations/20260826_add_bulk_data_archives.sql" \
    "migrations/20260826_publications_authors_nullable.sql" \
    "migrations/20260827_add_publication_invalid_reason.sql" \
    "migrations/20260830_consolidate_research_officer.sql" \
    "migrations/20260830_consolidate_researcher_role.sql" \
    "migrations/20260830_role_permissions_foreign_key.sql" \
    "migrations/20260831_add_sdr_exemption.sql" \
    "migrations/20260831_audit_log.sql" \
    "migrations/20260831_consolidate_navigation_areas.sql" \
    "migrations/20260901_grant_audit_and_not_awarded.sql" \
    "migrations/20260901_grant_collaborating_institutions.sql" \
    "migrations/20260902_grant_external_lpi.sql" \
    "migrations/20260903_program_links.sql"; do
  if [ -f "/app/$migration" ]; then
    echo "  Applying $migration..."
    if [ "$migration" = "migrations/20260820_grant_lifecycle_consistency.sql" ] || \
       [ "$migration" = "migrations/20260826_add_bulk_data_archives.sql" ] || \
       [ "$migration" = "migrations/20260901_grant_audit_and_not_awarded.sql" ] || \
       [ "$migration" = "migrations/20260901_grant_collaborating_institutions.sql" ] || \
       [ "$migration" = "migrations/20260902_grant_external_lpi.sql" ] || \
       [ "$migration" = "migrations/20260831_audit_log.sql" ] || \
       [ "$migration" = "migrations/20260827_add_publication_invalid_reason.sql" ]; then
      # This migration installs lifecycle constraints and concurrency guards.
      # Do not start the application if those protections fail to apply.
      psql "$DATABASE_URL" -f "/app/$migration" -v ON_ERROR_STOP=1
    else
      psql "$DATABASE_URL" -f "/app/$migration" -v ON_ERROR_STOP=0 2>&1 | grep -v "^$\|already exists\|does not exist\|NOTICE" || true
    fi
  fi
done
echo "==> Migrations complete."

# In demo mode, seed sample data so the app is populated out of the box.
if [ "${AUTH_MODE:-local}" = "demo" ]; then
  echo "==> Seeding demo data..."
  psql "$DATABASE_URL" -f "/app/migrations/demo_seed_data.sql" -v ON_ERROR_STOP=0 2>&1 | grep -v "^$\|already exists\|does not exist\|NOTICE\|duplicate key" || true
  echo "==> Demo data seeded."
fi

fi  # end of postgres-only block

echo "==> Starting ResearchVault..."
exec node dist/index.js
