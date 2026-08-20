-- Keep the grant lifecycle, historical award milestone, dates, and SDR links
-- internally consistent without removing any legitimate existing links.

BEGIN;

UPDATE "grants"
SET "status" = 'in_review'
WHERE "status" = 'under_review';

UPDATE "grants"
SET "status" = 'cancelled'
WHERE "status" IN ('canceled', 'withdrawn', 'terminated');

UPDATE "grants"
SET "awarded" = false
WHERE "awarded" IS NULL;

ALTER TABLE "grants"
  ALTER COLUMN "awarded" SET DEFAULT false,
  ALTER COLUMN "awarded" SET NOT NULL;

-- Any existing SDR link is evidence that the grant reached the award milestone.
-- Preserve every link and repair the grant rather than deleting relationships.
UPDATE "grants" grant_record
SET
  "awarded" = true,
  "status" = CASE
    WHEN grant_record."status" = 'rejected' THEN 'cancelled'
    WHEN grant_record."status" IN ('submitted', 'pending', 'in_review') THEN 'awarded'
    ELSE grant_record."status"
  END
WHERE EXISTS (
  SELECT 1
  FROM "grant_research_activities" link
  WHERE link."grant_id" = grant_record."id"
);

UPDATE "grants"
SET "awarded" = true
WHERE "status" IN ('awarded', 'active', 'completed');

UPDATE "grants"
SET "status" = 'awarded'
WHERE "awarded" = true
  AND "status" IN ('submitted', 'pending', 'in_review');

UPDATE "grants"
SET "status" = 'cancelled'
WHERE "awarded" = true
  AND "status" = 'rejected';

UPDATE "grants"
SET "status" = CASE WHEN "awarded" = true THEN 'awarded' ELSE 'pending' END
WHERE "status" NOT IN (
  'submitted',
  'pending',
  'in_review',
  'awarded',
  'active',
  'completed',
  'rejected',
  'cancelled'
);

-- Active/Completed without a start date cannot satisfy the lifecycle contract.
-- Keep the award milestone but return the current state to Awarded until a real
-- start date can be recorded; never invent a date.
UPDATE "grants"
SET "status" = 'awarded',
    "awarded" = true
WHERE "status" IN ('active', 'completed')
  AND "start_date" IS NULL;

-- Preserve the known start date and clear only an impossible end date. This
-- lets staff enter the correct end date later instead of guessing or swapping.
UPDATE "grants"
SET "end_date" = NULL
WHERE "start_date" IS NOT NULL
  AND "end_date" IS NOT NULL
  AND "end_date" < "start_date";

DELETE FROM "grant_research_activities" duplicate
USING "grant_research_activities" keeper
WHERE duplicate."grant_id" = keeper."grant_id"
  AND duplicate."research_activity_id" = keeper."research_activity_id"
  AND duplicate."id" > keeper."id";

CREATE UNIQUE INDEX IF NOT EXISTS "grant_research_activity_unique_idx"
  ON "grant_research_activities" ("grant_id", "research_activity_id");

ALTER TABLE "grants"
  DROP CONSTRAINT IF EXISTS "grants_status_valid",
  DROP CONSTRAINT IF EXISTS "grants_award_status_consistent",
  DROP CONSTRAINT IF EXISTS "grants_dates_chronological",
  DROP CONSTRAINT IF EXISTS "grants_active_start_date_required";

ALTER TABLE "grants"
  ADD CONSTRAINT "grants_status_valid"
    CHECK ("status" IN (
      'submitted',
      'pending',
      'in_review',
      'awarded',
      'active',
      'completed',
      'rejected',
      'cancelled'
    )),
  ADD CONSTRAINT "grants_award_status_consistent"
    CHECK (
      "status" NOT IN ('awarded', 'active', 'completed')
      OR "awarded" IS TRUE
    ),
  ADD CONSTRAINT "grants_dates_chronological"
    CHECK (
      "start_date" IS NULL
      OR "end_date" IS NULL
      OR "end_date" >= "start_date"
    ),
  ADD CONSTRAINT "grants_active_start_date_required"
    CHECK (
      "status" NOT IN ('active', 'completed')
      OR "start_date" IS NOT NULL
    );

CREATE OR REPLACE FUNCTION "enforce_grant_awarded_for_sdr_link"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  grant_is_awarded boolean;
BEGIN
  SELECT "awarded"
  INTO grant_is_awarded
  FROM "grants"
  WHERE "id" = NEW."grant_id"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grant % does not exist', NEW."grant_id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF grant_is_awarded IS NOT TRUE THEN
    RAISE EXCEPTION 'SDRs can only be linked after the grant has been awarded'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "grant_sdr_link_requires_award"
  ON "grant_research_activities";
CREATE TRIGGER "grant_sdr_link_requires_award"
BEFORE INSERT OR UPDATE OF "grant_id"
ON "grant_research_activities"
FOR EACH ROW
EXECUTE FUNCTION "enforce_grant_awarded_for_sdr_link"();

CREATE OR REPLACE FUNCTION "prevent_grant_unaward_with_sdr_links"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."awarded" IS TRUE
     AND NEW."awarded" IS NOT TRUE
     AND EXISTS (
       SELECT 1
       FROM "grant_research_activities"
       WHERE "grant_id" = NEW."id"
     ) THEN
    RAISE EXCEPTION 'Unlink all SDRs before clearing the Grant Awarded designation'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "grant_unaward_requires_no_sdr_links"
  ON "grants";
CREATE TRIGGER "grant_unaward_requires_no_sdr_links"
BEFORE UPDATE OF "awarded"
ON "grants"
FOR EACH ROW
EXECUTE FUNCTION "prevent_grant_unaward_with_sdr_links"();

COMMIT;