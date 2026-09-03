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

export function auditContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
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

  next();
}
