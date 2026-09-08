import { test } from "node:test";
import assert from "node:assert/strict";
import {
  investigatorTypeForJobTitle,
  investigatorTypeOf,
} from "./investigatorType";
import { JOB_TITLES } from "./constants";

test("a physician is a clinician", () => {
  assert.equal(investigatorTypeForJobTitle("Physician"), "Clinician");
});

test("nurses are clinical too, however the title is written", () => {
  // No nurse title is in JOB_TITLES yet. The office named nurses as clinical,
  // so the rule is written for one arriving rather than needing a code change
  // on the day it does.
  for (const title of ["Nurse", "Research Nurse", "Nursing Lead", "Senior Staff Nurse"]) {
    assert.equal(investigatorTypeForJobTitle(title), "Clinician", title);
  }
});

test("everyone else on a grant is a researcher", () => {
  for (const title of [
    "Investigator",
    "Staff Scientist",
    "Post Doctoral Fellow",
    "Post-doctoral Fellow",
    "Research Specialist",
    "PhD Student",
  ]) {
    assert.equal(investigatorTypeForJobTitle(title), "Researcher", title);
  }
});

test("no job title means nothing has been said", () => {
  // Not "Researcher": an empty staff record should not assert something about
  // the person.
  for (const empty of [null, undefined, "", "   ", 42 as unknown as string]) {
    assert.equal(investigatorTypeForJobTitle(empty), null, String(empty));
  }
});

test("the match is on words, not on the whole string", () => {
  // "Physician" inside a longer title still counts...
  assert.equal(investigatorTypeForJobTitle("Consultant Physician"), "Clinician");
  assert.equal(investigatorTypeForJobTitle("PHYSICIAN"), "Clinician");
  // ...but a word that merely contains one does not.
  assert.equal(investigatorTypeForJobTitle("Nurseryman"), "Researcher");
});

test("punctuation and spacing do not change the answer", () => {
  assert.equal(
    investigatorTypeForJobTitle("Physician - Paediatrics"),
    investigatorTypeForJobTitle("Physician, Paediatrics"),
  );
});

test("every canonical job title resolves to something", () => {
  // A title on the official list that returned null would show as blank on the
  // grant form for a person whose record is perfectly complete.
  for (const title of JOB_TITLES) {
    assert.notEqual(investigatorTypeForJobTitle(title), null, title);
  }
});

test("only Physician is clinical among the canonical titles", () => {
  // Matches what the office recorded on 272 grants: every Clinician there is a
  // physician, and no other title ever was.
  const clinical = JOB_TITLES.filter(
    (title) => investigatorTypeForJobTitle(title) === "Clinician",
  );
  assert.deepEqual(clinical, ["Physician"]);
});

test("it can be asked of a staff record directly", () => {
  assert.equal(investigatorTypeOf({ jobTitle: "Physician" }), "Clinician");
  assert.equal(investigatorTypeOf({ jobTitle: "Staff Scientist" }), "Researcher");
  assert.equal(investigatorTypeOf({ jobTitle: null }), null);
  assert.equal(investigatorTypeOf(null), null);
  assert.equal(investigatorTypeOf(undefined), null);
});
