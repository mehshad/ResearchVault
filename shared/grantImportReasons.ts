/**
 * Grouping the reasons an import row was skipped.
 *
 * A preview of 861 rows is a wall of individually-correct sentences, and the
 * question anybody actually has -- "why did most of my file not go in?" --
 * takes scrolling to answer. These categories turn that into a few lines at
 * the top, each pointing at one thing to fix.
 *
 * Codes are assigned where the skip happens, not matched back out of the text,
 * so a reworded message cannot silently fall into "Other".
 */

export type GrantSkipCode =
  | "unchanged"
  | "no_title"
  | "no_project_number"
  | "duplicate_project_number"
  | "unmatched_staff"
  | "ambiguous_staff"
  | "subaward_no_sidra_lead"
  | "subaward_ambiguous_lead"
  | "lifecycle"
  | "bad_value"
  | "other";

export const GRANT_SKIP_REASONS: ReadonlyArray<{
  code: GrantSkipCode;
  label: string;
  hint: string;
}> = [
  { code: "unchanged", label: "Already up to date", hint: "Every value matches the record already held. Nothing to do." },
  { code: "no_title", label: "No project title", hint: "A new grant needs a title. Add one to the file and re-import." },
  { code: "no_project_number", label: "No project number", hint: "Grants are matched on project number, so a row without one cannot be placed." },
  { code: "duplicate_project_number", label: "Duplicate project number in the file", hint: "The same project number appears on an earlier row. Only the first is used." },
  { code: "unmatched_staff", label: "Lead PI not found in the staff directory", hint: "Add the person to Scientists & Staff, or put their address in LPI Email." },
  { code: "ambiguous_staff", label: "Lead PI name matches two people", hint: "Use LPI Email to say which of them it is." },
  { code: "subaward_no_sidra_lead", label: "Subaward with no Sidra co-investigator", hint: "Another institution submitted it and no co-investigator is one of ours, so nobody here can be recorded as the Sidra Lead PI." },
  { code: "subaward_ambiguous_lead", label: "Subaward naming several Sidra staff", hint: "Two or more co-investigators are ours. Set the Sidra Lead PI by hand." },
  { code: "lifecycle", label: "Status and Awarded switch disagree", hint: "See Rules: some statuses only apply to a grant that was actually awarded." },
  { code: "bad_value", label: "A value could not be read", hint: "A number, date or currency is not in a form the import understands." },
  { code: "other", label: "Other", hint: "Opened individually below." },
];

const LABELS = new Map(GRANT_SKIP_REASONS.map((r) => [r.code, r]));

export interface GrantSkipSummaryRow {
  code: GrantSkipCode;
  label: string;
  hint: string;
  count: number;
}

/**
 * Count skipped rows by category, most common first, so the biggest cause of a
 * disappointing import is the first thing read.
 */
export function summariseGrantSkips(
  rows: ReadonlyArray<{ action?: string; reasonCode?: GrantSkipCode | null }>,
): GrantSkipSummaryRow[] {
  const counts = new Map<GrantSkipCode, number>();
  for (const row of rows) {
    if (row.action !== "skip") continue;
    const code = row.reasonCode ?? "other";
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([code, count]) => {
      const meta = LABELS.get(code) ?? LABELS.get("other")!;
      return { code, label: meta.label, hint: meta.hint, count };
    })
    .sort((a, b) => b.count - a.count);
}
