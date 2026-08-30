import { RESEARCH_OFFICER_ROLE } from "@shared/constants";

export const NAVIGATION_ITEMS = [
  "dashboard",
  "scientists",
  "facilities",
  "programs",
  "projects",
  "research-activities",
  "pmo-office",
  "research-office",
  "irb-applications",
  "irb-office",
  "irb-reviewer",
  "ibc-applications",
  "ibc-office",
  "ibc-reviewer",
  "data-management",
  "contracts",
  "publications",
  "outcome-office",
  "patents",
  "reports",
  "grants",
  "certifications",
  "management",
] as const;

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