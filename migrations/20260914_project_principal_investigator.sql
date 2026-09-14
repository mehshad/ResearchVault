-- projects.principal_investigator_id, added to shared/schema.ts without a
-- migration. Present in development (drizzle-kit push) and absent in
-- production (the entrypoint applies the migration list and never pushes),
-- so a query naming it would fail in production and the demo seed could not
-- write a project on a freshly-migrated database.
ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "principal_investigator_id" integer;
