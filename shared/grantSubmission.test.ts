import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyGrantSubmission, isHomeInstitution } from "./grantSubmission";

test("we are the lead when the submitting institution is us", () => {
  const result = classifyGrantSubmission({ submittingInstitution: "Sidra Medicine" });
  assert.equal(result.role, "lead");
  assert.equal(result.label, "Sidra Medicine");
});

test("our own name is recognised however it was typed", () => {
  // Years of spreadsheets, several authors. All of these mean us, and a
  // strict comparison would file our own grants as somebody else's.
  for (const spelling of ["Sidra", "SIDRA Medicine", "  sidra medicine  ", "Sidra Medicine Corp."]) {
    assert.equal(isHomeInstitution(spelling), true, spelling);
    assert.equal(classifyGrantSubmission({ submittingInstitution: spelling }).role, "lead", spelling);
  }
});

test("another institution submitting makes us a subawardee, and names them", () => {
  const result = classifyGrantSubmission({ submittingInstitution: "Qatar University" });
  assert.equal(result.role, "subawardee");
  assert.equal(result.submittedBy, "Qatar University");
  assert.equal(result.label, "Subawardee of Qatar University");
});

test("a blank field is unknown, never assumed to be us", () => {
  // 96 of 113 grants are blank today. Defaulting those to Sidra-led would
  // invent a fact about who holds the agreement -- the thing the column
  // exists to answer -- and it would be wrong for every real subaward.
  for (const blank of [null, undefined, "", "   "]) {
    const result = classifyGrantSubmission({ submittingInstitution: blank });
    assert.equal(result.role, "unknown", String(blank));
    assert.equal(result.submittedBy, null);
    assert.equal(result.label, "Not recorded");
  }
});

test("a partner whose name merely contains our name as a fragment is not us", () => {
  // Matched on a whole word, so a hypothetical "Sidrania Institute" stays a
  // partner rather than being absorbed into our own submissions.
  assert.equal(isHomeInstitution("Sidrania Institute"), false);
  assert.equal(classifyGrantSubmission({ submittingInstitution: "Sidrania Institute" }).role, "subawardee");
});
