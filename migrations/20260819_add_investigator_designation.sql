-- Preserve a staff member's primary job title while allowing Management to
-- designate them as eligible for investigator-only roles.
ALTER TABLE "scientists"
  ADD COLUMN IF NOT EXISTS "is_investigator" boolean NOT NULL DEFAULT false;