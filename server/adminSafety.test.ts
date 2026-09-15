import { test } from "node:test";
import assert from "node:assert/strict";
import { adminChangeRefusal } from "./adminSafety";

/**
 * #25: the two role routes must never let an administrator lock themselves
 * out, nor let the last administrator be demoted.
 */
const admin = { role: "admin", secondaryRoles: [] as string[] };
const investigator = { role: "investigator", secondaryRoles: [] as string[] };

test("an administrator cannot remove their own rights", () => {
  assert.match(
    adminChangeRefusal({ targetId: 7, callerId: 7, before: admin, after: investigator, otherAdministrators: 3 }) ?? "",
    /your own administrator rights/,
  );
});

test("the last administrator cannot be demoted by anyone", () => {
  assert.match(
    adminChangeRefusal({ targetId: 7, callerId: 2, before: admin, after: investigator, otherAdministrators: 0 }) ?? "",
    /last account/,
  );
});

test("demoting one administrator while others remain is allowed", () => {
  assert.equal(adminChangeRefusal({ targetId: 7, callerId: 2, before: admin, after: investigator, otherAdministrators: 1 }), null);
});

test("rights held as a secondary role count, in both directions", () => {
  const secondaryAdmin = { role: "investigator", secondaryRoles: ["admin"] };
  // keeping admin as a secondary while the primary moves: nothing is removed
  assert.equal(adminChangeRefusal({ targetId: 7, callerId: 7, before: admin, after: secondaryAdmin, otherAdministrators: 0 }), null);
  // clearing the secondary that carried the rights: refused
  assert.match(
    adminChangeRefusal({ targetId: 7, callerId: 7, before: secondaryAdmin, after: investigator, otherAdministrators: 0 }) ?? "",
    /your own/,
  );
});

test("a change that does not touch administrator rights is never refused", () => {
  assert.equal(adminChangeRefusal({ targetId: 7, callerId: 7, before: investigator, after: { role: "user" }, otherAdministrators: 0 }), null);
  assert.equal(adminChangeRefusal({ targetId: 7, callerId: 7, before: admin, after: { role: "superadmin" }, otherAdministrators: 0 }), null);
});

test("with no signed-in caller only the last-administrator rule applies", () => {
  assert.equal(adminChangeRefusal({ targetId: 7, callerId: null, before: admin, after: investigator, otherAdministrators: 1 }), null);
});
