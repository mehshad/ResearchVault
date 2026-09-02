import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  GRANT_MINIMUM_ISSUE_CODES,
  describeMissingGrantFields,
  isGrantIncomplete,
  missingMinimumGrantFields,
} from "./grantValidity";
import { GRANT_ISSUE_DEFINITIONS, evaluateGrantIssues } from "./grantIssues";

const codes = (grant: any) => missingMinimumGrantFields(grant).map((issue) => issue.code);

const complete = { projectNumber: "PPM 06-0426-230002", title: "A real proposal", lpiId: 42 };

test("a grant with a project number, a title and an LPI is complete", () => {
  assert.deepEqual(codes(complete), []);
  assert.equal(isGrantIncomplete(complete), false);
});

test("a missing Lead PI is what the import actually leaves behind", () => {
  assert.deepEqual(codes({ ...complete, lpiId: null }), ["missing_lpi"]);
});

test("whitespace is not a title", () => {
  assert.deepEqual(codes({ ...complete, title: "   " }), ["missing_title"]);
  assert.deepEqual(codes({ ...complete, title: "" }), ["missing_title"]);
  assert.deepEqual(codes({ ...complete, title: null }), ["missing_title"]);
});

test("fields are reported in a fixed order, so two callers cannot disagree", () => {
  const empty = { projectNumber: "", title: "", lpiId: null };
  assert.deepEqual(codes(empty), ["missing_project_number", "missing_title", "missing_lpi"]);
  assert.equal(describeMissingGrantFields(empty), "Missing project no., Missing title, Missing Lead PI");
});

/**
 * The clean-up deletes records, so it must never widen past the three codes
 * it claims. evaluateGrantIssues flags eleven things, most of them ordinary
 * gaps in a perfectly real grant -- an awarded one with no end date raises
 * five at once. If a future issue code leaked into this set, the tool would
 * quietly start offering those rows for deletion.
 */
test("only the three minimum codes make a grant a deletion candidate", () => {
  assert.deepEqual([...GRANT_MINIMUM_ISSUE_CODES], [
    "missing_project_number",
    "missing_title",
    "missing_lpi",
  ]);

  const awardedButUnfinished = {
    ...complete,
    awarded: true,
    status: "awarded",
    fundingAgency: null,
    awardedAmount: null,
    currency: null,
    awardedYear: null,
    startDate: null,
    endDate: null,
  };
  assert.ok(
    evaluateGrantIssues(awardedButUnfinished).length >= 5,
    "this grant should raise several ordinary issues",
  );
  assert.deepEqual(codes(awardedButUnfinished), [], "none of which make it deletable");
});

test("every minimum code is a real issue code", () => {
  const known = new Set(GRANT_ISSUE_DEFINITIONS.map((definition) => definition.code));
  for (const code of GRANT_MINIMUM_ISSUE_CODES) {
    assert.ok(known.has(code), `${code} is not a known grant issue`);
  }
});

/**
 * The preview and the delete are separate requests, so the delete cannot trust
 * the list it was handed: a grant may have been completed, linked to an SDR,
 * or given a progress report in between. Those re-checks are the only thing
 * standing between a stale browser tab and a wrongly deleted record, and they
 * are easy to drop while refactoring -- everything still passes without them.
 */
test("deleteIncompleteGrants re-checks the record and both blockers before deleting", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, "..", "server", "databaseStorage.ts"), "utf-8");
  const start = source.indexOf("async deleteIncompleteGrants(");
  assert.ok(start > -1, "deleteIncompleteGrants has been renamed or removed");
  const body = source.slice(start, source.indexOf("\n  }\n", start));

  assert.match(body, /FOR UPDATE/, "must lock the row it is about to delete");
  assert.match(body, /isGrantIncomplete\(grant\)/, "must re-check that the grant is still incomplete");
  // Matched on the lookup itself, not on the table name: the name appears in
  // any mention of the table, so a weaker pattern still passes after the
  // check it is guarding has been deleted.
  assert.match(
    body,
    /from\(grantResearchActivities\)[\s\S]{0,120}?eq\(grantResearchActivities\.grantId, id\)/,
    "must re-check for SDR links",
  );
  assert.match(
    body,
    /from\(grantProgressReports\)[\s\S]{0,120}?eq\(grantProgressReports\.grantId, id\)/,
    "must re-check for progress reports: that table has no foreign key, so the database would neither stop the delete nor clean up after it",
  );
});
