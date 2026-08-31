// Unit tests for auth.ts middleware functions that require no database.
// createRequirePublicationOfficer is tested separately in authPublicationOfficer.test.ts.

import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response, NextFunction } from "express";

process.env.DATABASE_URL ||= "postgresql://ci:ci@localhost:5432/ci_test";

import {
  getAuthMode,
  isSsoEnabled,
  hashPassword,
  demoBannerMiddleware,
  requireAuth,
  requireContractsOfficer,
  requireContractsRead,
} from "./auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeReq(overrides: Partial<Request> = {}): Request {
  return {
    method: "GET",
    path: "/test",
    session: {},
    ...overrides,
  } as unknown as Request;
}

function fakeRes() {
  let statusCode = 200;
  let body: unknown;
  const res: any = {
    get statusCode() { return statusCode; },
    get body() { return body; },
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
  };
  return res as Response & { statusCode: number; body: unknown };
}

// ---------------------------------------------------------------------------
// getAuthMode
// ---------------------------------------------------------------------------

test("getAuthMode returns 'local' by default", () => {
  const prev = process.env.AUTH_MODE;
  delete process.env.AUTH_MODE;
  assert.equal(getAuthMode(), "local");
  process.env.AUTH_MODE = prev ?? "";
});

test("getAuthMode returns 'demo' when AUTH_MODE=demo", () => {
  const prev = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "demo";
  assert.equal(getAuthMode(), "demo");
  process.env.AUTH_MODE = prev ?? "";
});

test("getAuthMode returns 'ldap' when AUTH_MODE=LDAP (case-insensitive)", () => {
  const prev = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "LDAP";
  assert.equal(getAuthMode(), "ldap");
  process.env.AUTH_MODE = prev ?? "";
});

test("getAuthMode returns 'oidc' when AUTH_MODE=oidc", () => {
  const prev = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "oidc";
  assert.equal(getAuthMode(), "oidc");
  process.env.AUTH_MODE = prev ?? "";
});

test("getAuthMode falls back to 'local' for unknown modes", () => {
  const prev = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "saml";
  assert.equal(getAuthMode(), "local");
  process.env.AUTH_MODE = prev ?? "";
});

// ---------------------------------------------------------------------------
// isSsoEnabled
// ---------------------------------------------------------------------------

test("isSsoEnabled is true only for oidc mode", () => {
  const prev = process.env.AUTH_MODE;

  process.env.AUTH_MODE = "oidc";
  assert.equal(isSsoEnabled(), true);

  process.env.AUTH_MODE = "ldap";
  assert.equal(isSsoEnabled(), false);

  process.env.AUTH_MODE = "demo";
  assert.equal(isSsoEnabled(), false);

  process.env.AUTH_MODE = "local";
  assert.equal(isSsoEnabled(), false);

  process.env.AUTH_MODE = prev ?? "";
});

// ---------------------------------------------------------------------------
// hashPassword
// ---------------------------------------------------------------------------

test("hashPassword returns a 64-char hex string", () => {
  const hash = hashPassword("secret");
  assert.equal(typeof hash, "string");
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test("hashPassword is deterministic", () => {
  assert.equal(hashPassword("password123"), hashPassword("password123"));
});

test("hashPassword produces different hashes for different inputs", () => {
  assert.notEqual(hashPassword("password"), hashPassword("Password"));
  assert.notEqual(hashPassword("a"), hashPassword("b"));
});

test("hashPassword handles empty string", () => {
  const hash = hashPassword("");
  assert.equal(hash.length, 64);
  assert.notEqual(hash, hashPassword(" "));
});

// ---------------------------------------------------------------------------
// demoBannerMiddleware
// ---------------------------------------------------------------------------

test("demoBannerMiddleware injects default demo user when session is empty", () => {
  const req = fakeReq({ session: {} } as any);
  const res = fakeRes();
  let calledNext = false;
  demoBannerMiddleware(req, res, () => { calledNext = true; });

  assert.ok(calledNext, "must call next()");
  assert.equal((req.session as any).user.username, process.env.DEMO_USERNAME || "demo.user");
  assert.equal((req.session as any).user.role, process.env.DEMO_ROLE || "Management");
  assert.equal((req.session as any).user.scientistId, null);
});

test("demoBannerMiddleware does not overwrite an existing session user", () => {
  const existing = { id: 5, username: "alice", role: "Investigator" };
  const req = fakeReq({ session: { user: existing } } as any);
  const res = fakeRes();
  demoBannerMiddleware(req, res, () => {});
  assert.deepEqual((req.session as any).user, existing);
});

test("demoBannerMiddleware always calls next()", () => {
  const req = fakeReq({ session: {} } as any);
  const res = fakeRes();
  let called = false;
  demoBannerMiddleware(req, res, () => { called = true; });
  assert.ok(called);
});

test("demoBannerMiddleware uses DEMO_NAME env if set", () => {
  const prev = process.env.DEMO_NAME;
  process.env.DEMO_NAME = "Dr Test";
  const req = fakeReq({ session: {} } as any);
  demoBannerMiddleware(req, fakeRes(), () => {});
  assert.equal((req.session as any).user.name, "Dr Test");
  process.env.DEMO_NAME = prev ?? "";
});

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------

test("requireAuth calls next() in demo mode without a session user", () => {
  const prev = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "demo";
  const req = fakeReq({ session: {} } as any);
  const res = fakeRes();
  let called = false;
  requireAuth(req, res, () => { called = true; });
  assert.ok(called);
  process.env.AUTH_MODE = prev ?? "";
});

test("requireAuth calls next() in local mode when session user exists", () => {
  const prev = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "local";
  const req = fakeReq({ session: { user: { id: 1, role: "Investigator" } } } as any);
  const res = fakeRes();
  let called = false;
  requireAuth(req, res, () => { called = true; });
  assert.ok(called);
  process.env.AUTH_MODE = prev ?? "";
});

test("requireAuth returns 401 in local mode without a session user", () => {
  const prev = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "local";
  const req = fakeReq({ session: {} } as any);
  const res = fakeRes();
  let called = false;
  requireAuth(req, res, () => { called = true; });
  assert.ok(!called);
  assert.equal(res.statusCode, 401);
  process.env.AUTH_MODE = prev ?? "";
});

// ---------------------------------------------------------------------------
// requireContractsOfficer
// ---------------------------------------------------------------------------

const CONTRACTS_ALLOWED = ["Contracts Officer", "admin", "superadmin", "Management"];
const CONTRACTS_DENIED  = ["Investigator", "Grant Officer", "IRB Officer", "user"];

for (const role of CONTRACTS_ALLOWED) {
  test(`requireContractsOfficer allows role="${role}"`, () => {
    const req = fakeReq({ session: { user: { id: 1, role } } } as any);
    const res = fakeRes();
    let called = false;
    requireContractsOfficer(req, res, () => { called = true; });
    assert.ok(called, `expected next() for role="${role}"`);
  });
}

for (const role of CONTRACTS_DENIED) {
  test(`requireContractsOfficer blocks role="${role}" with 403`, () => {
    const req = fakeReq({ session: { user: { id: 1, role } } } as any);
    const res = fakeRes();
    let called = false;
    requireContractsOfficer(req, res, () => { called = true; });
    assert.ok(!called, `expected 403 for role="${role}"`);
    assert.equal(res.statusCode, 403);
  });
}

test("requireContractsOfficer returns 403 for anonymous (no session user)", () => {
  const req = fakeReq({ session: {} } as any);
  const res = fakeRes();
  let called = false;
  requireContractsOfficer(req, res, () => { called = true; });
  assert.ok(!called);
  assert.equal(res.statusCode, 403);
});

// ---------------------------------------------------------------------------
// requireContractsRead
// ---------------------------------------------------------------------------

test("requireContractsRead calls next() and sets currentUser when session user exists", () => {
  const user = { id: 3, role: "Investigator" };
  const req = fakeReq({ session: { user } } as any);
  const res = fakeRes();
  let called = false;
  requireContractsRead(req, res, () => { called = true; });
  assert.ok(called);
  assert.deepEqual((req as any).currentUser, user);
});

test("requireContractsRead returns 401 when no session user", () => {
  const req = fakeReq({ session: {} } as any);
  const res = fakeRes();
  let called = false;
  requireContractsRead(req, res, () => { called = true; });
  assert.ok(!called);
  assert.equal(res.statusCode, 401);
});
