#!/bin/bash
set -e
npm install
npx drizzle-kit push --force

# The express-session store (connect-pg-simple) uses a `session` table that is
# intentionally NOT part of the Drizzle schema. `drizzle-kit push --force` drops
# any table it doesn't know about, so we recreate it here after every push.
# Idempotent: safe to run when the table already exists.
if [ -z "$DATABASE_URL" ]; then
  echo "post-merge: DATABASE_URL is not set; cannot ensure session table" >&2
  exit 1
fi
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
SQL
