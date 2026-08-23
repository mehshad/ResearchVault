import assert from "node:assert/strict";
import test from "node:test";
import { requireAdmin } from "./auth.js";

function runRequireAdmin(role: string, authMode: string) {
  const previousMode = process.env.AUTH_MODE;
  process.env.AUTH_MODE = authMode;

  let nextCalled = false;
  let statusCode = 200;
  let body: unknown;
  const req = {
    method: "GET",
    path: "/api/bulk-data/sections",
    session: {
      user: {
        username: "test-user",
        role,
      },
    },
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

  try {
    requireAdmin(req as any, res as any, () => {
      nextCalled = true;
    });
  } finally {
    if (previousMode === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = previousMode;
  }

  return { nextCalled, statusCode, body };
}

test("demo Management session can exercise administrator-only previews", () => {
  const result = runRequireAdmin("Management", "demo");
  assert.equal(result.nextCalled, true);
  assert.equal(result.statusCode, 200);
});

test("Management remains blocked outside demo mode", () => {
  const result = runRequireAdmin("Management", "local");
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
  assert.deepEqual(result.body, { message: "Forbidden. Admin access required." });
});

test("admin and superadmin remain allowed outside demo mode", () => {
  assert.equal(runRequireAdmin("admin", "local").nextCalled, true);
  assert.equal(runRequireAdmin("superadmin", "oidc").nextCalled, true);
});