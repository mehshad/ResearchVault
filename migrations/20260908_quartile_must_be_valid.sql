-- A quartile is Q1, Q2, Q3, Q4, or nothing at all.
--
-- One row in production -- CLASSICAL REVIEW, year 2024 -- carries the literal
-- string "N/A". It has been in every archive taken so far, and it costs the
-- whole Research Output restore: the bulk importer validates quartile against
-- Q1-Q4, a section applies atomically, so that single row takes all of the
-- section's publications, impact-factor rows and author links with it unless
-- the operator ticks "skip the rows that failed validation".
--
-- It could not be corrected in the interface either, because
-- getJournalImpactFactors joins only the newest year per journal, which leaves
-- the row unreachable.
--
-- Two doors, disagreeing. The bulk importer refuses a quartile that is not
-- Q1-Q4; POST /api/journal-impact-factors/import-csv passed `row.quartile`
-- straight through with no check at all. So the CSV importer could write a
-- value that the bulk importer would then refuse to restore -- a database that
-- cannot be reloaded from its own export.
--
-- This closes it at the column, which is the one place every door has to pass
-- through. Empty stays allowed: a missing quartile is a fact about the data
-- (the office's 2022 file has no category column at all, so 9,483 rows have
-- none) and blocks nothing. It is only a *wrong* value that breaks things.
--
-- Written to be safe to re-run, and to clean before it constrains so it cannot
-- fail on the very row it exists to fix.
--
-- Reaches production through docker-entrypoint.sh.

UPDATE "journal_impact_factor_metrics"
SET "quartile" = NULL
WHERE "quartile" IS NOT NULL
  AND "quartile" !~ '^Q[1-4]$';

ALTER TABLE "journal_impact_factor_metrics"
  DROP CONSTRAINT IF EXISTS "journal_impact_factor_metrics_quartile_valid";

ALTER TABLE "journal_impact_factor_metrics"
  ADD CONSTRAINT "journal_impact_factor_metrics_quartile_valid"
  CHECK ("quartile" IS NULL OR "quartile" ~ '^Q[1-4]$');
