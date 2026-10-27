import assert from "node:assert/strict";
import test from "node:test";

import { deleteRefusal } from "./deleteBlockers";

test("sums rows per table and counts distinct tables", () => {
  const refusal = deleteRefusal([
    { table: "project_members", column: "research_activity_id", count: 3 },
    { table: "publications", column: "research_activity_id", count: 2 },
    { table: "publication_research_activities", column: "research_activity_id", count: 1 },
  ]);
  assert.deepEqual(refusal.blockedBy, {
    project_members: 3,
    publications: 2,
    publication_research_activities: 1,
  });
  assert.match(refusal.message, /referenced by 6 records across 3 tables/);
  assert.match(refusal.message, /project_members, publications, publication_research_activities/);
});

test("two columns of one table are one table in the count", () => {
  const refusal = deleteRefusal([
    { table: "programs", column: "program_director_id", count: 1 },
    { table: "programs", column: "research_co_lead_id", count: 1 },
  ]);
  assert.equal(refusal.blockedBy.programs, 2);
  assert.match(refusal.message, /2 records across 1 table\b/);
});

test("singular when one row blocks", () => {
  const refusal = deleteRefusal([{ table: "grants", column: "program_id", count: 1 }]);
  assert.match(refusal.message, /referenced by 1 record across 1 table \(grants\)/);
  assert.equal(refusal.details.length, 1);
});
