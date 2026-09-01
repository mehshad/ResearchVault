import assert from "node:assert/strict";
import test from "node:test";

import {
  groupInvestigatorsBySection,
  type SectionMember,
} from "./organizationInvestigators.js";

const person = (
  id: number,
  firstName: string,
  lastName: string,
  extra: Partial<SectionMember> = {},
): SectionMember => ({
  id, firstName, lastName, isInvestigator: true, sectionId: 1, ...extra,
});

test("only designated investigators appear", () => {
  const grouped = groupInvestigatorsBySection([
    person(1, "Ada", "Lovelace"),
    person(2, "Grace", "Hopper", { isInvestigator: false }),
  ]);
  assert.deepEqual(grouped.get(1)?.map((p) => p.id), [1]);
});

test("someone with no section placement is not shown anywhere", () => {
  // The common case right now: staff imported without a Section ID. They must
  // not silently collect under some default section.
  const grouped = groupInvestigatorsBySection([
    person(1, "Ada", "Lovelace", { sectionId: null }),
    person(2, "Grace", "Hopper", { sectionId: 7 }),
  ]);
  assert.equal(grouped.has(7), true);
  assert.equal(grouped.size, 1);
  assert.equal([...grouped.values()].flat().length, 1);
});

test("investigators are grouped by their own section", () => {
  const grouped = groupInvestigatorsBySection([
    person(1, "Ada", "Lovelace", { sectionId: 1 }),
    person(2, "Grace", "Hopper", { sectionId: 2 }),
    person(3, "Alan", "Turing", { sectionId: 1 }),
  ]);
  assert.deepEqual(grouped.get(1)?.map((p) => p.id).sort(), [1, 3]);
  assert.deepEqual(grouped.get(2)?.map((p) => p.id), [2]);
});

test("a section's investigators are ordered by surname", () => {
  const grouped = groupInvestigatorsBySection([
    person(1, "Alan", "Turing"),
    person(2, "Ada", "Lovelace"),
    person(3, "Grace", "Hopper"),
  ]);
  assert.deepEqual(
    grouped.get(1)?.map((p) => p.lastName),
    ["Hopper", "Lovelace", "Turing"],
  );
});

test("two people sharing a surname are ordered by given name", () => {
  const grouped = groupInvestigatorsBySection([
    person(1, "Zoe", "Hopper"),
    person(2, "Grace", "Hopper"),
  ]);
  assert.deepEqual(grouped.get(1)?.map((p) => p.firstName), ["Grace", "Zoe"]);
});

test("no staff at all yields no groups rather than throwing", () => {
  // The chart renders before the staff query resolves, and for anyone whose
  // access to the Scientists area is refused.
  assert.equal(groupInvestigatorsBySection(undefined).size, 0);
  assert.equal(groupInvestigatorsBySection([]).size, 0);
});
