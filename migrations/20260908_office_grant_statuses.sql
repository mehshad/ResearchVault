-- The office's own status vocabulary, from the funder's Project Status list.
--
-- The previous migration made statuses editable rows and seeded the thirteen
-- the system shipped with. It did not put the office's actual list in, so the
-- dropdown still offered thirteen generic words while the office works to a
-- fifty-eight-entry pipeline -- "LoI Submitted", "Award Pending - RO
-- Correction", "IRP QRDI Rejected". This loads that list.
--
-- Taken from the funder's Project Status filter, alphabetically, minus its
-- "(All)" row, which is the filter's own "no filter" entry and not a status.
--
-- Five of the fifty-eight are already here under the same name -- Submitted,
-- Awarded, Active, Not Awarded and Rejected -- and are not inserted again.
-- Statuses match on a normalised key (lower case, letters and digits only), so
-- a second row labelled "Awarded" would be a genuine ambiguity rather than a
-- harmless duplicate: normalizeGrantStatus() would resolve the word to
-- whichever row sorted first. All five already carry the stage they would have
-- been given here.
--
-- `value` is a slug and `label` is what the office wrote. A reload carrying the
-- office's own spelling still resolves, because the same normalisation maps
-- "Award Pending - RO Correction" onto award_pending_ro_correction.
--
-- is_built_in stays false: the office added these and may retire or relabel
-- them without a deployment. Only the original thirteen are protected.
--
-- == The stage each one declares ===========================================
--
-- The stage is what every rule reads; the words are only what people see. The
-- large families are unambiguous:
--
--   * everything prefixed Expired is an application that lapsed, so `refused`
--     -- it never won, which is what separates it from `ended`;
--   * the Award Pending family is `awarded`: the money is won and the award is
--     being set up, but there are no dates yet;
--   * Award Active, Award Closed and Award Tech. Completed are `scheduled`,
--     the stage that requires a start date and carries progress reports;
--   * Award Suspended, Award Terminated and Award Withdrawn are `ended`: an
--     award that stopped. Proposal Withdrawn is deliberately NOT `ended` --
--     nothing was ever won there -- and is `refused` instead.
--
-- Five could not be settled from the label alone, and are flagged for the
-- office to correct on the configuration page. Each was given the reading whose
-- failure is visible rather than silent:
--
--   * Accepted -> awarded. The only one of the five given an award-bearing
--     stage, because "Accepted" at the end of a review pipeline this detailed
--     reads as the funding decision. If it means a proposal accepted for
--     review it should be `application`, and until it is changed a grant on it
--     shows as awarded to other sections.
--   * FR Submitted -> application, reading FR as a submission alongside LoI and
--     IRP. If it is a final report it belongs to an awarded project and should
--     be `scheduled`.
--   * In Progress -> application. If it means a running award rather than an
--     application being worked on, it should be `scheduled`.
--   * IRP QRDI Approved -> application, as a gate passed inside the review
--     pipeline. If QRDI approval is the funding decision, it should be
--     `awarded`.
--   * Inactive -> application. Genuinely unclear: it may be a dormant record or
--     a stopped award. `ended` is only valid on a grant that was actually
--     awarded and would refuse the save on any other, so the reading that
--     cannot block anybody was chosen. If it means a stopped award, change it
--     to `ended`.
--
-- Reaches production through docker-entrypoint.sh.

INSERT INTO "grant_statuses" ("value", "label", "stage", "sort_order", "is_built_in") VALUES
  ('accepted',                      'Accepted',                        'awarded',     13, false),
  ('award_active',                  'Award Active',                    'scheduled',   14, false),
  ('award_closed',                  'Award Closed',                    'scheduled',   15, false),
  ('award_pending',                 'Award Pending',                   'awarded',     16, false),
  ('award_pending_open',            'Award Pending - Open',            'awarded',     17, false),
  ('award_pending_ro_correction',   'Award Pending - RO Correction',   'awarded',     18, false),
  ('award_pending_submitted',       'Award Pending - Submitted',       'awarded',     19, false),
  ('award_pending_vetted',          'Award Pending - Vetted',          'awarded',     20, false),
  ('award_suspended',               'Award Suspended',                 'ended',       21, false),
  ('award_tech_completed',          'Award Tech. Completed',           'scheduled',   22, false),
  ('award_terminated',              'Award Terminated',                'ended',       23, false),
  ('award_withdrawn',               'Award Withdrawn',                 'ended',       24, false),
  ('banned',                        'Banned',                          'refused',     25, false),
  ('disqualified',                  'Disqualified',                    'refused',     26, false),
  ('eoi_approved',                  'EOI Approved',                    'application', 27, false),
  ('eoi_open_for_modification',     'EOI Open for Modification',       'application', 28, false),
  ('eoi_rejected',                  'EOI Rejected',                    'refused',     29, false),
  ('eoi_submitted',                 'EOI Submitted',                   'application', 30, false),
  ('eoi_vetted',                    'EOI Vetted',                      'application', 31, false),
  ('expired',                       'Expired',                         'refused',     32, false),
  ('expired_in_preparation',        'Expired - In Preparation',        'refused',     33, false),
  ('expired_irp_submitted',         'Expired - IRP Submitted',         'refused',     34, false),
  ('expired_loi_submitted',         'Expired - LoI Submitted',         'refused',     35, false),
  ('expired_open_for_modification', 'Expired - Open for Modification', 'refused',     36, false),
  ('expired_proposal_registered',   'Expired - Proposal Registered',   'refused',     37, false),
  ('expired_reviewing_completed',   'Expired - Reviewing Completed',   'refused',     38, false),
  ('expired_ro_vetted',             'Expired - RO Vetted',             'refused',     39, false),
  ('expired_submitted',             'Expired - Submitted',             'refused',     40, false),
  ('fr_submitted',                  'FR Submitted',                    'application', 41, false),
  ('in_preparation',                'In Preparation',                  'application', 42, false),
  ('in_progress',                   'In Progress',                     'application', 43, false),
  ('inactive',                      'Inactive',                        'application', 44, false),
  ('irp_did_not_pass_screening',    'IRP did not pass screening',      'refused',     45, false),
  ('irp_in_preparation',            'IRP In Preparation',              'application', 46, false),
  ('irp_open_for_modification',     'IRP Open for Modification',       'application', 47, false),
  ('irp_qrdi_approved',             'IRP QRDI Approved',               'application', 48, false),
  ('irp_qrdi_rejected',             'IRP QRDI Rejected',               'refused',     49, false),
  ('irp_ro_rejected',               'IRP RO Rejected',                 'refused',     50, false),
  ('irp_ro_vetted',                 'IRP RO Vetted',                   'application', 51, false),
  ('irp_submitted',                 'IRP Submitted',                   'application', 52, false),
  ('loi_submitted',                 'LoI Submitted',                   'application', 53, false),
  ('not_pass_screening',            'Not Pass Screening',              'refused',     54, false),
  ('open_for_modification',         'Open for Modification',           'application', 55, false),
  ('open_for_rebuttal',             'Open for Rebuttal',               'application', 56, false),
  ('pass_screening',                'Pass Screening',                  'application', 57, false),
  ('proposal_registered',           'Proposal Registered',             'application', 58, false),
  ('proposal_withdrawn',            'Proposal Withdrawn',              'refused',     59, false),
  ('qualified',                     'Qualified',                       'application', 60, false),
  ('reviewing_completed',           'Reviewing Completed',             'application', 61, false),
  ('ro_vetted',                     'RO Vetted',                       'application', 62, false),
  ('submitted_for_round_2',         'Submitted for round 2',           'application', 63, false),
  ('under_deliberation',            'Under Deliberation',              'application', 64, false),
  ('under_review',                  'Under Review',                    'application', 65, false)
ON CONFLICT ("value") DO NOTHING;
