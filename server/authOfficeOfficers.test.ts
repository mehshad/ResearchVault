/**
 * The office guards.
 *
 * These used to admit a hard-coded list of role names, which made the code a
 * second authority on access competing with the configurable matrix — and the
 * code always won. They now resolve "pmo-office" and "research-office", two
 * areas the matrix configures like any other, so these tests assert matrix
 * semantics rather than a list of names.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  createRequirePmoOfficer,
  createRequireResearchOfficer,
  type NavigationAccessLoader,
} from "./auth.js";

type User = { username?: string; role?: string | null; secondaryRoles?: string[] };

/** A matrix in which only the named roles hold anything. */
function matrix(levels: Record<string, string>): NavigationAccessLoader {
  return async (role) => levels[role] ?? null;
}

async function runMiddleware(
  middleware: ReturnType<typeof createRequirePmoOfficer>,
  user?: User,
  method = "GET",
) {
  let nextCalled = false;
  let statusCode = 200;
  let body: unknown;
  const req = {
    method,
    path: "/api/office-dashboards/test",
    session: user ? { user } : {},
  };
  const res = {
    status(code: number) { statusCode = code; return this; },
    json(value: unknown) { body = value; return this; },
  };
  await middleware(req as any, res as any, () => { nextCalled = true; });
  return { nextCalled, statusCode, body };
}

test("the PMO office admits whoever the matrix grants it to", async () => {
  const guard = createRequirePmoOfficer(matrix({ "PMO Officer": "edit", Management: "view" }));

  const officer = await runMiddleware(guard, { username: "a", role: "PMO Officer" });
  assert.equal(officer.nextCalled, true);

  const management = await runMiddleware(guard, { username: "b", role: "Management" });
  assert.equal(management.nextCalled, true, "view is enough to read the dashboard");

  // Management holds only view here, so it may read but not write. Under the
  // old guard the role name alone admitted every method.
  const write = await runMiddleware(guard, { username: "b", role: "Management" }, "POST");
  assert.equal(write.nextCalled, false, "view does not carry a write");
});

test("the PMO office refuses roles the matrix does not grant, and anonymous", async () => {
  const guard = createRequirePmoOfficer(matrix({ "PMO Officer": "edit" }));
  for (const user of [
    { username: "c", role: "Researcher" },
    { username: "d", role: "Research Officer" },
    undefined,
  ]) {
    const result = await runMiddleware(guard, user);
    assert.equal(result.nextCalled, false, `${user?.role ?? "anonymous"} should be rejected`);
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.body, { message: "Forbidden. PMO office access required." });
  }
});

test("the research office admits whoever the matrix grants it to", async () => {
  const guard = createRequireResearchOfficer(matrix({ "Research Officer": "edit" }));
  const result = await runMiddleware(guard, { username: "e", role: "Research Officer" });
  assert.equal(result.nextCalled, true);
});

test("administrators reach both offices whatever the matrix says", async () => {
  // A wrong cell must not lock out the people who would have to correct it.
  const denyAll = matrix({});
  for (const factory of [createRequirePmoOfficer, createRequireResearchOfficer]) {
    for (const user of [
      { username: "f", role: "superadmin" },
      { username: "g", role: "admin" },
      { username: "h", role: "Investigator", secondaryRoles: ["admin"] },
    ]) {
      const result = await runMiddleware(factory(denyAll), user, "DELETE");
      assert.equal(result.nextCalled, true, `${user.username} must reach the office`);
    }
  }
});

test("the retired grant and contracts roles no longer open the research office", async () => {
  // Grants and contracts were consolidated into one Research Officer role. A
  // stale role string left on an account holds nothing in the matrix, so it
  // contributes nothing rather than defaulting open.
  const guard = createRequireResearchOfficer(matrix({ "Research Officer": "edit" }));
  for (const role of ["Grant Officer", "Contracts Officer"]) {
    const result = await runMiddleware(guard, { username: "i", role });
    assert.equal(result.nextCalled, false, `${role} must no longer be admitted`);
    assert.equal(result.statusCode, 403);
  }
});

test("the research office refuses roles the matrix does not grant, and anonymous", async () => {
  const guard = createRequireResearchOfficer(matrix({ "Research Officer": "edit" }));
  for (const user of [
    { username: "j", role: "Researcher" },
    { username: "k", role: "PMO Officer" },
    undefined,
  ]) {
    const result = await runMiddleware(guard, user);
    assert.equal(result.nextCalled, false, `${user?.role ?? "anonymous"} should be rejected`);
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.body, {
      message: "Forbidden. Research office access required.",
    });
  }
});

test("a secondary role can open an office the primary role cannot", async () => {
  // The reason secondary roles exist: someone whose job title grants nothing
  // here still gets in through the seat they actually hold.
  const guard = createRequirePmoOfficer(matrix({ "PMO Officer": "edit", Researcher: "hide" }));
  const result = await runMiddleware(
    guard,
    { username: "l", role: "Researcher", secondaryRoles: ["PMO Officer"] },
  );
  assert.equal(result.nextCalled, true);
});
