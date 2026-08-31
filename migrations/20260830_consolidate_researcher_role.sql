-- Consolidate the bench and support research access roles into one "Researcher"
-- role: Staff Scientist, Postdoctoral Researcher, PhD Student, Research
-- Specialist, Research Associate and Research Assistant.
--
-- Investigator is deliberately NOT folded in — it carries responsibilities the
-- others do not.
--
-- Job titles are unaffected. A person stays a "Postdoctoral Researcher" on their
-- profile while holding the "Researcher" access role; the two lists are now
-- separate, and shared/constants.ts maps between them.
--
-- Anyone holding a retired role is returned to the default "user" role rather
-- than being auto-mapped, so an administrator makes a deliberate choice about
-- each person in User Management. "user" is restricted by default, so this fails
-- closed: nobody silently keeps access through a role that no longer exists.
--
-- Idempotent: the entrypoint replays every migration on each container start.

BEGIN;

-- 1. Ensure the consolidated role exists.
INSERT INTO role_groups (name, description)
VALUES ('Researcher', 'Bench and support research staff')
ON CONFLICT (name) DO NOTHING;

-- 2. Merge the matrix. Where the retired roles disagreed on an area, take the
--    most permissive level so the consolidated role is not accidentally
--    narrower than what its members previously had.
WITH ranked AS (
  SELECT
    rp.navigation_item,
    rp.access_level,
    CASE rp.access_level WHEN 'edit' THEN 3 WHEN 'view' THEN 2 ELSE 1 END AS rank
  FROM role_permissions rp
  JOIN role_groups rg ON rg.id = rp.role_group_id
  WHERE rg.name IN (
    'Staff Scientist', 'Postdoctoral Researcher', 'PhD Student',
    'Research Specialist', 'Research Associate', 'Research Assistant'
  )
),
best AS (
  SELECT DISTINCT ON (navigation_item) navigation_item, access_level
  FROM ranked
  ORDER BY navigation_item, rank DESC
)
INSERT INTO role_permissions (role_group_id, navigation_item, access_level)
SELECT (SELECT id FROM role_groups WHERE name = 'Researcher'),
       best.navigation_item,
       best.access_level
FROM best
ON CONFLICT (role_group_id, navigation_item) DO UPDATE
  SET access_level = CASE
        WHEN CASE EXCLUDED.access_level WHEN 'edit' THEN 3 WHEN 'view' THEN 2 ELSE 1 END
           > CASE role_permissions.access_level WHEN 'edit' THEN 3 WHEN 'view' THEN 2 ELSE 1 END
        THEN EXCLUDED.access_level
        ELSE role_permissions.access_level
      END,
      updated_at = now();

-- 3. Return holders of a retired role to the default. Their profile job title is
--    left untouched, so an administrator can see what each person actually does
--    when reassigning them.
UPDATE users
SET role = 'user', updated_at = now()
WHERE role IN (
  'Staff Scientist', 'Postdoctoral Researcher', 'PhD Student',
  'Research Specialist', 'Research Associate', 'Research Assistant'
);

-- 4. Drop the retired roles from any secondary-role assignments.
DELETE FROM user_role_assignments
WHERE role_group_id IN (
  SELECT id FROM role_groups WHERE name IN (
    'Staff Scientist', 'Postdoctoral Researcher', 'PhD Student',
    'Research Specialist', 'Research Associate', 'Research Assistant'
  )
);

-- 5. Retire the roles themselves. Their matrix rows go with them; step 2 has
--    already carried the access forward.
DELETE FROM role_permissions
WHERE role_group_id IN (
  SELECT id FROM role_groups WHERE name IN (
    'Staff Scientist', 'Postdoctoral Researcher', 'PhD Student',
    'Research Specialist', 'Research Associate', 'Research Assistant'
  )
);

DELETE FROM role_groups
WHERE name IN (
  'Staff Scientist', 'Postdoctoral Researcher', 'PhD Student',
  'Research Specialist', 'Research Associate', 'Research Assistant'
);

COMMIT;
