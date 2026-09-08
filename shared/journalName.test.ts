import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeJournalName,
  displayJournalName,
  normalizeJournalName,
} from "./journalName";

// ── Matching ────────────────────────────────────────────────────────────────

test("the spellings the sources disagree about compare equal", () => {
  // The pairs this exists for, taken from the real data.
  assert.equal(
    normalizeJournalName("The Lancet. Oncology"),
    normalizeJournalName("LANCET ONCOLOGY"),
  );
  assert.equal(
    normalizeJournalName("Journal of Experimental Clinical Cancer Research"),
    normalizeJournalName("JOURNAL OF EXPERIMENTAL & CLINICAL CANCER RESEARCH"),
  );
  assert.equal(normalizeJournalName("Nucleic Acids Res"), "nucleic acids res");
});

test("a leading The is dropped, an interior the is not", () => {
  assert.equal(normalizeJournalName("The Lancet"), "lancet");
  assert.equal(
    normalizeJournalName("JOURNAL OF THE AMERICAN COLLEGE OF CARDIOLOGY"),
    "journal of the american college of cardiology",
  );
});

test("an HTML escape breaks matching until it is decoded", () => {
  // "&amp;" normalises to the word "amp", not to nothing, which is exactly why
  // the summary suggests the decoded name.
  const escaped = "Clinical Reviews in Allergy &amp; Immunology";
  const real = "CLINICAL REVIEWS IN ALLERGY & IMMUNOLOGY";
  assert.notEqual(normalizeJournalName(escaped), normalizeJournalName(real));
  assert.equal(normalizeJournalName(decodeJournalName(escaped)), normalizeJournalName(real));
});

test("normalising is safe on nothing", () => {
  for (const empty of [null, undefined, "", "   ", "&&&"]) {
    assert.equal(normalizeJournalName(empty), "", String(empty));
  }
});

// ── Display casing ──────────────────────────────────────────────────────────

test("an all-capitals name is title cased", () => {
  assert.equal(displayJournalName("NUCLEIC ACIDS RESEARCH"), "Nucleic Acids Research");
  assert.equal(displayJournalName("MACROMOLECULES"), "Macromolecules");
  assert.equal(displayJournalName("WORLD POLITICS"), "World Politics");
});

test("small words stay small inside the title", () => {
  assert.equal(
    displayJournalName("JOURNAL OF THE ROYAL STATISTICAL SOCIETY"),
    "Journal of the Royal Statistical Society",
  );
  assert.equal(
    displayJournalName("PHYSICS IN MEDICINE AND BIOLOGY"),
    "Physics in Medicine and Biology",
  );
  assert.equal(
    displayJournalName("BULLETIN OF THE HISTORY OF MEDICINE"),
    "Bulletin of the History of Medicine",
  );
});

test("a small word at the start or the end is still capitalised", () => {
  assert.equal(displayJournalName("THE ANATOMICAL RECORD"), "The Anatomical Record");
  assert.equal(displayJournalName("ANNALS OF"), "Annals Of");
});

test("acronyms are left alone", () => {
  assert.equal(displayJournalName("JAMA ONCOLOGY"), "JAMA Oncology");
  assert.equal(displayJournalName("BMJ OPEN"), "BMJ Open");
  assert.equal(displayJournalName("PLOS BIOLOGY"), "PLOS Biology");
  assert.equal(displayJournalName("AIDS RESEARCH AND THERAPY"), "AIDS Research and Therapy");
  assert.equal(displayJournalName("RNA BIOLOGY"), "RNA Biology");
});

test("short vowel-less words are treated as acronyms even when unlisted", () => {
  // "GFF" is a real journal name in the data and is not in any list.
  assert.equal(displayJournalName("GFF"), "GFF");
});

test("hyphenated names capitalise both halves", () => {
  assert.equal(
    displayJournalName("CA-A CANCER JOURNAL FOR CLINICIANS"),
    "CA-A Cancer Journal for Clinicians",
  );
  assert.equal(
    displayJournalName("TRANSPORTATION RESEARCH PART C-EMERGING TECHNOLOGIES"),
    "Transportation Research Part C-Emerging Technologies",
  );
  // A hyphen is a subtitle separator in these names, so what follows starts a
  // phrase and is never kept small: "Governance-an" reads as a typo.
  assert.equal(
    displayJournalName("GOVERNANCE-AN INTERNATIONAL JOURNAL OF POLICY"),
    "Governance-An International Journal of Policy",
  );
});

test("an ampersand survives", () => {
  assert.equal(displayJournalName("ARTHRITIS RESEARCH & THERAPY"), "Arthritis Research & Therapy");
});

test("a name that already has lower case is left exactly as it is", () => {
  // Somebody or something already cased these deliberately, and no rule simple
  // enough to trust would improve them.
  for (const name of [
    "Journal of tRNA Biology",
    "eLife",
    "mBio",
    "npj Digital Medicine",
    "The Lancet. Oncology",
  ]) {
    assert.equal(displayJournalName(name), name, name);
  }
});

test("spacing is preserved, not collapsed", () => {
  // Display must not silently rewrite the value beyond its case.
  assert.equal(displayJournalName("  UROLOGY  "), "Urology");
});

test("nothing in, nothing out", () => {
  for (const empty of [null, undefined, "", "   "]) {
    assert.equal(displayJournalName(empty), "", String(empty));
  }
});

test("casing never changes what a name matches", () => {
  // The property that keeps this display-only: re-casing a name must not move
  // it to a different journal.
  for (const name of [
    "NUCLEIC ACIDS RESEARCH",
    "JOURNAL OF THE ROYAL STATISTICAL SOCIETY",
    "CA-A CANCER JOURNAL FOR CLINICIANS",
    "GFF",
    "ARTHRITIS RESEARCH & THERAPY",
  ]) {
    assert.equal(
      normalizeJournalName(displayJournalName(name)),
      normalizeJournalName(name),
      name,
    );
  }
});
