import assert from "node:assert/strict";
import test from "node:test";

import { classifyAuthorEntries, suggestInternalAuthors } from "./authorMatching.js";

test("classifyAuthorEntries separates linked, missed and external authors", () => {
  const staff = [
    { id: 1, firstName: "Sara", lastName: "Deola" },
    { id: 2, firstName: "Wouter", lastName: "Hendrickx" },
    { id: 3, firstName: "Nourhen", lastName: "Agrebi" },
  ];
  const authors = "Jane Foreign, Sara Deola, Wouter R. L. Hendrickx, Karl Elsewhere";

  const entries = classifyAuthorEntries(authors, staff, [1]);

  assert.deepEqual(
    entries.map((e) => [e.text, e.status]),
    [
      ["Jane Foreign", "external"],
      ["Sara Deola", "linked"],
      ["Wouter R. L. Hendrickx", "missed"],
      ["Karl Elsewhere", "external"],
    ],
  );
  assert.equal(entries[1].scientistId, 1);
  assert.equal(entries[2].scientistId, 2);
  // Positions are 1-based and follow the written order.
  assert.deepEqual(entries.map((e) => e.position), [1, 2, 3, 4]);

  // Nobody on staff is claimed twice, so a namesake cannot resolve to the same
  // person as the author before them.
  const twice = classifyAuthorEntries("Sara Deola, Sara Deola", staff, []);
  assert.deepEqual(twice.map((e) => e.status), ["missed", "external"]);

  // Nothing to say about a record with no author text.
  assert.deepEqual(classifyAuthorEntries("", staff, []), []);
  assert.deepEqual(classifyAuthorEntries(null, staff, []), []);
});

test("what is highlighted as missed is exactly what auto-connect would link", () => {
  const staff = [
    { id: 1, firstName: "Sara", lastName: "Deola" },
    { id: 2, firstName: "Wouter", lastName: "Hendrickx" },
    { id: 3, firstName: "Nourhen", lastName: "Agrebi" },
  ];
  const authors = "Nourhen Agrebi, Jane Foreign, Sara Deola, Wouter Hendrickx";
  const linked = [3];

  const missed = classifyAuthorEntries(authors, staff, linked)
    .filter((e) => e.status === "missed")
    .map((e) => e.scientistId)
    .sort();
  const wouldLink = suggestInternalAuthors(authors, staff, linked)
    .map((s) => s.scientistId)
    .sort();

  // A highlight that disagreed with the button would be worse than none.
  assert.deepEqual(missed, wouldLink);
  assert.deepEqual(missed, [1, 2]);
});
