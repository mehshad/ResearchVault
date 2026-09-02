// Unit tests for the Express middleware wrappers in publicationMutationPolicy.ts.
// The underlying violation logic is already covered in publicationMutationPolicy.test.ts;
// these tests verify the HTTP response layer (status codes, JSON body, next() calls).

import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response, NextFunction } from "express";

process.env.DATABASE_URL ||= "postgresql://ci:ci@localhost:5432/ci_test";

import {
  rejectGenericPublicationWorkflowMutation,
  rejectPublicationCreateWorkflowMutation,
  rejectProtectedPublicationStatusFields,
} from "./publicationMutationPolicy";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeReq(body: Record<string, unknown> = {}): Request {
  return { body, method: "PATCH", path: "/api/publications/1" } as unknown as Request;
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

function run(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  body: Record<string, unknown>,
): { calledNext: boolean; res: Response & { statusCode: number; body: unknown } } {
  const req = fakeReq(body);
  const res = fakeRes();
  let calledNext = false;
  middleware(req, res, () => { calledNext = true; });
  return { calledNext, res };
}

// ---------------------------------------------------------------------------
// rejectGenericPublicationWorkflowMutation
// ---------------------------------------------------------------------------

test("rejectGenericPublicationWorkflowMutation calls next() for a clean PATCH body", () => {
  const { calledNext } = run(rejectGenericPublicationWorkflowMutation, {
    title: "A new title",
  });
  assert.ok(calledNext);
});

test("rejectGenericPublicationWorkflowMutation blocks vetted-flag mutation with 4xx", () => {
  const { calledNext, res } = run(rejectGenericPublicationWorkflowMutation, {
    vettedForSubmissionByIpOffice: true,
  });
  assert.ok(!calledNext);
  assert.ok(res.statusCode >= 400 && res.statusCode < 500);
  assert.ok(typeof (res.body as any).message === "string");
});

test("rejectGenericPublicationWorkflowMutation blocks Published * status mutation", () => {
  const { calledNext, res } = run(rejectGenericPublicationWorkflowMutation, {
    status: "Published *",
  });
  assert.ok(!calledNext);
  assert.ok(res.statusCode >= 400 && res.statusCode < 500);
});

test("rejectGenericPublicationWorkflowMutation calls next() for empty body", () => {
  const { calledNext } = run(rejectGenericPublicationWorkflowMutation, {});
  assert.ok(calledNext);
});

// ---------------------------------------------------------------------------
// rejectPublicationCreateWorkflowMutation
// ---------------------------------------------------------------------------

test("rejectPublicationCreateWorkflowMutation calls next() for a normal create body", () => {
  const { calledNext } = run(rejectPublicationCreateWorkflowMutation, {
    title: "My paper",
    status: "Concept",
  });
  assert.ok(calledNext);
});

test("rejectPublicationCreateWorkflowMutation blocks create with Published * status", () => {
  const { calledNext, res } = run(rejectPublicationCreateWorkflowMutation, {
    title: "My paper",
    status: "Published *",
  });
  assert.ok(!calledNext);
  assert.ok(res.statusCode >= 400 && res.statusCode < 500);
  assert.ok(typeof (res.body as any).message === "string");
});

test("rejectPublicationCreateWorkflowMutation blocks create with vettedForSubmissionByIpOffice", () => {
  const { calledNext, res } = run(rejectPublicationCreateWorkflowMutation, {
    title: "My paper",
    vettedForSubmissionByIpOffice: true,
  });
  assert.ok(!calledNext);
  assert.ok(res.statusCode >= 400 && res.statusCode < 500);
});

// ---------------------------------------------------------------------------
// rejectProtectedPublicationStatusFields
// ---------------------------------------------------------------------------

test("rejectProtectedPublicationStatusFields calls next() for a clean status update", () => {
  const req = fakeReq({ status: "Complete Draft", changes: "Moving forward" });
  const res = fakeRes();
  let calledNext = false;
  rejectProtectedPublicationStatusFields(req, res, () => { calledNext = true; });
  assert.ok(calledNext);
});

test("rejectProtectedPublicationStatusFields blocks updatedFields containing vettedForSubmissionByIpOffice", () => {
  const req = fakeReq({
    status: "Vetted for submission",
    updatedFields: { vettedForSubmissionByIpOffice: true },
  });
  const res = fakeRes();
  let calledNext = false;
  rejectProtectedPublicationStatusFields(req, res, () => { calledNext = true; });
  assert.ok(!calledNext);
  assert.ok(res.statusCode >= 400 && res.statusCode < 500);
});

test("rejectProtectedPublicationStatusFields calls next() when updatedFields is absent", () => {
  const req = fakeReq({ status: "Under review" });
  const res = fakeRes();
  let calledNext = false;
  rejectProtectedPublicationStatusFields(req, res, () => { calledNext = true; });
  assert.ok(calledNext);
});
