import {
  NAVIGATION_ITEMS as SHARED_NAVIGATION_ITEMS,
  RESEARCH_OFFICER_ROLE,
} from "@shared/constants";

/**
 * The navigation areas, as bare ids.
 *
 * Derived from the shared list rather than repeated. These two definitions used
 * to be maintained separately and drifted: this file listed 23 areas while
 * shared/constants.ts listed 20, so the permission matrix was seeded from one
 * and the settings grid rendered from the other. Three areas existed only in
 * the matrix, enforced but impossible for an administrator to review.
 */
export const NAVIGATION_ITEMS = SHARED_NAVIGATION_ITEMS.map((item) => item.id);

export function getOfficeDashboardDefaultAccess(
  role: string,
  navigationItem: string,
): "edit" | "hide" | null {
  if (navigationItem === "pmo-office") {
    return role === "PMO Officer" || role === "Management" ? "edit" : "hide";
  }
  if (navigationItem === "research-office") {
    return role === RESEARCH_OFFICER_ROLE ||
      role === "Management"
      ? "edit"
      : "hide";
  }
  if (navigationItem === "management") {
    return role === "Management" ? "edit" : "hide";
  }
  return null;
}

export function isAdministratorRole(role: string): boolean {
  const normalizedRole = role.trim().toLowerCase().replace(/[\s_-]+/g, "");
  return normalizedRole === "admin" || normalizedRole === "superadmin";
}