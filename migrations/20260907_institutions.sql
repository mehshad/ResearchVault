-- One list of external organisations, shared by everything that names one.
--
-- A grant's submitting institution, the institutions a grant is run with and a
-- contract's counterparty were three free-text boxes. The same organisation
-- therefore arrived spelled several ways -- "Weill Cornell Medical College in
-- Qatar" and "Weill Cornell Medicine Qatar" are both in grant_collaborating_
-- institutions today -- and no form could offer what had been typed before.
--
-- name_key is the name with case, spacing and punctuation removed. It carries
-- the unique index rather than name itself, so the list cannot come to hold
-- "Hamad Medical Corporation" and "hamad  medical corporation" as two
-- organisations. Kept in step with institutionKey() in shared/institutions.ts;
-- the server derives it on write and never accepts one from a caller.
--
-- The three columns that name an institution keep their text. They are read by
-- the grant import and export and by isHomeInstitution(), and 272 grant rows
-- predate this table; turning them into foreign keys would have meant migrating
-- all of that to gain a rename nobody has asked for. This table's job is to
-- make sure what lands in them came from a list.
--
-- Reaches production through docker-entrypoint.sh, which applies this list and
-- never runs drizzle-kit push, so a table living only in shared/schema.ts would
-- be present in development and absent in production.
CREATE TABLE IF NOT EXISTS "institutions" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "name_key" text NOT NULL UNIQUE,
  "created_by_user_id" integer REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Seed from what is already recorded, so the dropdown is useful on the first
-- day rather than empty in front of somebody who then types a fresh spelling.
--
-- created_by_user_id stays null on these: they came from existing data and
-- naming an account as their author would be inventing a fact.
--
-- DISTINCT ON the key keeps one spelling per organisation. Which one survives
-- is whichever sorts first, which is arbitrary; the alternatives are to guess
-- at a preferred spelling or to refuse the seed, and an arbitrary but editable
-- choice beats both. Near duplicates that key differently ("Weill Cornell
-- Medical College in Qatar" against "Weill Cornell Medicine Qatar") both
-- survive on purpose: merging them needs judgement, and the dropdown shows them
-- next to each other for somebody to deal with.
INSERT INTO "institutions" ("name", "name_key")
SELECT DISTINCT ON (key) name, key
FROM (
  SELECT
    btrim(regexp_replace(submitting_institution, '\s+', ' ', 'g')) AS name,
    lower(regexp_replace(submitting_institution, '[^A-Za-z0-9]', '', 'g')) AS key
  FROM "grants"
  WHERE submitting_institution IS NOT NULL

  UNION ALL

  SELECT
    btrim(regexp_replace(name, '\s+', ' ', 'g')),
    lower(regexp_replace(name, '[^A-Za-z0-9]', '', 'g'))
  FROM "grant_collaborating_institutions"
  WHERE name IS NOT NULL

  UNION ALL

  SELECT
    btrim(regexp_replace(contractor_name, '\s+', ' ', 'g')),
    lower(regexp_replace(contractor_name, '[^A-Za-z0-9]', '', 'g'))
  FROM "research_contracts"
  WHERE contractor_name IS NOT NULL
) AS existing
WHERE key <> ''
ORDER BY key, name
ON CONFLICT ("name_key") DO NOTHING;
