import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVettingFilters, type VettingFilters } from "./publicationVettingFilters";

const defaults: VettingFilters = {
  status: "Published",
  tag: "no-issues",
  scientistId: "all",
  dateFrom: "",
  dateTo: "",
  yearRange: "this-year",
};

test("a complete stored set comes back intact", () => {
  const stored: VettingFilters = {
    status: "Under review",
    tag: "no-sdr",
    scientistId: "15",
    dateFrom: "2024-01-01",
    dateTo: "2024-12-31",
    yearRange: "5",
  };
  assert.deepEqual(parseVettingFilters(stored, defaults), stored);
});

test("nothing stored means the defaults", () => {
  for (const empty of [null, undefined, "", 0, [], "not an object"]) {
    assert.deepEqual(parseVettingFilters(empty, defaults), defaults, String(empty));
  }
});

test("a year range the app no longer offers falls back", () => {
  // The failure this exists for: a stored value outliving the option it names
  // would leave the queue filtered by something with no control on screen.
  const parsed = parseVettingFilters({ ...defaults, yearRange: "10" }, defaults);
  assert.equal(parsed.yearRange, "this-year");
});

test("a partial object keeps the defaults for what is absent", () => {
  const parsed = parseVettingFilters({ status: "Concept" }, defaults);
  assert.equal(parsed.status, "Concept");
  assert.equal(parsed.tag, defaults.tag);
  assert.equal(parsed.scientistId, defaults.scientistId);
  assert.equal(parsed.yearRange, defaults.yearRange);
});

test("dates must look like dates, and an empty date stays empty", () => {
  assert.equal(parseVettingFilters({ dateFrom: "2024-03-01" }, defaults).dateFrom, "2024-03-01");
  for (const bad of ["01/03/2024", "2024-3-1", "yesterday", 20240301, {}]) {
    assert.equal(parseVettingFilters({ dateFrom: bad }, defaults).dateFrom, "", String(bad));
  }
});

test("a date is cleared rather than defaulted", () => {
  // Dates have no meaningful default -- an unparseable one means no bound.
  const withDates = { ...defaults, dateFrom: "2024-01-01", dateTo: "2024-12-31" };
  assert.equal(parseVettingFilters({ dateTo: "rubbish" }, withDates).dateTo, "");
});

test("values are trimmed, and absurd ones refused", () => {
  assert.equal(parseVettingFilters({ status: "  Concept  " }, defaults).status, "Concept");
  assert.equal(parseVettingFilters({ status: "   " }, defaults).status, defaults.status);
  assert.equal(parseVettingFilters({ status: "x".repeat(500) }, defaults).status, defaults.status);
});

test("wrong types never reach the screen", () => {
  const parsed = parseVettingFilters(
    { status: 7, tag: null, scientistId: {}, yearRange: [] },
    defaults,
  );
  assert.deepEqual(parsed, defaults);
});
