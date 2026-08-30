-- Consolidate "Grant Officer" and "Contracts Officer" into a single
-- "Research Officer" role covering grants and contracts.
--
-- The two roles differed in exactly two matrix cells (grants and scientists,
-- where Grant Officer held edit and Contracts Officer only view), and the
-- contracts guard was never applied to any endpoint, so nothing was enforcing
-- the separation. The merge takes the more permissive value of the two so no
-- existing holder loses access.
--
-- Idempotent: the entrypoint re-runs every migration on each container start.

BEGIN;

-- 1. Ensure the target role exists.
INSERT INTO role_groups (name, description)
VALUES ('Research Officer', 'Research Office: grants and contracts')
ON CONFLICT (name) DO NOTHING;

-- 2. Merge the matrix. For every navigation item held by either legacy role,
--    give Research Officer the most permissive level (edit > view > hide).
WITH ranked AS (
  SELECT
    rp.navigation_item,
    rp.access_level,
    CASE rp.access_level WHEN 'edit' THEN 3 WHEN 'view' THEN 2 ELSE 1 END AS rank
  FROM role_permissions rp
  JOIN role_groups rg ON rg.id = rp.role_group_id
  WHERE rg.name IN ('Grant Officer', 'Contracts Officer')
),
best AS (
  SELECT DISTINCT ON (navigation_item)
    navigation_item, access_level
  FROM ranked
  ORDER BY navigation_item, rank DESC
)
INSERT INTO role_permissions (role_group_id, navigation_item, access_level)
SELECT
  (SELECT id FROM role_groups WHERE name = 'Research Officer'),
  best.navigation_item,
  best.access_level
FROM best
ON CONFLICT (role_group_id, navigation_item) DO UPDATE
  -- Keep the more permissive of what is already there and what we computed.
  SET access_level = CASE
        WHEN CASE EXCLUDED.access_level WHEN 'edit' THEN 3 WHEN 'view' THEN 2 ELSE 1 END
           > CASE role_permissions.access_level WHEN 'edit' THEN 3 WHEN 'view' THEN 2 ELSE 1 END
        THEN EXCLUDED.access_level
        ELSE role_permissions.access_level
      END,
      updated_at = now();

-- 3. Move anyone holding a legacy role onto the consolidated one.
UPDATE users
SET role = 'Research Officer', updated_at = now()
WHERE role IN ('Grant Officer', 'Contracts Officer');

UPDATE scientists
SET job_title = 'Research Officer', updated_at = now()
WHERE job_title IN ('Grant Officer', 'Contracts Officer');

-- 4. Retire the legacy roles. Their permission rows go with them; the merge
--    above has already carried the access forward.
DELETE FROM role_permissions
WHERE role_group_id IN (
  SELECT id FROM role_groups WHERE name IN ('Grant Officer', 'Contracts Officer')
);

DELETE FROM user_role_assignments
WHERE role_group_id IN (
  SELECT id FROM role_groups WHERE name IN ('Grant Officer', 'Contracts Officer')
);

DELETE FROM role_groups
WHERE name IN ('Grant Officer', 'Contracts Officer');

COMMIT;
