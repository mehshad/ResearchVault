-- Grant statuses become rows the Research Office maintains.
--
-- The office works to a funder's pipeline -- "LoI Submitted", "Award Pending -
-- Vetted", "IRP RO Vetted" -- much finer than the thirteen statuses the system
-- shipped with, and it should not need a deployment to record its own
-- vocabulary.
--
-- The obstacle was that status strings were load-bearing: five lifecycle rules,
-- the CHECK constraint below and the cross-section visibility boundary all
-- branched on the exact words "awarded", "active" and "completed". So a status
-- now declares a **stage**, and the rules read the stage. The office owns the
-- words; the system owns what they imply. See shared/grantStatusStages.ts.
--
-- Reaches production through docker-entrypoint.sh.

CREATE TABLE IF NOT EXISTS "grant_statuses" (
  "id" serial PRIMARY KEY,
  -- Stored in grants.status.
  "value" text NOT NULL UNIQUE,
  -- What the dropdown shows.
  "label" text NOT NULL,
  -- What every rule reads. Constrained here as well as in the application:
  -- a stage outside this list would leave the grant's meaning undefined, and
  -- the rules would answer "no" to everything about it.
  "stage" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  -- The thirteen that ship. Relabelled and reordered freely, never deleted:
  -- existing grants hold them and the lifecycle still moves grants onto some
  -- of them by name.
  "is_built_in" boolean NOT NULL DEFAULT false,
  -- Hidden from the dropdown without breaking the grants that already carry
  -- it. Deleting a status in use would leave those grants meaning nothing.
  "retired_at" timestamp,
  "created_by_user_id" integer REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "grant_statuses_stage_valid" CHECK (
    "stage" IN ('application', 'refused', 'awarded', 'scheduled', 'ended')
  )
);

-- The thirteen, with the stage each one has always meant. Derived by reading
-- which of the four old sets in grantLifecycle.ts each belonged to; a test
-- checks every one of them against those sets so this cannot drift.
INSERT INTO "grant_statuses" ("value", "label", "stage", "sort_order", "is_built_in") VALUES
  ('submitted',   'Submitted',   'application',  0, true),
  ('pending',     'Pending',     'application',  1, true),
  ('in_review',   'In Review',   'application',  2, true),
  ('awarded',     'Awarded',     'awarded',      3, true),
  ('active',      'Active',      'scheduled',    4, true),
  ('completed',   'Completed',   'scheduled',    5, true),
  ('not_awarded', 'Not Awarded', 'refused',      6, true),
  ('rejected',    'Rejected',    'refused',      7, true),
  ('cancelled',   'Cancelled',   'ended',        8, true),
  ('withdrawn',   'Withdrawn',   'ended',        9, true),
  ('terminated',  'Terminated',  'ended',       10, true),
  ('transferred', 'Transferred', 'ended',       11, true),
  ('suspended',   'Suspended',   'ended',       12, true)
ON CONFLICT ("value") DO NOTHING;

-- The CHECK that made this impossible.
--
-- It listed the thirteen by name, so any status the office added would have
-- been rejected on save -- the grant would simply refuse to store. What
-- replaces it is not nothing: grant_statuses.value is now the list of what
-- exists, the stage CHECK above keeps every entry meaningful, and the
-- application rejects a status that is not on the list.
--
-- A foreign key from grants.status to grant_statuses.value would be the
-- stricter fix, and is deliberately not done here: 272 existing grants would
-- have to be validated against the table inside this migration, and the office
-- is reloading the grants table anyway. Worth revisiting once that reload has
-- happened and the data is known to be clean.
ALTER TABLE "grants" DROP CONSTRAINT IF EXISTS "grants_status_valid";
