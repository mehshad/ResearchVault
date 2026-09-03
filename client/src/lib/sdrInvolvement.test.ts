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
