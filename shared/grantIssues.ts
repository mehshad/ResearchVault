import { grantStatusImpliesAward } from "./grantLifecycle";

/**
 * Every check the grants list flags, and when each one applies.
 *
 * `when` is here so the rules panel on the grants page can be generated from
 * this list rather than restating it in prose that drifts. A test holds each
 * value to what evaluateGrantIssues actually does, so the page cannot end up
 * describing a rule the code does not enforce.
 *
 *   always   - checked on every grant
 *   preAward - only while the grant is submitted, pending or in review
 *   awarded  - only once the grant carries the award milestone
 */
export const GRANT_ISSUE_DEFINITIONS = [
  { code: "missing_project_number", label: "Missing project no.", detail: "Add the grant project number.", when: "always" },
  { code: "missing_title", label: "Missing title", detail: "Add the project title.", when: "always" },
  { code: "missing_lpi", label: "Missing Lead PI", detail: "Select the Lead Principal Investigator.", when: "always" },
  { code: "missing_funding_agency", label: "Missing funder", detail: "Add the funding agency.", when: "always" },
  { code: "missing_requested_budget", label: "Missing requested budget", detail: "Add the amount requested from the funder.", when: "preAward" },
  { code: "missing_awarded_budget", label: "Missing awarded budget", detail: "Add the final awarded amount.", when: "awarded" },
  { code: "missing_currency", label: "Missing currency", detail: "Select the grant currency.", when: "awarded" },
  { code: "missing_awarded_year", label: "Missing award year", detail: "Add the year the grant was awarded.", when: "awarded" },
  { code: "missing_start_date", label: "Missing start date", detail: "Add the grant start date.", when: "awarded" },
  { code: "missing_end_date", label: "Missing end date", detail: "Add the grant end date.", when: "awarded" },
  { code: "missing_sdr", label: "Missing SDR", detail: "Link at least one SDR to this awarded grant.", when: "awarded" },
] as const;

export type GrantIssueWhen = (typeof GRANT_ISSUE_DEFINITIONS)[number]["when"];

export const GRANT_ISSUE_WHEN_LABELS: Record<GrantIssueWhen, string> = {
  always: "Every grant",
  preAward: "Submitted, Pending or In Review",
  awarded: "Once awarded",
};

/** Statuses the pre-award checks apply to, for the rules panel. */
export const PRE_AWARD_STATUS_VALUES = ["submitted", "pending", "in_review"] as const;

export type GrantIssueCode = (typeof GRANT_ISSUE_DEFINITIONS)[number]["code"];

export type GrantIssue = {
  code: GrantIssueCode;
  label: string;
  detail: string;
  severity: "warning";
};

type GrantIssueInput = {
  projectNumber?: string | null;
  title?: string | null;
  lpiId?: number | null;
  fundingAgency?: string | null;
  requestedAmount?: string | number | null;
  awardedAmount?: string | number | null;
  currency?: string | null;
  awardedYear?: number | null;
  awarded?: boolean | null;
  status?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
};

const PRE_AWARD_STATUSES = new Set<string>(PRE_AWARD_STATUS_VALUES);

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

/**
 * Exported because a numeric column arrives from pg as a string, so "0.00" is
 * truthy and a plain falsy check reads an empty amount as a filled-in one.
 * Anything asking "does this grant hold a real figure" must ask here.
 */
export function isMissingAmount(value: string | number | null | undefined): boolean {
  if (value == null || value === "") return true;
  const amount = typeof value === "number" ? value : Number(value);
  return !Number.isFinite(amount) || amount <= 0;
}

export function evaluateGrantIssues(
  grant: GrantIssueInput,
  linkedSdrCount = 0,
): GrantIssue[] {
  const codes = new Set<GrantIssueCode>();
  if (isBlank(grant.projectNumber)) codes.add("missing_project_number");
  if (isBlank(grant.title)) codes.add("missing_title");
  if (grant.lpiId == null) codes.add("missing_lpi");
  if (isBlank(grant.fundingAgency)) codes.add("missing_funding_agency");

  if (PRE_AWARD_STATUSES.has(grant.status ?? "") && isMissingAmount(grant.requestedAmount)) {
    codes.add("missing_requested_budget");
  }

  const hasAwardMilestone = grant.awarded === true || grantStatusImpliesAward(grant.status);
  if (hasAwardMilestone) {
    if (isMissingAmount(grant.awardedAmount)) codes.add("missing_awarded_budget");
    if (isBlank(grant.currency)) codes.add("missing_currency");
    if (grant.awardedYear == null) codes.add("missing_awarded_year");
    if (!grant.startDate) codes.add("missing_start_date");
    if (!grant.endDate) codes.add("missing_end_date");
    if (linkedSdrCount <= 0) codes.add("missing_sdr");
  }

  return GRANT_ISSUE_DEFINITIONS
    .filter((definition) => codes.has(definition.code))
    .map(({ code, label, detail }) => ({ code, label, detail, severity: "warning" as const }));
}

export function grantMatchesIssueFilter(
  issues: readonly Pick<GrantIssue, "code">[],
  filter: "all" | "any" | GrantIssueCode,
): boolean {
  if (filter === "all") return true;
  if (filter === "any") return issues.length > 0;
  return issues.some((issue) => issue.code === filter);
}

type FilterableGrant = {
  title?: string | null;
  projectNumber?: string | null;
  fundingAgency?: string | null;
  description?: string | null;
  submittedYear?: number | null;
  status?: string | null;
  lpi?: { firstName?: string | null; lastName?: string | null } | null;
  issues?: readonly Pick<GrantIssue, "code">[];
};

export type GrantListFilters = {
  searchQuery: string;
  status: string;
  year: string;
  issue: "all" | "any" | GrantIssueCode;
};

export function grantMatchesListFilters(
  grant: FilterableGrant,
  filters: GrantListFilters,
): boolean {
  if (filters.status !== "all" && grant.status !== filters.status) return false;
  if (filters.year !== "all" && String(grant.submittedYear ?? "") !== filters.year) {
    return false;
  }
  if (!grantMatchesIssueFilter(grant.issues ?? [], filters.issue)) return false;

  const query = filters.searchQuery.trim().toLowerCase();
  if (!query) return true;
  const searchable = [
    grant.title,
    grant.projectNumber,
    grant.fundingAgency,
    grant.description,
    grant.lpi ? `${grant.lpi.firstName ?? ""} ${grant.lpi.lastName ?? ""}` : "",
  ];
  return searchable.some((value) => value?.toLowerCase().includes(query));
}