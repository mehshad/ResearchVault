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
    userId:    user?.id    ?? null,
    // Trust proxy is set in index.ts, so req.ip is the real client IP.
    ipAddress: req.ip      ?? null,
    userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
    route:     `${req.method} ${req.path}`,
  });

  next();
}
