// Unit tests for auth.ts middleware functions that require no database.
// createRequirePublicationOfficer is tested separately in authPublicationOfficer.test.ts.

import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response, NextFunction } from "express";

process.env.DATABASE_URL ||= "postgresql://ci:ci@localhost:5432/ci_test";

import {
  getAuthMode,
  isSsoEnabled,
  isDemoLoginEnabled,
  hashPassword,
  requireAuth,
  createRequireResearchOfficer,
  createRequirePmoOfficer,
} from "./auth";

// ── Stub loaders ─────────────────────────────────────────────────────────────
// Inject a mock NavigationAccessLoader so tests never touch the database.
// The loader returns the access level the named role holds for the area,
// mirroring the matrix values set by 20260830_consolidate_research_officer.sql.

/** research-office: Research Officer → edit, Management → view, everyone else → null */
const researchOfficeLoader = async (role: string, _item: string) => {
  if (role === "Research Officer") return "edit" as const;
  if (role === "Management")       return "view" as const;
  return null;
};

/** pmo-office: PMO Officer → edit, Management → view, everyone else → null */
const pmoOfficeLoader = async (role: string, _item: string) => {
  if (role === "PMO Officer") return "edit" as const;
  if (role === "Management")  return "view" as const;
  return null;
};

const requireResearchOfficer = createRequireResearchOfficer(researchOfficeLoader);
const requirePmoOfficer       = createRequirePmoOfficer(pmoOfficeLoader);

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

test("getAuthMode falls back to 'local' for the retired demo mode", () => {
  const prev = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "demo";
  assert.equal(getAuthMode(), "local");
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

  process.env.AUTH_MODE = "local";
  assert.equal(isSsoEnabled(), false);

  process.env.AUTH_MODE = prev ?? "";
});

// ---------------------------------------------------------------------------
// isDemoLoginEnabled
// ---------------------------------------------------------------------------

test("isDemoLoginEnabled is true only for local mode with DEMO_LOGIN=1", () => {
  const prevMode = process.env.AUTH_MODE;
  const prevFlag = process.env.DEMO_LOGIN;

  process.env.AUTH_MODE = "local";
  process.env.DEMO_LOGIN = "1";
  assert.equal(isDemoLoginEnabled(), true);

  // Not without the flag.
  delete process.env.DEMO_LOGIN;
  assert.equal(isDemoLoginEnabled(), false);

  // Not in an external-provider mode, where the provider owns the identity.
  process.env.AUTH_MODE = "oidc";
  process.env.DEMO_LOGIN = "1";
  assert.equal(isDemoLoginEnabled(), false);

  process.env.AUTH_MODE = prevMode ?? "";
  if (prevFlag === undefined) delete process.env.DEMO_LOGIN;
  else process.env.DEMO_LOGIN = prevFlag;
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
// requireAuth
// ---------------------------------------------------------------------------

test("requireAuth returns 401 without a session user, whatever the mode", () => {
  const prev = process.env.AUTH_MODE;
  process.env.AUTH_MODE = "local";
  const req = fakeReq({ session: {} } as any);
  const res = fakeRes();
  let called = false;
  requireAuth(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
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

// ---------------------------------------------------------------------------
// requireResearchOfficer
// Guards /api/grants, /api/research-contracts after the role consolidation in
// 20260830_consolidate_research_officer.sql.  "Grant Officer" and "Contracts
// Officer" were merged into "Research Officer"; the guard now reads the matrix.
// ---------------------------------------------------------------------------

test("requireResearchOfficer allows Research Officer (has edit on research-office)", async () => {
  const req = fakeReq({ session: { user: { id: 1, role: "Research Officer" } } } as any);
  const res = fakeRes();
  let called = false;
  await requireResearchOfficer(req, res, () => { called = true; });
  assert.ok(called, "Research Officer must reach the handler");
});

test("requireResearchOfficer allows Management (has view on research-office)", async () => {
  const req = fakeReq({ session: { user: { id: 2, role: "Management" } } } as any);
  const res = fakeRes();
  let called = false;
  await requireResearchOfficer(req, res, () => { called = true; });
  assert.ok(called, "Management (view) must pass GET guard");
});

test("requireResearchOfficer blocks Management on write (view < create)", async () => {
  const req = fakeReq({
    method: "POST",
    session: { user: { id: 2, role: "Management" } },
  } as any);
  const res = fakeRes();
  let called = false;
  await requireResearchOfficer(req, res, () => { called = true; });
  assert.ok(!called, "Management (view) must not POST");
  assert.equal(res.statusCode, 403);
});

test("requireResearchOfficer blocks Investigator (no matrix entry)", async () => {
  const req = fakeReq({ session: { user: { id: 3, role: "Investigator" } } } as any);
  const res = fakeRes();
  let called = false;
  await requireResearchOfficer(req, res, () => { called = true; });
  assert.ok(!called);
  assert.equal(res.statusCode, 403);
});

test("requireResearchOfficer blocks anonymous request", async () => {
  const req = fakeReq({ session: {} } as any);
  const res = fakeRes();
  let called = false;
  await requireResearchOfficer(req, res, () => { called = true; });
  assert.ok(!called);
  assert.equal(res.statusCode, 403);
});

test("requireResearchOfficer allows superadmin (administrator short-circuit)", async () => {
  const req = fakeReq({ session: { user: { id: 99, role: "superadmin" } } } as any);
  const res = fakeRes();
  let called = false;
  await requireResearchOfficer(req, res, () => { called = true; });
  assert.ok(called, "superadmin bypasses the matrix");
});

// ---------------------------------------------------------------------------
// requirePmoOfficer
// Guards /api/programs, /api/projects, /api/research-activities after the
// consolidation in 20260831_consolidate_navigation_areas.sql.
// ---------------------------------------------------------------------------

test("requirePmoOfficer allows PMO Officer (has edit on pmo-office)", async () => {
  const req = fakeReq({ session: { user: { id: 1, role: "PMO Officer" } } } as any);
  const res = fakeRes();
  let called = false;
  await requirePmoOfficer(req, res, () => { called = true; });
  assert.ok(called);
});

test("requirePmoOfficer allows Management GET (has view on pmo-office)", async () => {
  const req = fakeReq({ session: { user: { id: 2, role: "Management" } } } as any);
  const res = fakeRes();
  let called = false;
  await requirePmoOfficer(req, res, () => { called = true; });
  assert.ok(called);
});

test("requirePmoOfficer blocks Management POST (view < create)", async () => {
  const req = fakeReq({
    method: "POST",
    session: { user: { id: 2, role: "Management" } },
  } as any);
  const res = fakeRes();
  let called = false;
  await requirePmoOfficer(req, res, () => { called = true; });
  assert.ok(!called);
  assert.equal(res.statusCode, 403);
});

test("requirePmoOfficer blocks Researcher (no matrix entry)", async () => {
  const req = fakeReq({ session: { user: { id: 5, role: "Researcher" } } } as any);
  const res = fakeRes();
  let called = false;
  await requirePmoOfficer(req, res, () => { called = true; });
  assert.ok(!called);
  assert.equal(res.statusCode, 403);
});

test("requirePmoOfficer blocks anonymous request", async () => {
  const req = fakeReq({ session: {} } as any);
  const res = fakeRes();
  let called = false;
  await requirePmoOfficer(req, res, () => { called = true; });
  assert.ok(!called);
  assert.equal(res.statusCode, 403);
});

test("requirePmoOfficer allows admin (administrator short-circuit)", async () => {
  const req = fakeReq({ session: { user: { id: 99, role: "admin" } } } as any);
  const res = fakeRes();
  let called = false;
  await requirePmoOfficer(req, res, () => { called = true; });
  assert.ok(called, "admin bypasses the matrix");
});
