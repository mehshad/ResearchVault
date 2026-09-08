/**
 * A journal's quartile is Q1, Q2, Q3, Q4, or nothing.
 *
 * The distinction that matters here is between *missing* and *wrong*.
 *
 * Missing is ordinary. The office's 2022 file has no category column at all, so
 * 9,483 journals have no quartile for that year, and nothing is broken by it --
 * the bulk importer skips an empty cell, and the only cost is that those
 * publications do not count toward a Q1 tally.
 *
 * Wrong breaks a restore. One row in production carries the literal string
 * "N/A", the bulk importer validates against Q1-Q4, and a section applies
 * atomically -- so that single row costs the whole Research Output import
 * unless the operator ticks "skip the rows that failed validation". It could
 * not even be corrected in the interface, because the read joins only the
 * newest year per journal and left the row unreachable.
 *
 * So: anything that is not a quartile becomes nothing, at every door.
 */

export type JournalQuartile = "Q1" | "Q2" | "Q3" | "Q4";

export const JOURNAL_QUARTILE_PATTERN = /^Q[1-4]$/;

export function isJournalQuartile(value: unknown): value is JournalQuartile {
  return typeof value === "string" && JOURNAL_QUARTILE_PATTERN.test(value);
}

/**
 * The quartile a value means, or null.
 *
 * Trims and upper-cases first, so "q1" and " Q1 " are accepted -- they are the
 * same fact written carelessly, and refusing them would lose real data. "N/A",
 * "-", "none" and every other way of writing "no quartile" become null, which
 * is what they mean.
 */
export function normaliseQuartile(value: unknown): JournalQuartile | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toUpperCase();
  return isJournalQuartile(candidate) ? candidate : null;
}
