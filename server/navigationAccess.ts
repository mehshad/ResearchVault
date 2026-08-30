/**
 * Server-side enforcement of the permission matrix, by API path prefix.
 *
 * The matrix configures 23 navigation areas. Until this existed the server
 * consulted it for exactly one of them ("outcome-office", via
 * requirePublicationOfficer); the other 22 were enforced only by the browser
 * hiding menu items. Hiding a menu item does not stop anyone calling the
 * endpoint behind it, so 205 of 281 routes reached their handler with no role
 * check at all -- including DELETE /api/programs/:id.
 *
 * Mapping by prefix rather than annotating each route is deliberate: it is one
 * table an auditor can read against the matrix, and a route added tomorrow
 * under a mapped prefix is covered the moment it is written, rather than being
 * covered only if someone remembers the guard.
 *
 * These run in addition to any guard already on a route, never instead of one.
 * A route carrying requirePublicationOfficer under /api/publications now needs
 * both the "publications" area and the "outcome-office" area, which is what
 * having two separately configurable areas is supposed to mean.
 */
import type { Express, RequestHandler } from "express";
import { createRequireNavigationAccess } from "./auth";
import { isRestrictedUserApiRequestAllowed } from "./restrictedUserPolicy";

export interface NavigationRouteRule {
  /** Mounted path prefix. Matches the prefix itself and everything under it. */
  prefix: string;
  /** navigation_item value in role_permissions. */
  navigationItem: string;
  /** Named in the 403 so the message says which area was missing. */
  label: string;
}

/**
 * Areas the matrix configures that NAVIGATION_ITEMS does not list:
 * "certifications", "pmo-office" and "research-office". They are not stray
 * rows -- they are what the office guards below resolve against, and they are
 * configurable in exactly the same way as the twenty listed areas.
 */
export const NAVIGATION_ROUTE_RULES: NavigationRouteRule[] = [
  // ── People and organisation ──────────────────────────────────────────────
  { prefix: "/api/scientists", navigationItem: "scientists", label: "Scientists" },
  { prefix: "/api/staff", navigationItem: "scientists", label: "Scientists" },
  { prefix: "/api/principal-investigators", navigationItem: "scientists", label: "Scientists" },
  { prefix: "/api/branches", navigationItem: "scientists", label: "Scientists" },
  { prefix: "/api/departments", navigationItem: "scientists", label: "Scientists" },
  { prefix: "/api/sections", navigationItem: "scientists", label: "Scientists" },
  { prefix: "/api/team-members", navigationItem: "scientists", label: "Scientists" },

  // ── Facilities ───────────────────────────────────────────────────────────
  { prefix: "/api/buildings", navigationItem: "facilities", label: "Facilities" },
  { prefix: "/api/rooms", navigationItem: "facilities", label: "Facilities" },

  // ── PMO ──────────────────────────────────────────────────────────────────
  { prefix: "/api/programs", navigationItem: "programs", label: "Programs" },
  { prefix: "/api/projects", navigationItem: "projects", label: "Projects" },
  { prefix: "/api/research-activities", navigationItem: "research-activities", label: "Research activities" },
  { prefix: "/api/project-members", navigationItem: "research-activities", label: "Research activities" },
  { prefix: "/api/pmo-applications", navigationItem: "pmo-office", label: "PMO office" },

  // ── Compliance ───────────────────────────────────────────────────────────
  { prefix: "/api/irb-applications", navigationItem: "irb-applications", label: "IRB applications" },
  { prefix: "/api/irb-board-members", navigationItem: "irb-office", label: "IRB office" },
  { prefix: "/api/ibc-applications", navigationItem: "ibc-applications", label: "IBC applications" },
  { prefix: "/api/ibc-submissions", navigationItem: "ibc-applications", label: "IBC applications" },
  { prefix: "/api/ibc-documents", navigationItem: "ibc-applications", label: "IBC applications" },
  { prefix: "/api/ibc-board-members", navigationItem: "ibc-office", label: "IBC office" },
  { prefix: "/api/data-management-plans", navigationItem: "data-management", label: "Data management" },

  // ── Research Office ──────────────────────────────────────────────────────
  { prefix: "/api/research-contracts", navigationItem: "contracts", label: "Research contracts" },
  { prefix: "/api/grants", navigationItem: "grants", label: "Grants" },
  { prefix: "/api/grant-progress-reports", navigationItem: "grants", label: "Grants" },

  // ── Research output ──────────────────────────────────────────────────────
  { prefix: "/api/publications", navigationItem: "publications", label: "Publications" },
  { prefix: "/api/journal-impact-factors", navigationItem: "publications", label: "Publications" },
  { prefix: "/api/patents", navigationItem: "patents", label: "Patents" },

  // ── Certifications ───────────────────────────────────────────────────────
  { prefix: "/api/certifications", navigationItem: "certifications", label: "Certifications" },
  { prefix: "/api/certification-modules", navigationItem: "certifications", label: "Certifications" },
  { prefix: "/api/certification-config", navigationItem: "certifications", label: "Certifications" },
  { prefix: "/api/certificates", navigationItem: "certifications", label: "Certifications" },

  // ── Overview ─────────────────────────────────────────────────────────────
  { prefix: "/api/dashboard", navigationItem: "dashboard", label: "Dashboard" },
  { prefix: "/api/reports", navigationItem: "reports", label: "Reports" },
];

/**
 * Prefixes deliberately left unmapped, with the reason. Kept here rather than
 * in a commit message so the next person auditing this file can see what is
 * *not* covered without re-deriving it from the route table.
 */
export const UNMAPPED_API_PREFIXES: ReadonlyArray<{ prefix: string; reason: string }> = [
  { prefix: "/api/auth", reason: "Sign-in itself; guarding it would lock everyone out." },
  { prefix: "/api/health", reason: "Liveness probe, polled by uptime monitors without a session." },
  { prefix: "/api/register", reason: "Reached before a role exists." },
  { prefix: "/api/admin", reason: "Already administrator-only via requireAdmin." },
  { prefix: "/api/bulk-data", reason: "Already administrator-only via requireAdmin." },
  { prefix: "/api/ownership-overrides", reason: "Already administrator-only via requireAdmin." },
  { prefix: "/api/management", reason: "Guarded by requireManagement, which now reads the matrix." },
  { prefix: "/api/office-dashboards", reason: "Guarded by the office guards, which now read the matrix." },
  { prefix: "/api/system-configurations", reason: "No matrix area covers system configuration." },
  { prefix: "/api/feature-requests", reason: "No matrix area covers feature requests." },
  { prefix: "/api/pdf-import-history", reason: "No matrix area covers import history." },
  { prefix: "/api/ra200-applications", reason: "No matrix area covers RA200 forms." },
  { prefix: "/api/ra205a-applications", reason: "No matrix area covers RA205A forms." },
  { prefix: "/objects", reason: "Object storage, served outside the /api surface." },
];

/**
 * Mounts one matrix guard per rule. Must run before the route handlers are
 * registered, and after the session and restricted-user middleware, so the
 * guard sees a resolved principal.
 */
export function registerNavigationAccessGuards(
  app: Express,
  makeGuard: (navigationItem: string, label: string) => RequestHandler =
    (navigationItem, label) => createRequireNavigationAccess(navigationItem, {
      label,
      // A restricted account holds no matrix role, so the matrix alone would
      // refuse it everywhere -- including its own profile and the ordinary
      // publication reads the restricted policy deliberately allows, both of
      // which sit under mapped prefixes. Consulting that policy keeps it the
      // single owner of what a restricted account may reach.
      allowRestricted: isRestrictedUserApiRequestAllowed,
    }),
): void {
  for (const rule of NAVIGATION_ROUTE_RULES) {
    app.use(rule.prefix, makeGuard(rule.navigationItem, rule.label));
  }
}
