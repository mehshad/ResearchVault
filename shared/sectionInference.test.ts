import assert from "node:assert/strict";
import test from "node:test";

import {
  SECTION_INFERENCE_EXCLUDED_MANAGERS,
  inferPlacementFromLineManagers,
} from "./sectionInference.js";

type Person = { email: string; manager?: string | null; section: string | null };

const readers = {
  email: (p: Person) => p.email,
  manager: (p: Person) => p.manager,
  placement: (p: Person) => p.section,
  assign: (p: Person, section: string) => { p.section = section; },
};

const run = (people: Person[], seeded = new Map<string, string>()) =>
  inferPlacementFromLineManagers(people, readers, seeded);

test("a blank section is filled from the line manager", () => {
  const people: Person[] = [
    { email: "lead@x.org", section: "Tumor Biology" },
    { email: "report@x.org", manager: "lead@x.org", section: null },
  ];
  assert.equal(run(people), 1);
  assert.equal(people[1].section, "Tumor Biology");
});

test("a section already set is never replaced", () => {
  // The whole point: an import completes records, it does not correct them.
  const people: Person[] = [
    { email: "lead@x.org", section: "Tumor Biology" },
    { email: "report@x.org", manager: "lead@x.org", section: "Stem Cell" },
  ];
  assert.equal(run(people), 0);
  assert.equal(people[1].section, "Stem Cell");
});

test("the manager may already be on file rather than in the roster", () => {
  const people: Person[] = [
    { email: "report@x.org", manager: "existing.lead@x.org", section: null },
  ];
  const seeded = new Map([["existing.lead@x.org", "Immunoregulation"]]);
  assert.equal(run(people, seeded), 1);
  assert.equal(people[0].section, "Immunoregulation");
});

test("nothing is inherited from an excluded manager", () => {
  // Someone at the top has reports across every department; inheriting from
  // them would file the whole organisation into one section.
  const [excluded] = SECTION_INFERENCE_EXCLUDED_MANAGERS;
  const people: Person[] = [
    { email: excluded, section: "Executive" },
    { email: "dept.head@x.org", manager: excluded, section: null },
  ];
  assert.equal(run(people), 0);
  assert.equal(people[1].section, null);
});

test("an excluded manager is matched whatever the case", () => {
  const [excluded] = SECTION_INFERENCE_EXCLUDED_MANAGERS;
  const people: Person[] = [
    { email: excluded, section: "Executive" },
    { email: "report@x.org", manager: excluded.toUpperCase(), section: null },
  ];
  assert.equal(run(people), 0);
});

test("a manager with no section of their own passes nothing down", () => {
  // One pass, deliberately: nobody inherits from further up a chain that was
  // never stated.
  const people: Person[] = [
    { email: "top@x.org", section: "Genomics" },
    { email: "middle@x.org", manager: "top@x.org", section: null },
    { email: "bottom@x.org", manager: "middle@x.org", section: null },
  ];
  assert.equal(run(people), 1, "only the direct report of a placed manager is filled");
  assert.equal(people[1].section, "Genomics");
  assert.equal(people[2].section, null);
});

test("the result does not depend on row order", () => {
  const forward: Person[] = [
    { email: "lead@x.org", section: "Precision Nutrition" },
    { email: "report@x.org", manager: "lead@x.org", section: null },
  ];
  const reversed: Person[] = [
    { email: "report@x.org", manager: "lead@x.org", section: null },
    { email: "lead@x.org", section: "Precision Nutrition" },
  ];
  run(forward);
  run(reversed);
  assert.equal(forward[1].section, "Precision Nutrition");
  assert.equal(reversed[0].section, "Precision Nutrition");
});

test("someone with no line manager is left alone", () => {
  const people: Person[] = [
    { email: "nobody@x.org", section: null },
    { email: "blank@x.org", manager: "", section: null },
  ];
  assert.equal(run(people), 0);
});

test("an unknown line manager leaves the section blank", () => {
  const people: Person[] = [
    { email: "report@x.org", manager: "ghost@x.org", section: null },
  ];
  assert.equal(run(people), 0);
  assert.equal(people[0].section, null);
});

test("a reporting cycle does not hang or invent a placement", () => {
  const people: Person[] = [
    { email: "a@x.org", manager: "b@x.org", section: null },
    { email: "b@x.org", manager: "a@x.org", section: null },
  ];
  assert.equal(run(people), 0);
});
