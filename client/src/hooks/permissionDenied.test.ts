import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * A hidden area must never render as an empty page.
 *
 * `fallback` defaulted to null, so every page-level PermissionWrapper whose
 * access resolved to "hide" rendered nothing at all: no heading, no
 * navigation cue, nothing to act on. It reads as the application being broken
 * rather than as a permission being withheld, and it is what every account
 * holding the restricted `user` role -- which is what the account-creation
 * buttons assign -- saw on nearly every screen.
 */
const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "components", "PermissionWrapper.tsx"),
  "utf-8",
);

const hideBranch = (() => {
  const start = source.indexOf("if (accessLevel === 'hide')");
  assert.ok(start > -1, "the hide branch has moved or been renamed");
  return source.slice(start, start + 2200);
})();

test("a hidden page explains itself instead of rendering nothing", () => {
  assert.match(hideBranch, /You do not have access|waiting for an access role/);
});

test("a caller's own fallback still wins", () => {
  // Button-level checks and pages that supply their own empty state must not
  // suddenly grow a full-page panel.
  assert.match(hideBranch, /fallback !== null && fallback !== undefined/);
});

test("an account with no access role is told to get one, not to edit the matrix", () => {
  // Editing the access matrix cannot help a restricted account: the rule
  // short-circuits before the matrix is consulted.
  assert.match(hideBranch, /RESTRICTED_USER_ROLE/);
  assert.match(hideBranch, /Settings → Users/);
  assert.match(hideBranch, /Settings → Access Control/);
});
