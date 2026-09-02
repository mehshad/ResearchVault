// Unit tests for server/middleware/validation.ts

import assert from "node:assert/strict";
import test from "node:test";
import { z, ZodError } from "zod";
import type { Request, Response, NextFunction } from "express";

process.env.DATABASE_URL ||= "postgresql://ci:ci@localhost:5432/ci_test";

import {
  validateBody,
  validateQuery,
  asyncHandler,
  errorHandler,
} from "./middleware/validation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeReq(overrides: Partial<{ body: unknown; query: unknown }>): Request {
  return { body: {}, query: {}, ...overrides } as unknown as Request;
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
// validateBody
// ---------------------------------------------------------------------------

const bodySchema = z.object({
  name: z.string().min(1),
  age: z.number().int().positive(),
});

test("validateBody calls next() and parses body for valid input", () => {
  const mw = validateBody(bodySchema);
  const req = fakeReq({ body: { name: "Alice", age: 30 } });
  const res = fakeRes();
  let called = false;
  mw(req, res, () => { called = true; });
  assert.ok(called);
  assert.deepEqual(req.body, { name: "Alice", age: 30 });
});

test("validateBody returns 400 for invalid body", () => {
  const mw = validateBody(bodySchema);
  const req = fakeReq({ body: { name: "", age: -1 } });
  const res = fakeRes();
  let called = false;
  mw(req, res, () => { called = true; });
  assert.ok(!called);
  assert.equal(res.statusCode, 400);
  assert.equal((res.body as any).message, "Validation error");
  assert.ok(Array.isArray((res.body as any).errors));
});

test("validateBody returns 400 for completely wrong type", () => {
  const mw = validateBody(bodySchema);
  const req = fakeReq({ body: "not an object" });
  const res = fakeRes();
  let called = false;
  mw(req, res, () => { called = true; });
  assert.ok(!called);
  assert.equal(res.statusCode, 400);
});

test("validateBody coerces valid input via Zod transform", () => {
  const schema = z.object({ value: z.string().transform((s) => s.trim()) });
  const mw = validateBody(schema);
  const req = fakeReq({ body: { value: "  hello  " } });
  const res = fakeRes();
  mw(req, res, () => {});
  assert.equal(req.body.value, "hello");
});

// ---------------------------------------------------------------------------
// validateQuery
// ---------------------------------------------------------------------------

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  q: z.string().optional(),
});

test("validateQuery calls next() and parses query for valid input", () => {
  const mw = validateQuery(querySchema);
  const req = fakeReq({ query: { page: "2", q: "science" } });
  const res = fakeRes();
  let called = false;
  mw(req, res, () => { called = true; });
  assert.ok(called);
  assert.equal((req.query as any).page, 2);
  assert.equal((req.query as any).q, "science");
});

test("validateQuery returns 400 for invalid query param", () => {
  const mw = validateQuery(querySchema);
  const req = fakeReq({ query: { page: "abc" } });
  const res = fakeRes();
  let called = false;
  mw(req, res, () => { called = true; });
  assert.ok(!called);
  assert.equal(res.statusCode, 400);
  assert.equal((res.body as any).message, "Validation error");
});

test("validateQuery applies defaults from schema", () => {
  const mw = validateQuery(querySchema);
  const req = fakeReq({ query: {} });
  const res = fakeRes();
  mw(req, res, () => {});
  assert.equal((req.query as any).page, 1);
});

// ---------------------------------------------------------------------------
// asyncHandler
// ---------------------------------------------------------------------------

test("asyncHandler calls next() when the handler resolves", async () => {
  const handler = asyncHandler(async (_req, _res, next) => { next(); });
  const req = fakeReq({});
  const res = fakeRes();
  let called = false;
  await new Promise<void>((resolve) => {
    handler(req, res, () => { called = true; resolve(); });
  });
  assert.ok(called);
});

test("asyncHandler forwards rejected promise to next(error)", async () => {
  const boom = new Error("boom");
  const handler = asyncHandler(async () => { throw boom; });
  const req = fakeReq({});
  const res = fakeRes();
  let caughtError: unknown;
  await new Promise<void>((resolve) => {
    handler(req, res, (err) => { caughtError = err; resolve(); });
  });
  assert.equal(caughtError, boom);
});

test("asyncHandler does not call next() when handler sends a response", async () => {
  const handler = asyncHandler(async (_req, res) => { res.status(200).json({}); });
  const req = fakeReq({});
  const res = fakeRes();
  let called = false;
  await new Promise<void>((resolve) => {
    handler(req, res, () => { called = true; resolve(); });
    // give the promise a tick to settle even if next is never called
    setTimeout(resolve, 20);
  });
  assert.ok(!called);
});

// ---------------------------------------------------------------------------
// errorHandler
// ---------------------------------------------------------------------------

test("errorHandler returns 500 for a generic Error", () => {
  const err = new Error("Something broke");
  const req = fakeReq({});
  const res = fakeRes();
  errorHandler(err, req, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.equal((res.body as any).message, "Something broke");
});

test("errorHandler returns 400 for a ZodError", () => {
  let zodErr: ZodError;
  try {
    z.object({ n: z.number() }).parse({ n: "x" });
  } catch (e) {
    zodErr = e as ZodError;
  }
  const req = fakeReq({});
  const res = fakeRes();
  errorHandler(zodErr!, req, res, () => {});
  assert.equal(res.statusCode, 400);
  assert.equal((res.body as any).message, "Validation error");
  assert.ok(Array.isArray((res.body as any).errors));
});

test("errorHandler returns 500 with fallback message when error has no message", () => {
  const err = new Error("");
  const req = fakeReq({});
  const res = fakeRes();
  errorHandler(err, req, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.ok(typeof (res.body as any).message === "string");
});
