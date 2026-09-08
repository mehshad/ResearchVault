-- The preprint server is not the journal.
--
-- Three publications carry a preprint server in `journal` as well as in
-- `prepublication_site` -- "Research Square" or "bioRxiv" in both columns on
-- the same row. The server belongs in `prepublication_site`, which is what it
-- is for; `journal` is where the work was published, and a preprint has not
-- been published anywhere.
--
-- The visible cost was on the Impact Factors summary, which asks which journals
-- we publish in have no impact factor and was duly reporting "bioRxiv" and
-- "Research Square" as journals without one. They are not journals without an
-- impact factor; they are not journals.
--
-- Why the existing repair tool did not catch them: preprintRepairEvidence()
-- returns nothing unless `status = 'Published'`. That tool exists to find
-- preprints masquerading as published articles, and it clears `journal` only as
-- a side effect of correcting the status. These three are correctly classified
-- already -- two are "Submitted for review with pre-publication" and one is
-- "Under review" -- so the tool passes over them and the stray journal value is
-- never cleaned.
--
-- Deliberately narrow: only where the two columns say the same thing. Ten other
-- rows hold a real journal alongside a preprint server, which is the ordinary
-- and correct shape -- "Journal of Translational Medicine" published, with a
-- bioRxiv preprint recorded as its provenance. Clearing those would destroy the
-- publication record.
--
-- Reaches production through docker-entrypoint.sh.

UPDATE "publications"
SET "journal" = NULL,
    "updated_at" = now()
WHERE "journal" IS NOT NULL
  AND btrim("journal") <> ''
  AND "prepublication_site" IS NOT NULL
  AND lower(btrim("journal")) = lower(btrim("prepublication_site"));
