import assert from "node:assert/strict";
import test from "node:test";

import { requirePmoOfficer, requireResearchOfficer } from "./auth.js";

function runMiddleware(
  middleware: typeof requirePmoOfficer,
  role?: string,
) {
  let nextCalled = false;
  let statusCode = 200;
  let body: unknown;
  const req = {
    method: "GET",
    path: "/api/office-dashboards/test",
    session: role ? { user: { username: "test-user", role } } : {},
  };
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  };

  middleware(req as any, res as any, () => {
    nextCalled = true;
  });

  return { nextCalled, statusCode, body };
}

test("PMO officer middleware allows its office and elevated roles", () => {
  for (const role of ["PMO Officer", "admin", "superadmin", "Management"]) {
    const result = runMiddleware(requirePmoOfficer, role);
    assert.equal(result.nextCalled, true, `${role} should be allowed`);
    assert.equal(result.statusCode, 200);
  }
});

test("PMO officer middleware rejects unrelated and anonymous users", () => {
  for (const role of ["Scientist", "Grant Officer", undefined]) {
    const result = runMiddleware(requirePmoOfficer, role);
    assert.equal(result.nextCalled, false, `${role ?? "anonymous"} should be rejected`);
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.body, { message: "Forbidden. PMO access required." });
  }
});

test("research officer middleware allows research-office and elevated roles", () => {
  for (const role of ["Grant Officer", "Contracts Officer", "admin", "superadmin", "Management"]) {
    const result = runMiddleware(requireResearchOfficer, role);
    assert.equal(result.nextCalled, true, `${role} should be allowed`);
    assert.equal(result.statusCode, 200);
  }
});

test("research officer middleware rejects unrelated and anonymous users", () => {
  for (const role of ["Scientist", "PMO Officer", undefined]) {
    const result = runMiddleware(requireResearchOfficer, role);
    assert.equal(result.nextCalled, false, `${role ?? "anonymous"} should be rejected`);
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.body, {
      message: "Forbidden. Research office access required.",
    });
  }
});