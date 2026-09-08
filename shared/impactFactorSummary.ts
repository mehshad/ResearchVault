/**
 * What is loaded, and what is missing, on the Impact Factors screen.
 *
 * Two different questions, and only one of them is about counting.
 *
 * **How many factors per year** is a straight tally, and worth showing because
 * the years arrive as separate files years apart, so a short or absent year is
 * invisible until somebody adds them up. A year with 1,758 journals next to one
 * with 21,787 is a half-loaded file, not a quiet year in publishing.
 *
 * **Which journals are missing one** is not a counting problem at all. Every
 * journal in the table got there by being in an impact-factor import, so
 * "journals in the system without a factor" is always zero and tells nobody
 * anything. The journals that matter are the ones *we publish in*, which are
 * held as free text on the publication rather than as a link -- so a missing
 * factor is usually a name that does not match, not a factor that does not
 * exist.
 *
 * Coverage is decided with `normalizeJournalName`, which is the rule the scorer
 * itself uses. Written first against a stricter rule, this reported journals as
 * missing that score perfectly well -- "Nucleic Acids Res" matches by
 * abbreviation and "The Lancet Oncology" by dropping the article, and neither
 * needs anybody's attention.
 *
 * What is left is a worklist, so each row carries a suggestion where one can be
 * made honestly.
 */
import { decodeJournalName, normalizeJournalName } from "./journalName";

export interface ImpactFactorYearSummary {
  /** JIF year, the year whose citations the factor is computed from. */
  year: number;
  /** Journals carrying a factor for that year. */
  factors: number;
  /** How many of the journals we publish in are covered by that year. */
  coversPublishedIn: number;
}

export interface MissingImpactFactorJournal {
  /** The journal name exactly as the publication records it. */
  journal: string;
  /** How many publications name it. */
  publications: number;
  /** A journal we hold that this probably is, or null when it is a guess. */
  suggestion: string | null;
  /** Why we think so, for somebody deciding whether to trust it. */
  reason: MissingReason | null;
}

export type MissingReason = "punctuation";

export const MISSING_REASON_LABELS: Record<MissingReason, string> = {
  punctuation: "matches once the HTML escape is decoded",
};

export interface ImpactFactorSummary {
  years: ImpactFactorYearSummary[];
  publishedIn: {
    /** Distinct journal names across all publications. */
    total: number;
    /** How many of those the scorer can match to a factor. */
    covered: number;
    /** The rest, named, so they can be fixed rather than counted. */
    missing: MissingImpactFactorJournal[];
  };
}

/**
 * Every spelling of a journal the scorer will accept.
 *
 * Mirrors findJournalByName: the full name, the abbreviated name, and both of
 * those normalised.
 */
export function journalMatchKeys(journal: {
  name: string;
  abbreviated?: string | null;
}): string[] {
  const keys = [normalizeJournalName(journal.name)];
  if (journal.abbreviated) keys.push(normalizeJournalName(journal.abbreviated));
  return keys.filter(Boolean);
}

/**
 * Which year looks short next to the rest.
 *
 * A year holding less than a third of the largest is almost certainly a partial
 * file rather than a quiet year in publishing -- the 2024 set sat at 1,758
 * against 21,787 for 2023 for weeks, and nothing on the screen said so.
 * Returns an empty list when there is nothing to compare against.
 */
export function shortYears(
  years: readonly ImpactFactorYearSummary[],
  fraction = 1 / 3,
): number[] {
  if (years.length < 2) return [];
  const largest = Math.max(...years.map((y) => y.factors));
  if (largest <= 0) return [];
  return years.filter((y) => y.factors < largest * fraction).map((y) => y.year);
}

export { decodeJournalName, normalizeJournalName };
