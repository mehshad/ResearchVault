import assert from "node:assert/strict";
import test from "node:test";

import {
  canGrantLinkSdrs,
  GrantLifecycleError,
  grantStatusAllowsProgressTracking,
  grantStatusImpliesAward,
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