import assert from "node:assert/strict";
import test from "node:test";
import {
  getOfficeDashboardDefaultAccess,
  isAdministratorRole,
  NAVIGATION_ITEMS,
} from "@/lib/navigationPermissions";

test("the access matrix includes the Certifications navigation item", () => {
  assert.equal(NAVIGATION_ITEMS.includes("certifications"), true);
});

test("the access matrix includes all office dashboard navigation items", () => {
  assert.equal(NAVIGATION_ITEMS.includes("pmo-office"), true);
  assert.equal(NAVIGATION_ITEMS.includes("research-office"), true);
});

test("office dashboard defaults expose each dashboard only to its intended officers", () => {
  assert.equal(getOfficeDashboardDefaultAccess("PMO Officer", "pmo-office"), "edit");
  assert.equal(getOfficeDashboardDefaultAccess("Management", "pmo-office"), "edit");
  assert.equal(getOfficeDashboardDefaultAccess("Scientist", "pmo-office"), "hide");
  assert.equal(getOfficeDashboardDefaultAccess("Research Officer", "pmo-office"), "hide");

  // Grants and contracts are one office under one role.
  assert.equal(getOfficeDashboardDefaultAccess("Research Officer", "research-office"), "edit");
  assert.equal(getOfficeDashboardDefaultAccess("Contracts Officer", "research-office"), "hide",
    "the retired Contracts Officer role must no longer open the research office");
  assert.equal(getOfficeDashboardDefaultAccess("Management", "research-office"), "edit");
  assert.equal(getOfficeDashboardDefaultAccess("Scientist", "research-office"), "hide");
  assert.equal(getOfficeDashboardDefaultAccess("PMO Officer", "research-office"), "hide");
});

test("administrator roles bypass configurable navigation hiding", () => {
  assert.equal(isAdministratorRole("admin"), true);
  assert.equal(isAdministratorRole("superadmin"), true);
  assert.equal(isAdministratorRole("Super Admin"), true);
  assert.equal(isAdministratorRole("Management"), false);
});