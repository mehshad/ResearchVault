import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateDatedValues,
  buildPmoTransitionEvents,
  buildPeriods,
  extractHistoryEvents,
  parseDashboardRange,
  totalsByCurrency,
} from "./officeDashboardSummary";

test("range uses inclusive from and exclusive day-after-to boundaries", () => {
  const range = parseDashboardRange({ from: "2024-01-01", to: "2024-01-31", interval: "month" });
  const result = aggregateDatedValues(range, [
    { eventDate: "2024-01-01T00:00:00Z", category: "A" },
    { eventDate: "2024-01-31T23:59:59Z", category: "A" },
    { eventDate: "2024-02-01T00:00:00Z", category: "A" },
  ], ["A"]);
  assert.equal(result[0].total, 2);
});

test("sparse month and quarter periods are filled", () => {
  const months = parseDashboardRange({ from: "2024-01-15", to: "2024-03-02", interval: "month" });
  assert.deepEqual(buildPeriods(months).map((period) => period.key), ["2024-01", "2024-02", "2024-03"]);
  assert.deepEqual(aggregateDatedValues(months, [], ["RA-200"]).map((row) => row.byCategory["RA-200"]), [0, 0, 0]);
  const quarters = parseDashboardRange({ from: "2023-12-20", to: "2024-04-01", interval: "quarter" });
  assert.deepEqual(buildPeriods(quarters).map((period) => period.key), ["2023-Q4", "2024-Q1", "2024-Q2"]);
});

test("invalid dates, reversed ranges, excessive periods and intervals are rejected", () => {
  assert.throws(() => parseDashboardRange({ from: "2024-02-30", to: "2024-03-01", interval: "month" }));
  assert.throws(() => parseDashboardRange({ from: "2024-03-02", to: "2024-03-01", interval: "month" }));
  assert.throws(() => parseDashboardRange({ from: "2024-01-01", to: "2024-03-01", interval: "week" }));
  assert.throws(() => parseDashboardRange({ from: "2000-01-01", to: "2021-01-01", interval: "year" }));
  assert.throws(() => parseDashboardRange({ from: "2000-01-01", to: "2020-01-01", interval: "month" }));
});

test("currency totals remain separate and invalid amounts are ignored", () => {
  assert.deepEqual(totalsByCurrency([
    { currency: "qar", amount: "12.50" },
    { currency: "QAR", amount: 7.5 },
    { currency: "USD", amount: "3" },
    { currency: null, amount: "2" },
    { currency: "EUR", amount: "not-a-number" },
  ]), { QAR: 20, USD: 3, UNSPECIFIED: 2 });
});

test("status history accepts production PMO actions only with valid recorded event dates", () => {
  const events = extractHistoryEvents([
    { timestamp: "2024-03-10T12:00:00Z", action: "approved", user: "PMO Office" },
    { createdAt: "not-a-date", action: "rejected" },
    { action: "submitted" },
    null,
  ]);
  assert.deepEqual(events, [
    { eventDate: "2024-03-10T12:00:00Z", category: "approved", value: 1 },
  ]);
});

test("PMO dashboard transition series preserve distinct production actions", () => {
  const range = parseDashboardRange({
    from: "2024-03-01",
    to: "2024-03-31",
    interval: "month",
  });
  const events = buildPmoTransitionEvents([
    {
      applicationType: "RA-200",
      event: { timestamp: "2024-03-10T12:00:00Z", action: "approved" },
    },
    {
      applicationType: "RA-200",
      event: { timestamp: "2024-03-11T12:00:00Z", action: "revision_requested" },
    },
    {
      applicationType: "RA-205A",
      event: { timestamp: "2024-03-12T12:00:00Z", action: "approved" },
    },
  ]);
  const [bucket] = aggregateDatedValues(range, events);
  assert.deepEqual(bucket.byCategory, {
    "RA-200: approved": 1,
    "RA-200: revision_requested": 1,
    "RA-205A: approved": 1,
  });
});