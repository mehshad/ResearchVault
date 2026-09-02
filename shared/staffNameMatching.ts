/**
 * Matching a name typed in a spreadsheet to a staff record.
 *
 * The grants import resolves the Lead PI by email first and falls back to the
 * name. That fallback used to be an exact string comparison against
 * "firstName lastName", which failed on the two things the Research Office's
 * files do constantly:
 *
 *   "Dr. Mohamed Djekidel"        the file carries the title in the name field,
 *                                 the directory keeps it in its own column
 *   "Ammira Sarah Akil"           the file carries a middle name, the directory
 *                                 stores only first and last
 *
 * Measured against their file: 34 of 310 unmatched names are the first case
 * and 8 more are the second. The rest have no staff record at all, which no
 * amount of matching can fix.
 *
 * Reuses the folding and title-stripping already written for author matching,
 * so a name resolves the same way here as it does on a publication.
 *
 * A name that could be two different people is deliberately left unmatched.
 * Linking a grant to the wrong Lead PI is worse than leaving it for a person
 * to resolve -- the import reports it, and the office fixes the file.
 */

import { foldName, stripTitles, type MatchableScientist } from "./authorMatching";

const TITLE_TOKENS = new Set([
  "dr", "dr.", "prof", "prof.", "professor",
  "mr", "mr.", "mrs", "mrs.", "ms", "ms.", "miss",
  "md", "md.", "phd", "phd.",
]);

/**
 * Name reduced to comparable words: folded, titles removed wherever they sit,
 * and punctuation treated as a separator so "Al-Shabeeb" and "Al Shabeeb" are
 * the same two words.
 */
export function nameTokens(value: string | null | undefined): string[] {
  return stripTitles(foldName(value))
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length > 0 && !TITLE_TOKENS.has(token));
}

export type StaffNameIndex = Map<string, MatchableScientist[]>;

const addKey = (index: StaffNameIndex, key: string, scientist: MatchableScientist) => {
  if (!key.trim()) return;
  const existing = index.get(key);
  if (existing) {
    if (!existing.some((candidate) => candidate.id === scientist.id)) existing.push(scientist);
  } else {
    index.set(key, [scientist]);
  }
};

/**
 * Index staff under every form a spreadsheet is likely to write them as.
 *
 * Candidates are collected per key rather than overwritten, so a key two
 * people share is visible as ambiguous instead of silently resolving to
 * whichever record happened to be indexed last.
 */
export function buildStaffNameIndex(scientists: MatchableScientist[]): StaffNameIndex {
  const index: StaffNameIndex = new Map();
  for (const scientist of scientists) {
    const first = nameTokens(scientist.firstName);
    const last = nameTokens(scientist.lastName);
    if (first.length === 0 || last.length === 0) continue;

    // The full recorded name, and its first-and-last reduction, which is what
    // an incoming name with a middle name collapses to.
    addKey(index, [...first, ...last].join(" "), scientist);
    addKey(index, `${first[0]} ${last[last.length - 1]}`, scientist);
  }
  return index;
}

export type StaffNameMatch =
  | { status: "matched"; scientist: MatchableScientist }
  | { status: "ambiguous"; candidates: MatchableScientist[] }
  | { status: "unmatched" };

export function matchStaffByName(
  index: StaffNameIndex,
  rawName: string | null | undefined,
): StaffNameMatch {
  const tokens = nameTokens(rawName);
  if (tokens.length === 0) return { status: "unmatched" };

  // Whole name first, then first-and-last. A single token is not enough to
  // identify anyone, so it is never tried on its own.
  const keys = [tokens.join(" ")];
  if (tokens.length > 2) keys.push(`${tokens[0]} ${tokens[tokens.length - 1]}`);

  for (const key of keys) {
    const candidates = index.get(key);
    if (!candidates || candidates.length === 0) continue;
    if (candidates.length === 1) return { status: "matched", scientist: candidates[0] };
    return { status: "ambiguous", candidates };
  }

  return { status: "unmatched" };
}
