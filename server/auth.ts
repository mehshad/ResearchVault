import { roleGroups, rolePermissions, scientists, users } from "@shared/schema";
import { INVESTIGATOR_ROLE } from "@shared/investigatorEligibility";
import {
  ACCESS_ROLES,
  BUILT_IN_ASSIGNABLE_ROLES,
  RESEARCH_OFFICER_ROLE,
  resolveNavigationArea,
} from "@shared/constants";
import {
  allRolesOf,
  hasAnyRole,
  holdsAdministratorRole,
  isAdministrator,
  isRestrictedOnly,
  effectiveAccessLevel,
  satisfiesAccessLevel,
  type AccessLevel,
} from "@shared/effectiveRoles";
import { userRoleAssignments } from "@shared/schema";
import { inArray } from "drizzle-orm";
import { db } from "./db";
import { and, eq, sql } from "drizzle-orm";
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
  /** Primary access role. */
  role: string;
  /**
   * Additional roles held alongside the primary one. Access is the union of
   * all of them — see @shared/effectiveRoles.
   */
  secondaryRoles: string[];
  scientistId: number | null;
  needsRegistration: boolean; // true if user has no linked scientist profile yet
  /** True while this administrator is previewing without their rights. */
  adminPreviewOff?: boolean;
}

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
    /**
     * Held on the session rather than the user object: the authorization
     * refresh rebuilds `user` from the database on every request, which would
     * drop the flag on the very next call.
     */
    adminPreviewOff?: boolean;
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

/**
 * The staff record the demo session acts as.
 *
 * Demo mode has no real identity, so anything that asks "is this about me"
 * rather than "may I" -- which SDRs I am on, whose team I lead -- had nothing
 * to answer with and appeared broken while being merely inapplicable. Pointing
 * the demo session at a real person makes those features explorable in the
 * mode the application is actually demonstrated in.
 *
 * Resolved from DEMO_SCIENTIST_EMAIL, falling back to the configured
 * superadmin, so which person it is stays configuration rather than a name
 * compiled into the server. Looked up once: the demo identity does not change
 * while the process runs, and this is on every request.
 */
let demoScientistId: number | null | undefined;

async function resolveDemoScientistId(): Promise<number | null> {
  if (demoScientistId !== undefined) return demoScientistId;

  const email = (process.env.DEMO_SCIENTIST_EMAIL || process.env.SUPER_ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  if (!email) {
    demoScientistId = null;
    return demoScientistId;
  }

  try {
    const [match] = await db
      .select({ id: scientists.id })
      .from(scientists)
      .where(sql`lower(${scientists.email}) = ${email}`)
      .limit(1);
    demoScientistId = match?.id ?? null;
    if (demoScientistId === null) {
      authLog(`Demo session: no staff record matches ${email}; identity-based views stay empty`);
    }
  } catch {
    // A demo session is not worth failing a request over.
    demoScientistId = null;
  }
  return demoScientistId ?? null;
}

/**
 * The demo session is linked to a staff record only while it is emulating an
 * Investigator.
 *
 * Investigator is the role for whom "my SDRs" and "my team's SDRs" mean
 * anything, so that is when a real person behind the demo is useful. Emulating
 * Management or an office role and still being answered as a named researcher
 * would misrepresent what those roles see.
 */
async function demoScientistIdForRole(role: string | null | undefined): Promise<number | null> {
  if ((role ?? "").trim() !== INVESTIGATOR_ROLE) return null;
  return resolveDemoScientistId();
}

// Demo mode: auto-inject a configurable guest user for every request
export async function demoBannerMiddleware(req: Request, _res: Response, next: NextFunction) {
  const startingRole = process.env.DEMO_ROLE || "Management";
  const scientistId = await demoScientistIdForRole(
    req.session.user ? req.session.user.role : startingRole,
  );

  if (!req.session.user) {
    req.session.user = {
      id: 0,
      username: process.env.DEMO_USERNAME || "demo.user",
      name: process.env.DEMO_NAME || "Demo User",
      email: process.env.DEMO_EMAIL || "demo@researchvault.local",
      role: startingRole,
      secondaryRoles: [],
      scientistId,
      needsRegistration: false,
    };
  } else if (req.session.user.id === 0 && req.session.user.scientistId !== scientistId) {
    // Sessions outlive restarts, so one created before this existed would keep
    // its null forever and the feature would look broken to whoever had it.
    req.session.user.scientistId = scientistId;
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
  const user = req.session?.user;
  const role = user?.role;
  // Administrator rights are normally held as a secondary role, so this checks
  // every slot rather than the primary alone.
  // Demo role switching is intentionally client-side. The demo server session
  // remains Management even when a tester selects the Super Admin persona, so
  // treat that fixed demo session as the administrator for protected previews.
  if (
    isAdministrator(user) ||
    (getAuthMode() === "demo" && role === "Management")
  ) {
    return next();
  }
  authLog(`403 admin required: ${req.method} ${req.path} user=${req.session?.user?.username ?? "anonymous"} role=${role ?? "none"}`);
  res.status(403).json({ message: "Forbidden. Admin access required." });
}

export type NavigationAccessLoader = (
  role: string,
  navigationItem: string,
) => Promise<string | null>;

async function loadNavigationAccess(role: string, rawNavigationItem: string): Promise<string | null> {
  // Resolve any area that was folded into another, so a guard naming a retired
  // id still finds the surviving row rather than nothing -- and nothing means
  // hide.
  const navigationItem = resolveNavigationArea(rawNavigationItem);
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

/**
 * The access level a request needs, from its method.
 *
 * The matrix has four levels and "create" means exactly what it says: may add
 * new records but not change existing ones. Mapping POST to "create" rather
 * than "edit" is what makes that level mean anything on the server.
 */
export function requiredLevelForMethod(method: string): AccessLevel {
  switch (method.toUpperCase()) {
    case "GET":
    case "HEAD":
    case "OPTIONS":
      return "view";
    case "POST":
      return "create";
    default:
      return "edit";
  }
}

/**
 * Enforces the permission matrix for one navigation area.
 *
 * Until this existed the matrix was enforced in the browser for every area but
 * one: the server consulted it only for "outcome-office", so 22 of the 23
 * configured columns were advisory. Hiding a menu item does not stop anyone
 * calling the endpoint behind it.
 *
 * Three cases short-circuit before the matrix is read:
 *
 *  - Anonymous requests are refused. There is no role to resolve.
 *  - Administrators pass. `admin` in any slot, or `superadmin`, is full access
 *    by definition, so no matrix cell can lock an administrator out.
 *  - A restricted "user" account holds no matrix role, so the matrix would
 *    refuse it everywhere. That would revoke the narrow allowlist
 *    restrictDefaultUserApiAccess grants it -- its own profile, ordinary
 *    publication reads -- both of which sit under mapped prefixes. The caller
 *    supplies `allowRestricted` so that one policy stays the single owner of
 *    what a restricted account may reach. Left unset, restricted accounts are
 *    refused, so the guard is safe on a route mounted without that middleware.
 */
export function createRequireNavigationAccess(
  navigationItem: string,
  options: {
    label?: string;
    loadAccess?: NavigationAccessLoader;
    /** Whether a restricted "user" account may make this request. */
    allowRestricted?: (req: Request) => boolean;
  } = {},
) {
  const loadAccess = options.loadAccess ?? loadNavigationAccess;
  const label = options.label ?? navigationItem;
  const allowRestricted = options.allowRestricted ?? (() => false);
  const deny = (req: Request, res: Response, reason: string) => {
    const user = req.session?.user;
    // originalUrl, not path: these guards are mounted on a prefix, and express
    // strips the mount point from req.path, so req.path would log "/" for every
    // denial. The whole point of this line is to say which endpoint was refused.
    const where = (req.originalUrl ?? req.path ?? "").split("?")[0] || req.path;
    authLog(
      `403 ${navigationItem} access required: ${req.method} ${where} ` +
      `user=${user?.username ?? "anonymous"} roles=${allRolesOf(user).join("|") || "none"} ` +
      `needed=${requiredLevelForMethod(req.method)} (${reason})`,
    );
    return res.status(403).json({ message: `Forbidden. ${label} access required.` });
  };

  return async function requireNavigationAccess(req: Request, res: Response, next: NextFunction) {
    const user = req.session?.user;
    if (!user?.role) return deny(req, res, "not signed in");
    if (isAdministrator(user)) return next();
    if (isRestrictedOnly(user)) {
      return allowRestricted(req) ? next() : deny(req, res, "restricted account");
    }

    try {
      // Someone holding several roles gets the most permissive of them, which
      // is how /api/access-check has always resolved multi-role access.
      const roles = allRolesOf(user);
      const levels = await Promise.all(
        roles.map((held) => loadAccess(held, navigationItem)),
      );
      const levelByRole = new Map(roles.map((held, index) => [held, levels[index]]));
      const best = effectiveAccessLevel(
        user,
        (held) => (levelByRole.get(held) as AccessLevel | null) ?? null,
      );
      if (satisfiesAccessLevel(best, requiredLevelForMethod(req.method))) return next();
      return deny(req, res, `holds ${best}`);
    } catch (error) {
      // A lookup that failed is not permission granted.
      authError(`${navigationItem} matrix lookup failed for user=${user.username}`, error);
      return deny(req, res, "matrix lookup failed");
    }
  };
}

export function createRequirePublicationOfficer(
  loadAccess: NavigationAccessLoader = loadNavigationAccess,
) {
  return createRequireNavigationAccess("outcome-office", {
    label: "Publication office",
    loadAccess,
  });
}

export const requirePublicationOfficer = createRequirePublicationOfficer();

/**
 * The office guards resolve the matrix instead of naming roles.
 *
 * They used to admit a hard-coded list -- "Research Officer", "PMO Officer",
 * "Management", plus administrators. That made the code a second authority on
 * access, competing with the matrix an administrator actually configures, and
 * the code always won: granting an area in the matrix admitted nobody the
 * guard had not been written to expect, and revoking it shut nobody out. The
 * matrix is now the only authority, with administrators short-circuiting as
 * they do everywhere else.
 *
 * "research-office" and "pmo-office" are real configured areas. They are
 * absent from NAVIGATION_ITEMS only because that list describes what appears
 * in the menu, not what is configurable.
 */
export function createRequireResearchOfficer(loadAccess?: NavigationAccessLoader) {
  return createRequireNavigationAccess("research-office", { label: "Research office", loadAccess });
}

export function createRequirePmoOfficer(loadAccess?: NavigationAccessLoader) {
  return createRequireNavigationAccess("pmo-office", { label: "PMO office", loadAccess });
}

export function createRequireManagement(loadAccess?: NavigationAccessLoader) {
  return createRequireNavigationAccess("management", { label: "Management", loadAccess });
}

export const requireResearchOfficer = createRequireResearchOfficer();
export const requirePmoOfficer = createRequirePmoOfficer();

/** Management Hub and reporting, resolved against the "management" area. */
export const requireManagement = createRequireManagement();

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
  return toSessionUser(user, await loadSecondaryRoles(user.id));
}

function toSessionUser(
  user: typeof users.$inferSelect,
  secondaryRoles: string[] = [],
  adminPreviewOff = false,
): SessionUser {
  return {
    ...(adminPreviewOff ? { adminPreviewOff: true } : {}),
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    secondaryRoles,
    scientistId: (user as any).scientistId ?? null,
    needsRegistration: !(user as any).scientistId,
  };
}

/**
 * Secondary roles held by a user, resolved to role-group names. Loaded on login
 * and on every session refresh so a change takes effect on the next request
 * rather than at next sign-in.
 */
export async function loadSecondaryRoles(userId: number): Promise<string[]> {
  if (!userId || userId <= 0) return [];
  try {
    const rows = await db
      .select({ name: roleGroups.name })
      .from(userRoleAssignments)
      .innerJoin(roleGroups, eq(userRoleAssignments.roleGroupId, roleGroups.id))
      .where(eq(userRoleAssignments.userId, userId));
    return rows.map((row: { name: string }) => row.name).filter(Boolean);
  } catch (error) {
    // A failure here must not silently widen access, so treat it as none.
    authError(`failed to load secondary roles for user id=${userId}`, error);
    return [];
  }
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

    const refreshedUser = toSessionUser(
      currentUser,
      await loadSecondaryRoles(currentUser.id),
      req.session.adminPreviewOff === true,
    );
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

      // Reload secondaries too, so revoking one takes effect on the next
      // request rather than at next sign-in.
      req.session.user = toSessionUser(
        currentUser,
        await loadSecondaryRoles(currentUser.id),
        req.session.adminPreviewOff === true,
      );
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

  /**
   * POST /api/auth/admin-preview — drop or restore your own administrator rights.
   *
   * An administrator whose rights come from a secondary role has no way to see
   * the application without them, because admin short-circuits every matrix
   * lookup to edit. This suppresses that short-circuit for their session.
   *
   * It moves the session, not just the browser. A preview that only dimmed the
   * menu while the API kept answering would be worse than none -- the interface
   * and the server would disagree about who you are, which is exactly the fault
   * the demo role selector had before it was made to post to the server too.
   *
   * Deliberately NOT behind requireAdmin. While previewing, the caller is not
   * an administrator as far as every guard is concerned, so that gate would
   * strand them outside their own rights with no way back. Authority comes from
   * the roles the database says they hold.
   */
  app.post("/api/auth/admin-preview", requireAuth, async (req: Request, res: Response) => {
    const off = (req.body as { off?: boolean } | undefined)?.off === true;

    if (getAuthMode() === "demo") {
      // Demo has the role selector already, and requireAdmin admits the demo
      // Management session regardless -- the preview could not be honest here.
      return res.status(400).json({
        message: "Use the demo role selector to preview another role.",
      });
    }

    const sessionUser = req.session?.user;
    if (!sessionUser) return res.status(401).json({ message: "Not authenticated" });

    try {
      const [row] = await db.select().from(users).where(eq(users.id, sessionUser.id));
      if (!row) return res.status(401).json({ message: "Your account is no longer available." });

      // Asked of the database, not the session: a session already previewing
      // reports no administrator rights and would refuse to give them back.
      const holdsAdmin = holdsAdministratorRole({
        role: row.role,
        secondaryRoles: await loadSecondaryRoles(row.id),
      });
      if (!holdsAdmin) {
        return res.status(403).json({ message: "You hold no administrator rights to preview without." });
      }

      req.session.adminPreviewOff = off;
      req.session.user = off
        ? { ...sessionUser, adminPreviewOff: true }
        : { ...sessionUser, adminPreviewOff: undefined };
      authLog(`admin preview ${off ? "enabled" : "cleared"} for user id=${row.id} username=${row.username}`);
      res.json({ adminPreviewOff: off });
    } catch (error) {
      authError(`failed to change admin preview for user id=${sessionUser.id}`, error);
      res.status(500).json({ message: "Could not change administrator preview." });
    }
  });

  // ── Demo role emulation ──
  //
  // The sidebar role selector exists so demo mode can be explored as each role.
  // It used to change only React state, so the session kept whatever DEMO_ROLE
  // said and the server answered every request as that role. That was survivable
  // while the server barely enforced roles; once the permission matrix became
  // server-enforced it meant the interface and the API disagreed about who you
  // were — the selector appeared to work and changed nothing.
  //
  // Registered only in demo mode, so outside it the path does not exist at all
  // rather than existing and refusing.
  if (mode === "demo") {
    app.post("/api/auth/demo-role", async (req: Request, res: Response) => {
      const requested = typeof req.body?.role === "string" ? req.body.role.trim() : "";
      if (!requested) {
        return res.status(400).json({ message: "A role is required." });
      }
      // Only roles that really exist may be emulated, so the selector cannot
      // put the session into a state no real account could reach.
      const assignable = new Set<string>([...ACCESS_ROLES, ...BUILT_IN_ASSIGNABLE_ROLES, "superadmin"]);
      if (!assignable.has(requested)) {
        return res.status(400).json({ message: `"${requested}" is not an assignable role.` });
      }
      if (!req.session.user) {
        return res.status(401).json({ message: "No demo session to update." });
      }
      // Emulating an Investigator means being somebody, so that the views
      // answering "which of these are mine" have an answer to give.
      const scientistId = await demoScientistIdForRole(requested);
      req.session.user = { ...req.session.user, role: requested, secondaryRoles: [], scientistId };
      authLog(`demo role switched to ${requested}${scientistId ? ` (as scientist ${scientistId})` : ""}`);
      res.json({ user: req.session.user });
    });
  }

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
          sessionUser = toSessionUser(updated, await loadSecondaryRoles(updated.id));
        } else {
          sessionUser = toSessionUser(user, await loadSecondaryRoles(user.id));
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
