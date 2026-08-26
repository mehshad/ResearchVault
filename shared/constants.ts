/**
 * Single source of truth for shared constants used across client and server.
 */

export const JOB_TITLES = [
  "Investigator",
  "Staff Scientist",
  "Physician",
  "Research Specialist",
  "Research Associate",
  "Research Assistant",
  "Lab Manager",
  "Postdoctoral Researcher",
  "PhD Student",
  "Management",
  "IRB Board Member",
  "IBC Board Member",
  "PMO Officer",
  "IRB Officer",
  "IBC Officer",
  "Outcome Officer",
  "Grant Officer",
  "Contracts Officer",
  "IT Officer",
] as const;

export type JobTitle = typeof JOB_TITLES[number];

/**
 * Built-in access roles that exist outside the configurable role matrix.
 * "user" is the restricted onboarding role. "admin" is the application
 * administrator role. "superadmin" is intentionally not assignable.
 */
export const BUILT_IN_ASSIGNABLE_ROLES = ["user", "admin"] as const;

export const RESTRICTED_USER_ROLE = "user";

export const NAVIGATION_ITEMS = [
  { id: "dashboard", name: "Dashboard", description: "System overview and statistics" },
  { id: "scientists", name: "Scientists & Staff", description: "Research team management" },
  { id: "facilities", name: "Facilities", description: "Buildings and rooms management" },
  { id: "programs", name: "Programs (PRM)", description: "Research programs" },
  { id: "projects", name: "Projects (PRJ)", description: "Research projects" },
  { id: "research-activities", name: "Research Activities (SDR)", description: "Scientific data records" },
  { id: "irb-applications", name: "IRB Applications", description: "Ethics review applications" },
  { id: "irb-office", name: "IRB Office", description: "IRB administration" },
  { id: "irb-reviewer", name: "IRB Reviewer", description: "IRB review interface" },
  { id: "ibc-applications", name: "IBC Applications", description: "Biosafety applications" },
  { id: "ibc-office", name: "IBC Office", description: "IBC administration" },
  { id: "ibc-reviewer", name: "IBC Reviewer", description: "IBC review interface" },
  { id: "data-management", name: "Data Management Plans", description: "Research data governance" },
  { id: "contracts", name: "Research Contracts", description: "Collaboration agreements" },
  { id: "publications", name: "Publications", description: "Academic publications" },
  { id: "outcome-office", name: "Outcome Office", description: "Research outcomes and impact tracking" },
  { id: "patents", name: "Patents", description: "Intellectual property" },
  { id: "reports", name: "Reports", description: "System reports and analytics" },
  { id: "grants", name: "Grants", description: "Research grants and funding" },
  { id: "management", name: "Management Hub", description: "Cross-office oversight and management reporting" },
] as const;

export type NavigationItemId = typeof NAVIGATION_ITEMS[number]["id"];

/**
 * Access levels for role permissions.
 * - "hide": Navigation item is not visible.
 * - "view": Read-only access.
 * - "create": Can add new records but cannot edit existing ones.
 * - "edit": Full access (create + edit + delete).
 */
export type AccessLevel = "hide" | "view" | "create" | "edit";
