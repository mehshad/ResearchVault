import assert from "node:assert/strict";
import test from "node:test";
import { requirePublicationOfficer } from "./auth.js";

function runRequirePublicationOfficer(role?: string) {
  let nextCalled = false;
  let statusCode = 200;
  let body: unknown;
  const req = {
    method: "POST",
    path: "/api/publications/export",
    session: role
      ? {
          user: {
            username: "test-user",
            role,
          },
        }
      : {},
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

  requirePublicationOfficer(req as any, res as any, () => {
    nextCalled = true;
  });

  return { nextCalled, statusCode, body };
}

test("publication officer middleware allows office and administrator roles", () => {
  for (const role of ["Outcome Officer", "admin", "superadmin", "Management"]) {
    const result = runRequirePublicationOfficer(role);
    assert.equal(result.nextCalled, true, `${role} should be allowed`);
    assert.equal(result.statusCode, 200);
  }
});

test("publication officer middleware rejects unrelated roles", () => {
  for (const role of ["Scientist", "Contracts Officer", "Research Admin"]) {
    const result = runRequirePublicationOfficer(role);
    assert.equal(result.nextCalled, false, `${role} should be rejected`);
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.body, {
      message: "Forbidden. Publication office access required.",
    });
  }
});

test("publication officer middleware rejects requests without a session user", () => {
  const result = runRequirePublicationOfficer();
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
  assert.deepEqual(result.body, {
    message: "Forbidden. Publication office access required.",
  });
});