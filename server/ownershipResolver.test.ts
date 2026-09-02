// Unit tests for the pure helper functions in ownershipResolver.ts.
// resolveOwnershipAccess (requires DB) is not tested here.

import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://ci:ci@localhost:5432/ci_test";

import { maxAccess } from "./ownershipResolver";
import type { AccessLevel } from "./ownershipResolver";

// ---------------------------------------------------------------------------
// maxAccess — ordering: edit(3) > create(2) > view(1) > hide(0) > null(-1)
// ---------------------------------------------------------------------------

test("maxAccess returns null when both inputs are null", () => {
  assert.equal(maxAccess(null, null), null);
});

test("maxAccess returns the non-null value when one side is null", () => {
  assert.equal(maxAccess("view", null), "view");
  assert.equal(maxAccess(null, "edit"), "edit");
  assert.equal(maxAccess("hide", null), "hide");
});

test("maxAccess: edit beats all others", () => {
  const others: Array<AccessLevel | null> = ["create", "view", "hide", null];
  for (const other of others) {
    assert.equal(maxAccess("edit", other), "edit", `edit vs ${other}`);
    assert.equal(maxAccess(other, "edit"), "edit", `${other} vs edit`);
  }
});

test("maxAccess: create beats view, hide, null", () => {
  assert.equal(maxAccess("create", "view"), "create");
  assert.equal(maxAccess("view", "create"), "create");
  assert.equal(maxAccess("create", "hide"), "create");
  assert.equal(maxAccess("create", null),   "create");
});

test("maxAccess: view beats hide and null", () => {
  assert.equal(maxAccess("view", "hide"), "view");
  assert.equal(maxAccess("hide", "view"), "view");
  assert.equal(maxAccess("view", null),   "view");
  assert.equal(maxAccess(null,   "view"), "view");
});

test("maxAccess: hide beats null", () => {
  assert.equal(maxAccess("hide", null), "hide");
  assert.equal(maxAccess(null, "hide"), "hide");
});

test("maxAccess: identical levels return that level", () => {
  assert.equal(maxAccess("edit",   "edit"),   "edit");
  assert.equal(maxAccess("create", "create"), "create");
  assert.equal(maxAccess("view",   "view"),   "view");
  assert.equal(maxAccess("hide",   "hide"),   "hide");
});

test("maxAccess is commutative", () => {
  const levels: Array<AccessLevel | null> = ["edit", "create", "view", "hide", null];
  for (const a of levels) {
    for (const b of levels) {
      assert.equal(
        maxAccess(a, b),
        maxAccess(b, a),
        `maxAccess(${a}, ${b}) should equal maxAccess(${b}, ${a})`,
      );
    }
  }
});
