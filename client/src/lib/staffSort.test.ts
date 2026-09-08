import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SORT_DIRECTION,
  nextSort,
  type SortField,
  type SortState,
} from "./staffSort";

const byName: SortState = { field: "name", direction: "asc" };

// ── The bug this exists for ─────────────────────────────────────────────────

test("picking a field from the dropdown does not inherit the old direction", () => {
  // Sort by Active SDRs (descending, deliberately), then pick Name from the
  // dropdown. The directory used to come back Z to A under a control reading
  // "Sort by: Name", because only the column headers set a direction.
  const busiestFirst = nextSort(byName, "activeResearchActivities", true);
  assert.equal(busiestFirst.direction, "desc");

  const backToName = nextSort(busiestFirst, "name", false);
  assert.deepEqual(backToName, { field: "name", direction: "asc" });
});

test("no field can inherit a direction from any other", () => {
  const fields: SortField[] = ["name", "department", "jobTitle", "activeResearchActivities"];
  for (const from of fields) {
    for (const to of fields) {
      if (from === to) continue;
      for (const direction of ["asc", "desc"] as const) {
        const result = nextSort({ field: from, direction }, to, true);
        assert.deepEqual(
          result,
          { field: to, direction: DEFAULT_SORT_DIRECTION[to] },
          `${from}/${direction} -> ${to}`,
        );
      }
    }
  }
});

// ── Opening directions ──────────────────────────────────────────────────────

test("a count opens busiest-first and the rest open A to Z", () => {
  assert.equal(DEFAULT_SORT_DIRECTION.activeResearchActivities, "desc");
  assert.equal(DEFAULT_SORT_DIRECTION.name, "asc");
  assert.equal(DEFAULT_SORT_DIRECTION.department, "asc");
  assert.equal(DEFAULT_SORT_DIRECTION.jobTitle, "asc");
});

// ── Repeating the field you are already on ──────────────────────────────────

test("a column header reverses the column it already sorts", () => {
  const reversed = nextSort(byName, "name", true);
  assert.deepEqual(reversed, { field: "name", direction: "desc" });
  assert.deepEqual(nextSort(reversed, "name", true), { field: "name", direction: "asc" });
});

test("the dropdown leaves the sort alone when you re-pick it", () => {
  // You picked what you already had. The direction button beside it is how a
  // direction gets changed from that control.
  const descending: SortState = { field: "name", direction: "desc" };
  assert.deepEqual(nextSort(descending, "name", false), descending);
});

test("nextSort returns a fresh state rather than mutating the one given", () => {
  const current: SortState = { field: "name", direction: "asc" };
  nextSort(current, "jobTitle", true);
  assert.deepEqual(current, { field: "name", direction: "asc" });
});
