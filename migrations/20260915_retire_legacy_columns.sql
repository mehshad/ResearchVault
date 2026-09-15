-- Retire the legacy duplicates that nothing reads (finding #30), and carry the
-- grant people recorded only as text into the tables that are now the source
-- of truth.
--
-- What goes:
--   research_activities.line_manager_id, .staff_scientist_id -- marked legacy,
--     0 populated rows, no reader.
--   research_activities.lead_scientist_id -- shared/schema.ts said it was
--     removed; the live database still had it (0 rows populated).
--   project_groups -- renamed to projects by rename_project_groups.sql on a
--     fresh database; on older databases the empty original was left behind.
--     (On a fresh database this DROP is a no-op: the table is already projects.)
--
-- What is carried across:
--   grants.co_investigators text[] -> grant_co_investigators, for every name
--     that matches exactly one staff record by first + last name (titles
--     stripped). The forms already write the link table; the portfolio page
--     reads only it, so a co-investigator recorded only as text was invisible
--     there. Names matching nobody are external people or spellings the
--     directory does not have; they stay in the array, which is kept as
--     read-only legacy text rather than dropped -- dropping it would lose them.
--   grants.collaborators text[] -> grant_collaborating_institutions, by name.
--
-- Idempotent: ON CONFLICT DO NOTHING on both unique keys; IF EXISTS on drops.

INSERT INTO grant_co_investigators (grant_id, scientist_id)
SELECT DISTINCT n.grant_id, s.id
FROM (
  SELECT g.id AS grant_id,
         lower(btrim(regexp_replace(unnest(g.co_investigators), '^(Dr|Prof|Professor|Mr|Mrs|Ms|Miss)\.?\s+', '', 'i'))) AS name_key
  FROM grants g
  WHERE g.co_investigators IS NOT NULL AND cardinality(g.co_investigators) > 0
) n
JOIN scientists s ON lower(btrim(s.first_name) || ' ' || btrim(s.last_name)) = n.name_key
WHERE n.name_key <> ''
  -- exactly one person with that name; two would be a guess
  AND (SELECT count(*) FROM scientists s2 WHERE lower(btrim(s2.first_name) || ' ' || btrim(s2.last_name)) = n.name_key) = 1
ON CONFLICT (grant_id, scientist_id) DO NOTHING;

INSERT INTO grant_collaborating_institutions (grant_id, name)
SELECT DISTINCT g.id, btrim(regexp_replace(c.name, '\s+', ' ', 'g'))
FROM grants g
CROSS JOIN LATERAL unnest(g.collaborators) AS c(name)
WHERE g.collaborators IS NOT NULL AND cardinality(g.collaborators) > 0
  AND btrim(c.name) <> ''
ON CONFLICT (grant_id, name) DO NOTHING;

ALTER TABLE research_activities DROP COLUMN IF EXISTS line_manager_id;
ALTER TABLE research_activities DROP COLUMN IF EXISTS staff_scientist_id;
ALTER TABLE research_activities DROP COLUMN IF EXISTS lead_scientist_id;

DROP TABLE IF EXISTS project_groups;
