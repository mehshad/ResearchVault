/**
 * AuditService — application-level audit trail.
 *
 * Writes to the audit_log table on every important INSERT / UPDATE / DELETE.
 * Works identically on PostgreSQL, SQLite and SQL Server because it uses the
 * same Drizzle ORM insert that all other writes use — no trigger syntax needed.
 *
 * Usage (inside a route handler, after req.audit is attached by the middleware):
 *
 *   const before = await fetchRecord(id);
 *   const after  = await updateRecord(id, data);
 *   await req.audit.logUpdate("grants", after.id, before, after, req.body.reason);
 */

import { db } from "./db";
import { auditLog, type AuditAction } from "@shared/schema";

// ---------------------------------------------------------------------------
// Context — populated once per request by auditContextMiddleware
// ---------------------------------------------------------------------------

export interface AuditContext {
  userId:    number | null;
  ipAddress: string | null;
  userAgent: string | null;
  /** e.g. "PUT /api/grants/42" */
  route:     string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the keys whose JSON-serialised value differs between two snapshots.
 * Timestamps are compared as ISO strings so `Date` instances work correctly.
 */
function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );
}

/**
 * Strip fields that should never appear in an audit snapshot:
 * passwords, tokens, and large binary blobs.
 */
const REDACT = new Set(["password", "passwordHash", "token", "secret", "apiKey", "refreshToken"]);

function redact(obj: unknown): unknown {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = REDACT.has(k) ? "[REDACTED]" : v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// AuditService
// ---------------------------------------------------------------------------

export class AuditService {
  constructor(private ctx: AuditContext) {}

  private base(): Omit<typeof auditLog.$inferInsert, "tableName" | "recordId" | "action"> {
    return {
      changedBy:  this.ctx.userId,
      changedAt:  new Date(),
      ipAddress:  this.ctx.ipAddress,
      userAgent:  this.ctx.userAgent,
      route:      this.ctx.route,
    };
  }

  /** Call after a successful INSERT. */
  async logInsert(
    tableName: string,
    recordId:  number,
    newValues: Record<string, unknown>,
    reason?:   string,
  ): Promise<void> {
    await db.insert(auditLog).values({
      ...this.base(),
      tableName,
      recordId,
      action:        "INSERT" satisfies AuditAction,
      newValues:     redact(newValues),
      changedFields: Object.keys(newValues),
      reason:        reason ?? null,
    });
  }

  /**
   * Call after a successful UPDATE.
   * If nothing actually changed the entry is skipped — no-op writes are noise.
   */
  async logUpdate(
    tableName: string,
    recordId:  number,
    before:    Record<string, unknown>,
    after:     Record<string, unknown>,
    reason?:   string,
  ): Promise<void> {
    const changed = changedKeys(before, after);
    if (changed.length === 0) return;

    await db.insert(auditLog).values({
      ...this.base(),
      tableName,
      recordId,
      action:        "UPDATE" satisfies AuditAction,
      oldValues:     redact(before),
      newValues:     redact(after),
      changedFields: changed,
      reason:        reason ?? null,
    });
  }

  /** Call after a successful DELETE (pass the row snapshot before deletion). */
  async logDelete(
    tableName: string,
    recordId:  number,
    oldValues: Record<string, unknown>,
    reason?:   string,
  ): Promise<void> {
    await db.insert(auditLog).values({
      ...this.base(),
      tableName,
      recordId,
      action:        "DELETE" satisfies AuditAction,
      oldValues:     redact(oldValues),
      changedFields: Object.keys(oldValues),
      reason:        reason ?? null,
    });
  }

  /**
   * Convenience: log a status transition (e.g. IRB review decision).
   * Equivalent to logUpdate but makes the intent explicit at the call site.
   */
  async logStatusChange(
    tableName: string,
    recordId:  number,
    fromStatus: string | null,
    toStatus:   string,
    extra?:     Record<string, unknown>,
    reason?:    string,
  ): Promise<void> {
    const before = { status: fromStatus, ...extra };
    const after  = { status: toStatus,   ...extra };
    await this.logUpdate(tableName, recordId, before, after, reason);
  }
}

// ---------------------------------------------------------------------------
// System audit — for background jobs / scheduled tasks that have no request
// ---------------------------------------------------------------------------

export const systemAudit = new AuditService({
  userId:    null,
  ipAddress: null,
  userAgent: "system",
  route:     null,
});
