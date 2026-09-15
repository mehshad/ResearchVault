-- Index the scientist- and project-side of the hot lookups.
--
-- Postgres does not index a referencing column on its own, and the only
-- indexes on the link tables lead with the other column: publication_scientist_idx
-- is (publication_id, scientist_id) and project_scientist_idx is
-- (research_activity_id, scientist_id). Every query that filters on the second
-- column -- a scientist's publications, a scientist's SDRs, the SDRs under a
-- project, the publications under an SDR -- ran unindexed, including the
-- correlated subquery the staff directory runs once per person.
--
-- Plain b-tree indexes; IF NOT EXISTS so a re-run is a no-op. Declared in
-- shared/schema.ts as well, so drizzle-kit push builds the same set.
CREATE INDEX IF NOT EXISTS "publication_authors_scientist_idx" ON "publication_authors" ("scientist_id");
CREATE INDEX IF NOT EXISTS "project_members_scientist_idx" ON "project_members" ("scientist_id");
CREATE INDEX IF NOT EXISTS "research_activities_project_idx" ON "research_activities" ("project_id");
CREATE INDEX IF NOT EXISTS "research_activities_budget_holder_idx" ON "research_activities" ("budget_holder_id");
CREATE INDEX IF NOT EXISTS "publications_research_activity_idx" ON "publications" ("research_activity_id");
CREATE INDEX IF NOT EXISTS "grant_research_activities_research_activity_idx" ON "grant_research_activities" ("research_activity_id");
