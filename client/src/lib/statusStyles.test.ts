import assert from "node:assert/strict";
import test from "node:test";

import { normaliseStatus, statusBadgeClass, type StatusDomain } from "./statusStyles";

const domains: StatusDomain[] = ["irb", "ibc", "pmo", "grant", "contract", "patent", "publication", "project"];

test("spelling, case, hyphens and padding do not change the colour", () => {
  const expected = statusBadgeClass("irb", "under_review");
  assert.equal(statusBadgeClass("irb", "Under Review"), expected);
  assert.equal(statusBadgeClass("irb", "under-review"), expected);
  assert.equal(statusBadgeClass("irb", " under_review "), expected);
  assert.equal(normaliseStatus("Under Review"), "under_review");
});

test("the same status has the same colour on every page of a domain", () => {
  // The three IRB pages used to disagree on this one.
  assert.match(statusBadgeClass("irb", "under_review"), /bg-yellow-100/);
  assert.match(statusBadgeClass("pmo", "revision_requested"), /bg-orange-100/);
});

test("an unknown, empty or missing status falls back to gray", () => {
  const fallback = statusBadgeClass("grant", "no_such_status");
  assert.match(fallback, /bg-gray-100/);
  assert.equal(statusBadgeClass("grant", ""), fallback);
  assert.equal(statusBadgeClass("grant", null), fallback);
  assert.equal(statusBadgeClass("grant", undefined), fallback);
});

test("Published * is published", () => {
  assert.equal(statusBadgeClass("publication", "Published *"), statusBadgeClass("publication", "published"));
  assert.match(statusBadgeClass("publication", "Published *"), /bg-green-100/);
  assert.match(statusBadgeClass("publication", "Published - invalid"), /bg-red-100/);
});

test("every class string carries a light and a dark variant", () => {
  const statuses = [
    "draft", "submitted", "triage_complete", "under_review", "ready_for_decision", "approved",
    "rejected", "revisions_requested", "resubmitted", "pending", "expired", "vetted", "active",
    "revision_requested", "in_review", "awarded", "completed", "not_awarded", "cancelled",
    "withdrawn", "terminated", "transferred", "suspended", "filed", "granted", "in_preparation",
    "published", "published_invalid", "planning", "on_hold", "no_such_status",
  ];
  for (const domain of domains) {
    for (const status of statuses) {
      const cls = statusBadgeClass(domain, status);
      assert.match(cls, /(^|\s)bg-[a-z]+-100(\s|$)/, `${domain}/${status}: ${cls}`);
      assert.match(cls, /(^|\s)text-[a-z]+-700(\s|$)/, `${domain}/${status}: ${cls}`);
      assert.match(cls, /(^|\s)dark:bg-[a-z]+-950(\s|$)/, `${domain}/${status}: ${cls}`);
      assert.match(cls, /(^|\s)dark:text-[a-z]+-300(\s|$)/, `${domain}/${status}: ${cls}`);
    }
  }
});
