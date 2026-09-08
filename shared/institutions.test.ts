import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAddInstitution,
  findInstitutionByName,
  institutionKey,
  isUsableInstitutionName,
  normaliseInstitutionName,
} from "./institutions";

const list = [
  { id: 1, name: "Hamad Medical Corporation" },
  { id: 2, name: "Sidra Medicine" },
  { id: 3, name: "Weill Cornell Medical College in Qatar" },
];

// ── What counts as the same organisation ────────────────────────────────────

test("case, spacing and punctuation do not make a second institution", () => {
  const spellings = [
    "Hamad Medical Corporation",
    "hamad medical corporation",
    "HAMAD MEDICAL CORPORATION",
    "Hamad  Medical-Corporation",
    " Hamad Medical Corporation ",
  ];
  const keys = new Set(spellings.map(institutionKey));
  assert.equal(keys.size, 1, [...keys].join(" | "));
});

test("different organisations keep different keys", () => {
  assert.notEqual(institutionKey("Qatar University"), institutionKey("Qatar Biobank"));
});

test("near duplicates are left for a person to spot, not merged", () => {
  // Same place, different name. Merging these needs judgement, and guessing
  // wrong silently folds two organisations into one a reader cannot separate.
  assert.notEqual(
    institutionKey("Weill Cornell Medical College in Qatar"),
    institutionKey("Weill Cornell Medicine Qatar"),
  );
});

test("an accented name keeps its own key rather than collapsing to nothing", () => {
  // Non-ASCII letters are stripped by the key, so a name that is *only*
  // non-ASCII would key to "" and be unusable. This one keeps its ASCII run.
  assert.equal(institutionKey("Centro de Investigación") .length > 0, true);
});

// ── Usability ───────────────────────────────────────────────────────────────

test("a name with no letters or digits is not usable", () => {
  for (const name of ["", "   ", "---", "..."]) {
    assert.equal(isUsableInstitutionName(name), false, JSON.stringify(name));
  }
});

test("a real name is usable", () => {
  assert.equal(isUsableInstitutionName("Osaka University"), true);
});

test("stored names are tidied but not otherwise rewritten", () => {
  assert.equal(normaliseInstitutionName("  Qatar   University  "), "Qatar University");
  // Capitalisation is the submitter's, not ours to correct.
  assert.equal(normaliseInstitutionName("qatar university"), "qatar university");
});

// ── Looking a name up ───────────────────────────────────────────────────────

test("an existing institution is found however it was typed", () => {
  assert.equal(findInstitutionByName(list, "HAMAD medical corporation")?.id, 1);
  assert.equal(findInstitutionByName(list, "sidra  medicine")?.id, 2);
});

test("an unknown name finds nothing", () => {
  assert.equal(findInstitutionByName(list, "Osaka University"), undefined);
});

test("an empty name finds nothing rather than the first entry", () => {
  assert.equal(findInstitutionByName(list, "   "), undefined);
});

// ── When to offer "add" ─────────────────────────────────────────────────────

test("adding is offered for a name not on the list", () => {
  assert.equal(canAddInstitution(list, "Osaka University"), true);
});

test("adding is not offered for another spelling of one already there", () => {
  // The whole point: the dropdown must never invite a second spelling.
  assert.equal(canAddInstitution(list, "sidra medicine"), false);
  assert.equal(canAddInstitution(list, "Sidra  Medicine"), false);
});

test("adding is not offered for a name that is only punctuation", () => {
  assert.equal(canAddInstitution(list, "--"), false);
  assert.equal(canAddInstitution(list, ""), false);
});
