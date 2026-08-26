import test from "node:test";
import assert from "node:assert/strict";
import { buildAssignableRoles } from "./assignableRoles";

test("assignable roles include built-ins and every unique matrix role", () => {
  assert.deepEqual(
    buildAssignableRoles([
      "Research Specialist",
      "Future Matrix Role",
      "Research Specialist",
    ]),
    ["user", "admin", "Future Matrix Role", "Research Specialist"]
  );
});

test("superadmin never becomes assignable, even if present in role_groups", () => {
  assert.deepEqual(buildAssignableRoles(["superadmin", "Management"]), [
    "user",
    "admin",
    "Management",
  ]);
});