-- Consolidate the permission matrix onto the areas the interface can show.
--
-- Three areas -- pmo-office, research-office and certifications -- were stored
-- and enforced but never appeared in the settings grid, because the matrix was
-- seeded from one list of navigation areas (23 entries) and the grid rendered
-- from another (20). No administrator could review or change them.
--
-- The fix folds the areas that belong together and keeps the ones the offices
-- own, so a single list serves both:
--
--   programs, projects, research-activities  ->  pmo-office
--   grants, contracts                        ->  research-office
--   certifications                           ->  kept, now listed
--
-- Those five were never configured apart from the office that owns them; they
-- were five sets of cells to hold in step that always said the same thing.
--
-- Each merge takes the MOST PERMISSIVE level involved, so nobody loses access
-- that they had. Widening is visible in the grid and can be narrowed there;
-- silently narrowing would lock people out of screens they use with no trace of
-- why.
--
-- Idempotent: the entrypoint replays every migration on each container start.
-- Re-running is a no-op once the retired rows are gone.

BEGIN;

-- 1. Merge each retired area into the one that absorbed it, keeping the most
--    permissive level held across the group (including the target's own).
WITH mapping(source, target) AS (
  VALUES ('programs', 'pmo-office'),
         ('projects', 'pmo-office'),
         ('research-activities', 'pmo-office'),
         ('grants', 'research-office'),
         ('contracts', 'research-office'),
         ('pmo-office', 'pmo-office'),
         ('research-office', 'research-office')
),
ranked AS (
  SELECT
    rp.role_group_id,
    m.target AS navigation_item,
    rp.access_level,
    CASE rp.access_level
      WHEN 'edit' THEN 4 WHEN 'create' THEN 3 WHEN 'view' THEN 2 ELSE 1
    END AS rank
  FROM role_permissions rp
  JOIN mapping m ON m.source = rp.navigation_item
),
best AS (
  SELECT DISTINCT ON (role_group_id, navigation_item)
    role_group_id, navigation_item, access_level
  FROM ranked
  ORDER BY role_group_id, navigation_item, rank DESC
)
INSERT INTO role_permissions (role_group_id, navigation_item, access_level)
SELECT role_group_id, navigation_item, access_level FROM best
ON CONFLICT (role_group_id, navigation_item) DO UPDATE
  SET access_level = CASE
        WHEN CASE EXCLUDED.access_level
               WHEN 'edit' THEN 4 WHEN 'create' THEN 3 WHEN 'view' THEN 2 ELSE 1 END
           > CASE role_permissions.access_level
               WHEN 'edit' THEN 4 WHEN 'create' THEN 3 WHEN 'view' THEN 2 ELSE 1 END
        THEN EXCLUDED.access_level
        ELSE role_permissions.access_level
      END,
      updated_at = now();

-- 2. Drop the retired areas. Their access has been carried forward above.
DELETE FROM role_permissions
WHERE navigation_item IN ('programs', 'projects', 'research-activities', 'grants', 'contracts');

-- 3. Ownership overrides are configured against the same area names, so any
--    rule naming a retired area would stop matching. Point them at the
--    surviving area instead of leaving them silently inert.
UPDATE ownership_overrides SET module = 'pmo-office'
WHERE module IN ('programs', 'projects', 'research-activities');

UPDATE ownership_overrides SET module = 'research-office'
WHERE module IN ('grants', 'contracts');

-- 4. Give every role a row for certifications. It was already stored for the
--    roles the client happened to seed; an absent row means hide, so without
--    this a role would silently lose access the moment the area became
--    reviewable.
INSERT INTO role_permissions (role_group_id, navigation_item, access_level)
SELECT rg.id, 'certifications', 'view'
FROM role_groups rg
ON CONFLICT (role_group_id, navigation_item) DO NOTHING;

COMMIT;
