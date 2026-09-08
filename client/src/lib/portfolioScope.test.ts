import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchesScope,
  scopeEmptyMessage,
  scopeUnavailableReason,
  type PortfolioViewerSummary,
} from "./portfolioScope";

const researcher: PortfolioViewerSummary = {
  scientistId: 1,
  sectionId: 10,
  seesEverything: false,
  sectionSize: 4,
};
const soloResearcher: PortfolioViewerSummary = { ...researcher, sectionSize: 1 };
const management: PortfolioViewerSummary = {
  scientistId: 9,
  sectionId: 20,
  seesEverything: true,
  sectionSize: null,
};
const unlinked: PortfolioViewerSummary = {
  scientistId: null,
  sectionId: null,
  seesEverything: false,
  sectionSize: 0,
};
const unplaced: PortfolioViewerSummary = {
  scientistId: 4,
  sectionId: null,
  seesEverything: false,
  sectionSize: 0,
};

// ── Which rows a scope shows ────────────────────────────────────────────────

test("all shows every row, including ones concerning nobody", () => {
  for (const involvement of ["mine", "team", null] as const) {
    assert.equal(matchesScope(involvement, "all"), true, String(involvement));
  }
});

test("mine shows only what I am on", () => {
  assert.equal(matchesScope("mine", "mine"), true);
  assert.equal(matchesScope("team", "mine"), false);
  assert.equal(matchesScope(null, "mine"), false);
});

test("my section includes my own work", () => {
  // Excluding it would make the section view an "everyone but me" list.
  assert.equal(matchesScope("mine", "team"), true);
  assert.equal(matchesScope("team", "team"), true);
  assert.equal(matchesScope(null, "team"), false);
});

// ── When the filter cannot work ─────────────────────────────────────────────

test("a researcher with a placed profile can use the filter", () => {
  assert.equal(scopeUnavailableReason(researcher), null);
});

test("Management is never blocked, even with no section of their own", () => {
  assert.equal(scopeUnavailableReason(management), null);
  assert.equal(scopeUnavailableReason({ ...management, sectionId: null }), null);
});

test("an account with no staff profile is told that, specifically", () => {
  assert.match(String(scopeUnavailableReason(unlinked)), /not linked to a staff profile/);
});

test("a profile placed in no section is told that instead", () => {
  // A different gap with a different fix, so it gets a different sentence.
  assert.match(String(scopeUnavailableReason(unplaced)), /not been placed in a section/);
});

test("nothing is claimed before the response arrives", () => {
  assert.equal(scopeUnavailableReason(undefined), null);
});

// ── What an empty table says ────────────────────────────────────────────────

test("an unusable filter explains itself rather than saying nothing was found", () => {
  assert.match(scopeEmptyMessage("team", unplaced, "contracts"), /not been placed in a section/);
  assert.match(scopeEmptyMessage("mine", unlinked, "grants"), /not linked to a staff profile/);
});

test("the all scope still reports an empty list plainly", () => {
  // "all" works whether or not the viewer has a profile, so a configuration
  // gap is not blamed for a genuinely empty table.
  assert.equal(scopeEmptyMessage("all", unlinked, "grants"), "There are no grants on record.");
});

test("a search that matches nothing is blamed on the search", () => {
  assert.equal(
    scopeEmptyMessage("team", researcher, "grants", true),
    "No grants match the filters you have set.",
  );
});

test("mine and team read differently when nothing is found", () => {
  assert.equal(scopeEmptyMessage("mine", researcher, "grants"), "You are not named on any grants.");
  assert.equal(
    scopeEmptyMessage("team", researcher, "grants"),
    "Nobody in your section is named on any grants.",
  );
});

test("a section of one says so, rather than implying colleagues were checked", () => {
  assert.match(scopeEmptyMessage("team", soloResearcher, "contracts"), /only person in your section/);
});

test("Management is not told about a section they do not have", () => {
  // Their scope is "records with somebody named on them", not a section, so
  // describing an empty section would describe a boundary they do not have.
  const message = scopeEmptyMessage("team", management, "contracts");
  assert.equal(message.includes("your section"), false);
  assert.equal(message.includes("only person"), false);
  assert.equal(message, "No contracts have anybody named on them.");
});
