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
/**
 * Compare job titles by letters alone, so spacing, hyphens and case cannot
 * change the answer. "Post-doctoral Fellow", "Post Doctoral Fellow" and
 * "Postdoctoral Fellow" are one title written three ways.
 */
export function jobTitleKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Whether a stored job title is one of `accepted`, ignoring spacing, hyphens
 * and case.
 *
 * Titles are typed by hand and arrive through imports, so the same post is
 * written several ways: "Post Doctoral Fellow" and "Post-doctoral Fellow" are
 * one job. Filtering on exact equality split them, and a tab showed two of
 * sixteen people without any sign the rest existed.
 */
export function matchesJobTitle(
  jobTitle: string | null | undefined,
  accepted: readonly string[],
): boolean {
  if (!jobTitle) return false;
  const key = jobTitleKey(jobTitle);
  return accepted.some((candidate) => jobTitleKey(candidate) === key);
}

/** Spellings of each staff-directory tab's job title that are in real use. */
export const JOB_TITLE_TAB_ALIASES: Record<string, readonly string[]> = {
  "post-doc": ["Postdoctoral Researcher", "Postdoctoral Fellow", "Postdoc"],
  "staff-scientist": ["Staff Scientist"],
  "research-specialist": ["Research Specialist"],
  "research-assistant": ["Research Assistant"],
  "research-associate": ["Research Associate"],
  "phd-student": ["PhD Student"],
  "lab-manager": ["Lab Manager"],
  management: ["Management"],
  physician: ["Physician"],
  officers: ["IRB Officer", "IBC Officer", "PMO Officer", "Outcome Officer", "Research Officer"],
};

/**
 * Spellings of a postdoctoral post that are in real use but are not the
 * canonical JOB_TITLES entry.
 *
 * Titles are typed by HR and arrive through staff imports, so the stored value
 * is whatever an organisation calls the post. Sixteen people held "Post
 * Doctoral Fellow" or "Post-doctoral Fellow" against the canonical
 * "Postdoctoral Researcher" and every one was reported as a role/title
 * mismatch -- a warning about nothing, which is the kind that teaches people to
 * ignore warnings.
 */
const RESEARCHER_JOB_TITLE_ALIASES = [
  "Postdoctoral Fellow",
  "Postdoctoral Scientist",
  "Postdoc",
] as const;

const RESEARCHER_JOB_TITLE_KEYS = new Set<string>([
  ...RESEARCHER_JOB_TITLES.map(jobTitleKey),
  ...RESEARCHER_JOB_TITLE_ALIASES.map(jobTitleKey),
]);

export function accessRoleForJobTitle(jobTitle: string | null | undefined): string | null {
  if (!jobTitle) return null;
  const trimmed = jobTitle.trim();
  if (!trimmed) return null;
  const key = jobTitleKey(trimmed);
  if (RESEARCHER_JOB_TITLE_KEYS.has(key)) return RESEARCHER_ROLE;
  // A canonical title written differently still resolves to the canonical one,
  // so "research officer" does not read as a title nobody recognises.
  const canonical = JOB_TITLES.find((title) => jobTitleKey(title) === key);
  if (canonical) return canonical;

  // An unrecognised title -- "Other", or anything free-text -- implies no
  // particular access role, so there is nothing for a role to disagree with.
  // Returning the title itself made every such person a permanent mismatch
  // against a role that was very likely correct.
  return null;
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
  // Compared by the same letters-only key: a role and a title that differ only
  // in punctuation are the same assignment, not a mismatch.
  return expected !== null && jobTitleKey(expected) !== jobTitleKey(role.trim());
}


/**
 * Built-in access roles that exist outside the configurable role matrix.
 * "user" is the restricted onboarding role. "admin" is the application
 * administrator role. "superadmin" is intentionally not assignable.
 */
export const BUILT_IN_ASSIGNABLE_ROLES = ["user", "admin"] as const;

export const RESTRICTED_USER_ROLE = "user";

export const NAVIGATION_ITEMS = [
  { id: "dashboard", name: "Dashboard & Feature Requests", description: "System overview, statistics and feature requests" },
  { id: "scientists", name: "Scientists & Staff", description: "Research team management" },
  { id: "facilities", name: "Facilities", description: "Buildings and rooms management" },
  { id: "pmo-office", name: "PMO Office", description: "Programs, projects, research activities and RA200/RA205A forms" },
  { id: "irb-applications", name: "IRB Applications", description: "Ethics review applications" },
  { id: "irb-office", name: "IRB Office", description: "IRB administration" },
  { id: "irb-reviewer", name: "IRB Reviewer", description: "IRB review interface" },
  { id: "ibc-applications", name: "IBC Applications", description: "Biosafety applications" },
  { id: "ibc-office", name: "IBC Office", description: "IBC administration" },
  { id: "ibc-reviewer", name: "IBC Reviewer", description: "IBC review interface" },
  { id: "data-management", name: "Data Management Plans", description: "Research data governance" },
  { id: "research-office", name: "Research Office", description: "Grants and research contracts" },
  { id: "publications", name: "Publications", description: "Academic publications" },
  { id: "outcome-office", name: "Outcome Office", description: "Research outcomes and impact tracking" },
  { id: "patents", name: "Patents", description: "Intellectual property" },
  { id: "reports", name: "Reports", description: "System reports and analytics" },
  { id: "certifications", name: "Certifications", description: "Staff certification records and modules" },
  { id: "management", name: "Management Hub", description: "Cross-office oversight and management reporting" },
] as const;

export type NavigationItemId = typeof NAVIGATION_ITEMS[number]["id"];

/**
 * Areas that were folded into another, mapped to the area that absorbed them.
 *
 * Programs, projects and research activities are one office's work and were
 * never configured apart; the same is true of grants and contracts. Keeping
 * them as separate matrix columns meant five sets of cells to hold in step
 * that always said the same thing.
 *
 * The old ids remain in use across the interface -- a page still asks about
 * "programs" -- so rather than rewriting every call site and risking a missed
 * one silently resolving to hide, every lookup goes through
 * resolveNavigationArea() and lands on the surviving area.
 */
export const NAVIGATION_AREA_ALIASES: Record<string, NavigationItemId> = {
  programs: "pmo-office",
  projects: "pmo-office",
  "research-activities": "pmo-office",
  grants: "research-office",
  contracts: "research-office",
};

/** The area a navigation id resolves to, following any consolidation. */
export function resolveNavigationArea(navigationItem: string): string {
  return NAVIGATION_AREA_ALIASES[navigationItem] ?? navigationItem;
}

/**
 * Access levels for role permissions.
 * - "hide": Navigation item is not visible.
 * - "view": Read-only access.
 * - "create": Can add new records but cannot edit existing ones.
 * - "edit": Full access (create + edit + delete).
 *
 * Exported as a runtime list, not only a type, so validation reads the same
 * source the application does. A hand-copied list in a validator drifts from
 * the real set and silently rejects valid data.
 */
export const ACCESS_LEVELS = ["hide", "view", "create", "edit"] as const;

export type AccessLevel = typeof ACCESS_LEVELS[number];
