import { test } from "node:test";
import assert from "node:assert/strict";
import { auditContextMiddleware } from "./auditContext";

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
