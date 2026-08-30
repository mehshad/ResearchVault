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
  // One Research Office role covering grants and contracts. There is no
  // separate Contracts Officer: the two roles differed in only two cells and
  // the contracts guard was never applied to an endpoint.
  "Research Officer",
  "IT Officer",
] as const;

export type JobTitle = typeof JOB_TITLES[number];

/**
 * The single Research Office role, covering grants and contracts. Named here so
 * the string is not repeated across guards, seed data and client role lists.
 */
export const RESEARCH_OFFICER_ROLE = "Research Officer";

/**
 * The single access role covering bench and support research staff.
 *
 * Job titles and access roles are separate things: someone stays a
 * "Postdoctoral Researcher" on their profile while holding the "Researcher"
 * access role. Investigator is deliberately *not* folded in — it carries
 * responsibilities the others do not.
 */
export const RESEARCHER_ROLE = "Researcher";

/**
 * Job titles that resolve to the consolidated Researcher access role. Used by
 * the role/title comparison so holding "Researcher" while titled "Staff
 * Scientist" is understood rather than flagged as a mismatch.
 */
export const RESEARCHER_JOB_TITLES = [
  "Staff Scientist",
  "Postdoctoral Researcher",
  "PhD Student",
  "Research Specialist",
  "Research Associate",
  "Research Assistant",
] as const;

/**
 * Assignable access roles. This is deliberately *not* JOB_TITLES: several job
 * titles share one access role, and the two lists drift apart as roles are
 * consolidated.
 */
export const ACCESS_ROLES = [
  ...JOB_TITLES.filter(
    (title) => !(RESEARCHER_JOB_TITLES as readonly string[]).includes(title),
  ),
  RESEARCHER_ROLE,
].sort() as string[];

/**
 * The access role a job title corresponds to, when one exists. Returns the
 * title itself where the two still share a name.
 */
export function accessRoleForJobTitle(jobTitle: string | null | undefined): string | null {
  if (!jobTitle) return null;
  const trimmed = jobTitle.trim();
  if (!trimmed) return null;
  if ((RESEARCHER_JOB_TITLES as readonly string[]).includes(trimmed)) return RESEARCHER_ROLE;
  return trimmed;
}

/**
 * True when an access role is inconsistent with the profile job title. A person
 * titled "Staff Scientist" holding "Researcher" is consistent; holding
 * "IRB Officer" is not. Built-in roles are never a mismatch — they are granted
 * deliberately and say nothing about the person's job.
 */
export function isRoleTitleMismatch(
  role: string | null | undefined,
  jobTitle: string | null | undefined,
): boolean {
  if (!role || !jobTitle) return false;
  if (role === "admin" || role === "superadmin" || role === RESTRICTED_USER_ROLE) return false;
  const expected = accessRoleForJobTitle(jobTitle);
  return expected !== null && expected !== role.trim();
}


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
