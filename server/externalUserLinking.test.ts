import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Signing in for the first time must adopt the staff profile that already
 * exists for that address, not create a second one.
 *
 * Active Directory returns an address as it was registered -- "WHendrickx@..."
 * where the staff table holds "whendrickx@..." -- so a literal comparison finds
 * nothing, the person is sent to register, and registering makes a duplicate
 * profile that has to be merged by hand afterwards.
 *
 * Guarded by reading the source because the alternative is a live directory and
 * an identity provider; what matters is that these lookups stay case-insensitive
 * and that neither path inserts before it has looked.
 */
const here = dirname(fileURLToPath(import.meta.url));
const auth = readFileSync(join(here, "auth.ts"), "utf-8");
const routes = readFileSync(join(here, "routes.ts"), "utf-8");

const externalUserFn = (() => {
  const start = auth.indexOf("async function findOrCreateExternalUser(");
  assert.ok(start > -1, "findOrCreateExternalUser has been renamed or removed");
  return auth.slice(start, auth.indexOf("\nfunction toSessionUser", start));
})();

test("the account lookup on sign-in ignores capitalisation", () => {
  // eq(users.username, username) would provision a second account for somebody
  // whose provider changed the casing.
  assert.match(externalUserFn, /lower\(\$\{users\.username\}\)/);
  assert.doesNotMatch(externalUserFn, /where\(eq\(users\.username, username\)\)/);
});

test("a staff profile is matched by email ignoring capitalisation", () => {
  const finder = auth.slice(
    auth.indexOf("async function findScientistByEmail("),
    auth.indexOf("async function findOrCreateExternalUser("),
  );
  assert.match(finder, /lower\(\$\{scientists\.email\}\)/);
  assert.match(finder, /toLowerCase\(\)/);
});

test("a new account is linked to that profile as it is created", () => {
  assert.match(externalUserFn, /findScientistByEmail\(email\)/);
  assert.match(externalUserFn, /scientistId: existingScientistId/);
});

test("an existing account with no profile is adopted on a later sign-in", () => {
  // Accounts provisioned before this existed would otherwise stay unlinked and
  // keep being offered registration.
  const tail = auth.slice(auth.indexOf("if (!user) return null;"));
  assert.match(tail, /findScientistByEmail/);
  assert.match(tail, /isNull\(users\.scientistId\)/);
});

test("registration looks for an existing profile before inserting one", () => {
  const register = routes.slice(
    routes.indexOf("'/api/register'"),
    routes.indexOf("// ── Access level helpers"),
  );
  const lookupAt = register.indexOf("lower(${scientists.email})");
  const insertAt = register.indexOf(".insert(scientists)");
  assert.ok(lookupAt > -1, "registration must look for an existing staff profile");
  assert.ok(insertAt > -1, "registration still creates a profile when there is none");
  assert.ok(lookupAt < insertAt, "the lookup must come before the insert");
});
