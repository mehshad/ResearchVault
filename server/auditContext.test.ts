import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { auditContextMiddleware, deletedRecordId, deletedTableName } from "./auditContext";
import { db } from "./db";

/**
 * audit_log.changed_by is a foreign key to users(id). The demo session is user
 * id 0, which is not a real users row, so a context that carries the 0 makes
 * every audited write in demo mode fail its audit insert.
 *
 * This is the third place the `??` / `||` distinction has mattered here --
 * grants.created_by_user_id and user_role_assignments.assigned_by were the
 * others -- and each time it presented as an unrelated bug.
 */
const contextFor = (user: unknown) => {
  const req: any = { session: { user }, ip: "127.0.0.1", headers: {}, method: "PATCH", path: "/scientists/1" };
  auditContextMiddleware(req, {} as any, () => {});
  return (req.audit as any).ctx;
};

test("the demo session's user id 0 is recorded as nobody, not as user 0", () => {
  assert.equal(contextFor({ id: 0 }).userId, null);
});

test("a real user id is kept", () => {
  assert.equal(contextFor({ id: 23 }).userId, 23);
});

test("no session at all is nobody", () => {
  assert.equal(contextFor(undefined).userId, null);
});

test("the route is recorded for investigations", () => {
  assert.equal(contextFor({ id: 23 }).route, "PATCH /scientists/1");
});

// ---------------------------------------------------------------------------
// #24: every successful DELETE leaves an entry, even when the route forgot.
// ---------------------------------------------------------------------------

const captured: Array<Record<string, unknown>> = [];
(db as any).insert = () => ({
  values: (row: Record<string, unknown>) => {
    captured.push(row);
    return Promise.resolve();
  },
});

const deleteRequest = (overrides: Record<string, unknown> = {}) => ({
  session: { user: { id: 5 } },
  ip: "127.0.0.1",
  headers: {},
  method: "DELETE",
  path: "/api/programs/7",
  route: { path: "/api/programs/:id" },
  params: { id: "7" },
  ...overrides,
});

/** Run the middleware, let the handler act, then finish the response. */
async function finishDelete(req: any, statusCode: number, handler?: (req: any) => Promise<void>) {
  captured.length = 0;
  const res: any = new EventEmitter();
  res.statusCode = statusCode;
  auditContextMiddleware(req, res, () => {});
  if (handler) await handler(req);
  res.emit("finish");
  await new Promise((resolve) => setImmediate(resolve));
}

test("a DELETE that recorded nothing gets a fallback entry naming who deleted what", async () => {
  await finishDelete(deleteRequest(), 204);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].tableName, "programs");
  assert.equal(captured[0].recordId, 7);
  assert.equal(captured[0].action, "DELETE");
  assert.equal(captured[0].changedBy, 5);
  assert.deepEqual(captured[0].oldValues, { params: { id: "7" } });
});

test("a DELETE that audited itself is not recorded twice", async () => {
  await finishDelete(deleteRequest(), 204, (req) => req.audit.logDelete("programs", 7, { name: "Genomics" }));
  assert.equal(captured.length, 1);
  assert.deepEqual(captured[0].oldValues, { name: "Genomics" });
});

test("a DELETE that failed is not recorded", async () => {
  await finishDelete(deleteRequest(), 404);
  assert.equal(captured.length, 0);
  await finishDelete(deleteRequest(), 409);
  assert.equal(captured.length, 0);
});

test("a DELETE that matched no route is not recorded: the static fallback answered, nothing was deleted", async () => {
  await finishDelete(deleteRequest({ route: undefined, path: "/api/team-members/", params: { "0": "/api/team-members/" } }), 200);
  assert.equal(captured.length, 0);
});

test("other methods are left to their routes", async () => {
  await finishDelete(deleteRequest({ method: "PUT" }), 200);
  assert.equal(captured.length, 0);
});

test("the table and id come from the route template", () => {
  assert.equal(
    deletedTableName({ route: { path: "/api/projects/:projectId/members/:scientistId" }, path: "/api/projects/12/members/34" }),
    "projects/members",
  );
  assert.equal(deletedRecordId({ params: { projectId: "12", scientistId: "34" }, path: "/api/projects/12/members/34" }), 34);
  assert.equal(deletedTableName({ route: { path: "/api/research-activities/:id" }, path: "/api/research-activities/3" }), "research_activities");
  // no template (an unmatched path) falls back to the path itself
  assert.equal(deletedTableName({ path: "/api/ibc-applications/3/rooms/9" }), "ibc_applications/rooms");
  assert.equal(deletedRecordId({ path: "/api/ibc-applications/3/rooms/9" }), 9);
  // a key that is not a number is no record id
  assert.equal(deletedRecordId({ params: { key: "theme" }, path: "/api/system-configurations/theme" }), null);
});
