import assert from "node:assert/strict";
import test from "node:test";
import { createRequirePublicationOfficer } from "./auth.js";

async function runRequirePublicationOfficer(
  role?: string,
  accessLevel: string | null = null,
  method = "POST",
) {
  let nextCalled = false;
  let statusCode = 200;
  let body: unknown;
  const req = {
    method,
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

  const requirePublicationOfficer = createRequirePublicationOfficer(async () => accessLevel);
  await requirePublicationOfficer(req as any, res as any, () => {
    nextCalled = true;
  });

  return { nextCalled, statusCode, body };
}

test("publication officer middleware allows matrix edit access and administrators", async () => {
  for (const role of ["Outcome Officer", "Management", "admin", "superadmin"]) {
    const result = await runRequirePublicationOfficer(role, "edit");
    assert.equal(result.nextCalled, true, `${role} should be allowed`);
    assert.equal(result.statusCode, 200);
  }
});

test("publication officer middleware allows matrix view access only for reads", async () => {
  const read = await runRequirePublicationOfficer("Research Admin", "view", "GET");
  assert.equal(read.nextCalled, true);

  const write = await runRequirePublicationOfficer("Research Admin", "view", "POST");
  assert.equal(write.nextCalled, false);
  assert.equal(write.statusCode, 403);
});

test("publication officer middleware rejects hidden or missing matrix access", async () => {
  for (const role of ["Scientist", "Contracts Officer", "Research Admin"]) {
    const result = await runRequirePublicationOfficer(role, role === "Research Admin" ? null : "hide");
    assert.equal(result.nextCalled, false, `${role} should be rejected`);
    assert.equal(result.statusCode, 403);
    assert.deepEqual(result.body, {
      message: "Forbidden. Publication office access required.",
    });
  }
});

test("publication officer middleware rejects requests without a session user", async () => {
  const result = await runRequirePublicationOfficer();
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
  assert.deepEqual(result.body, {
    message: "Forbidden. Publication office access required.",
  });
});