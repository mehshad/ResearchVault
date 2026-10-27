-- institutions.country, added to shared/schema.ts without a migration.
--
-- Where the organisation is, so a contract naming a counterparty can fill in
-- its country rather than asking somebody to type it again. It was present in
-- development (a drizzle-kit push materialises the schema) and absent in
-- production (docker-entrypoint.sh applies the migration list and never
-- pushes), which is also why the demo seed could not write an institution on
-- a freshly-migrated database.
ALTER TABLE "institutions"
  ADD COLUMN IF NOT EXISTS "country" text;
