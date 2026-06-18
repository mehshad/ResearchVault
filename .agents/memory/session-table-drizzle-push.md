---
name: connect-pg-simple session table dropped by drizzle-kit push
description: Why the app suddenly throws "relation \"session\" does not exist" and how to fix it.
---

Symptom: app/preview breaks with repeated `error: relation "session" does not exist` from connect-pg-simple (`PGStore._asyncQuery`). API GETs may still return 200, but anything touching the session store errors.

**Cause:** The `session` table used by `connect-pg-simple` is NOT in `shared/schema.ts`. A `drizzle-kit push` (e.g. during post-merge setup) treats it as an extraneous table and drops it. `createTableIfMissing: true` in `server/index.ts` does not reliably recreate it after a drop, so the errors persist until the table is restored.

**Durable fix (in place):** `scripts/post-merge.sh` now recreates the `session` table (idempotent `CREATE TABLE IF NOT EXISTS` + index) right after `drizzle-kit push --force`, so every merge self-heals. If you see this error again, first confirm that block still exists in the post-merge script.

**Manual fix (if it ever recurs):** Recreate the table directly (idempotent), then restart the workflow:
```sql
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
```

**Why this matters beyond the preview:** role-protected routes (e.g. `requirePublicationOfficer` on `/api/publications/discover`) depend on the session store; when the table is gone those endpoints fail, so features like the "Find Papers" tab break even though basic GETs return 200.

**How to apply:** Whenever a post-merge `drizzle-kit push` runs against this DB, the session table is at risk. If the preview or a session-gated feature breaks after a merge, check for this error first before touching app code.
