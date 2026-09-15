/**
 * A second line against cross-site requests, beside the session cookie's
 * SameSite=Lax (#47).
 *
 * Lax already keeps the cookie off a cross-site POST in current browsers, but
 * it is the only line: there is no token, express.urlencoded is enabled so a
 * form-encoded cross-site POST would parse if the cookie ever arrived, and
 * behind nginx a wrong APP_URL leaves the cookie non-secure. So every
 * state-changing /api request that a browser marks with an Origin (or, failing
 * that, a Referer) must name this site -- APP_URL's host, or the host the
 * request arrived on. A request with neither header is not from a browser
 * page (curl, a script, the tests) and passes; the cookie rules still apply.
 */
import type { NextFunction, Request, Response } from "express";
import { log } from "./logger";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hostOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

export interface OriginCheckInput {
  method: string;
  /** The Origin header, if the browser sent one. */
  origin?: string;
  /** The Referer header, consulted only when there is no Origin. */
  referer?: string;
  /** The Host the request arrived on (X-Forwarded-Host behind the proxy). */
  host?: string;
  /** APP_URL from the environment; may be unset in development. */
  appUrl?: string;
}

/**
 * Whether the request may proceed. Exported for the tests; the middleware is
 * this decision plus a 403.
 */
export function originAllowed(input: OriginCheckInput): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return true;

  // "Origin: null" is what a sandboxed frame or a privacy-mode redirect sends;
  // it cannot be verified, so it is treated as foreign.
  const source = input.origin !== undefined
    ? (input.origin === "null" ? "null" : hostOf(input.origin) ?? "invalid")
    : input.referer !== undefined
      ? hostOf(input.referer) ?? "invalid"
      : undefined;
  if (source === undefined) return true;

  const allowed = new Set([hostOf(input.appUrl), input.host?.toLowerCase() ?? null].filter(Boolean));
  return allowed.has(source);
}

export function originCheck(options: { appUrl?: string }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const forwarded = req.headers["x-forwarded-host"];
    const host = (Array.isArray(forwarded) ? forwarded[0] : forwarded) ?? req.headers.host;
    const input: OriginCheckInput = {
      method: req.method,
      origin: req.headers.origin,
      referer: req.headers.referer,
      host,
      appUrl: options.appUrl,
    };
    if (originAllowed(input)) return next();
    log(`403 cross-site request refused: ${req.method} ${req.path}`, "auth", {
      origin: input.origin ?? null,
      referer: input.referer ?? null,
      host: host ?? null,
    });
    res.status(403).json({ message: "Request refused: it did not come from this site." });
  };
}
