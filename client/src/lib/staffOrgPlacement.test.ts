import test from "node:test";
import assert from "node:assert/strict";

import { resolveOrgPlacement } from "./staffOrgPlacement";

const departments = [
  { id: 1, name: "Translational Medicine" },
  { id: 2, name: "Pathology" },
];

const sections = [
  { id: 10, name: "Disease Modelling and Therapeutics (DMT-LAB)", type: "Laboratory", departmentId: 1 },
  { id: 11, name: "Anatomical Pathology", type: "Clinic", departmentId: 2 },
];

test("the structured department and section are what a profile shows", () => {
  const placement = resolveOrgPlacement(
    { departmentId: 1, sectionId: 10, department: null },
    departments,
    sections,
  );

  assert.equal(placement.departmentName, "Translational Medicine");
  assert.equal(placement.section?.name, "Disease Modelling and Therapeutics (DMT-LAB)");
  assert.equal(placement.section?.type, "Laboratory");
});

// The case the page used to get wrong: no free text at all, so it showed
// nothing, even though the record says precisely where the person works.
test("a record with only structured links still names a department", () => {
  const placement = resolveOrgPlacement(
    { departmentId: 2, sectionId: null, department: null },
    departments,
    sections,
  );

  assert.equal(placement.departmentName, "Pathology");
  assert.equal(placement.section, null);
});

test("a section implies its department when the record names no department", () => {
  const placement = resolveOrgPlacement(
    { departmentId: null, sectionId: 11, department: null },
    departments,
    sections,
  );

  assert.equal(placement.departmentName, "Pathology");
});

test("the structured department wins over free text that disagrees with it", () => {
  const placement = resolveOrgPlacement(
    { departmentId: 1, sectionId: null, department: "Some Former Department" },
    departments,
    sections,
  );

  assert.equal(placement.departmentName, "Translational Medicine");
});

test("free text still answers for a record that has nothing else", () => {
  const placement = resolveOrgPlacement(
    { departmentId: null, sectionId: null, department: "Translational medicine" },
    departments,
    sections,
  );

  assert.equal(placement.departmentName, "Translational medicine");
});

test("a blank free-text department is nothing, not an empty name", () => {
  assert.equal(
    resolveOrgPlacement({ department: "   " }, departments, sections).departmentName,
    null,
  );
  assert.equal(
    resolveOrgPlacement({}, departments, sections).departmentName,
    null,
  );
});

// The lists arrive from their own queries and are empty while those load, or
// if the endpoints refuse. Neither should blank out a department the record
// can still name itself.
test("ids that resolve to nothing fall back rather than showing an empty label", () => {
  const placement = resolveOrgPlacement(
    { departmentId: 99, sectionId: 99, department: "Translational medicine" },
    departments,
    sections,
  );

  assert.equal(placement.departmentName, "Translational medicine");
  assert.equal(placement.section, null);
});
