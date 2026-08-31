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

// ── AC-01: the access matrix is administrator-only to change ────────────────

test("every mutating role-permission route is behind an administrator guard", async () => {
  // The matrix decides what each role may reach, and one of its columns
  // (outcome-office) is enforced server-side. An unguarded write here is a
  // privilege-escalation path from any assigned role, so the guards are
  // asserted at the source rather than trusted to stay.
  const fs = await import("node:fs");
  const routes = fs.readFileSync(
    new URL("./routes.ts", import.meta.url),
    "utf-8",
  );

  const mutating = [
    /app\.post\('\/api\/role-permissions',\s*requireAuth,\s*requireAdmin/,
    /app\.patch\('\/api\/role-permissions\/:jobTitle\/:navigationItem',\s*requireAuth,\s*requireAdmin/,
    /app\.post\('\/api\/role-permissions\/bulk',\s*requireAuth,\s*requireAdmin/,
  ];
  for (const pattern of mutating) {
    assert.ok(
      pattern.test(routes),
      `a mutating role-permission route lost its administrator guard: ${pattern}`,
    );
  }

  // The read stays open to any signed-in user on purpose: every client loads
  // the matrix on mount to render its own navigation. Admin-gating it would
  // make non-admins fall back to hard-coded defaults and silently ignore the
  // configured matrix.
  assert.ok(
    /app\.get\('\/api\/role-permissions',\s*requireAuth,/.test(routes),
    "the matrix read must require authentication but not administrator rights",
  );
});
