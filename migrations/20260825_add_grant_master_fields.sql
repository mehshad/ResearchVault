ALTER TABLE "grants"
  ADD COLUMN IF NOT EXISTS "source_category" text,
  ADD COLUMN IF NOT EXISTS "source_record_key" text,
  ADD COLUMN IF NOT EXISTS "submitting_institution" text,
  ADD COLUMN IF NOT EXISTS "co_investigators" text[],
  ADD COLUMN IF NOT EXISTS "subaward_completed_year" integer,
  ADD COLUMN IF NOT EXISTS "contribution_type" text,
  ADD COLUMN IF NOT EXISTS "contribution_details" text,
  ADD COLUMN IF NOT EXISTS "duration_months" integer,
  ADD COLUMN IF NOT EXISTS "currency" text;

CREATE INDEX IF NOT EXISTS "grants_source_record_idx"
ON "grants" ("source_category", "source_record_key");