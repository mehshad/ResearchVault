import assert from "node:assert/strict";
import test from "node:test";
import { isAdministratorRole, NAVIGATION_ITEMS } from "@/lib/navigationPermissions";

test("the access matrix includes the Certifications navigation item", () => {
  assert.equal(NAVIGATION_ITEMS.includes("certifications"), true);
});

test("administrator roles bypass configurable navigation hiding", () => {
  assert.equal(isAdministratorRole("admin"), true);
  assert.equal(isAdministratorRole("superadmin"), true);
  assert.equal(isAdministratorRole("Super Admin"), true);
  assert.equal(isAdministratorRole("Management"), false);
});