import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GRANT_STATUS_STAGE,
  GRANT_STATUS_STAGES,
  isGrantStatusStage,
  stageImpliesAward,
  stageRequiresAward,
  stageRequiresSchedule,
  stageVisibleOutsideSection,
} from "./grantStatusStages";
import {
  BUILT_IN_GRANT_STATUSES,
  grantStatusDefinitions,
  resetGrantStatusRegistry,
  setGrantStatusRegistry,
  stageOfGrantStatus,
} from "./grantStatusRegistry";
import {
  grantStatusAllowsProgressTracking,
  grantStatusImpliesAward,
  grantStatusRequiresAward,
  grantStatusRequiresStartDate,
} from "./grantLifecycle";

/**
 * The sets the rules used before statuses became editable. Reproduced here
 * verbatim from the old grantLifecycle.ts so the stage table can be checked
 * against what it replaced, rather than against itself.
 */
const OLD_AWARD_IMPLYING = ["awarded", "active", "completed"];
const OLD_REQUIRES_AWARD = [
  "awarded", "active", "completed",
  "cancelled", "withdrawn", "terminated", "transferred", "suspended",
];
const OLD_START_DATE_REQUIRED = ["active", "completed"];
const OLD_VISIBLE_OUTSIDE_SECTION = ["awarded", "active", "completed"];

const ALL_BUILT_IN = BUILT_IN_GRANT_STATUSES.map((s) => s.value);

// ── The migration must not change what an existing grant means ──────────────

test("every built-in status still implies an award exactly as it did", () => {
  for (const status of ALL_BUILT_IN) {
    assert.equal(
      grantStatusImpliesAward(status),
      OLD_AWARD_IMPLYING.includes(status),
      status,
    );
  }
});

test("every built-in status still requires an award exactly as it did", () => {
  for (const status of ALL_BUILT_IN) {
    assert.equal(
      grantStatusRequiresAward(status),
      OLD_REQUIRES_AWARD.includes(status),
      status,
    );
  }
});

test("every built-in status still requires a start date exactly as it did", () => {
  for (const status of ALL_BUILT_IN) {
    assert.equal(
      grantStatusRequiresStartDate(status),
      OLD_START_DATE_REQUIRED.includes(status),
      status,
    );
    // The old code used the same set for both questions.
    assert.equal(
      grantStatusAllowsProgressTracking(status),
      OLD_START_DATE_REQUIRED.includes(status),
      status,
    );
  }
});

test("every built-in status still crosses a section boundary exactly as it did", () => {
  for (const status of ALL_BUILT_IN) {
    const stage = stageOfGrantStatus(status);
    assert.notEqual(stage, null, status);
    assert.equal(
      stageVisibleOutsideSection(stage!),
      OLD_VISIBLE_OUTSIDE_SECTION.includes(status),
      status,
    );
  }
});

test("all thirteen built-in statuses have a stage", () => {
  assert.equal(ALL_BUILT_IN.length, 13);
  for (const status of ALL_BUILT_IN) {
    assert.ok(isGrantStatusStage(GRANT_STATUS_STAGE[status]), status);
  }
});

// ── What a stage means ──────────────────────────────────────────────────────

test("an ended grant requires an award without implying one", () => {
  // Moving a grant to Terminated must not silently flip the award on. An
  // application that never won is `refused`, which is the distinction Not
  // Awarded exists to make.
  assert.equal(stageImpliesAward("ended"), false);
  assert.equal(stageRequiresAward("ended"), true);
});

test("an application and a refusal behave identically to every rule", () => {
  // They mean different things to a reader; no rule distinguishes them.
  for (const stage of ["application", "refused"] as const) {
    assert.equal(stageImpliesAward(stage), false, stage);
    assert.equal(stageRequiresAward(stage), false, stage);
    assert.equal(stageRequiresSchedule(stage), false, stage);
    assert.equal(stageVisibleOutsideSection(stage), false, stage);
  }
});

test("only a scheduled grant needs dates", () => {
  for (const stage of GRANT_STATUS_STAGES) {
    assert.equal(stageRequiresSchedule(stage), stage === "scheduled", stage);
  }
});

// ── A status the office adds ────────────────────────────────────────────────

test("a status the office adds means whatever stage it declares", () => {
  try {
    setGrantStatusRegistry([
      ...BUILT_IN_GRANT_STATUSES,
      {
        value: "award_pending_vetted",
        label: "Award Pending - Vetted",
        stage: "application",
        sortOrder: 99,
        isBuiltIn: false,
      },
      {
        value: "irp_ro_vetted",
        label: "IRP RO Vetted",
        stage: "awarded",
        sortOrder: 100,
        isBuiltIn: false,
      },
    ]);

    // Declared an application: no award, no dates.
    assert.equal(grantStatusImpliesAward("award_pending_vetted"), false);
    assert.equal(grantStatusRequiresStartDate("award_pending_vetted"), false);

    // Declared awarded: the award flag follows, and SDR linking opens.
    assert.equal(grantStatusImpliesAward("irp_ro_vetted"), true);
    assert.equal(grantStatusRequiresAward("irp_ro_vetted"), true);
    assert.equal(grantStatusRequiresStartDate("irp_ro_vetted"), false);
  } finally {
    resetGrantStatusRegistry();
  }
});

test("a status nobody has declared means nothing rather than something", () => {
  // Refusing to guess is the safe direction for all four rules.
  for (const unknown of ["invented_by_a_caller", "", null, undefined]) {
    assert.equal(grantStatusImpliesAward(unknown), false, String(unknown));
    assert.equal(grantStatusRequiresAward(unknown), false, String(unknown));
    assert.equal(grantStatusRequiresStartDate(unknown), false, String(unknown));
    assert.equal(stageOfGrantStatus(unknown as any), null, String(unknown));
  }
});

// ── The registry itself ─────────────────────────────────────────────────────

test("the registry starts as the built-in thirteen", () => {
  resetGrantStatusRegistry();
  assert.deepEqual(grantStatusDefinitions().map((s) => s.value), ALL_BUILT_IN);
});

test("an empty list is ignored rather than adopted", () => {
  // An empty table would strip the award from every grant at once. A load that
  // returns nothing is far likelier to be a failure than a decision.
  try {
    setGrantStatusRegistry([]);
    assert.equal(grantStatusImpliesAward("awarded"), true);
    assert.equal(grantStatusDefinitions().length, 13);
  } finally {
    resetGrantStatusRegistry();
  }
});

test("the registry keeps the order the office chose", () => {
  try {
    setGrantStatusRegistry([
      { value: "b", label: "B", stage: "application", sortOrder: 2, isBuiltIn: false },
      { value: "a", label: "A", stage: "application", sortOrder: 1, isBuiltIn: false },
    ]);
    assert.deepEqual(grantStatusDefinitions().map((s) => s.value), ["a", "b"]);
  } finally {
    resetGrantStatusRegistry();
  }
});
