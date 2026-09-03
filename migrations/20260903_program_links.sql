-- Where a program's material actually lives.
--
-- Every program already has a SharePoint site the coordinators work in and,
-- for most of them, a page on the public site. Neither was recorded anywhere,
-- so finding either meant asking somebody. These two columns hold them, and
-- the program page and the programs table link out to them.
--
-- Free text rather than a lookup: both are external addresses owned by other
-- systems, with nothing here to reference them against.
--
-- Nullable: a program that has neither is normal, especially before its
-- public page exists.
--
-- Reaches production through docker-entrypoint.sh, which applies this list
-- and never runs drizzle-kit push, so a column living only in
-- shared/schema.ts would be present in development and absent in production.
ALTER TABLE "programs"
  ADD COLUMN IF NOT EXISTS "sharepoint_url" text,
  ADD COLUMN IF NOT EXISTS "website_url" text;
