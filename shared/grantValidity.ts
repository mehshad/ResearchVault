/**
 * Which grant records are too incomplete to act on, for the Research Office's
 * clean-up tool.
 *
 * Built on evaluateGrantIssues rather than beside it. That function already
 * decides what counts as a missing title or a missing Lead PI and already
 * labels them for the grants list, so a second opinion here would mean the
 * list flagging one set of rows and the clean-up offering to delete another.
 * All this module adds is which of those issues are severe enough to make a
 * record not worth keeping.
 *
 * Deliberately three codes, not eleven. A grant with no funding agency or no
 * end date is incomplete but identifiable and fixable; a grant with no title
 * and no Lead PI is a failed import row. Adding a code to this list makes the
 * tool delete more, so it should be argued for rather than assumed.
 */

import { evaluateGrantIssues, type GrantIssue, type GrantIssueCode } from "./grantIssues";

export const GRANT_MINIMUM_ISSUE_CODES = [
  "missing_project_number",
  "missing_title",
  "missing_lpi",
] as const satisfies readonly GrantIssueCode[];

export type GrantMinimumIssueCode = (typeof GRANT_MINIMUM_ISSUE_CODES)[number];

const MINIMUM = new Set<GrantIssueCode>(GRANT_MINIMUM_ISSUE_CODES);

interface GrantLike {
  projectNumber?: string | null;
  title?: string | null;
  lpiId?: number | null;
}

/**
 * The minimum-field issues this grant has, in the order the shared definition
 * lists them. Empty means the record is complete enough to keep.
 */
export function missingMinimumGrantFields(grant: GrantLike): GrantIssue[] {
  return evaluateGrantIssues(grant).filter((issue) => MINIMUM.has(issue.code));
}

export function isGrantIncomplete(grant: GrantLike): boolean {
  return missingMinimumGrantFields(grant).length > 0;
}

export function describeMissingGrantFields(grant: GrantLike): string {
  return missingMinimumGrantFields(grant)
    .map((issue) => issue.label)
    .join(", ");
}

/**
 * One incomplete grant as the clean-up preview reports it.
 *
 * Carries more than which fields are blank, because that is not really the
 * decision: it is whether deleting the row loses anything. `deletable` says
 * whether the database would let it go without orphaning rows elsewhere, and
 * `hasOtherContent` whether a person ought to look at it first.
 */
export interface IncompleteGrantSummary {
  id: number;
  projectNumber: string | null;
  title: string | null;
  status: string | null;
  createdAt: Date | string | null;
  missing: GrantIssue[];
  /** SDR links and progress reports both block deletion. */
  linkedSdrs: number;
  progressReports: number;
  deletable: boolean;
  hasOtherContent: boolean;
}
