-- Label the loaded impact factors consistently.
--
-- Three sets were loaded together on 2 September, labelled 2022, 2024 and
-- 2026. Two of those are right; the third cannot be.
--
-- The convention the other two follow is the JCR **data year** — the year whose
-- citations the factor is computed from, which is the year Clarivate names the
-- edition after, and which is released the following June. Spot-checking well
-- known journals against that convention:
--
--     Nature   2022 = 64.8    2024 = 48.5
--     Science  2022 = 56.9    2024 = 45.8
--     NEJM     2022 = 158.5   2024 = 78.5
--     Lancet   2022 = 168.9   2024 = 88.5
--
-- Those are the published 2022 and 2024 JCR figures, so both sets are labelled
-- correctly and are left alone.
--
-- The set labelled 2026 cannot be a 2026 edition: the 2026 JCR is computed from
-- 2026 citations and is not released until mid-2027. The newest edition that
-- can exist as this is written is 2025, published around June 2026. Two further
-- things agree with it being that edition rather than an older one:
--
--   * its values sit above the 2024 set for 915 of the 1,286 journals present
--     in all three, which is the direction of a later edition, not an earlier
--     one — the sharp drop between the 2022 and 2023 editions partly recovered
--     afterwards;
--   * it is much the largest set (22,649 journals against 9,000 and 1,758),
--     which is what a current full JCR load looks like.
--
-- So: 2026 becomes 2025, and nothing else moves.
--
-- This changes scores. A publication scored on its publication year against the
-- 2026 label was matching nothing real; it now matches 2025, and manuscripts
-- published in 2025 pick up a factor they previously missed.
--
-- Written to be safe to re-run, and to refuse rather than collide if a genuine
-- 2025 set is ever loaded before this runs.
UPDATE "journal_impact_factor_metrics" AS m
SET "year" = 2025
WHERE m."year" = 2026
  AND NOT EXISTS (
    SELECT 1
    FROM "journal_impact_factor_metrics" AS other
    WHERE other."journal_id" = m."journal_id"
      AND other."year" = 2025
  );

-- Not touched, and worth a person's eye rather than a guess in a migration:
-- CA-A CANCER JOURNAL FOR CLINICIANS carries 685.2 in this set, against 118.0
-- for the next highest journal. That journal genuinely has the largest impact
-- factor in publishing and has swung between roughly 250 and 500 in recent
-- editions, so 685.2 is high but not impossible. Changing it would need the
-- real figure, not an inference from its neighbours.
