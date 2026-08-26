import test from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { DatabaseStorage } from "./databaseStorage";
import { roleGroups, rolePermissions } from "@shared/schema";

test("bulk role-permission save creates and then updates a missing Research Specialist cell", async () => {
  const storage = new DatabaseStorage();
  const navigationItem = `access-matrix-regression-${process.pid}-${Date.now()}`;

  try {
    const created = await storage.updateRolePermissionsBulk([
      {
        jobTitle: "Research Specialist",
        navigationItem,
        accessLevel: "hide",
      },
    ]);
    assert.equal(created.length, 1);
    assert.equal(created[0].jobTitle, "Research Specialist");
    assert.equal(created[0].navigationItem, navigationItem);
    assert.equal(created[0].accessLevel, "hide");

    const updated = await storage.updateRolePermissionsBulk([
      {
        jobTitle: "Research Specialist",
        navigationItem,
        accessLevel: "view",
      },
    ]);
    assert.equal(updated.length, 1);
    assert.equal(updated[0].accessLevel, "view");

    const persisted = (await storage.getRolePermissions()).filter(
      (permission) =>
        permission.jobTitle === "Research Specialist" &&
        permission.navigationItem === navigationItem
    );
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].accessLevel, "view");
  } finally {
    const [group] = await db
      .select({ id: roleGroups.id })
      .from(roleGroups)
      .where(eq(roleGroups.name, "Research Specialist"));
    if (group) {
      await db
        .delete(rolePermissions)
        .where(
          and(
            eq(rolePermissions.roleGroupId, group.id),
            eq(rolePermissions.navigationItem, navigationItem)
          )
        );
    }
  }
});