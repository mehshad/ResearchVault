import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATUSES_VISIBLE_OUTSIDE_SECTION,
  contractInvolvement,
  contractOwnerScientistId,
  grantInvolvement,
  grantVisibleToViewer,
  sectionColleagueIds,
  visibleContracts,
  type PortfolioViewer,
} from "./researchPortfolioScope";

const staff = [
  { id: 1, sectionId: 10 }, // the viewer
  { id: 2, sectionId: 10 }, // a colleague in the same section
  { id: 3, sectionId: 20 }, // somebody else entirely
  { id: 4, sectionId: null }, // placed nowhere
];

const researcher: PortfolioViewer = { scientistId: 1, sectionId: 10, seesEverything: false };
const management: PortfolioViewer = { scientistId: 9, sectionId: 20, seesEverything: true };

// ── Who counts as my section ────────────────────────────────────────────────

test("my section is everyone sharing it, me included", () => {
  const colleagues = sectionColleagueIds(researcher, staff);
  assert.deepEqual([...(colleagues ?? [])].sort(), [1, 2]);
});

test("Management has no section boundary at all", () => {
  // null is not an empty set: it means every record is in scope.
  assert.equal(sectionColleagueIds(management, staff), null);
});

test("an account with no section is in a section with nobody in it", () => {
  const unplaced: PortfolioViewer = { scientistId: 4, sectionId: null, seesEverything: false };
  const colleagues = sectionColleagueIds(unplaced, staff);
  assert.notEqual(colleagues, null, "an unplaced viewer must still be bounded");
  assert.equal(colleagues?.size, 0);
});

// ── Grants ──────────────────────────────────────────────────────────────────

const colleagues = sectionColleagueIds(researcher, staff);

test("a grant I lead is mine", () => {
  assert.equal(grantInvolvement({ lpiId: 1 }, researcher, colleagues), "mine");
});

test("a grant I am a co-investigator on is mine, not my team's", () => {
  // The whole reason co-investigators were included: most of a bench
  // scientist's funding names them without their leading it.
  const grant = { lpiId: 3, coInvestigatorIds: [1] };
  assert.equal(grantInvolvement(grant, researcher, colleagues), "mine");
});

test("being on it myself wins over my section also being on it", () => {
  const grant = { lpiId: 2, coInvestigatorIds: [1] };
  assert.equal(grantInvolvement(grant, researcher, colleagues), "mine");
});

test("a colleague's grant is my team's", () => {
  assert.equal(grantInvolvement({ lpiId: 2 }, researcher, colleagues), "team");
});

test("a colleague named only as co-investigator still makes it my team's", () => {
  const grant = { lpiId: 3, coInvestigatorIds: [2] };
  assert.equal(grantInvolvement(grant, researcher, colleagues), "team");
});

test("another section's grant concerns me not at all", () => {
  assert.equal(grantInvolvement({ lpiId: 3 }, researcher, colleagues), null);
});

test("a grant with no people on it concerns nobody", () => {
  assert.equal(grantInvolvement({ lpiId: null }, researcher, colleagues), null);
});

test("for Management every grant with a person on it is their team's", () => {
  assert.equal(grantInvolvement({ lpiId: 3 }, management, null), "team");
  assert.equal(grantInvolvement({ lpiId: 9 }, management, null), "mine");
});

// ── What crosses a section boundary ─────────────────────────────────────────

test("my own section is visible at every status, refusals included", () => {
  for (const status of ["submitted", "not_awarded", "rejected", "terminated", "suspended"]) {
    assert.equal(grantVisibleToViewer("mine", status), true, `mine/${status}`);
    assert.equal(grantVisibleToViewer("team", status), true, `team/${status}`);
  }
});

test("another section's grant is visible while it is in good standing", () => {
  for (const status of ["awarded", "active", "completed"]) {
    assert.equal(grantVisibleToViewer(null, status), true, status);
  }
});

test("a running grant in another section is visible", () => {
  // An earlier version listed only awarded and completed, which showed other
  // sections' finished work and hid the work in progress. This is that
  // regression.
  assert.equal(grantVisibleToViewer(null, "active"), true);
});

test("another section's pipeline and refusals stay theirs", () => {
  for (const status of ["submitted", "pending", "in_review", "not_awarded", "rejected", "cancelled"]) {
    assert.equal(grantVisibleToViewer(null, status), false, status);
  }
});

test("another section's bad endings stay theirs too", () => {
  // These all follow a real award, so a test on the `awarded` flag would let
  // every one of them across. They are also the ones a section would least
  // like published, which is why the rule is a status list and not that flag.
  for (const status of ["withdrawn", "terminated", "suspended", "transferred"]) {
    assert.equal(grantVisibleToViewer(null, status), false, status);
  }
});

test("the visible list is exactly the three good-standing statuses", () => {
  // Pinned so widening it is a deliberate edit rather than a side effect.
  assert.deepEqual([...STATUSES_VISIBLE_OUTSIDE_SECTION], ["awarded", "active", "completed"]);
});

test("status is compared without regard to case or padding", () => {
  assert.equal(grantVisibleToViewer(null, "  Active "), true);
  assert.equal(grantVisibleToViewer(null, "COMPLETED"), true);
});

test("a grant with no status is not visible outside the section", () => {
  // Unknown is not good standing, and defaulting the other way would leak the
  // pipeline through a blank field.
  assert.equal(grantVisibleToViewer(null, null), false);
  assert.equal(grantVisibleToViewer(null, undefined), false);
  assert.equal(grantVisibleToViewer(null, ""), false);
  assert.equal(grantVisibleToViewer("team", null), true);
});

// ── Contracts ───────────────────────────────────────────────────────────────

test("a contract belongs to its lead PI's section", () => {
  assert.equal(contractOwnerScientistId({ leadPIId: 2, requestedByScientistId: 3 }), 2);
});

test("with no lead PI it falls back to whoever raised the request", () => {
  // A request in flight has a requester before it has a PI; scoping on the PI
  // alone would hide it from the section that made it.
  assert.equal(contractOwnerScientistId({ leadPIId: null, requestedByScientistId: 2 }), 2);
});

test("my section's contracts are visible, other sections' are not", () => {
  const contracts = [
    { id: 1, leadPIId: 1 },
    { id: 2, leadPIId: 2 },
    { id: 3, leadPIId: 3 },
    { id: 4, leadPIId: null, requestedByScientistId: 2 },
  ];
  const visible = visibleContracts(contracts, researcher, colleagues);
  assert.deepEqual(visible.map((c) => c.id), [1, 2, 4]);
  assert.deepEqual(visible.map((c) => c.involvement), ["mine", "team", "team"]);
});

test("a contract naming nobody is withheld from a researcher", () => {
  // Not quietly shown to all: it belongs to no section, so only somebody who
  // sees everything sees it.
  const orphan = [{ id: 1, leadPIId: null, requestedByScientistId: null }];
  assert.deepEqual(visibleContracts(orphan, researcher, colleagues), []);
  assert.equal(visibleContracts(orphan, management, null).length, 1);
});

test("an unplaced account sees no contracts rather than everyone's", () => {
  const unplaced: PortfolioViewer = { scientistId: 4, sectionId: null, seesEverything: false };
  const theirs = sectionColleagueIds(unplaced, staff);
  const contracts = [{ id: 1, leadPIId: 1 }, { id: 2, leadPIId: 3 }];
  assert.deepEqual(visibleContracts(contracts, unplaced, theirs), []);
});

test("Management sees every contract", () => {
  const contracts = [{ id: 1, leadPIId: 1 }, { id: 2, leadPIId: 3 }];
  assert.equal(visibleContracts(contracts, management, null).length, 2);
});

test("visibleContracts does not mutate what it is given", () => {
  const contracts = [{ id: 1, leadPIId: 1 }];
  visibleContracts(contracts, researcher, colleagues);
  assert.equal("involvement" in contracts[0], false);
});

test("contractInvolvement agrees with visibleContracts on what is dropped", () => {
  const contracts = [
    { id: 1, leadPIId: 1 },
    { id: 2, leadPIId: 3 },
    { id: 3, leadPIId: null, requestedByScientistId: null },
  ];
  const kept = new Set(visibleContracts(contracts, researcher, colleagues).map((c) => c.id));
  for (const contract of contracts) {
    const involved = contractInvolvement(contract, researcher, colleagues) !== null;
    assert.equal(involved, kept.has(contract.id), `contract ${contract.id}`);
  }
});
