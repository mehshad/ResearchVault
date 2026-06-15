-- Migration: 20260611_role_groups.sql
-- Adds role_groups and user_role_assignments tables.
-- Migrates role_permissions from job_title (free-text) to role_group_id (FK).
-- Adds updated_by column to role_permissions.
-- Expands access_level to include "create".

-- ─── 1. Create role_groups table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_groups (
  id          serial PRIMARY KEY,
  name        text   NOT NULL UNIQUE,
  description text,
  created_at  timestamp DEFAULT now(),
  updated_at  timestamp DEFAULT now()
);

-- ─── 2. Create user_role_assignments table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_role_assignments (
  id            serial PRIMARY KEY,
  user_id       integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_group_id integer NOT NULL REFERENCES role_groups(id) ON DELETE CASCADE,
  assigned_by   integer REFERENCES users(id),
  assigned_at   timestamp DEFAULT now(),
  UNIQUE (user_id, role_group_id)
);

-- ─── 3. Add role_group_id (nullable initially) and updated_by to role_permissions ──
ALTER TABLE role_permissions
  ADD COLUMN IF NOT EXISTS role_group_id integer REFERENCES role_groups(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS updated_by    integer REFERENCES users(id);

-- ─── 4. Seed role_groups from the canonical JOB_TITLES list ─────────────────
INSERT INTO role_groups (name) VALUES
  ('Investigator'),
  ('Staff Scientist'),
  ('Physician'),
  ('Research Specialist'),
  ('Research Associate'),
  ('Research Assistant'),
  ('Lab Manager'),
  ('Postdoctoral Researcher'),
  ('PhD Student'),
  ('Management'),
  ('IRB Board Member'),
  ('IBC Board Member'),
  ('PMO Officer'),
  ('IRB Officer'),
  ('IBC Officer'),
  ('Outcome Officer'),
  ('Grant Officer'),
  ('Contracts Officer')
ON CONFLICT (name) DO NOTHING;

-- ─── 5. Backfill role_group_id on existing role_permissions rows ─────────────
-- Guard: only run if job_title still exists (idempotent on re-runs after drop)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'role_permissions' AND column_name = 'job_title'
  ) THEN
    UPDATE role_permissions rp
    SET    role_group_id = rg.id
    FROM   role_groups rg
    WHERE  rp.job_title = rg.name
      AND  rp.role_group_id IS NULL;
  END IF;
END $$;

-- ─── 6. Drop rows that could not be matched (orphaned job_title values) ───────
--       (safe to delete — they would fail the NOT NULL constraint below anyway)
DELETE FROM role_permissions WHERE role_group_id IS NULL;

-- ─── 7. Make role_group_id NOT NULL, then drop job_title and old unique index ─
ALTER TABLE role_permissions
  ALTER COLUMN role_group_id SET NOT NULL;

-- Drop the old unique index if it exists (name used by Drizzle)
DROP INDEX IF EXISTS unique_job_title_nav_item;

-- Drop the job_title column
ALTER TABLE role_permissions
  DROP COLUMN IF EXISTS job_title;

-- ─── 8. Create new unique index on (role_group_id, navigation_item) ───────────
CREATE UNIQUE INDEX IF NOT EXISTS unique_role_group_nav_item
  ON role_permissions (role_group_id, navigation_item);
