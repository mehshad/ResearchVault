-- manuscript_history.changed_by is the account that made the change.
--
-- The column was documented as "references scientists.id", but every writer
-- stores a user id, and with no foreign key it also held 0 (a bulk restore
-- with no actor) and the legacy default 1. The history read route left-joined
-- users AND scientists on the same value and preferred the user's name, so a
-- row written with a scientist id by an older path showed the wrong person.
--
-- Now nullable, a users foreign key that clears itself when the account goes,
-- and every value that names no account becomes NULL rather than pretending.
ALTER TABLE "manuscript_history" ALTER COLUMN "changed_by" DROP NOT NULL;

UPDATE "manuscript_history"
SET "changed_by" = NULL
WHERE "changed_by" IS NOT NULL
  AND ("changed_by" <= 0 OR NOT EXISTS (SELECT 1 FROM "users" u WHERE u.id = "manuscript_history"."changed_by"));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manuscript_history_changed_by_users_id_fk') THEN
    ALTER TABLE "manuscript_history"
      ADD CONSTRAINT "manuscript_history_changed_by_users_id_fk"
      FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;
