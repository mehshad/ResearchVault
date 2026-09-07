import { test } from "node:test";
import assert from "node:assert/strict";
import { findDuplicateCandidates, nameSimilarity, nameWords } from "./referenceDuplicates";

const entry = (id: number, name: string) => ({ id, name });

/**
 * A stand-in for a real list.
 *
 * The scoring weighs each word by how rare it is across the list, so it can
 * only be tested against a list. Two entries on their own carry no information
 * about which of their words are distinctive, and testing with a pair would be
 * testing a degenerate case the function is never used in.
 */
const CORPUS = [
  "Qatar University",
  "Osaka University",
  "University of Oxford",
  "University of Exeter",
  "University of Algiers",
  "Hamad Medical Corporation",
  "Primary Health Care Corporation",
  "Weill Cornell Medical College in Qatar",
  "Qatar Biomedical Research Institute",
  "Sidra Medicine",
  "Aga Khan University",
  "Marmara University",
  "Semmelweis University",
  "Bilkent University",
  "Baylor College of Medicine",
  "Addgene",
  "Acumenta",
].map((name, i) => entry(i + 1, name));

const withExtra = (...names: string[]) => [
  ...CORPUS,
  ...names.map((name, i) => entry(1000 + i, name)),
];

const pairFound = (
  found: ReturnType<typeof findDuplicateCandidates>,
  a: string,
  b: string,
) =>
  found.some(
    (c) =>
      (c.left.name === a && c.right.name === b) || (c.left.name === b && c.right.name === a),
  );

// ── The pairs this exists to catch ──────────────────────────────────────────

test("a misspelling inside a word is caught", () => {
  // The name key cannot: "osakauniveristy" and "osakauniversity" are different
  // keys, so both can exist, and only a fuzzy comparison finds them.
  const found = findDuplicateCandidates(withExtra("Osaka Univeristy"));
  assert.ok(pairFound(found, "Osaka University", "Osaka Univeristy"));
});

test("Centre and Center are the same place", () => {
  const found = findDuplicateCandidates(
    withExtra("Equine Veterinary Medical Center (EVMC)", "Equine Veterinary Medical Centre (EVMC)"),
  );
  assert.ok(
    pairFound(
      found,
      "Equine Veterinary Medical Center (EVMC)",
      "Equine Veterinary Medical Centre (EVMC)",
    ),
  );
});

test("an added acronym is caught as containment", () => {
  const found = findDuplicateCandidates(withExtra("Hamad Medical Corporation (HMC)"));
  const pair = found.find(
    (c) =>
      c.left.name.startsWith("Hamad Medical Corporation") &&
      c.right.name.startsWith("Hamad Medical Corporation"),
  );
  assert.ok(pair);
  assert.equal(pair!.reason, "contains");
});

test("a leading article does not make a second institution", () => {
  const found = findDuplicateCandidates(withExtra("The Aga Khan University"));
  assert.ok(pairFound(found, "Aga Khan University", "The Aga Khan University"));
});

// ── What it must not do ─────────────────────────────────────────────────────

test("two different universities are not paired", () => {
  // The failure that made word weighting necessary: "university" is most of
  // both names, so plain overlap called them a match.
  const found = findDuplicateCandidates(CORPUS);
  assert.equal(pairFound(found, "Qatar University", "Osaka University"), false);
  assert.equal(pairFound(found, "University of Oxford", "University of Exeter"), false);
});

test("two different corporations are not paired", () => {
  const found = findDuplicateCandidates(CORPUS);
  assert.equal(
    pairFound(found, "Hamad Medical Corporation", "Primary Health Care Corporation"),
    false,
  );
});

test("short words are not fuzzily matched", () => {
  // "Oulu" and "Iowa" are two edits apart and two different places. Below five
  // characters, being close says nothing.
  const found = findDuplicateCandidates(withExtra("University of Oulu", "University of Iowa"));
  assert.equal(pairFound(found, "University of Oulu", "University of Iowa"), false);
});

test("nothing is merged; candidates are only reported", () => {
  const entries = withExtra("Osaka Univeristy");
  const before = JSON.stringify(entries);
  findDuplicateCandidates(entries);
  assert.equal(JSON.stringify(entries), before);
});

test("containment is reported as its own kind of evidence", () => {
  // Often two real institutions, so the screen should say why they were paired
  // rather than assert they are the same.
  const found = findDuplicateCandidates(withExtra("Qatar University College of Medicine"));
  const pair = found.find(
    (c) =>
      pairFound([c], "Qatar University", "Qatar University College of Medicine"),
  );
  assert.ok(pair);
  assert.equal(pair!.reason, "contains");
});

// ── Mechanics ───────────────────────────────────────────────────────────────

test("each pair is offered once, not twice", () => {
  const found = findDuplicateCandidates(withExtra("Osaka Univeristy"));
  const osaka = found.filter(
    (c) => /osaka/i.test(c.left.name) && /osaka/i.test(c.right.name),
  );
  assert.equal(osaka.length, 1);
});

test("the most alike pair comes first", () => {
  const found = findDuplicateCandidates(
    withExtra("Osaka Univeristy", "Qatar University College of Medicine"),
  );
  assert.ok(found.length >= 2);
  assert.ok(found[0].similarity >= found[found.length - 1].similarity);
});

test("an empty or single-entry list yields nothing", () => {
  assert.deepEqual(findDuplicateCandidates([]), []);
  assert.deepEqual(findDuplicateCandidates([entry(1, "Only One")]), []);
});

test("single characters are ignored, and nothing else is", () => {
  // "A", "M" and "X" say nothing about whether two organisations are the same;
  // "of" says little, but the weighting handles that on its own by seeing how
  // often it appears, which is better than a stop-word list to maintain.
  assert.deepEqual([...nameWords("A&M University of X")].sort(), ["of", "university"]);
});

test("trigram similarity is unaffected by case and punctuation", () => {
  assert.equal(nameSimilarity("Hamad Medical Corporation", "hamad  medical-corporation"), 1);
  assert.equal(nameSimilarity("", "anything"), 0);
});
