---
name: connect-pg-simple session table dropped by drizzle-kit push
description: Why the app suddenly throws "relation \"session\" does not exist" and how to fix it.
---

Symptom: app/preview breaks with repeated `error: relation "session" does not exist` from connect-pg-simple (`PGStore._asyncQuery`). API GETs may still return 200, but anything touching the session store errors.

**Cause:** The `session` table used by `connect-pg-simple` is NOT in `shared/schema.ts`. A `drizzle-kit push` (e.g. during post-merge setup) treats it as an extraneous table and drops it. `createTableIfMissing: true` in `server/index.ts` does not reliably recreate it after a drop, so the errors persist until the table is restored.

**Fix:** Recreate the table directly (idempotent), then restart the workflow:
```sql
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
) WITH (OIDS=FALSE);
-- add PK session_pkey on (sid) if missing; CREATE INDEX IF NOT EXISTS IDX_session_expire ON session(expire)
```

**How to apply:** Whenever a post-merge `drizzle-kit push` runs against this DB, the session table is at risk. If the preview breaks after a merge, check for this error first before touching app code.
