/**
 * Read-only audit log access for administrators.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { requireAdmin, requireAuth } from "../auth";
import { db } from "../db";
import { log, logError } from "../logger";
import { auditLog } from "@shared/schema";
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

export function registerAuditLogRoutes(app: Express): void {
  // ── Audit Log ─────────────────────────────────────────────────────────────
  // Read-only access for admins and superadmins.
  //
  // Query parameters (all optional):
  //   table      — filter by table_name (e.g. ?table=grants)
  //   recordId   — filter by record_id  (e.g. ?recordId=42)
  //   userId     — filter by changed_by (e.g. ?userId=7)
  //   action     — filter by action     (INSERT | UPDATE | DELETE)
  //   field      — filter to entries where changed_fields contains this key
  //   from       — ISO date lower bound  (e.g. ?from=2026-01-01)
  //   to         — ISO date upper bound  (e.g. ?to=2026-12-31)
  //   limit      — max rows (default 100, max 1000)
  //   offset     — pagination offset (default 0)

  app.get('/api/audit-log', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const {
        table,
        recordId: rawRecordId,
        userId: rawUserId,
        action,
        field,
        from: rawFrom,
        to: rawTo,
        limit: rawLimit = "100",
        offset: rawOffset = "0",
      } = req.query as Record<string, string | undefined>;

      const limit  = Math.min(parseInt(rawLimit  ?? "100",  10) || 100,  1000);
      const offset = Math.max(parseInt(rawOffset ?? "0",   10) || 0,    0);

      const conditions: SQL[] = [];

      if (table)       conditions.push(eq(auditLog.tableName, table));
      if (rawRecordId) conditions.push(eq(auditLog.recordId, parseInt(rawRecordId, 10)));
      if (rawUserId)   conditions.push(eq(auditLog.changedBy, parseInt(rawUserId, 10)));
      if (action && ["INSERT", "UPDATE", "DELETE"].includes(action.toUpperCase())) {
        conditions.push(eq(auditLog.action, action.toUpperCase()));
      }
      if (field) {
        // changed_fields is a JSON array of strings. Use @> (contains) on jsonb.
        conditions.push(sql`${auditLog.changedFields} @> ${JSON.stringify([field])}::jsonb`);
      }
      if (rawFrom) {
        const fromDate = new Date(rawFrom);
        if (!isNaN(fromDate.getTime())) conditions.push(gte(auditLog.changedAt, fromDate));
      }
      if (rawTo) {
        const toDate = new Date(rawTo);
        if (!isNaN(toDate.getTime())) conditions.push(lte(auditLog.changedAt, toDate));
      }

      const where = conditions.length ? and(...conditions) : undefined;

      const [rows, [{ total }]] = await Promise.all([
        db.select().from(auditLog)
          .where(where)
          .orderBy(desc(auditLog.changedAt))
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(auditLog).where(where),
      ]);

      res.json({ total: Number(total), limit, offset, rows });
    } catch (err) {
      logError("Error fetching audit log", "routes", err);
      res.status(500).json({ message: "Failed to fetch audit log" });
    }
  });

  // GET /api/audit-log/:table/:recordId — full history for one record
  app.get('/api/audit-log/:table/:recordId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { table, recordId: rawId } = req.params;
      const recordId = parseInt(rawId, 10);
      if (isNaN(recordId)) return res.status(400).json({ message: "Invalid record ID" });

      const rows = await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.tableName, table), eq(auditLog.recordId, recordId)))
        .orderBy(desc(auditLog.changedAt));

      res.json(rows);
    } catch (err) {
      logError("Error fetching record audit history", "routes", err);
      res.status(500).json({ message: "Failed to fetch record history" });
    }
  });
}
