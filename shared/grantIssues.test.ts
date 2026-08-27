import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateGrantIssues,
  grantMatchesListFilters,
  grantMatchesIssueFilter,
  type GrantIssueCode,
} from "./grantIssues";

const completePreAward = {
  projectNumber: "G-1",
  title: "Grant",
  lpiId: 1,
  fundingAgency: "Funder",
  requestedAmount: "100",
  status: "submitted",
  awarded: false,
};

test("healthy pre-award grants have no issues and do not require an SDR", () => {
  assert.deepEqual(evaluateGrantIssues(completePreAward, 0), []);
});

test("pre-award grants require their essentials and a positive requested budget", () => {
  const issues = evaluateGrantIssues({
    ...completePreAward,
    projectNumber: " ",
    title: "",
    lpiId: null,
    fundingAgency: null,
    requestedAmount: "0",
  });
  assert.deepEqual(issues.map((issue) => issue.code), [
    "missing_project_number",
    "missing_title",
    "missing_lpi",
    "missing_funding_agency",
    "missing_requested_budget",
  ]);
});

test("a lasting award milestone requires award details, dates, and an SDR", () => {
  const issues = evaluateGrantIssues({
    ...completePreAward,
    status: "cancelled",
    awarded: true,
    awardedAmount: null,
    currency: null,
    awardedYear: null,
    startDate: null,
    endDate: null,
  });
  assert.deepEqual(issues.map((issue) => issue.code), [
    "missing_awarded_budget",
    "missing_currency",
    "missing_awarded_year",
    "missing_start_date",
    "missing_end_date",
    "missing_sdr",
  ]);
});

test("award-implying statuses are checked even when legacy awarded flag is false", () => {
  const issues = evaluateGrantIssues({
    ...completePreAward,
    status: "completed",
    awarded: false,
    awardedAmount: "100",
    currency: "QAR",
    awardedYear: 2026,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  }, 1);
  assert.deepEqual(issues, []);
});

test("issue filtering combines all, any, and specific codes deterministically", () => {
  const issues = evaluateGrantIssues({ ...completePreAward, lpiId: null });
  assert.equal(grantMatchesIssueFilter(issues, "all"), true);
  assert.equal(grantMatchesIssueFilter(issues, "any"), true);
  assert.equal(grantMatchesIssueFilter(issues, "missing_lpi"), true);
  assert.equal(
    grantMatchesIssueFilter(issues, "missing_sdr" as GrantIssueCode),
    false,
  );
  assert.equal(grantMatchesIssueFilter([], "any"), false);
});

test("grant list filters combine status, year, search, and issues", () => {
  const grant = {
    title: "Precision Medicine",
    projectNumber: "G-2026-1",
    fundingAgency: "Sidra IRF",
    description: "Genomics",
    submittedYear: 2026,
    status: "awarded",
    lpi: { firstName: "Emily", lastName: "Chen" },
    issues: [{ code: "missing_sdr" as const }],
  };
  assert.equal(grantMatchesListFilters(grant, {
    searchQuery: "emily",
    status: "awarded",
    year: "2026",
    issue: "any",
  }), true);
  assert.equal(grantMatchesListFilters(grant, {
    searchQuery: "emily",
    status: "completed",
    year: "2026",
    issue: "any",
  }), false);
  assert.equal(grantMatchesListFilters(grant, {
    searchQuery: "not present",
    status: "awarded",
    year: "2026",
    issue: "missing_sdr",
  }), false);
  assert.equal(grantMatchesListFilters(grant, {
    searchQuery: "G-2026",
    status: "awarded",
    year: "2026",
    issue: "missing_lpi",
  }), false);
});