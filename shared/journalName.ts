/**
 * One way to compare two spellings of a journal name.
 *
 * Publication sources and the impact-factor dataset disagree constantly:
 * "The Lancet. Oncology" against "LANCET ONCOLOGY", "Journal of Experimental
 * Clinical Cancer Research" against "JOURNAL OF EXPERIMENTAL & CLINICAL CANCER
 * RESEARCH". Lower-casing, dropping a leading "The" and collapsing every run of
 * punctuation to a single space makes those pairs equal.
 *
 * Lifted out of server/databaseStorage.ts so the screen that reports which
 * journals have no impact factor can ask the same question the scorer asks. It
 * lived only on the server, so the summary was written against a stricter rule
 * and called journals missing that score perfectly well -- the same shape of
 * bug as the two importers that disagreed about quartiles.
 */

export function normalizeJournalName(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the\s+/, "")
    .trim();
}

/**
 * Decode the handful of HTML entities that reach journal names.
 *
 * Publication feeds escape the ampersand and the escape survives into the
 * stored name, where normalisation turns "&amp;" into the word "amp" rather
 * than nothing -- so "Clinical Reviews in Allergy &amp; Immunology" fails to
 * match a journal we hold. Decoding first fixes it.
 *
 * Only the entities actually seen are decoded. A general-purpose decoder here
 * would be a way to turn a journal name into something it is not.
 */
export function decodeJournalName(name: string): string {
  return name
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/g, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Words that stay lower case inside a title, but not at the start.
 *
 * "JOURNAL OF THE AMERICAN COLLEGE OF CARDIOLOGY" should read "Journal of the
 * American College of Cardiology", not "Journal Of The American College Of
 * Cardiology".
 */
const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor",
  "of", "on", "or", "per", "the", "to", "via", "with",
]);

/**
 * Words that are acronyms rather than words, and stay as they are.
 *
 * A list rather than a rule, because no rule separates "AIDS" from "Aids"
 * without knowing what the letters stand for. Anything absent from it is
 * still caught by the no-vowel test below, which covers most of the rest.
 */
const ACRONYMS = new Set([
  "ACM", "ACS", "AIDS", "AAPS", "BMC", "BMJ", "CA", "CNS", "COPD", "DNA", "EMBO",
  "EPJ", "ESC", "EFSA", "FEBS", "FEMS", "HIV", "IEEE", "IET", "IUBMB", "JAMA",
  "JBIC", "JCI", "MMWR", "NMR", "PLOS", "PNAS", "RNA", "RSC", "SAE", "SPE",
  "USA", "UK", "US", "AI", "IT", "3D", "II", "III", "IV", "VI", "VII", "VIII",
  "IX", "XI", "XII",
]);

const VOWELS = /[AEIOUY]/;

/** One hyphen-free run: "CA", "CLINICIANS", "3D". */
function caseSegment(segment: string, isEdge: boolean): string {
  const bare = segment.replace(/[^A-Za-z0-9]/g, "");
  if (!bare) return segment;
  const upper = bare.toUpperCase();
  // Acronyms, single letters, and vowel-less runs like "BMJ" are not words.
  if (ACRONYMS.has(upper) || bare.length === 1 || (bare.length <= 4 && !VOWELS.test(upper))) {
    return segment.toUpperCase();
  }
  const lower = segment.toLowerCase();
  if (!isEdge && MINOR_WORDS.has(lower)) return lower;
  return lower.replace(/^([^a-z]*)([a-z])/, (_m, before, letter) => before + letter.toUpperCase());
}

function caseWord(word: string, isEdge: boolean): string {
  if (!word) return word;
  // Split on hyphens and slashes so each half is judged on its own: "CA-A"
  // is two acronyms, "C-EMERGING" is an acronym and a word.
  const parts = word.split(/([-\/])/);
  if (parts.length === 1) return caseSegment(word, isEdge);
  // Every segment after a hyphen starts a phrase of its own -- these are
  // subtitle separators in practice ("GOVERNANCE-AN INTERNATIONAL JOURNAL") --
  // so none of them is ever a minor word to be kept small.
  return parts
    .map((part, i) => (/^[-\/]$/.test(part) ? part : caseSegment(part, isEdge || i > 0)))
    .join("");
}

/**
 * A journal name as it should be read, not as it was imported.
 *
 * Journal Citation Reports ships everything in capitals -- "NUCLEIC ACIDS
 * RESEARCH", "CA-A CANCER JOURNAL FOR CLINICIANS" -- while publication feeds
 * supply ordinary mixed case. Both spellings end up on the same screen and it
 * reads as shouting.
 *
 * **Only all-capital names are touched.** A name that already contains a lower
 * case letter was written by a person or a feed that knew what it was doing,
 * and re-casing it could only make it worse: "Journal of tRNA Biology" would
 * come back wrong under any rule simple enough to be trustworthy.
 *
 * Display only. Nothing stored or matched goes through here -- comparison is
 * `normalizeJournalName`, which lowercases everything anyway.
 */
export function displayJournalName(name: string | null | undefined): string {
  const value = (name ?? "").trim();
  if (!value) return "";
  if (/[a-z]/.test(value)) return value;
  const words = value.split(/(\s+)/);
  let index = 0;
  return words
    .map((part) => {
      if (/^\s+$/.test(part)) return part;
      const isEdge = index === 0 || index === words.filter((w) => !/^\s+$/.test(w)).length - 1;
      index += 1;
      return caseWord(part, isEdge);
    })
    .join("");
}
