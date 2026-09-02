-- Collaborating institutions on a grant, and the people at each of them.
--
-- Replaces grants.collaborators, a text array holding whatever was typed into a
-- free-text box. Every value in it was in practice an institution name, with
-- nowhere to record who at that institution was involved.
--
-- Idempotent, and reaches production through docker-entrypoint.sh: that script
-- applies this list and never runs drizzle-kit push, so a table that exists
-- only in shared/schema.ts would be present in development and absent in
-- production.

CREATE TABLE IF NOT EXISTS "grant_collaborating_institutions" (
  "id" serial PRIMARY KEY,
  "grant_id" integer NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "grant_institution_collaborators" (
  "id" serial PRIMARY KEY,
  "institution_id" integer NOT NULL,
  "name" text NOT NULL,
  "role" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Constraint names follow Drizzle's convention, or drizzle-kit push believes
-- they are missing, tries to recreate them, and prompts -- which fails the
-- post-merge setup with stdin closed.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grant_collaborating_institutions_grant_id_grants_id_fk') THEN
    ALTER TABLE "grant_collaborating_institutions"
      ADD CONSTRAINT "grant_collaborating_institutions_grant_id_grants_id_fk"
      FOREIGN KEY ("grant_id") REFERENCES "grants"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grant_collaborating_institutions_grant_id_name_unique') THEN
    -- Naming the same partner twice on one grant is a mistake, not a second
    -- collaboration. Also what the backfill below relies on to stay idempotent.
    ALTER TABLE "grant_collaborating_institutions"
      ADD CONSTRAINT "grant_collaborating_institutions_grant_id_name_unique"
      UNIQUE ("grant_id", "name");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grant_institution_collaborators_institution_id_grant_collaborating_institutions_id_fk') THEN
    ALTER TABLE "grant_institution_collaborators"
      ADD CONSTRAINT "grant_institution_collaborators_institution_id_grant_collaborating_institutions_id_fk"
      FOREIGN KEY ("institution_id") REFERENCES "grant_collaborating_institutions"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "grant_collaborating_institutions_grant_id_idx"
  ON "grant_collaborating_institutions" ("grant_id");
CREATE INDEX IF NOT EXISTS "grant_institution_collaborators_institution_id_idx"
  ON "grant_institution_collaborators" ("institution_id");

-- No backfill. grants.collaborators was never in real use, so there is nothing
-- worth carrying across; the column is left in place and untouched rather than
-- dropped, so whatever it does hold is still recoverable.

-- ── Sidra Medicine co-investigators ─────────────────────────────────────────
-- Replaces grants.co_investigators, a text array of typed names. These are our
-- own staff, so they are links to scientist records rather than strings: a name
-- in a box could not be counted, filtered, or shown on that person's profile,
-- and spelling decided whether two rows meant the same colleague.
--
-- The old column is left in place and untouched, as with collaborators.
CREATE TABLE IF NOT EXISTS "grant_co_investigators" (
  "id" serial PRIMARY KEY,
  "grant_id" integer NOT NULL,
  "scientist_id" integer NOT NULL,
  "role" text,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grant_co_investigators_grant_id_grants_id_fk') THEN
    ALTER TABLE "grant_co_investigators"
      ADD CONSTRAINT "grant_co_investigators_grant_id_grants_id_fk"
      FOREIGN KEY ("grant_id") REFERENCES "grants"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grant_co_investigators_scientist_id_scientists_id_fk') THEN
    ALTER TABLE "grant_co_investigators"
      ADD CONSTRAINT "grant_co_investigators_scientist_id_scientists_id_fk"
      FOREIGN KEY ("scientist_id") REFERENCES "scientists"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grant_co_investigators_grant_id_scientist_id_unique') THEN
    ALTER TABLE "grant_co_investigators"
      ADD CONSTRAINT "grant_co_investigators_grant_id_scientist_id_unique"
      UNIQUE ("grant_id", "scientist_id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "grant_co_investigators_grant_id_idx"
  ON "grant_co_investigators" ("grant_id");
CREATE INDEX IF NOT EXISTS "grant_co_investigators_scientist_id_idx"
  ON "grant_co_investigators" ("scientist_id");
