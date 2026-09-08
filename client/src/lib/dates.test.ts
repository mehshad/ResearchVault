import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatDate,
  formatDateLong,
  formatDateTime,
  formatMonthYear,
} from "./dates";

// Local time on purpose: these render what a reader sees on their own machine,
// and a bare "2026-09-08" would be midnight UTC, which is the previous evening
// in the Americas and would make the tests pass for the wrong reason.
const on = (y: number, m: number, d: number, hh = 0, mm = 0) => new Date(y, m - 1, d, hh, mm);

test("dates are written day first, zero padded", () => {
  // The whole point: 08/09/2026 is 8 September, not 9 August.
  assert.equal(formatDate(on(2026, 9, 8)), "08/09/2026");
  assert.equal(formatDate(on(2026, 12, 31)), "31/12/2026");
  assert.equal(formatDate(on(2026, 1, 1)), "01/01/2026");
});

test("a day and a month that could be swapped are not", () => {
  // The pair that exposes a month-first formatter.
  assert.equal(formatDate(on(2026, 9, 8)), "08/09/2026");
  assert.equal(formatDate(on(2026, 8, 9)), "09/08/2026");
});

test("ISO strings and Dates give the same answer", () => {
  assert.equal(formatDate("2026-09-08T00:00:00"), "08/09/2026");
  assert.equal(formatDate(on(2026, 9, 8)), formatDate("2026-09-08T00:00:00"));
});

test("nothing in, fallback out", () => {
  // "Invalid Date" in a table cell tells a reader nothing they can act on.
  for (const empty of [null, undefined, ""]) {
    assert.equal(formatDate(empty), "", String(empty));
  }
  assert.equal(formatDate("not a date"), "");
  assert.equal(formatDate(null, "—"), "—");
  assert.equal(formatDateLong(undefined, "Not recorded"), "Not recorded");
});

test("the long form is still day first", () => {
  assert.equal(formatDateLong(on(2026, 9, 8)), "8 Sep 2026");
  assert.equal(formatDateLong(on(2026, 1, 22)), "22 Jan 2026");
});

test("date and time use a 24-hour clock", () => {
  assert.equal(formatDateTime(on(2026, 9, 8, 14, 30)), "08/09/2026 14:30");
  assert.equal(formatDateTime(on(2026, 9, 8, 9, 5)), "08/09/2026 09:05");
  // Midnight is 00:00, not 12:00 with an am nobody printed.
  assert.equal(formatDateTime(on(2026, 9, 8, 0, 0)), "08/09/2026 00:00");
});

test("month and year only", () => {
  assert.equal(formatMonthYear(on(2026, 9, 8)), "Sep 2026");
});

test("the format does not follow the reader's browser", () => {
  // The bug this replaces: toLocaleDateString() with no locale gave a
  // different order to a reader in New York than to one in Doha.
  const date = on(2026, 9, 8);
  assert.equal(formatDate(date), "08/09/2026");
  assert.notEqual(formatDate(date), date.toLocaleDateString("en-US"));
});
