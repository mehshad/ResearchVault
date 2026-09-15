-- Rename leadPIId to principalInvestigatorId in research_activities, add the
-- lead scientist and the programme role columns, and rename the project lead.
--
-- Rewritten to be re-run safe. The entrypoint replays every migration on each
-- start, and this file used to rename columns unconditionally: the second run
-- said "column lead_pi_id does not exist", which was filtered out with every
-- other error. Now each rename happens only while the old name is present.
--
-- The last step also has to work on a fresh database, where this file runs
-- BEFORE rename_project_groups.sql and the table is still called
-- project_groups. Unguarded, the rename failed there ("relation projects does
-- not exist"), was swallowed, and only applied on the next restart.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'research_activities' AND column_name = 'lead_pi_id') THEN
    ALTER TABLE research_activities RENAME COLUMN lead_pi_id TO principal_investigator_id;
  END IF;
END $$;

ALTER TABLE research_activities ADD COLUMN IF NOT EXISTS lead_scientist_id INTEGER;

ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS program_director_id INTEGER,
  ADD COLUMN IF NOT EXISTS research_co_lead_id INTEGER,
  ADD COLUMN IF NOT EXISTS clinical_co_lead_1_id INTEGER,
  ADD COLUMN IF NOT EXISTS clinical_co_lead_2_id INTEGER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'projects' AND column_name = 'lead_scientist_id') THEN
    ALTER TABLE projects RENAME COLUMN lead_scientist_id TO principal_investigator_id;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'project_groups' AND column_name = 'lead_scientist_id') THEN
    ALTER TABLE project_groups RENAME COLUMN lead_scientist_id TO principal_investigator_id;
  END IF;
END $$;
