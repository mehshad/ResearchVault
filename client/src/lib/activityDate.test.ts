import assert from "node:assert/strict";
import test from "node:test";

import { formatActivityDate } from "./activityDate";

test("labels the previous Doha calendar day as yesterday even when under 24 hours old", () => {
  const now = new Date("2026-08-19T09:23:00.000Z"); // 12:23 PM in Doha
  const activity = new Date("2026-08-18T14:28:00.000Z"); // 5:28 PM in Doha

  assert.equal(
    formatActivityDate(activity, now),
    "Yesterday, 5:28 PM"
  );
});

test("labels an earlier time on the same Doha calendar day as today", () => {
  const now = new Date("2026-08-19T09:23:00.000Z"); // 12:23 PM in Doha
  const activity = new Date("2026-08-19T08:00:00.000Z"); // 11:00 AM in Doha

  assert.equal(formatActivityDate(activity, now), "Today, 11:00 AM");
});

test("uses Doha calendar days across the UTC date boundary", () => {
  const now = new Date("2026-08-19T00:30:00.000Z"); // 3:30 AM Aug 19 in Doha
  const activity = new Date("2026-08-18T22:30:00.000Z"); // 1:30 AM Aug 19 in Doha

  assert.equal(formatActivityDate(activity, now), "Today, 1:30 AM");
});

test("shows a day count for recent activities older than yesterday", () => {
  const now = new Date("2026-08-19T09:23:00.000Z");
  const activity = new Date("2026-08-16T09:23:00.000Z");

  assert.equal(formatActivityDate(activity, now), "3 days ago");
});