import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStaffNameIndex, matchStaffByName, nameTokens } from "./staffNameMatching";

const staff = [
  { id: 35, firstName: "Khalid", lastName: "Fakhro" },
  { id: 27, firstName: "Ammira", lastName: "Akil" },
  { id: 12, firstName: "Mohamed", lastName: "Djekidel" },
  { id: 44, firstName: "Jerome", lastName: "Le Nours" },
];

const index = buildStaffNameIndex(staff);
const match = (name: string) => matchStaffByName(index, name);

test("a title in the name field no longer hides the person", () => {
  // The office's files write "Dr." into the name; the directory keeps it in
  // its own column. This is the single biggest cause of unmatched LPIs.
  for (const spelling of ["Dr. Khalid Fakhro", "Dr Khalid Fakhro", "PROF. Khalid Fakhro", "Khalid Fakhro"]) {
    const result = match(spelling);
    assert.equal(result.status, "matched", spelling);
    assert.equal((result as any).scientist.id, 35, spelling);
  }
});

test("a middle name does not hide the person either", () => {
  for (const spelling of ["Ammira Sarah Akil", "Ammira Al-Shabeeb Akil", "Dr. Ammira Al-Shabeeb Akil"]) {
    const result = match(spelling);
    assert.equal(result.status, "matched", spelling);
    assert.equal((result as any).scientist.id, 27, spelling);
  }
});

test("punctuation and accents are not identity", () => {
  assert.equal(match("Mohamed  Djekidel").status, "matched");
  assert.equal((match("Dr. Mohaméd Djekidel") as any).scientist?.id, 12);
});

test("a two-word surname still matches when written in full", () => {
  const result = match("Jerome Le Nours");
  assert.equal(result.status, "matched");
  assert.equal((result as any).scientist.id, 44);
});

test("a name that fits two people is refused, not guessed", () => {
  // Linking a grant to the wrong Lead PI is worse than leaving it for a
  // person to resolve. The import says so and asks for an email.
  const ambiguous = buildStaffNameIndex([
    { id: 1, firstName: "Ahmed", lastName: "Khan" },
    { id: 2, firstName: "Ahmed", lastName: "Khan" },
  ]);
  const result = matchStaffByName(ambiguous, "Dr. Ahmed Khan");
  assert.equal(result.status, "ambiguous");
  assert.equal((result as any).candidates.length, 2);
});

test("a middle name is only dropped when the result is still unique", () => {
  // "Ahmed Ali Khan" collapsing to "Ahmed Khan" must not silently pick one of
  // two people who share that reduced name.
  const ambiguous = buildStaffNameIndex([
    { id: 1, firstName: "Ahmed", lastName: "Khan" },
    { id: 2, firstName: "Ahmed", lastName: "Khan" },
  ]);
  assert.equal(matchStaffByName(ambiguous, "Ahmed Ali Khan").status, "ambiguous");
});

test("one name is never enough to identify anybody", () => {
  assert.equal(match("Fakhro").status, "unmatched");
  assert.equal(match("Dr.").status, "unmatched");
  assert.equal(match("").status, "unmatched");
});

test("someone genuinely absent stays absent", () => {
  assert.equal(match("Dr. Jing Gao").status, "unmatched");
});

test("two people crammed into one cell match neither", () => {
  // Seen in the real file: "Robert Hoffman - Khalid Al Ansari". Reducing it to
  // first-and-last would give "robert ansari", who does not exist -- but the
  // rule that gets there must not accidentally land on one of the two.
  assert.equal(match("Robert Hoffman - Khalid Fakhro").status, "unmatched");
});

test("titles are stripped wherever they appear, not only in front", () => {
  assert.deepEqual(nameTokens("Khalid Fakhro, PhD"), ["khalid", "fakhro"]);
  assert.deepEqual(nameTokens("Prof Khalid Fakhro MD"), ["khalid", "fakhro"]);
});
