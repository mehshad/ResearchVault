-- Add publication columns that exist in the Drizzle schema but are absent
-- from the production database. Safe to re-run (IF NOT EXISTS throughout).

-- pmid: PubMed ID for imported publications.
-- Note: an earlier migration added "pub_med_id" under a different name;
-- the schema uses "pmid", so we add the correct column here.
ALTER TABLE publications ADD COLUMN IF NOT EXISTS pmid                              text;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS vetted_for_submission_by_ip_office boolean DEFAULT false;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS prepublication_url               text;
ALTER TABLE publications ADD COLUMN IF NOT EXISTS prepublication_site              text;

-- Backfill pmid from pub_med_id if that column exists and pmid is still empty
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'publications' AND column_name = 'pub_med_id'
  ) THEN
    UPDATE publications SET pmid = pub_med_id WHERE pmid IS NULL AND pub_med_id IS NOT NULL;
  END IF;
END $$;
