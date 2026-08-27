import assert from "node:assert/strict";
import test from "node:test";

import {
  getGrantSdrCandidates,
  isGrantSdrEligible,
} from "./grantSdrEligibility";

test("only SDRs owned by the grant LPI are eligible", () => {
  assert.equal(isGrantSdrEligible(7, 7), true);
  assert.equal(isGrantSdrEligible(7, 8), false);
  assert.equal(isGrantSdrEligible(null, 7), false);
});

test("candidate SDRs are naturally ordered by SDR number", () => {
  const candidates = getGrantSdrCandidates([
    { id: 1, sdrNumber: "SDR-10", budgetHolderId: 7 },
    { id: 2, sdrNumber: "SDR-2", budgetHolderId: 7 },
    { id: 3, sdrNumber: "SDR-1", budgetHolderId: 8 },
  ], 7, []);
  assert.deepEqual(candidates.map((candidate) => candidate.id), [2, 1]);
});

test("an existing mismatched link remains visible so it can be removed", () => {
  const candidates = getGrantSdrCandidates([
    { id: 1, sdrNumber: "SDR-2", budgetHolderId: 7 },
    { id: 2, sdrNumber: "SDR-1", budgetHolderId: 8 },
  ], 7, [2]);
  assert.deepEqual(candidates.map((candidate) => candidate.id), [2, 1]);
});