/**
 * Why an SDR import row was skipped, grouped for the preview.
 *
 * Same idea as the grants import: a file of several hundred rows produces a
 * wall of individually-correct sentences, and the question anybody has --
 * "why did most of this not go in?" -- should not need scrolling to answer.
 *
 * Codes are assigned where the skip happens, not matched back out of the
 * message text, so rewording a message cannot silently drop its rows into
 * "Other".
 */

export type SdrSkipCode =
  | "unchanged"
  | "no_sdr_number"
  | "no_title"
  | "duplicate_sdr_number"
  | "unmatched_pi"
  | "ambiguous_pi"
  | "pi_not_investigator"
  | "no_project"
  | "bad_value"
  | "other";

export const SDR_SKIP_REASONS: ReadonlyArray<{
  code: SdrSkipCode;
  label: string;
  hint: string;
}> = [
  { code: "unchanged", label: "Already up to date", hint: "Every value matches the record already held." },
  { code: "no_sdr_number", label: "No SDR number", hint: "SDRs are matched on their number, so a row without one cannot be placed." },
  { code: "no_title", label: "No SDR name", hint: "A new SDR needs a name. Add one and re-import." },
  { code: "duplicate_sdr_number", label: "Duplicate SDR number in the file", hint: "The same SDR number appears on an earlier row; only the first is used." },
  { code: "unmatched_pi", label: "PI not found in the staff directory", hint: "Add the person under Scientists & Staff, or put their address in PI Email." },
  { code: "ambiguous_pi", label: "PI name matches two people", hint: "Use PI Email to say which of them it is." },
  { code: "pi_not_investigator", label: "PI does not hold the Investigator access role", hint: "An SDR's PI must hold it. Set the access role in Settings → Users." },
  { code: "no_project", label: "No project to link to", hint: "Give both a project number and a project name, and the project is created if it does not exist." },
  { code: "bad_value", label: "A value could not be read", hint: "A date or status is not in a form the import understands." },
  { code: "other", label: "Other", hint: "Listed individually below." },
];

const LABELS = new Map(SDR_SKIP_REASONS.map((reason) => [reason.code, reason]));

export interface SdrSkipSummaryRow {
  code: SdrSkipCode;
  label: string;
  hint: string;
  count: number;
}

export function summariseSdrSkips(
  rows: ReadonlyArray<{ action?: string; reasonCode?: SdrSkipCode | null }>,
): SdrSkipSummaryRow[] {
  const counts = new Map<SdrSkipCode, number>();
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
