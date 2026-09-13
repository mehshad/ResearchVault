-- Additional SDR links on a publication.
--
-- publications.research_activity_id stays the primary link: the one the
-- score, the exemption rule and the finalise check read. A paper can belong
-- to more than one SDR -- a collaboration between two activities produces
-- one paper, and each SDR should list it -- so a publication may also carry
-- any number of additional links here. They are optional.
--
-- Idempotent, and reaches production through docker-entrypoint.sh: that
-- script applies this list and never runs drizzle-kit push, so a table that
-- exists only in shared/schema.ts would be present in development and absent
-- in production.

CREATE TABLE IF NOT EXISTS "publication_research_activities" (
  "id" serial PRIMARY KEY,
  "publication_id" integer NOT NULL,
  "research_activity_id" integer NOT NULL,
  "created_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "publication_research_activity_idx"
  ON "publication_research_activities" ("publication_id", "research_activity_id");
