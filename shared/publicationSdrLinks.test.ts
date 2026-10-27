import assert from "node:assert/strict";
import test from "node:test";

import {
  isLinkedToResearchActivity,
  normaliseAdditionalSdrIds,
} from "./publicationSdrLinks";

test("the primary SDR is never stored as an additional link", () => {
  assert.deepEqual(normaliseAdditionalSdrIds(7, [3, 7, 9]), [3, 9]);
});

test("duplicates collapse to one, keeping first position", () => {
  assert.deepEqual(normaliseAdditionalSdrIds(null, [4, 2, 4, 2, 8]), [4, 2, 8]);
});

test("strings from a form are accepted, and junk is dropped", () => {
  assert.deepEqual(
    normaliseAdditionalSdrIds(1, ["5", "x", 0, -2, 2.5, null, undefined, "6"]),
    [5, 6],
  );
});

test("no list means no links", () => {
  assert.deepEqual(normaliseAdditionalSdrIds(1, null), []);
  assert.deepEqual(normaliseAdditionalSdrIds(1, undefined), []);
});

test("a publication is linked to an SDR through either kind of link", () => {
  const publication = {
    researchActivityId: 10,
    additionalResearchActivities: [{ id: 11 }, { id: 12 }],
  };
  assert.equal(isLinkedToResearchActivity(publication, 10), true);
  assert.equal(isLinkedToResearchActivity(publication, 12), true);
  assert.equal(isLinkedToResearchActivity(publication, 13), false);
  assert.equal(isLinkedToResearchActivity({ researchActivityId: null }, 10), false);
});
