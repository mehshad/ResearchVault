export const NAVIGATION_ITEMS = [
  "dashboard",
  "scientists",
  "facilities",
  "programs",
  "projects",
  "research-activities",
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
] as const;

export function isAdministratorRole(role: string): boolean {
  const normalizedRole = role.trim().toLowerCase().replace(/[\s_-]+/g, "");
  return normalizedRole === "admin" || normalizedRole === "superadmin";
}