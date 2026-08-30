import { roleGroups, rolePermissions, users } from "@shared/schema";
import { RESEARCH_OFFICER_ROLE } from "@shared/constants";
import { db } from "./db";
import { and, eq } from "drizzle-orm";
import { createHash } from "crypto";
import { type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import { log } from "./logger";
// OIDC and LDAP providers are loaded lazily (dynamic import / require) inside the
// route handlers below, so they are only initialised when the matching AUTH_MODE
// is active. No static imports are needed here.

function authLog(msg: string) { log(msg, "auth"); }
function authError(msg: string, err?: unknown) {
  const detail = err instanceof Error ? ` — ${err.message}` : err ? ` — ${String(err)}` : "";
  log(`ERROR ${msg}${detail}`, "auth");
}

// ── Session types ────────────────────────────────────────────────────────────

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  email: string;
  role: string;
  scientistId: number | null;
  needsRegistration: boolean; // true if user has no linked scientist profile yet
}

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
    oidcState?: string;
    oidcNonce?: string;
  }
}

// ── Auth mode ──────────────────────────────────────────────────────────────────

export type AuthMode = "demo" | "local" | "ldap" | "oidc";

export function getAuthMode(): AuthMode {
  const mode = (process.env.AUTH_MODE || "local").toLowerCase();
  if (mode === "demo" || mode === "ldap" || mode === "oidc") return mode;
  return "local";
}

export function isSsoEnabled(): boolean {
  return getAuthMode() === "oidc"; // only OIDC redirects to an external IDP
}

export function logAuthStatus(): void {
  const mode = getAuthMode();
  const sso = isSsoEnabled();
  authLog(`mode=${mode} sso=${sso}`);
  if (mode === "ldap") {
    const ldapUrl    = process.env.LDAP_URL          || "(default ldap://localhost:389)";
    const bindDN     = process.env.LDAP_BIND_DN      || "(not set)";
    const searchBase = process.env.LDAP_SEARCH_BASE  || "(not set)";
    authLog(`LDAP url=${ldapUrl} bindDN=${bindDN} searchBase=${searchBase}`);
    if (!process.env.LDAP_BIND_DN)     authLog("WARN LDAP_BIND_DN is not set — authentication will fail");
    if (!process.env.LDAP_SEARCH_BASE) authLog("WARN LDAP_SEARCH_BASE is not set — authentication will fail");
  }
  if (mode === "oidc") {
    const issuer   = process.env.OIDC_ISSUER_URL  || "(not set)";
    const clientId = process.env.OIDC_CLIENT_ID   || "(not set)";
    const redirect = process.env.OIDC_REDIRECT_URI || "(derived from APP_URL)";
    authLog(`OIDC issuer=${issuer} clientId=${clientId} redirectUri=${redirect}`);
    if (!process.env.OIDC_ISSUER_URL) authLog("WARN OIDC_ISSUER_URL is not set — SSO login will fail");
    if (!process.env.OIDC_CLIENT_ID)  authLog("WARN OIDC_CLIENT_ID is not set — SSO login will fail");
  }
  if (mode === "demo") {
    authLog(`Demo user: ${process.env.DEMO_NAME || "Demo User"} <${process.env.DEMO_EMAIL || "demo@researchvault.local"}> role=${process.env.DEMO_ROLE || "Management"}`);
  }
  const superAdmin = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (superAdmin) authLog(`superadmin email=${superAdmin}`);
}

// ── Password hashing ───────────────────────────────────────────────────────────

export function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

// ── Middleware ─────────────────────────────────────────────────────────────────

// Demo mode: auto-inject a configurable guest user for every request
export function demoBannerMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (!req.session.user) {
    req.session.user = {
      id: 0,
      username: process.env.DEMO_USERNAME || "demo.user",
      name: process.env.DEMO_NAME || "Demo User",
      email: process.env.DEMO_EMAIL || "demo@researchvault.local",
      role: process.env.DEMO_ROLE || "Management",
      scientistId: null,
      needsRegistration: false,
    };
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (getAuthMode() === "demo") return next(); // demo bypasses auth
  if (req.session?.user) return next();
  authLog(`401 unauthenticated request: ${req.method} ${req.path}`);
  res.status(401).json({ message: "Unauthorized. Please log in." });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const role = req.session?.user?.role;
  // Demo role switching is intentionally client-side. The demo server session
  // remains Management even when a tester selects the Super Admin persona, so
  // treat that fixed demo session as the administrator for protected previews.
  // Real local/LDAP/OIDC sessions still require admin or superadmin exactly.
  if (
    role === "admin" ||
    role === "superadmin" ||
    (getAuthMode() === "demo" && role === "Management")
  ) {
    return next();
  }
  authLog(`403 admin required: ${req.method} ${req.path} user=${req.session?.user?.username ?? "anonymous"} role=${role ?? "none"}`);
  res.status(403).json({ message: "Forbidden. Admin access required." });
}

/**
 * The Research Office covers grants and contracts under a single role. The
 * former Grant Officer and Contracts Officer are folded into it: they differed
 * in only two matrix cells, and the contracts guard was never applied to any
 * endpoint, so nothing was enforcing the separation.
 */
export function requireResearchOfficer(req: Request, res: Response, next: NextFunction) {
  const role = req.session?.user?.role;
  if (
    role === RESEARCH_OFFICER_ROLE ||
    role === "admin" ||
    role === "superadmin" ||
    role === "Management"
  ) return next();
  authLog(`403 research officer required: ${req.method} ${req.path} user=${req.session?.user?.username ?? "anonymous"} role=${role ?? "none"}`);
  res.status(403).json({ message: "Forbidden. Research office access required." });
}

export function requirePmoOfficer(req: Request, res: Response, next: NextFunction) {
  const role = req.session?.user?.role;
  if (role === "PMO Officer" || role === "admin" || role === "superadmin" || role === "Management") return next();
  authLog(`403 PMO officer required: ${req.method} ${req.path} user=${req.session?.user?.username ?? "anonymous"} role=${role ?? "none"}`);
  res.status(403).json({ message: "Forbidden. PMO access required." });
}

export type NavigationAccessLoader = (
  role: string,
  navigationItem: string,
) => Promise<string | null>;

async function loadNavigationAccess(role: string, navigationItem: string): Promise<string | null> {
  const [permission] = await db
    .select({ accessLevel: rolePermissions.accessLevel })
    .from(rolePermissions)
    .innerJoin(roleGroups, eq(rolePermissions.roleGroupId, roleGroups.id))
    .where(and(
      eq(roleGroups.name, role),
      eq(rolePermissions.navigationItem, navigationItem),
    ))
    .limit(1);
  return permission?.accessLevel ?? null;
}

export function createRequirePublicationOfficer(
  loadAccess: NavigationAccessLoader = loadNavigationAccess,
) {
  return async function requirePublicationOfficer(req: Request, res: Response, next: NextFunction) {
    const role = req.session?.user?.role;
    if (!role) {
      authLog(`403 publication office required: ${req.method} ${req.path} user=anonymous role=none`);
      return res.status(403).json({ message: "Forbidden. Publication office access required." });
    }

    if (role === "admin" || role === "superadmin") return next();

    try {
      const accessLevel = await loadAccess(role, "outcome-office");
      const requiredLevel = req.method === "GET" || req.method === "HEAD" ? "view" : "edit";
      const allowed = requiredLevel === "view"
        ? accessLevel === "view" || accessLevel === "edit"
        : accessLevel === "edit";
      if (allowed) return next();
    } catch (error) {
      authError(`publication office matrix lookup failed for role=${role}`, error);
    }

    authLog(`403 publication office required: ${req.method} ${req.path} user=${req.session?.user?.username ?? "anonymous"} role=${role}`);
    return res.status(403).json({ message: "Forbidden. Publication office access required." });
  };
}

export const requirePublicationOfficer = createRequirePublicationOfficer();

/** Restricts Management Hub/report endpoints to the management tier. */
export function requireManagement(req: Request, res: Response, next: NextFunction) {
  const role = req.session?.user?.role;
  if (role === "Management" || role === "admin" || role === "superadmin") return next();
  authLog(`403 management required: ${req.method} ${req.path} user=${req.session?.user?.username ?? "anonymous"} role=${role ?? "none"}`);
  res.status(403).json({ message: "Forbidden. Management access required." });
}

export function requireContractsRead(req: Request, res: Response, next: NextFunction) {
  if (req.session?.user) {
    (req as any).currentUser = req.session.user;
    return next();
  }
  res.status(401).json({ message: "Unauthorized. Please log in." });
}

// ── Local auth helpers ─────────────────────────────────────────────────────────

function getSuperAdminEmail(): string | null {
  return process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() || null;
}

function resolveRole(existingRole: string, email: string): string {
  const superAdmin = getSuperAdminEmail();
  if (superAdmin && email.toLowerCase() === superAdmin) return "superadmin";
  return existingRole;
}

async function findOrCreateExternalUser(
  username: string,
  name: string,
  email: string,
): Promise<SessionUser | null> {
  let [user] = await db.select().from(users).where(eq(users.username, username));

  const role = resolveRole("user", email);

  if (!user) {
    authLog(`provisioning new user username=${username} email=${email} role=${role}`);
    const [created] = await db
      .insert(users)
      .values({ username, name, email, password: "", role })
      .returning();
    user = created;
    if (!user) {
      authError(`failed to provision user username=${username}`);
      return null;
    }
    authLog(`provisioned user id=${user.id} username=${username}`);
  } else {
    // Enforce super admin role if email matches env var
    const expectedRole = resolveRole(user.role, email);
    if (expectedRole !== user.role) {
      authLog(`escalating role for user id=${user.id} username=${username}: ${user.role} -> ${expectedRole}`);
      const [updated] = await db
        .update(users)
        .set({ role: expectedRole, updatedAt: new Date() })
        .where(eq(users.id, user.id))
        .returning();
      user = updated;
    }
  }

  if (!user) return null;
  return toSessionUser(user);
}

function toSessionUser(user: typeof users.$inferSelect): SessionUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    scientistId: (user as any).scientistId ?? null,
    needsRegistration: !(user as any).scientistId,
  };
}

async function recordSuccessfulLogin(userId: number): Promise<void> {
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, userId));
}

async function refreshSessionUserFromDatabase(
  req: Request
): Promise<SessionUser | null> {
  const sessionUser = req.session?.user;
  if (!sessionUser) return null;

  // Demo users are synthetic and do not have a corresponding database row.
  if (getAuthMode() === "demo" || sessionUser.id <= 0) {
    return sessionUser;
  }

  try {
    const [currentUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, sessionUser.id));

    if (!currentUser) {
      req.session.user = undefined;
      return null;
    }

    const refreshedUser = toSessionUser(currentUser);
    if (
      refreshedUser.role !== sessionUser.role ||
      refreshedUser.scientistId !== sessionUser.scientistId ||
      refreshedUser.name !== sessionUser.name ||
      refreshedUser.email !== sessionUser.email
    ) {
      authLog(
        `refreshing session user id=${sessionUser.id} role=${sessionUser.role} -> ${refreshedUser.role}`
      );
      req.session.user = refreshedUser;
    }

    return refreshedUser;
  } catch (error) {
    authError(`failed to refresh session user id=${sessionUser.id}`, error);
    throw error;
  }
}

type LoadUserById = (
  id: number
) => Promise<typeof users.$inferSelect | null | undefined>;

async function loadUserById(id: number) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

/**
 * Refresh the session principal from users before application API routes run.
 * This makes role demotions and assignments authoritative immediately instead
 * of allowing a stale serialized session to retain old permissions.
 */
export function createRefreshSessionAuthorizationMiddleware(
  loadCurrentUser: LoadUserById = loadUserById,
  shouldBypass: () => boolean = () => getAuthMode() === "demo"
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const sessionUser = req.session?.user;
    if (!sessionUser || sessionUser.id <= 0 || shouldBypass()) {
      return next();
    }

    try {
      const currentUser = await loadCurrentUser(sessionUser.id);
      if (!currentUser) {
        req.session.user = undefined;
        return res.status(401).json({ message: "Your account is no longer available." });
      }

      req.session.user = toSessionUser(currentUser);
      return next();
    } catch (error) {
      authError(`failed authorization refresh for user id=${sessionUser.id}`, error);
      return res.status(503).json({
        message: "Access could not be verified. Please try again.",
      });
    }
  };
}

export const refreshSessionAuthorization =
  createRefreshSessionAuthorizationMiddleware();

// ── Route registration ─────────────────────────────────────────────────────────

export function registerAuthRoutes(app: any) {
  const mode = getAuthMode();

  // Public: returns auth configuration so the client can adapt the UI
  app.get("/api/auth/config", async (_req: Request, res: Response) => {
    let providerName: string | null = null;
    if (mode === "oidc") {
      const { getOidcConfig } = await import("./authProviders/oidc");
      providerName = getOidcConfig().providerName ?? null;
    }
    const ssoEnabled = mode === "oidc"; // LDAP uses username/password, not browser SSO redirect
    res.json({ mode, ssoEnabled, provider: mode, providerName });
  });

  // Current user
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const currentUser = await refreshSessionUserFromDatabase(req);
      if (currentUser) return res.json({ user: currentUser });
      res.status(401).json({ message: "Not authenticated" });
    } catch {
      res.status(503).json({ message: "Access could not be verified. Please try again." });
    }
  });

  // ── Login (local + ldap share the same endpoint) ──
  if (mode === "local" || mode === "ldap") {
    app.post("/api/auth/login", async (req: Request, res: Response) => {
      const { username, password } = req.body;
      const ip = req.ip || req.socket?.remoteAddress || "unknown";

      if (!username || !password) {
        authLog(`login attempt rejected — missing credentials ip=${ip}`);
        return res.status(400).json({ message: "Username and password are required" });
      }

      authLog(`login attempt username=${username} mode=${mode} ip=${ip}`);
      let sessionUser: SessionUser | null = null;

      if (mode === "local") {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.username, username));

        if (!user) {
          authLog(`login failed — user not found username=${username} ip=${ip}`);
          return res.status(401).json({ message: "Invalid username or password" });
        }
        if (user.password !== hashPassword(password)) {
          authLog(`login failed — wrong password username=${username} ip=${ip}`);
          return res.status(401).json({ message: "Invalid username or password" });
        }
        const resolvedRole = resolveRole(user.role ?? "user", user.email ?? "");
        if (resolvedRole !== user.role) {
          authLog(`escalating role for user id=${user.id} username=${username}: ${user.role} -> ${resolvedRole}`);
          const [updated] = await db.update(users).set({ role: resolvedRole, updatedAt: new Date() }).where(eq(users.id, user.id)).returning();
          sessionUser = toSessionUser(updated);
        } else {
          sessionUser = toSessionUser(user);
        }

      } else {
        // LDAP
        const { authenticateLdap } = await import("./authProviders/ldap");
        const result = await authenticateLdap(username, password);
        if (!result.success || !result.user) {
          authLog(`login failed — LDAP rejected username=${username} ip=${ip} reason=${result.message || "unknown"}`);
          return res.status(401).json({ message: result.message || "Invalid credentials" });
        }
        sessionUser = await findOrCreateExternalUser(
          result.user.username,
          result.user.name,
          result.user.email,
        );
        if (!sessionUser) {
          authError(`login failed — could not create session for LDAP user username=${username}`);
          return res.status(500).json({ message: "Failed to create user session" });
        }
      }

      await recordSuccessfulLogin(sessionUser!.id);
      authLog(`login success username=${sessionUser!.username} id=${sessionUser!.id} role=${sessionUser!.role} ip=${ip}`);
      req.session.user = sessionUser;
      return res.json({ user: sessionUser });
    });
  }

  // ── OIDC flow ──
  if (mode === "oidc") {
    app.get("/api/auth/oidc", async (req: Request, res: Response) => {
      const ip = req.ip || req.socket?.remoteAddress || "unknown";
      authLog(`OIDC flow initiated ip=${ip}`);
      try {
        const { startOidcFlow } = await import("./authProviders/oidc");
        await startOidcFlow(req, res);
      } catch (err) {
        authError("failed to start OIDC flow", err);
        res.status(500).json({ message: "Failed to start SSO login" });
      }
    });

    app.get("/api/auth/callback", async (req: Request, res: Response) => {
      const ip = req.ip || req.socket?.remoteAddress || "unknown";
      authLog(`OIDC callback received ip=${ip}`);
      try {
        const { handleOidcCallback } = await import("./authProviders/oidc");
        const result = await handleOidcCallback(req);
        if (!result.success || !result.user) {
          authLog(`OIDC callback failed — ${result.message || "unknown reason"} ip=${ip}`);
          return res.redirect(`/login?error=${encodeURIComponent(result.message || "Login failed")}`);
        }

        authLog(`OIDC token validated username=${result.user.username} email=${result.user.email}`);
        const sessionUser = await findOrCreateExternalUser(
          result.user.username,
          result.user.name,
          result.user.email,
        );
        if (!sessionUser) {
          authError(`OIDC callback — failed to create session for username=${result.user.username}`);
          return res.redirect("/login?error=session_error");
        }

        await recordSuccessfulLogin(sessionUser.id);
        authLog(`OIDC login success username=${sessionUser.username} id=${sessionUser.id} role=${sessionUser.role} ip=${ip}`);
        req.session.user = sessionUser;
        await new Promise<void>((resolve, reject) => {
          req.session.save((error) => error ? reject(error) : resolve());
        });
        res.redirect("/");
      } catch (err) {
        authError("OIDC callback unhandled error", err);
        res.redirect("/login?error=callback_error");
      }
    });
  }

  // Logout (all modes)
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    if (mode === "demo") {
      return res.json({ message: "Demo mode — logout is a no-op" });
    }
    const username = req.session?.user?.username ?? "unknown";
    req.session.destroy((err: any) => {
      if (err) {
        authError(`session destroy failed for username=${username}`, err);
        return res.status(500).json({ message: "Failed to log out" });
      }
      authLog(`logout username=${username}`);
      res.clearCookie("rv.sid");
      res.json({ message: "Logged out successfully" });
    });
  });
}
