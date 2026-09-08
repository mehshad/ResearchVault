-- Researcher or clinician becomes a fact about the person.
--
-- It was asked once per grant, and 272 grants carried an answer. That is 272
-- chances for one person to be described two ways, and it duplicated something
-- that does not vary by grant: somebody is a clinician or they are not.
--
-- The grant form now shows this value read-only from the selected Sidra Lead
-- PI, so nobody retypes it and there is one place to correct it. The grants
-- column and its import/export column are left exactly as they are -- the
-- existing values stay readable, and any file carrying that column still
-- imports.
--
-- Backfilled from the grants themselves, by majority of each person's own
-- grants. Of the 38 staff who lead a grant carrying a type, 37 are described
-- the same way on every one of them. The one exception -- three grants saying
-- Clinician and one saying Researcher, for somebody whose job title is
-- "Physician" -- resolves to Clinician on both the majority and the job title,
-- which is why a plain majority is enough here and a report of conflicts would
-- have been ceremony.
--
-- Ties are left null rather than guessed. Null means nobody has said, which is
-- the honest state for the staff who have never led a grant, and the field is
-- editable on the staff profile.
--
-- Reaches production through docker-entrypoint.sh.

ALTER TABLE "scientists"
  ADD COLUMN IF NOT EXISTS "investigator_type" text;

ALTER TABLE "scientists"
  DROP CONSTRAINT IF EXISTS "scientists_investigator_type_valid";
ALTER TABLE "scientists"
  ADD CONSTRAINT "scientists_investigator_type_valid"
  CHECK ("investigator_type" IS NULL OR "investigator_type" IN ('Researcher', 'Clinician'));

WITH counted AS (
  SELECT lpi_id, investigator_type, count(*) AS n
  FROM "grants"
  WHERE lpi_id IS NOT NULL
    AND investigator_type IN ('Researcher', 'Clinician')
  GROUP BY lpi_id, investigator_type
),
ranked AS (
  SELECT lpi_id, investigator_type, n,
         row_number() OVER (PARTITION BY lpi_id ORDER BY n DESC) AS place,
         max(n) OVER (PARTITION BY lpi_id) AS top_n
  FROM counted
),
winners AS (
  SELECT lpi_id, investigator_type,
         -- How many answers share the top count. More than one is a tie.
         count(*) OVER (PARTITION BY lpi_id) AS tied_at_top
  FROM ranked
  WHERE n = top_n
)
UPDATE "scientists" AS s
SET "investigator_type" = winners.investigator_type
FROM winners
WHERE winners.lpi_id = s.id
  -- A genuine tie says nothing, so it is left null rather than decided by
  -- whichever row the planner happened to order first.
  AND winners.tied_at_top = 1
  AND s."investigator_type" IS NULL;
