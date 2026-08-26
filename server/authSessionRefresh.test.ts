import test from "node:test";
import assert from "node:assert/strict";
import { createRefreshSessionAuthorizationMiddleware } from "./auth";

function makeRequest(role = "Management") {
  return {
    session: {
      user: {
        id: 41,
        username: "active-user",
        name: "Active User",
        email: "active@example.test",
        role,
        scientistId: 12,
        needsRegistration: false,
      },
    },
  } as any;
}

function makeResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  } as any;
}

test("a database role demotion replaces the stale privileged session before routing", async () => {
  const req = makeRequest("Management");
  const res = makeResponse();
  let nextCalled = false;
  const middleware = createRefreshSessionAuthorizationMiddleware(
    async () =>
      ({
        id: 41,
        username: "active-user",
        name: "Active User",
        email: "active@example.test",
        password: "",
        role: "user",
        scientistId: 12,
      }) as any,
    () => false
  );

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.session.user.role, "user");
});

test("authorization fails closed when the role cannot be verified", async () => {
  const req = makeRequest();
  const res = makeResponse();
  let nextCalled = false;
  const middleware = createRefreshSessionAuthorizationMiddleware(
    async () => {
      throw new Error("database unavailable");
    },
    () => false
  );

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 503);
});

test("a removed account loses its serialized session", async () => {
  const req = makeRequest();
  const res = makeResponse();
  const middleware = createRefreshSessionAuthorizationMiddleware(
    async () => null,
    () => false
  );

  await middleware(req, res, () => {
    assert.fail("removed account must not reach application routes");
  });

  assert.equal(res.statusCode, 401);
  assert.equal(req.session.user, undefined);
});