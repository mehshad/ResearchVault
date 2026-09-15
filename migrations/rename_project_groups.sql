-- Rename project_groups to projects, and its foreign key column with it.
--
-- ALTER TABLE IF EXISTS guards the table, not the column: once the column had
-- been renamed, every restart failed here with "column project_group_id does
-- not exist" (silently, until the entrypoint started checking). The column
-- renames run only while the old name is present.

ALTER TABLE IF EXISTS project_groups RENAME TO projects;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'projects' AND column_name = 'project_group_id') THEN
    ALTER TABLE projects RENAME COLUMN project_group_id TO project_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'research_activities' AND column_name = 'project_group_id') THEN
    ALTER TABLE research_activities RENAME COLUMN project_group_id TO project_id;
  END IF;
END $$;
