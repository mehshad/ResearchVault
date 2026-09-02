import assert from "node:assert/strict";
import test from "node:test";

import {
  canGrantSetSchedule,
  canGrantLinkSdrs,
  GrantLifecycleError,
  grantStatusAllowsProgressTracking,
  grantStatusImpliesAward,
  GRANT_STATUS_OPTIONS,
  GRANT_STATUS_VALUES,
  reconcileGrantLifecycle,
} from "./grantLifecycle";

test("new grants default to a submitted, not-awarded lifecycle", () => {
  assert.deepEqual(reconcileGrantLifecycle({}), {
    status: "submitted",
    awarded: false,
  });
});

test("awarding a pre-award grant establishes the Awarded status", () => {
  assert.deepEqual(
    reconcileGrantLifecycle(
      { awarded: true },
      { status: "pending", awarded: false },
    ),
    { status: "awarded", awarded: true },
  );
});

test("Awarded, Active, and Completed statuses always preserve the award milestone", () => {
  assert.equal(grantStatusImpliesAward("awarded"), true);
  assert.deepEqual(
    reconcileGrantLifecycle({
      status: "active",
      awarded: false,
      startDate: "2026-01-01",
    }),
    { status: "active", awarded: true },
  );
  assert.deepEqual(
    reconcileGrantLifecycle({
      status: "completed",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    }),
    { status: "completed", awarded: true },
  );
});

test("Active and Completed grants require a start date", () => {
  assert.throws(
    () => reconcileGrantLifecycle({ status: "active" }),
    (error: unknown) =>
      error instanceof GrantLifecycleError &&
      error.message === "Active grants require a start date.",
  );
  assert.throws(
    () => reconcileGrantLifecycle({ status: "completed" }),
    (error: unknown) =>
      error instanceof GrantLifecycleError &&
      error.message === "Completed grants require a start date.",
  );
});

test("end date cannot be before start date", () => {
  assert.throws(
    () =>
      reconcileGrantLifecycle({
        status: "awarded",
        startDate: "2026-06-01",
        endDate: "2026-05-31",
      }),
    (error: unknown) =>
      error instanceof GrantLifecycleError &&
      error.message === "Grant end date cannot be before the start date.",
  );
});

test("cancelled grants retain a historical award milestone", () => {
  assert.deepEqual(
    reconcileGrantLifecycle(
      { status: "cancelled" },
      {
        status: "active",
        awarded: true,
        startDate: "2026-01-01",
      },
    ),
    { status: "cancelled", awarded: true },
  );
});

test("returning to a pre-award status requires explicitly clearing the award", () => {
  const current = {
    status: "awarded",
    awarded: true,
    startDate: "2026-01-01",
  };

  assert.throws(
    () => reconcileGrantLifecycle({ status: "pending" }, current),
    (error: unknown) =>
      error instanceof GrantLifecycleError &&
      error.message.includes("award designation is cleared"),
  );

  assert.deepEqual(
    reconcileGrantLifecycle(
      { status: "pending", awarded: false },
      current,
    ),
    { status: "pending", awarded: false },
  );
});

test("awarded grants cannot be changed to Rejected", () => {
  assert.throws(
    () =>
      reconcileGrantLifecycle(
        { status: "rejected" },
        { status: "awarded", awarded: true },
      ),
    (error: unknown) =>
      error instanceof GrantLifecycleError &&
      error.message.includes("Use Cancelled"),
  );
});

test("SDR linking is based on the lasting award milestone", () => {
  assert.equal(canGrantLinkSdrs({ awarded: true }), true);
  assert.equal(canGrantLinkSdrs({ awarded: false }), false);
  assert.equal(canGrantLinkSdrs({}), false);
});

test("dates and progress tracking begin when the grant becomes Active", () => {
  assert.equal(grantStatusAllowsProgressTracking("submitted"), false);
  assert.equal(grantStatusAllowsProgressTracking("awarded"), false);
  assert.equal(grantStatusAllowsProgressTracking("active"), true);
  assert.equal(grantStatusAllowsProgressTracking("completed"), true);
});

test("schedule dates can be entered once a grant is awarded", () => {
  assert.equal(canGrantSetSchedule({ status: "awarded", awarded: true }), true);
  assert.equal(canGrantSetSchedule({ status: "active", awarded: false }), true);
  assert.equal(canGrantSetSchedule({ status: "pending", awarded: false }), false);
});
test("the awarded flag and the status cannot disagree", () => {
  // Award-implying statuses turn the flag on, in either direction. Active and
  // Completed additionally require a start date, which is a separate rule.
  for (const status of ["awarded", "active", "completed"]) {
    const dates = status === "awarded" ? {} : { startDate: "2026-01-01" };
    assert.equal(reconcileGrantLifecycle({ status, awarded: false, ...dates }).awarded, true, status);
    assert.equal(reconcileGrantLifecycle({ status, ...dates }).awarded, true, status);
  }

  // The flag off is what these statuses mean; setting it on is a contradiction.
  for (const status of ["rejected", "not_awarded"]) {
    assert.equal(reconcileGrantLifecycle({ status, awarded: false }).status, status);
    assert.throws(
      () => reconcileGrantLifecycle({ status, awarded: true }, { awarded: true, status: "awarded" }),
      /cannot be marked/,
      status,
    );
  }

  // Cancelled means an awarded project that will not proceed, so it is the one
  // terminal state that requires the flag on. An application that never won
  // funding is Not Awarded, which is why that status exists.
  assert.equal(
    reconcileGrantLifecycle({ status: "cancelled", awarded: true }, { awarded: true, status: "awarded" }).awarded,
    true,
  );
  assert.throws(
    () => reconcileGrantLifecycle({ status: "cancelled", awarded: false }),
    /Use Not Awarded/,
  );

  // Not Awarded is a status in its own right, accepted by the schema.
  assert.equal(reconcileGrantLifecycle({ status: "not_awarded" }).status, "not_awarded");
  assert.ok(GRANT_STATUS_VALUES.includes("not_awarded"));
  assert.ok(GRANT_STATUS_OPTIONS.some((o) => o.value === "not_awarded" && o.label === "Not Awarded"));
});
