ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS invalid_reason text;