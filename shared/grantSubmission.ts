/**
 * Who submitted a grant: us, or a partner we are a subawardee on.
 *
 * The Research Office needs this at a glance in the grants list, because it
 * changes who owns the reporting and who holds the agreement. The database
 * records only a free-text `submittingInstitution`, so the distinction is
 * derived here rather than stored -- one place, so the list, any export and
 * any later report cannot disagree about what "subawardee" means.
 */

/**
 * Our own institution, as it appears in the submitting-institution field.
 *
 * Matched loosely on purpose. This value is typed into a spreadsheet by
 * several people over several years, and "Sidra", "SIDRA Medicine" and
 * "Sidra Medicine Corp" all mean us. A strict comparison would file most of
 * our own grants as somebody else's.
 */
export const HOME_INSTITUTION_NAME = "Sidra Medicine";
const HOME_INSTITUTION_TOKEN = "sidra";

export type GrantSubmissionRole = "lead" | "subawardee" | "unknown";

export interface GrantSubmissionSummary {
  role: GrantSubmissionRole;
  /** The submitting institution as recorded, trimmed; null when blank. */
  submittedBy: string | null;
  /** Short label for a table cell. */
  label: string;
}

const normalise = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function isHomeInstitution(name: string | null | undefined): boolean {
  if (!name) return false;
  return normalise(name).split(" ").includes(HOME_INSTITUTION_TOKEN);
}

export function classifyGrantSubmission(grant: {
  submittingInstitution?: string | null;
}): GrantSubmissionSummary {
  const recorded = grant.submittingInstitution?.trim() || null;

  // Blank stays unknown rather than defaulting to us. Most rows are blank,
  // and quietly calling them all Sidra-led would invent a fact about who
  // holds the agreement -- exactly the thing this column exists to answer.
  if (!recorded) {
    return { role: "unknown", submittedBy: null, label: "Not recorded" };
  }

  if (isHomeInstitution(recorded)) {
    return { role: "lead", submittedBy: recorded, label: HOME_INSTITUTION_NAME };
  }

  return { role: "subawardee", submittedBy: recorded, label: `Subawardee of ${recorded}` };
}
