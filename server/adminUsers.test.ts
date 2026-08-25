import assert from "node:assert/strict";
import test from "node:test";
import { toAdminUserResponse, type AdminUserRecord } from "./adminUsers";

function user(overrides: Partial<AdminUserRecord> = {}): AdminUserRecord {
  return {
    id: 12,
    username: "researcher",
    name: "Research User",
    email: "researcher@example.org",
    role: "user",
    scientistId: 34,
    lastLoginAt: null,
    ...overrides,
  };
}

test("admin user response includes the linked profile job title separately", () => {
  const response = toAdminUserResponse(user({ role: "Grant Officer" }), "Investigator");

  assert.equal(response.role, "Grant Officer");
  assert.equal(response.profileJobTitle, "Investigator");
});

test("admin user response returns no profile title for an unlinked user", () => {
  const response = toAdminUserResponse(user({ scientistId: null }), null);

  assert.equal(response.scientistId, null);
  assert.equal(response.profileJobTitle, null);
  assert.equal(response.role, "user");
});

test("profile job title cannot override the admin-assigned access role", () => {
  const response = toAdminUserResponse(user({ role: "user" }), "Management");

  assert.equal(response.role, "user");
  assert.equal(response.profileJobTitle, "Management");
});

test("admin user response never exposes authentication fields", () => {
  const response = toAdminUserResponse(
    { ...user(), password: "not-for-the-client" } as AdminUserRecord,
    "Staff Scientist",
  );

  assert.equal("password" in response, false);
});