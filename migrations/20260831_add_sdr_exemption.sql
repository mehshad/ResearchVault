-- An SDR is normally required on a publication. The exception is work done for
-- a collaborator at another institution: the scientist is an author, but there
-- is no research activity here to link, and forcing one would put a fictional
-- record in the system.
--
-- The reason is stored on the publication and read by the Outcome Office before
-- the record is finalised. There is no approval column: submitting the reason
-- is the request, and finalising the publication is the acceptance. Where the
-- office disagrees it uses the existing invalid/correction loop.
--
-- Idempotent: the entrypoint replays every migration on each container start.

BEGIN;

ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS sdr_exemption_reason text,
  ADD COLUMN IF NOT EXISTS sdr_exemption_requested_by integer,
  ADD COLUMN IF NOT EXISTS sdr_exemption_requested_at timestamp;

ALTER TABLE publications
  DROP CONSTRAINT IF EXISTS publications_sdr_exemption_requested_by_users_id_fk;

ALTER TABLE publications
  ADD CONSTRAINT publications_sdr_exemption_requested_by_users_id_fk
  FOREIGN KEY (sdr_exemption_requested_by) REFERENCES users(id);

-- A publication cannot both link an SDR and claim there is none to link.
UPDATE publications
SET sdr_exemption_reason = NULL,
    sdr_exemption_requested_by = NULL,
    sdr_exemption_requested_at = NULL
WHERE research_activity_id IS NOT NULL
  AND sdr_exemption_reason IS NOT NULL;

COMMIT;
