-- Migration: 20260615_schema_sync.sql
-- Adds all columns that exist in shared/schema.ts but are not covered by any
-- prior migration file. Excludes ibc_applications and publications (handled by
-- 20260615_ibc_missing_columns.sql and 20260615_publications_missing_columns.sql).
-- Safe to re-run: all statements use IF NOT EXISTS / DO $$ guards.

-- ── irb_applications ─────────────────────────────────────────────────────────
-- The base migration + 20260609_add_missing_columns.sql cover many columns but
-- omit these fields that are present in the Drizzle schema.

ALTER TABLE irb_applications ADD COLUMN IF NOT EXISTS submission_type         text DEFAULT 'initial';
ALTER TABLE irb_applications ADD COLUMN IF NOT EXISTS version                 integer DEFAULT 1;
ALTER TABLE irb_applications ADD COLUMN IF NOT EXISTS vulnerable_populations  text[];
ALTER TABLE irb_applications ADD COLUMN IF NOT EXISTS study_design            text;
ALTER TABLE irb_applications ADD COLUMN IF NOT EXISTS data_collection_methods text[];
ALTER TABLE irb_applications ADD COLUMN IF NOT EXISTS expected_participants   integer;
ALTER TABLE irb_applications ADD COLUMN IF NOT EXISTS study_duration          text;
ALTER TABLE irb_applications ADD COLUMN IF NOT EXISTS funding_source          text;
ALTER TABLE irb_applications ADD COLUMN IF NOT EXISTS conflict_of_interest    boolean DEFAULT false;
ALTER TABLE irb_applications ADD COLUMN IF NOT EXISTS multi_site              boolean DEFAULT false;
ALTER TABLE irb_applications ADD COLUMN IF NOT EXISTS international_sites     boolean DEFAULT false;
ALTER TABLE irb_applications ADD COLUMN IF NOT EXISTS review_comments         json;
ALTER TABLE irb_applications ADD COLUMN IF NOT EXISTS requires_monitoring     boolean DEFAULT false;
ALTER TABLE irb_applications ADD COLUMN IF NOT EXISTS monitoring_frequency    text;
ALTER TABLE irb_applications ADD COLUMN IF NOT EXISTS reporting_requirements  text[];
ALTER TABLE irb_applications ADD COLUMN IF NOT EXISTS protocol_team_members   json;

-- ── research_activities ───────────────────────────────────────────────────────
-- budget_source was created as plain text in the base migration; the schema
-- declares it as text[]. Cast the column to text[] so Drizzle queries work.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'research_activities'
      AND column_name = 'budget_source'
      AND data_type = 'text'
      AND udt_name != '_text'
  ) THEN
    ALTER TABLE research_activities ALTER COLUMN budget_source TYPE text[]
      USING CASE WHEN budget_source IS NULL THEN NULL ELSE ARRAY[budget_source] END;
  END IF;
END $$;
