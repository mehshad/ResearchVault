import assert from "node:assert/strict";
import test from "node:test";

import { buildPublicationQueues } from "./publicationQueues";

test("stages come out in workflow order, every one present even at zero", () => {
  const { bars } = buildPublicationQueues({ "Under review": 1, Concept: 3 });
  assert.deepEqual(
    bars.map((b) => [b.stage, b.label, b.count]),
    [
      [1, "Concept", 3],
      [2, "Complete Draft", 0],
      [3, "Vetted for submission", 0],
      [4, "Submitted for review", 0],
      [5, "Under review", 1],
      [6, "Accepted/In Press", 0],
      [7, "Published", 0],
    ],
  );
});

test("Published * is set apart from the bars", () => {
  const queues = buildPublicationQueues({ "Published *": 250, Published: 9 });
  assert.equal(queues.sealed, 250);
  assert.ok(!queues.bars.some((b) => b.label === "Published *"));
  assert.equal(queues.bars.find((b) => b.stage === 7)?.count, 9);
});

test("two spellings of one status are one bar", () => {
  // The server keys stocks by the stored string, and production carries
  // "Published" and "published"; the old list showed them as two rows with
  // the same label.
  const { bars } = buildPublicationQueues({ Published: 103, published: 9, " Published ": 1 });
  assert.equal(bars.find((b) => b.stage === 7)?.count, 113);
  assert.equal(bars.filter((b) => b.label === "Published").length, 1);
});

test("both submission variants fold into the one stage", () => {
  const { bars } = buildPublicationQueues({
    "Submitted for review with pre-publication": 6,
    "Submitted for review without pre-publication": 2,
  });
  assert.equal(bars.find((b) => b.stage === 4)?.count, 8);
});

test("off-flow states follow the stages, only when non-zero", () => {
  const { bars } = buildPublicationQueues({ "Published - Invalid": 5, Withdrawn: 2 });
  const tail = bars.slice(7).map((b) => [b.label, b.count]);
  assert.deepEqual(tail, [
    ["Published - Invalid", 5],
    ["Withdrawn", 2],
  ]);
  assert.ok(!bars.some((b) => b.label === "Rejected"), "a zero off-flow state is not drawn");
});

test("a status the model does not know is still shown, last, under its own name", () => {
  const { bars } = buildPublicationQueues({ in_preparation: 4, Concept: 1 });
  const last = bars[bars.length - 1];
  assert.deepEqual([last.label, last.count, last.stage], ["In Preparation", 4, undefined]);
});

test("an empty readout is all zeros and no sealed count", () => {
  const queues = buildPublicationQueues({});
  assert.equal(queues.sealed, 0);
  assert.equal(queues.bars.length, 7);
  assert.ok(queues.bars.every((b) => b.count === 0));
});
