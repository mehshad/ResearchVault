import { test } from "node:test";
import assert from "node:assert/strict";
import { orderPublicationsForActivity, workflowStageOf, isPublished } from "./publicationOrdering";

const pub = (title: string, status: string, publicationDate?: string) => ({ title, status, publicationDate });

test("published work comes before anything still in progress", () => {
  const ordered = orderPublicationsForActivity([
    pub("draft", "Concept"),
    pub("out", "Published", "2024-01-01"),
  ]);
  assert.deepEqual(ordered.map((p) => p.title), ["out", "draft"]);
});

test("published work runs oldest to newest, so the newest sits at the bottom", () => {
  const ordered = orderPublicationsForActivity([
    pub("2025", "Published", "2025-06-01"),
    pub("2019", "Published", "2019-03-04"),
    pub("2022", "Published", "2022-11-30"),
  ]);
  assert.deepEqual(ordered.map((p) => p.title), ["2019", "2022", "2025"]);
});

test("work in progress runs from the most advanced down to the least", () => {
  // Accepted/In Press (6) → Under review (5) → Submitted (4) → Vetted (3)
  // → Complete Draft (2) → Concept (1).
  const ordered = orderPublicationsForActivity([
    pub("concept", "Concept"),
    pub("accepted", "Accepted/In Press"),
    pub("draft", "Complete Draft"),
    pub("review", "Under review"),
  ]);
  assert.deepEqual(ordered.map((p) => p.title), ["accepted", "review", "draft", "concept"]);
});

test("the sealed Published * counts as published, not as a stage of its own", () => {
  assert.ok(isPublished({ status: "Published *" }));
  assert.equal(workflowStageOf("Published *"), 8);
});

test("a published paper with no date goes last among the published, not first", () => {
  // Undated is not the same as ancient; sorting it first would claim it is the
  // oldest thing on the SDR.
  const ordered = orderPublicationsForActivity([
    pub("undated", "Published"),
    pub("2020", "Published", "2020-01-01"),
  ]);
  assert.deepEqual(ordered.map((p) => p.title), ["2020", "undated"]);
});

test("an unrecognised status is treated as the earliest stage, never as published", () => {
  const ordered = orderPublicationsForActivity([
    pub("mystery", "Something Else"),
    pub("concept", "Concept"),
    pub("out", "Published", "2001-01-01"),
  ]);
  assert.deepEqual(ordered.map((p) => p.title), ["out", "concept", "mystery"]);
});

test("statuses match regardless of case or stray spacing", () => {
  assert.equal(workflowStageOf("  published  "), 7);
  assert.equal(workflowStageOf("UNDER REVIEW"), 5);
});

test("ties fall back to the title so the order is stable between renders", () => {
  const ordered = orderPublicationsForActivity([
    pub("beta", "Published", "2020-01-01"),
    pub("alpha", "Published", "2020-01-01"),
  ]);
  assert.deepEqual(ordered.map((p) => p.title), ["alpha", "beta"]);
});

test("the caller's array is not reordered underneath them", () => {
  const input = [pub("draft", "Concept"), pub("out", "Published", "2020-01-01")];
  orderPublicationsForActivity(input);
  assert.deepEqual(input.map((p) => p.title), ["draft", "out"]);
});
