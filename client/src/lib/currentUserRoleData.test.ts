/**
 * The demo role selector.
 *
 * This list was hand-maintained and rotted: after the research roles were
 * consolidated it still offered "Staff Scientist", "Postdoctoral Researcher"
 * and "PhD Student", none of which existed any more, while omitting
 * "Researcher" and "IT Officer". Someone testing as a retired role was
 * emulating an identity the matrix had no row for.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ACCESS_ROLES } from "../../../shared/constants.js";
import {
  DEFAULT_DEMO_ROLE,
  DUMMY_USERS,
  SUPER_ADMIN_USER,
} from "./currentUserRoleData.js";

test("every assignable access role can be emulated", () => {
  const offered = new Set(DUMMY_USERS.map((user) => user.role));
  for (const role of ACCESS_ROLES) {
    assert.ok(offered.has(role), `no demo identity offers the "${role}" role`);
  }
  assert.equal(offered.size, ACCESS_ROLES.length, "one identity per role, no duplicates");
});

test("no demo identity offers a role that does not exist", () => {
  // The failure this file exists to prevent: emulating a retired role.
  const assignable = new Set<string>(ACCESS_ROLES);
  for (const user of DUMMY_USERS) {
    assert.ok(
      assignable.has(user.role),
      `"${user.role}" is offered in the selector but is not an assignable access role`,
    );
  }
});

test("the default demo role is one the selector actually offers", () => {
  assert.ok(
    DUMMY_USERS.some((user) => user.role === DEFAULT_DEMO_ROLE),
    `the demo session starts as "${DEFAULT_DEMO_ROLE}", which is not in the list`,
  );
});

test("identities are distinguishable", () => {
  const ids = DUMMY_USERS.map((user) => user.id);
  assert.equal(new Set(ids).size, ids.length, "ids must be unique — the selector keys on them");
  assert.ok(!ids.includes(SUPER_ADMIN_USER.id), "the super admin id must not collide");
  for (const user of DUMMY_USERS) {
    assert.ok(user.name.trim().length > 0, `${user.role} has no name`);
    assert.match(user.email, /^[^@\s]+@[^@\s]+$/, `${user.role} has a malformed email`);
  }
  const emails = DUMMY_USERS.map((user) => user.email);
  assert.equal(new Set(emails).size, emails.length, "emails must be unique");
});

test("superadmin is offered separately, never as an access role", () => {
  // superadmin comes from SUPER_ADMIN_EMAIL and is never assignable, so it must
  // not leak into the ordinary list.
  assert.equal(SUPER_ADMIN_USER.role, "superadmin");
  assert.ok(!DUMMY_USERS.some((user) => user.role === "superadmin"));
  assert.ok(!(ACCESS_ROLES as readonly string[]).includes("superadmin"));
});
