import assert from "node:assert/strict";
import test from "node:test";

import {
  isWithinYearWindow,
  orderPublicationsNewestFirst,
  publicationYearOf,
  yearWindowStart,
} from "./programPublications";

const now = new Date("2026-09-13T10:00:00Z");

test("a window counts calendar years back from this one, inclusive", () => {
  assert.equal(yearWindowStart(1, now), 2026);
  assert.equal(yearWindowStart(3, now), 2024);
  assert.equal(yearWindowStart(5, now), 2022);
  assert.equal(yearWindowStart("all", now), null);
});

test("a paper from January of the first admitted year is inside the window", () => {
  const january2024 = { publicationDate: "2024-01-02" };
  const december2023 = { publicationDate: "2023-12-31" };
  assert.equal(isWithinYearWindow(january2024, 3, now), true);
  assert.equal(isWithinYearWindow(december2023, 3, now), false);
  assert.equal(isWithinYearWindow(december2023, 5, now), true);
});

test("an undated paper is shown by All and by no finite window", () => {
  const undated = { publicationDate: null };
  assert.equal(isWithinYearWindow(undated, "all", now), true);
  assert.equal(isWithinYearWindow(undated, 1, now), false);
  assert.equal(isWithinYearWindow(undated, 5, now), false);
  assert.equal(publicationYearOf(undated), null);
});

test("newest on top, same-year papers by full date, undated last", () => {
  const ordered = orderPublicationsNewestFirst([
    { title: "undated", publicationDate: null },
    { title: "march 2025", publicationDate: "2025-03-01" },
    { title: "june 2026", publicationDate: "2026-06-15" },
    { title: "november 2025", publicationDate: "2025-11-20" },
    { title: "bad date", publicationDate: "not a date" },
  ]);
  assert.deepEqual(
    ordered.map((publication) => publication.title),
    ["june 2026", "november 2025", "march 2025", "bad date", "undated"],
  );
});

test("ordering leaves the caller's array alone", () => {
  const input = [
    { title: "old", publicationDate: "2020-01-01" },
    { title: "new", publicationDate: "2026-01-01" },
  ];
  orderPublicationsNewestFirst(input);
  assert.equal(input[0].title, "old");
});
