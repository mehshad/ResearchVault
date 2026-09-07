/**
 * Finding entries in a curated list that are probably the same thing.
 *
 * The name key already stops the easy case: "Hamad Medical Corporation" and
 * "hamad  medical-corporation" cannot both exist, because case, spacing and
 * punctuation are stripped before the uniqueness check. What it cannot stop is
 * the same organisation written genuinely differently -- "Weill Cornell Medical
 * College in Qatar" and "Weill Cornell Medicine Qatar" are both in the seeded
 * list, and no normalisation should merge them, because deciding they are the
 * same place is a judgement.
 *
 * So this suggests, and a person decides. Everything here is a *candidate*: the
 * output is a list of pairs somebody should look at, never a merge performed on
 * its own authority. Silently folding two entries together is the one outcome
 * worth avoiding, because afterwards nobody can tell that two things were ever
 * distinct.
 */
import { referenceNameKey } from "./institutions";

export interface DuplicateCandidate<T> {
  left: T;
  right: T;
  /** 0 to 1. Higher means more alike. */
  similarity: number;
  /** Why they were paired, for the person deciding. */
  reason: "contains" | "similar";
}

/**
 * Trigrams of a normalised name, for comparing two names by overlap.
 *
 * Trigrams rather than edit distance: "Weill Cornell Medical College in Qatar"
 * and "Weill Cornell Medicine Qatar" are far apart character by character but
 * share most of their three-letter runs, which is exactly the kind of pair
 * worth surfacing. Edit distance ranks them below pairs that differ by a typo,
 * which are the ones the name key already caught.
 */
function trigrams(name: string): Set<string> {
  const key = referenceNameKey(name);
  if (key.length < 3) return new Set(key ? [key] : []);
  const grams = new Set<string>();
  for (let i = 0; i <= key.length - 3; i++) grams.add(key.slice(i, i + 3));
  return grams;
}

/**
 * The words of a name, lowercased and stripped of punctuation.
 *
 * Single characters are dropped: an initial or a stray "&" says nothing about
 * whether two organisations are the same, and counting them lets a pair share
 * weight for no reason.
 */
export function nameWords(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 1),
  );
}

/** Levenshtein distance, capped: anything past `limit` is not interesting. */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      best = Math.min(best, current[j]);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

/**
 * The word in `candidates` that `word` is, allowing for a misspelling.
 *
 * Exact first. Then a near match, but only for words long enough that being two
 * edits apart means something: "Policinico" is "Policlinico" and "Centre" is
 * "Center", while "Oulu" and "Iowa" are two different places that happen to be
 * two edits apart. Five characters is where that stops being a coin flip.
 */
function matchingWord(word: string, candidates: Set<string>): string | null {
  if (candidates.has(word)) return word;
  if (word.length < 5) return null;
  for (const candidate of candidates) {
    if (candidate.length < 5) continue;
    if (editDistance(word, candidate, 2) <= 2) return candidate;
  }
  return null;
}

/** Overlap of two trigram sets, 0 to 1. */
export function nameSimilarity(left: string, right: string): number {
  const a = trigrams(left);
  const b = trigrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared++;
  return shared / Math.max(a.size, b.size);
}

/**
 * Pairs worth a second look.
 *
 * `threshold` is deliberately generous. A cleaner that only offers certainties
 * finds nothing worth cleaning: the certainties were already prevented by the
 * unique key. Over-suggesting costs a person one glance per pair; under-
 * suggesting leaves the duplicate in the list forever.
 *
 * One name containing another is reported separately, because it is a different
 * kind of evidence -- "Qatar University" inside "Qatar University College of
 * Medicine" is often two real institutions, and the reason lets the screen say
 * so rather than presenting it as a near-match.
 */
export function findDuplicateCandidates<T extends { id: number; name: string }>(
  entries: readonly T[],
  threshold = 0.6,
): Array<DuplicateCandidate<T>> {
  const candidates: Array<DuplicateCandidate<T>> = [];

  /**
   * How much each word counts, given the rest of the list.
   *
   * Plain overlap scores "Qatar University" against "Osaka University" at 0.62,
   * because "university" is most of both names -- a false pair, and the kind
   * that would swamp a screen listing 405 institutions where dozens end in the
   * same word. Weighting each word by how rare it is fixes that from the data
   * rather than from a stop-word list somebody has to maintain: what
   * "everything says" is whatever this particular list says often, which for
   * agreement types is "agreement" and for institutions is "university".
   *
   * log(N/df) rather than 1/df, and words rather than trigrams, because both
   * naive versions were tried and both failed on real data:
   *
   *  - 1/df punishes a *family* of duplicates. Four Weill Cornell entries make
   *    "weill" look common, so the four spellings of one institution scored
   *    below the threshold and none was reported -- the exact case this exists
   *    to catch.
   *  - Trigrams let a shared suffix accumulate. "university" is nine trigrams
   *    of agreement between two unrelated universities.
   *
   * log(N/df) keeps a word appearing four times in four hundred emphatic while
   * still discounting one that appears eighty times.
   */
  const total = entries.length;
  const documentFrequency = new Map<string, number>();
  const wordsByEntry = entries.map((entry) => {
    const words = nameWords(entry.name);
    for (const word of words) {
      documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
    }
    return words;
  });
  const weightOf = (word: string) =>
    Math.log(total / (documentFrequency.get(word) ?? 1)) + 1;
  const weigh = (words: Set<string>) => {
    let sum = 0;
    for (const word of words) sum += weightOf(word);
    return sum;
  };

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const left = entries[i];
      const right = entries[j];
      const leftKey = referenceNameKey(left.name);
      const rightKey = referenceNameKey(right.name);
      if (!leftKey || !rightKey) continue;

      const contains = leftKey.includes(rightKey) || rightKey.includes(leftKey);

      let shared = 0;
      for (const word of wordsByEntry[i]) {
        const match = matchingWord(word, wordsByEntry[j]);
        if (match !== null) shared += Math.min(weightOf(word), weightOf(match));
      }
      const heaviest = Math.max(weigh(wordsByEntry[i]), weigh(wordsByEntry[j]));
      const similarity = heaviest === 0 ? 0 : shared / heaviest;

      if (contains) {
        candidates.push({ left, right, similarity, reason: "contains" });
      } else if (similarity >= threshold) {
        candidates.push({ left, right, similarity, reason: "similar" });
      }
    }
  }

  // Most alike first: the pairs most likely to be real duplicates are the ones
  // worth a person's attention soonest.
  return candidates.sort((a, b) => b.similarity - a.similarity);
}
