-- publications.authors: drop NOT NULL constraint
-- The base migration created this column as NOT NULL, but schema.ts declares
-- it nullable. Any insert without an authors string currently fails in
-- production despite the ORM allowing it.
ALTER TABLE publications ALTER COLUMN authors DROP NOT NULL;
