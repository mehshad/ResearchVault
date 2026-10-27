-- #48: publications.status and research_activities.status were free text; a
-- typo could invent a workflow stage. Each gets a CHECK listing the values the
-- application knows (shared/publicationWorkflow.ts PUBLICATION_STATUS_VALUES
-- and shared/schema.ts RESEARCH_ACTIVITY_STATUS_VALUES; a test keeps this file
-- and those lists equal).
--
-- Added NOT VALID first, so a production database carrying a stray value keeps
-- running: new rows are checked at once, and the VALIDATE below either
-- succeeds or leaves the constraint NOT VALID and says which values to fix.
-- Safe to re-run.

DO $$
DECLARE
  bad text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'publications_status_valid') THEN
    ALTER TABLE publications ADD CONSTRAINT publications_status_valid CHECK (
      status IN (
        'Concept', 'Complete Draft', 'Vetted for submission',
        'Submitted for review with pre-publication', 'Submitted for review without pre-publication',
        'Under review', 'Accepted/In Press', 'Published', 'Published *',
        'Published - Invalid', 'Withdrawn'
      )
    ) NOT VALID;
  END IF;
  BEGIN
    ALTER TABLE publications VALIDATE CONSTRAINT publications_status_valid;
  EXCEPTION WHEN check_violation THEN
    SELECT string_agg(DISTINCT coalesce(status, '<null>'), ', ') INTO bad
      FROM publications
      WHERE status NOT IN (
        'Concept', 'Complete Draft', 'Vetted for submission',
        'Submitted for review with pre-publication', 'Submitted for review without pre-publication',
        'Under review', 'Accepted/In Press', 'Published', 'Published *',
        'Published - Invalid', 'Withdrawn'
      );
    RAISE WARNING 'publications_status_valid left NOT VALID: rows carry status values outside the workflow: %', bad;
  END;
END $$;

DO $$
DECLARE
  bad text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'research_activities_status_valid') THEN
    ALTER TABLE research_activities ADD CONSTRAINT research_activities_status_valid CHECK (
      status IN ('planning', 'active', 'completed', 'on_hold')
    ) NOT VALID;
  END IF;
  BEGIN
    ALTER TABLE research_activities VALIDATE CONSTRAINT research_activities_status_valid;
  EXCEPTION WHEN check_violation THEN
    SELECT string_agg(DISTINCT coalesce(status, '<null>'), ', ') INTO bad
      FROM research_activities
      WHERE status NOT IN ('planning', 'active', 'completed', 'on_hold');
    RAISE WARNING 'research_activities_status_valid left NOT VALID: rows carry status values outside the list: %', bad;
  END;
END $$;
