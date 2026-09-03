import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSdrInvolvement, scientistsReportingTo } from "./sdrInvolvement";

const staff = [
  { id: 15, supervisorId: null },   // me: an investigator with a team
  { id: 20, supervisorId: 15 },     // reports to me
  { id: 21, supervisorId: 15 },     // reports to me
  { id: 30, supervisorId: 99 },     // somebody else's
];

const members = [
  { researchActivityId: 1, scientistId: 15 },  // mine
  { researchActivityId: 2, scientistId: 20 },  // my team's, not mine
  { researchActivityId: 2, scientistId: 21 },  // and a second of my people
  { researchActivityId: 3, scientistId: 15 },  // mine
  { researchActivityId: 3, scientistId: 20 },  // team on it too
  { researchActivityId: 4, scientistId: 30 },  // nothing to do with me
];

const run = (over = {}) =>
  computeSdrInvolvement({ myScientistId: 15, members, scientists: staff, includeTeam: true, ...over });

test("a team is the people whose line manager I am", () => {
  assert.deepEqual([...scientistsReportingTo(15, staff)].sort(), [20, 21]);
});

test("SDRs I am on are mine", () => {
  assert.equal(run().get(1)?.mine, true);
});

test("an SDR only my team is on is flagged as theirs, naming who", () => {
  // The point of the whole feature: work my lab is doing that I am not on.
  const entry = run().get(2);
  assert.equal(entry?.mine, false);
  assert.deepEqual(entry?.teamMembers.sort(), [20, 21]);
});

test("being a member wins over my team also being on it", () => {
  // Otherwise an SDR I am running would be labelled as somebody else's work.
  // The team members are still named -- who else from my lab is on it is worth
  // knowing -- but `mine` is what the badge reads.
  const entry = run().get(3);
  assert.equal(entry?.mine, true);
  assert.deepEqual(entry?.teamMembers, [20]);
});

test("SDRs that concern neither me nor my team are absent", () => {
  assert.equal(run().has(4), false);
});

test("without the team view, only my own SDRs appear", () => {
  // Somebody who is not an investigator leads no team, so the second kind of
  // answer does not apply to them.
  const involvement = run({ includeTeam: false });
  assert.deepEqual([...involvement.keys()].sort(), [1, 3]);
});

test("an account with no staff record is involved in nothing", () => {
  // Every demo session is one of these, which is why the filter is offered
  // but inert there rather than hidden.
  assert.equal(run({ myScientistId: null }).size, 0);
});

test("the same person listed twice on one SDR is counted once", () => {
  const involvement = computeSdrInvolvement({
    myScientistId: 15,
    members: [
      { researchActivityId: 7, scientistId: 20 },
      { researchActivityId: 7, scientistId: 20 },
    ],
    scientists: staff,
    includeTeam: true,
  });
  assert.deepEqual(involvement.get(7)?.teamMembers, [20]);
});

// ── The PI of record who is not on the team ────────────────────────────────
// Membership and the PI field are stored separately and only the create form
// ever wrote both, so an imported SDR names a PI absent from its own team.
// That is a discrepancy to correct, not a kind of membership: counting it as
// membership would hide it in the very view most likely to reveal it.

const activities = [
  { id: 1, budgetHolderId: null },
  { id: 5, budgetHolderId: 15 },  // I am the PI, and not on the team
  { id: 6, budgetHolderId: 20 },  // one of my people is, and is not on the team
  { id: 3, budgetHolderId: 15 },  // I am the PI and I am on the team
];

const withActivities = (over = {}) =>
  computeSdrInvolvement({
    myScientistId: 15, members, scientists: staff, includeTeam: true, activities, ...over,
  });

test("being the PI without a membership row is flagged, not counted as membership", () => {
  const entry = withActivities().get(5);
  assert.equal(entry?.mine, false, "not silently treated as being on the team");
  assert.equal(entry?.piMissingFromTeam, 15, "flagged so it can be corrected");
});

test("the same gap on one of my people's SDRs is flagged too", () => {
  const entry = withActivities().get(6);
  assert.equal(entry?.piMissingFromTeam, 20);
});

test("a PI who is on the team raises no flag", () => {
  const entry = withActivities().get(3);
  assert.equal(entry?.mine, true);
  assert.equal(entry?.piMissingFromTeam, undefined);
});

test("a PI who is nothing to do with me is not flagged", () => {
  const entry = withActivities({ activities: [{ id: 9, budgetHolderId: 30 }] }).get(9);
  assert.equal(entry, undefined);
});

test("passing no activities leaves the old answers untouched", () => {
  assert.equal(computeSdrInvolvement({
    myScientistId: 15, members, scientists: staff, includeTeam: true,
  }).get(5), undefined);
});
