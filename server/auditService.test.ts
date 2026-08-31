// Unit tests for server/auditService.ts
// All DB writes are intercepted by spying on the db object so no real
// database connection is needed.

import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://ci:ci@localhost:5432/ci_test";

import { AuditService, systemAudit } from "./auditService";
import { db } from "./db";

// ---------------------------------------------------------------------------
// Stub: capture the values passed to db.insert(auditLog).values(...)
// ---------------------------------------------------------------------------

const captured: unknown[] = [];

// Replace db.insert with a spy that records the values payload.
// The real db.insert returns a chainable builder; we only need `.values()`.
const originalInsert = db.insert.bind(db);
(db as any).insert = (table: unknown) => {
  return {
    values: (row: unknown) => {
      captured.push({ table, row });
      return Promise.resolve();
    },
  };
};

function lastCapture() {
  return captured[captured.length - 1] as { table: unknown; row: Record<string, unknown> };
}

function clearCaptures() {
  captured.length = 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<{ userId: number | null; ipAddress: string | null; userAgent: string | null; route: string | null }> = {}) {
  return {
    userId:    1,
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    route:     "PUT /test",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// logInsert
// ---------------------------------------------------------------------------

test("logInsert records action=INSERT with newValues and changedFields", async () => {
  clearCaptures();
  const svc = new AuditService(makeCtx());
  await svc.logInsert("grants", 42, { title: "Grant A", amount: 1000 });

  const { row } = lastCapture();
  assert.equal(row.action, "INSERT");
  assert.equal(row.tableName, "grants");
  assert.equal(row.recordId, 42);
  assert.deepEqual((row.newValues as any).title, "Grant A");
  assert.ok((row.changedFields as string[]).includes("title"));
  assert.ok((row.changedFields as string[]).includes("amount"));
  assert.equal(row.oldValues, undefined);
});

test("logInsert attaches context fields from AuditContext", async () => {
  clearCaptures();
  const svc = new AuditService(makeCtx({ userId: 7, ipAddress: "10.0.0.1", route: "POST /api/grants" }));
  await svc.logInsert("grants", 1, { title: "G" });

  const { row } = lastCapture();
  assert.equal(row.changedBy, 7);
  assert.equal(row.ipAddress, "10.0.0.1");
  assert.equal(row.route, "POST /api/grants");
});

test("logInsert stores reason when provided", async () => {
  clearCaptures();
  const svc = new AuditService(makeCtx());
  await svc.logInsert("publications", 5, { status: "Concept" }, "Initial submission");

  assert.equal(lastCapture().row.reason, "Initial submission");
});

test("logInsert redacts password fields", async () => {
  clearCaptures();
  const svc = new AuditService(makeCtx());
  await svc.logInsert("users", 1, { username: "alice", password: "secret123", email: "a@b.com" });

  const newValues = lastCapture().row.newValues as Record<string, unknown>;
  assert.equal(newValues.password, "[REDACTED]");
  assert.equal(newValues.username, "alice");
  assert.equal(newValues.email, "a@b.com");
});

// ---------------------------------------------------------------------------
// logUpdate
// ---------------------------------------------------------------------------

test("logUpdate records action=UPDATE with before and after snapshots", async () => {
  clearCaptures();
  const svc = new AuditService(makeCtx());
  const before = { status: "Concept", title: "Old" };
  const after  = { status: "Complete Draft", title: "Old" };
  await svc.logUpdate("publications", 10, before, after);

  const { row } = lastCapture();
  assert.equal(row.action, "UPDATE");
  assert.deepEqual((row.oldValues as any).status, "Concept");
  assert.deepEqual((row.newValues as any).status, "Complete Draft");
});

test("logUpdate only records keys that actually changed in changedFields", async () => {
  clearCaptures();
  const svc = new AuditService(makeCtx());
  await svc.logUpdate("grants", 3,
    { title: "A", amount: 100, status: "draft" },
    { title: "A", amount: 200, status: "draft" },
  );

  const fields = lastCapture().row.changedFields as string[];
  assert.ok(fields.includes("amount"), "amount should be in changedFields");
  assert.ok(!fields.includes("title"),  "title should not be in changedFields");
  assert.ok(!fields.includes("status"), "status should not be in changedFields");
});

test("logUpdate is a no-op when nothing changed", async () => {
  clearCaptures();
  const svc = new AuditService(makeCtx());
  await svc.logUpdate("grants", 3,
    { title: "Same", amount: 100 },
    { title: "Same", amount: 100 },
  );

  assert.equal(captured.length, 0, "no audit entry should be written for no-op update");
});

test("logUpdate stores reason", async () => {
  clearCaptures();
  const svc = new AuditService(makeCtx());
  await svc.logUpdate("publications", 1, { status: "A" }, { status: "B" }, "Reviewer approved");
  assert.equal(lastCapture().row.reason, "Reviewer approved");
});

// ---------------------------------------------------------------------------
// logDelete
// ---------------------------------------------------------------------------

test("logDelete records action=DELETE with oldValues only", async () => {
  clearCaptures();
  const svc = new AuditService(makeCtx());
  await svc.logDelete("grants", 9, { title: "Grant to delete", amount: 500 });

  const { row } = lastCapture();
  assert.equal(row.action, "DELETE");
  assert.equal(row.tableName, "grants");
  assert.equal(row.recordId, 9);
  assert.deepEqual((row.oldValues as any).title, "Grant to delete");
  assert.equal(row.newValues, undefined);
});

test("logDelete changedFields lists all keys of the deleted row", async () => {
  clearCaptures();
  const svc = new AuditService(makeCtx());
  await svc.logDelete("scientists", 2, { id: 2, firstName: "Jane", lastName: "Doe", email: "j@d.com" });

  const fields = lastCapture().row.changedFields as string[];
  assert.ok(fields.includes("firstName"));
  assert.ok(fields.includes("email"));
});

// ---------------------------------------------------------------------------
// logStatusChange
// ---------------------------------------------------------------------------

test("logStatusChange records a status transition as UPDATE", async () => {
  clearCaptures();
  const svc = new AuditService(makeCtx());
  await svc.logStatusChange("publications", 7, "Concept", "Complete Draft", undefined, "Ready for review");

  const { row } = lastCapture();
  assert.equal(row.action, "UPDATE");
  assert.equal((row.oldValues as any).status, "Concept");
  assert.equal((row.newValues as any).status, "Complete Draft");
  assert.equal(row.reason, "Ready for review");
});

test("logStatusChange is a no-op when status does not change", async () => {
  clearCaptures();
  const svc = new AuditService(makeCtx());
  await svc.logStatusChange("publications", 7, "Concept", "Concept");
  assert.equal(captured.length, 0, "same-status transition should produce no entry");
});

// ---------------------------------------------------------------------------
// systemAudit
// ---------------------------------------------------------------------------

test("systemAudit has null userId and 'system' userAgent", async () => {
  clearCaptures();
  await systemAudit.logInsert("bulk_data_archives", 1, { name: "archive.zip" });

  const { row } = lastCapture();
  assert.equal(row.changedBy, null);
  assert.equal(row.userAgent, "system");
});

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

test("logUpdate redacts sensitive fields in both before and after", async () => {
  clearCaptures();
  const svc = new AuditService(makeCtx());
  await svc.logUpdate("users", 1,
    { username: "alice", passwordHash: "oldhash", role: "admin" },
    { username: "alice", passwordHash: "newhash", role: "superadmin" },
  );

  const { row } = lastCapture();
  assert.equal((row.oldValues as any).passwordHash, "[REDACTED]");
  assert.equal((row.newValues as any).passwordHash, "[REDACTED]");
  assert.equal((row.newValues as any).role, "superadmin"); // non-sensitive preserved
});

// Restore original db.insert at end (best-effort; tests run in isolation)
test("restore db.insert", () => {
  (db as any).insert = originalInsert;
  assert.ok(true);
});
