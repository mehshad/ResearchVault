CREATE TABLE IF NOT EXISTS "bulk_data_archives" (
  "id" text PRIMARY KEY,
  "status" text NOT NULL DEFAULT 'pending',
  "source" text NOT NULL,
  "schedule_date" date,
  "file_name" text,
  "object_id" text,
  "byte_size" integer,
  "checksum" text,
  "lease_token" text,
  "error_message" text,
  "requested_by" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "started_at" timestamp,
  "completed_at" timestamp,
  CONSTRAINT "bulk_data_archives_status_check"
    CHECK ("status" IN ('pending', 'running', 'succeeded', 'failed', 'deleting')),
  CONSTRAINT "bulk_data_archives_source_check"
    CHECK ("source" IN ('manual', 'scheduled')),
  CONSTRAINT "bulk_data_archives_schedule_date_check"
    CHECK (("source" = 'scheduled' AND "schedule_date" IS NOT NULL)
      OR ("source" = 'manual' AND "schedule_date" IS NULL))
);

ALTER TABLE "bulk_data_archives"
  ADD COLUMN IF NOT EXISTS "checksum" text;
ALTER TABLE "bulk_data_archives"
  ADD COLUMN IF NOT EXISTS "lease_token" text;

ALTER TABLE "bulk_data_archives"
  DROP CONSTRAINT IF EXISTS "bulk_data_archives_status_check";
ALTER TABLE "bulk_data_archives"
  ADD CONSTRAINT "bulk_data_archives_status_check"
  CHECK ("status" IN ('pending', 'running', 'succeeded', 'failed', 'deleting'));

CREATE UNIQUE INDEX IF NOT EXISTS "bulk_data_archives_scheduled_date_idx"
  ON "bulk_data_archives" ("schedule_date")
  WHERE "source" = 'scheduled';