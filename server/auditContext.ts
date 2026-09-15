/**
 * auditContextMiddleware — attaches a per-request AuditService to req.audit.
 *
 * Mount this once after the session middleware and before any route:
 *
 *   app.use("/api", auditContextMiddleware);
 *
 * Route handlers then simply call:
 *
 *   await req.audit.logUpdate("grants", id, before, after, reason);
 *
 * The middleware captures the authenticated user, IP address, User-Agent and
 * the HTTP method + path so every audit entry carries full request context
 * without the route handler needing to pass any of it explicitly.
 *
 * It also guarantees that every successful DELETE leaves an entry (#24). A
 * handler that snapshots the row and calls logDelete itself records the full
 * row; one that does not gets a fallback entry when the response finishes,
 * naming the table, the id and the caller. So a new delete route cannot
 * silently go unrecorded -- at worst it is recorded without the row.
 */

import type { Request, Response, NextFunction } from "express";
import { AuditService } from "./auditService";

// Extend the Express Request type so TypeScript knows req.audit exists.
declare global {
  namespace Express {
    interface Request {
      audit: AuditService;
    }
  }
}

/**
 * The table a DELETE route acts on, read off the route template: the static
 * segments after /api, hyphens as underscores, nested collections joined with
 * a slash ("/api/projects/:projectId/members/:scientistId" -> "projects/members").
 */
export function deletedTableName(req: { route?: { path?: string }; path: string }): string {
  const template = req.route?.path ?? req.path;
  return template
    .split("/")
    .filter((segment) => segment && segment !== "api" && !segment.startsWith(":") && !/^\d+$/.test(segment))
    .map((segment) => segment.replace(/-/g, "_"))
    .join("/");
}

/** The last numeric id in the route parameters, or in the path; null if none. */
export function deletedRecordId(req: { params?: Record<string, string>; path: string }): number | null {
  const fromParams = Object.values(req.params ?? {}).filter((value) => /^\d+$/.test(value));
  if (fromParams.length) return Number(fromParams[fromParams.length - 1]);
  const fromPath = req.path.split("/").filter((segment) => /^\d+$/.test(segment));
  return fromPath.length ? Number(fromPath[fromPath.length - 1]) : null;
}

export function auditContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const user = (req.session as any)?.user;

  req.audit = new AuditService({
    // `|| null`, not `?? null`: the demo session is user id 0, which is not a
    // real users row, and audit_log.changed_by is a foreign key to it. `??`
    // preserves the 0, the insert is rejected, and every audited write in demo
    // mode loses its audit entry. Recording nobody is right here -- in demo
    // mode there is nobody to record. This is the third place this exact
    // distinction has mattered; see grants.created_by_user_id and
    // user_role_assignments.assigned_by.
    userId:    user?.id    || null,
    // Trust proxy is set in index.ts, so req.ip is the real client IP.
    ipAddress: req.ip      ?? null,
    userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
    route:     `${req.method} ${req.path}`,
  });

  if (req.method === "DELETE") {
    res.on("finish", () => {
      const succeeded = res.statusCode >= 200 && res.statusCode < 300;
      // No matched route means no handler ran: the static fallback answered
      // an unknown path with the app shell, and nothing was deleted.
      if (!succeeded || !req.route || req.audit.entriesWritten > 0) return;
      void req.audit.logDelete(
        deletedTableName(req),
        deletedRecordId(req),
        { params: req.params },
        "Recorded by the DELETE fallback; the route did not snapshot the row",
      );
    });
  }

  next();
}
