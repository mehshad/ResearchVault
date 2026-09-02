-- Grant provenance columns, and the "Not Awarded" status.
--
-- Both reach production through this file rather than through drizzle-kit push:
-- docker-entrypoint.sh applies the migration list and never runs push, so a
-- schema change that exists only in shared/schema.ts is present in development
-- and absent in production. Idempotent, like every migration in that list.

-- ── Provenance ──────────────────────────────────────────────────────────────
-- Who added a grant and who last changed it. The Research Office both imports
-- grants in bulk and enters them by hand, and nothing recorded which: the only
-- way to tell was to look for rows sharing an exact created_at, because a bulk
-- apply runs in one transaction.
--
-- Nullable on purpose. Rows that predate this, and rows restored from an
-- archive taken before it, have no creator to name.
ALTER TABLE "grants"
  ADD COLUMN IF NOT EXISTS "created_by_user_id" integer,
  ADD COLUMN IF NOT EXISTS "updated_by_user_id" integer;

-- Constraint names follow Drizzle's convention
-- (<table>_<column>_<reftable>_<refcolumn>_fk). A mismatch makes drizzle-kit
-- push believe the constraint is missing and try to recreate it, which prompts,
-- and a prompt with stdin closed fails the post-merge setup.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grants_created_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "grants"
      ADD CONSTRAINT "grants_created_by_user_id_users_id_fk"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'grants_updated_by_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "grants"
      ADD CONSTRAINT "grants_updated_by_user_id_users_id_fk"
      FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id");
  END IF;
END $$;

-- ── "Not Awarded" ───────────────────────────────────────────────────────────
-- A funding decision that came back negative, kept distinct from Rejected, plus
-- the post-award endings the Research Office already records: a grant that was
-- won and then withdrawn, terminated, transferred or suspended.
--
-- drizzle-kit push does NOT alter an existing CHECK constraint: it reported
-- "changes applied" while leaving the old eight values in place, so a grant
-- saved as not_awarded would have been refused by the database. Dropped and
-- recreated explicitly.
ALTER TABLE "grants" DROP CONSTRAINT IF EXISTS "grants_status_valid";
ALTER TABLE "grants"
  ADD CONSTRAINT "grants_status_valid"
  CHECK ("status" IN (
    'submitted', 'pending', 'in_review',
    'awarded', 'active', 'completed',
    'not_awarded', 'rejected', 'cancelled',
    'withdrawn', 'terminated', 'transferred', 'suspended'
  ));
