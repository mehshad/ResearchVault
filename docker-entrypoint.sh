#!/bin/sh
set -e

DB_HOST="${DB_HOST:-postgres}"
DB_USER="${DB_USER:-postgres}"

echo "==> Waiting for PostgreSQL at ${DB_HOST}..."
until pg_isready -h "${DB_HOST}" -U "${DB_USER}" > /dev/null 2>&1; do
  sleep 2
done
echo "==> PostgreSQL is ready."

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
    "migrations/20260615_ibc_missing_columns.sql"; do
  if [ -f "/app/$migration" ]; then
    echo "  Applying $migration..."
    psql "$DATABASE_URL" -f "/app/$migration" -v ON_ERROR_STOP=0 2>&1 | grep -v "^$\|already exists\|does not exist\|NOTICE" || true
  fi
done
echo "==> Migrations complete."

# In demo mode, seed sample data so the app is populated out of the box.
if [ "${AUTH_MODE:-local}" = "demo" ]; then
  echo "==> Seeding demo data..."
  psql "$DATABASE_URL" -f "/app/migrations/demo_seed_data.sql" -v ON_ERROR_STOP=0 2>&1 | grep -v "^$\|already exists\|does not exist\|NOTICE\|duplicate key" || true
  echo "==> Demo data seeded."
fi

echo "==> Starting ResearchVault..."
exec node dist/index.js
