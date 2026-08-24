import assert from "node:assert/strict";
import test from "node:test";
import {
  isRoomManagerEligible,
  isRoomSupervisorEligible,
} from "@shared/roomRoleEligibility";

test("room supervisors use shared investigator eligibility", () => {
  assert.equal(isRoomSupervisorEligible({ jobTitle: "Investigator", isInvestigator: false }), true);
  assert.equal(isRoomSupervisorEligible({ jobTitle: "Administrator", isInvestigator: true }), true);
  assert.equal(isRoomSupervisorEligible({ jobTitle: "Research Coordinator", isInvestigator: false }), false);
});

test("room managers use the actual jobTitle management/staff/post-doctoral/research rule", () => {
  for (const jobTitle of ["Management Lead", "Scientific Staff", "Post-doctoral Fellow", "Research Coordinator"]) {
    assert.equal(isRoomManagerEligible({ jobTitle }), true, jobTitle);
  }
  assert.equal(isRoomManagerEligible({ jobTitle: "Investigator" }), false);
  assert.equal(isRoomManagerEligible({ jobTitle: null }), false);
});