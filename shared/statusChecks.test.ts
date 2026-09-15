import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PUBLICATION_STATUS_VALUES } from "./publicationWorkflow";
import { RESEARCH_ACTIVITY_STATUS_VALUES } from "./schema";

/**
 * #48: the CHECK constraints in the migration and the lists the application
 * uses must name the same values, or a status the interface offers could be
 * refused by the database (or a typo the migration forgot could get in).
 */
const migration = readFileSync(new URL("../migrations/20260916_status_checks.sql", import.meta.url), "utf-8");

function checkValues(constraint: string): string[] {
  const start = migration.indexOf(`ADD CONSTRAINT ${constraint} CHECK (`);
  assert.ok(start > -1, `${constraint} is not added by the migration`);
  const clause = migration.slice(start, migration.indexOf("NOT VALID", start));
  return [...clause.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
}

test("the publication status CHECK lists every workflow status and nothing else", () => {
  assert.deepEqual(checkValues("publications_status_valid"), [...PUBLICATION_STATUS_VALUES]);
});

test("the research activity status CHECK lists the SDR states", () => {
  assert.deepEqual(checkValues("research_activities_status_valid"), [...RESEARCH_ACTIVITY_STATUS_VALUES]);
});

test("the sealed stage keeps its value: the asterisk is read as a state in too many places to retire here", () => {
  assert.ok(PUBLICATION_STATUS_VALUES.includes("Published *"));
  assert.ok(PUBLICATION_STATUS_VALUES.includes("Published"));
});
