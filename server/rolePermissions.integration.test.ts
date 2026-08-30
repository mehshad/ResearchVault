import test from "node:test";
import assert from "node:assert/strict";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { DatabaseStorage } from "./databaseStorage";
import { roleGroups, rolePermissions } from "@shared/schema";
import { ACCESS_ROLES } from "@shared/constants";

/**
 * Saving the permission matrix.
 *
 * This used to create a role group for whatever name the client submitted, so a
 * browser holding a stale grid could resurrect a role a consolidation had just
 * retired -- silently undoing the migration. A retired role reappeared in
 * production exactly that way.
 */

const RETIRED_ROLE = "Research Specialist";
const LIVE_ROLE = ACCESS_ROLES[0];

async function cleanup(navigationItem: string) {
  const groups = await db
    .select({ id: roleGroups.id })
    .from(roleGroups)
    .where(inArray(roleGroups.name, [RETIRED_ROLE, LIVE_ROLE]));
  for (const group of groups) {
    await db
      .delete(rolePermissions)
      .where(and(
        eq(rolePermissions.roleGroupId, group.id),
        eq(rolePermissions.navigationItem, navigationItem),
      ));
  }
  await db.delete(roleGroups).where(eq(roleGroups.name, RETIRED_ROLE));
}

test("a bulk save creates and then updates a cell for an assignable role", async () => {
  const storage = new DatabaseStorage();
  const navigationItem = `access-matrix-regression-${process.pid}-${Date.now()}`;

  try {
    const created = await storage.updateRolePermissionsBulk([
      { jobTitle: LIVE_ROLE, navigationItem, accessLevel: "hide" },
    ]);
    assert.equal(created.length, 1);
    assert.equal(created[0].jobTitle, LIVE_ROLE);
    assert.equal(created[0].navigationItem, navigationItem);
    assert.equal(created[0].accessLevel, "hide");

    const updated = await storage.updateRolePermissionsBulk([
      { jobTitle: LIVE_ROLE, navigationItem, accessLevel: "view" },
    ]);
    assert.equal(updated.length, 1);
    assert.equal(updated[0].accessLevel, "view");

    const persisted = (await storage.getRolePermissions()).filter(
      (permission) =>
        permission.jobTitle === LIVE_ROLE &&
        permission.navigationItem === navigationItem,
    );
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].accessLevel, "view");
  } finally {
    await cleanup(navigationItem);
  }
});

test("a bulk save cannot resurrect a retired role", async () => {
  const storage = new DatabaseStorage();
  const navigationItem = `access-matrix-retired-${process.pid}-${Date.now()}`;

  try {
    const result = await storage.updateRolePermissionsBulk([
      { jobTitle: RETIRED_ROLE, navigationItem, accessLevel: "edit" },
    ]);
    assert.deepEqual(result, [], "the retired role's cell is dropped, not saved");

    const [group] = await db
      .select({ id: roleGroups.id })
      .from(roleGroups)
      .where(eq(roleGroups.name, RETIRED_ROLE));
    assert.equal(group, undefined, `${RETIRED_ROLE} must not be recreated by a save`);
  } finally {
    await cleanup(navigationItem);
  }
});

test("one stale cell does not fail the whole save", async () => {
  // A browser holding an old grid submits everything at once. Rejecting the
  // batch would make the matrix unsavable until the page was reloaded, so the
  // unknown role is dropped and the rest is written.
  const storage = new DatabaseStorage();
  const navigationItem = `access-matrix-mixed-${process.pid}-${Date.now()}`;

  try {
    const result = await storage.updateRolePermissionsBulk([
      { jobTitle: RETIRED_ROLE, navigationItem, accessLevel: "edit" },
      { jobTitle: LIVE_ROLE, navigationItem, accessLevel: "view" },
    ]);
    assert.equal(result.length, 1, "only the assignable role is written");
    assert.equal(result[0].jobTitle, LIVE_ROLE);
    assert.equal(result[0].accessLevel, "view");
  } finally {
    await cleanup(navigationItem);
  }
});
