import { test } from "node:test";
import assert from "node:assert/strict";
import { isJournalQuartile, normaliseQuartile } from "./journalQuartile";

test("the four quartiles are accepted", () => {
  for (const q of ["Q1", "Q2", "Q3", "Q4"]) {
    assert.equal(normaliseQuartile(q), q, q);
    assert.equal(isJournalQuartile(q), true, q);
  }
});

test("carelessly written quartiles are still quartiles", () => {
  // The same fact, typed badly. Refusing these would lose real data.
  assert.equal(normaliseQuartile("q1"), "Q1");
  assert.equal(normaliseQuartile(" Q2 "), "Q2");
  assert.equal(normaliseQuartile("q4\n"), "Q4");
});

test('"N/A" becomes nothing rather than being stored', () => {
  // The row that blocked the Research Output restore in production. It is not
  // a quartile, so it is not kept as one.
  assert.equal(normaliseQuartile("N/A"), null);
  assert.equal(normaliseQuartile("n/a"), null);
});

test("every other way of writing no quartile also becomes nothing", () => {
  for (const value of ["", "  ", "-", "none", "None", "NULL", "0", "Q5", "Q0", "QQ", "1"]) {
    assert.equal(normaliseQuartile(value), null, JSON.stringify(value));
  }
});

test("non-strings are nothing, not a crash", () => {
  for (const value of [null, undefined, 1, {}, [], true]) {
    assert.equal(normaliseQuartile(value), null, String(value));
  }
});

test("isJournalQuartile is strict where normalise is forgiving", () => {
  // The guard says whether a value is already storable; normalise makes one.
  assert.equal(isJournalQuartile("q1"), false);
  assert.equal(isJournalQuartile("Q1"), true);
  assert.equal(isJournalQuartile("N/A"), false);
});

test("whatever normalise returns is accepted by the guard", () => {
  // The property the database constraint relies on: nothing that survives
  // normalisation can violate it.
  for (const value of ["Q1", "q2", " Q3 ", "N/A", "", "Q9", null, 7]) {
    const result = normaliseQuartile(value);
    assert.ok(result === null || isJournalQuartile(result), String(value));
  }
});
