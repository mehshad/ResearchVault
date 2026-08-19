// Shared author-name matching logic used by both the client (publication detail
// page) and the server (publications-to-fix detection). Keeping it here ensures
// the same rules drive (a) "is this person a likely author of this publication"
// and (b) "is each linked internal author actually present in the free-text
// author list".

/**
 * Core matcher: does a person with the given first/last name plausibly appear
 * in a publication's free-text author list? Tolerant of common academic
 * citation variations like "Hendrickx W", "W. Hendrickx", "Wouter Hendrickx".
 *
 * Returns `false` when there is no author text or the names are missing, since
 * a genuine match cannot be established in those cases.
 */
/**
 * Lowercase + strip diacritics + trim, so "Jérôme" matches "Jerome" and
 * stray whitespace in stored names never blocks a match.
 */
function foldName(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Strip honorific/title prefixes such as "Dr." or "Prof." from a name. */
function stripTitles(value: string): string {
  return value.replace(/^(dr\.?|prof\.?|professor|mr\.?|ms\.?|mrs\.?|phd\.?|md\.?)\s+/i, '').trim();
}

/** Minimal scientist shape needed for author matching and suggestions. */
export interface MatchableScientist {
  id: number;
  firstName: string | null | undefined;
  lastName: string | null | undefined;
}

export function matchesAuthorName(
  authorsText: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): boolean {
  if (!authorsText) return false;

  const authorNames = foldName(authorsText).split(',').map(name => name.trim());
  const scientistLastName = stripTitles(foldName(lastName));
  const scientistFirstName = stripTitles(foldName(firstName));

  if (!scientistLastName) return false;

  // Tolerate a scientist record with no first name (data-quality edge seen in
  // some environments): fall back to an exact last-name word match, mirroring
  // the manual "Add Internal Author" smart filter.
  if (!scientistFirstName) {
    const lastNameToken = new RegExp(
      `(^|[\\s.])${scientistLastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[\\s.])`,
    );
    return authorNames.some(authorName => lastNameToken.test(stripTitles(authorName)));
  }

  const firstInitial = scientistFirstName.charAt(0);

  return authorNames.some(authorName => {
    // Remove common titles and clean
    const cleanAuthorName = authorName
      .replace(/^(dr\.?|prof\.?|professor|mr\.?|ms\.?|mrs\.?|phd\.?|md\.?)\s+/i, '')
      .trim();

    // Pattern 1: "Smith JA" or "Johnson MK" (LastName InitialInitial...)
    const lastNameFirstPattern = cleanAuthorName.match(/^([a-z-]+)\s+([a-z]+)$/i);
    if (lastNameFirstPattern) {
      const [, ln, initials] = lastNameFirstPattern;
      if (ln === scientistLastName && initials.startsWith(firstInitial)) {
        return true;
      }
    }

    // Pattern 2: "K. Al-Mansouri" or "L. Chen" (Initial. LastName)
    const initialFirstPattern = cleanAuthorName.match(/^([a-z])\.?\s+([a-z-]+)$/i);
    if (initialFirstPattern) {
      const [, initial, ln] = initialFirstPattern;
      if (initial === firstInitial && ln === scientistLastName) {
        return true;
      }
    }

    // Pattern 2b: "X. Y. LastName" (FirstInitial. MiddleInitial. LastName)
    const multipleInitialsPattern = cleanAuthorName.match(/^([a-z])\.?\s+([a-z])\.?\s+([a-z-]+)$/i);
    if (multipleInitialsPattern) {
      const [, firstInit, , ln] = multipleInitialsPattern; // Skip middle initial
      if (firstInit === firstInitial && ln === scientistLastName) {
        return true;
      }
    }

    // Pattern 3: "Emily Chen" (FirstName LastName)
    const fullNamePattern = cleanAuthorName.match(/^([a-z]+)\s+([a-z-]+)$/i);
    if (fullNamePattern) {
      const [, fn, ln] = fullNamePattern;
      if (fn === scientistFirstName && ln === scientistLastName) {
        return true;
      }
    }

    // Pattern 4: Multiple parts - find last name and check for first initial
    const nameParts = cleanAuthorName.split(/\s+/);
    if (nameParts.length > 2) {
      for (const part of nameParts) {
        if (part === scientistLastName) {
          for (const otherPart of nameParts) {
            if (otherPart !== part && (
              otherPart.startsWith(firstInitial) ||
              otherPart.replace('.', '') === firstInitial
            )) {
              return true;
            }
          }
        }
      }
    }

    // Fallback: Check if last name appears and first initial is present
    if (cleanAuthorName.includes(scientistLastName)) {
      const hasFirstInitial = cleanAuthorName.includes(firstInitial) ||
                             cleanAuthorName.includes(firstInitial + '.') ||
                             cleanAuthorName.includes(scientistFirstName);
      return hasFirstInitial;
    }

    return false;
  });
}

/**
 * Require an exact full-name match when another internal scientist shares the
 * same citation identity (first initial + last name). This keeps abbreviated
 * names useful while preventing a researcher from self-linking an ambiguous
 * "Smith A" record when both Alice Smith and Alicia Smith exist.
 */
export function isUnambiguousAuthorMatch(
  authorsText: string | null | undefined,
  target: MatchableScientist,
  scientists: MatchableScientist[]
): boolean {
  if (!matchesAuthorName(authorsText, target.firstName, target.lastName)) {
    return false;
  }

  const targetFirst = stripTitles(foldName(target.firstName));
  const targetLast = stripTitles(foldName(target.lastName));
  if (!targetFirst || !targetLast) return false;

  const exactFullNameMatch = foldName(authorsText)
    .split(",")
    .map((entry) =>
      stripTitles(entry)
        .replace(/\./g, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .some(
      (entry) =>
        entry === `${targetFirst} ${targetLast}` ||
        entry === `${targetLast} ${targetFirst}`
    );
  if (exactFullNameMatch) return true;

  const firstInitial = targetFirst.charAt(0);
  return !scientists.some((scientist) => {
    if (scientist.id === target.id) return false;
    const otherFirst = stripTitles(foldName(scientist.firstName));
    const otherLast = stripTitles(foldName(scientist.lastName));
    return (
      otherFirst.charAt(0) === firstInitial &&
      otherLast === targetLast
    );
  });
}

/** A proposed internal-author link inferred from a free-text author list. */
export interface AuthorSuggestion {
  scientistId: number;
  /** Inferred role: First Author / Contributing Author / Last Author. */
  authorshipType: string;
  /** 1-based position of the matched name in the free-text author list. */
  authorPosition: number;
}

/**
 * Single source of truth for proposing internal-author links from a
 * publication's free-text author list. Reused by both the "Auto-connect
 * internal authors" dialog and the Paper Discovery import so the matching
 * heuristic is never duplicated.
 *
 * For each author entry in the comma-separated `authorsText`, find the first
 * not-yet-suggested internal scientist whose name matches (via
 * `matchesAuthorName`). The author's index drives the inferred role:
 *   - first entry  -> "First Author"
 *   - last entry   -> "Last Author"
 *   - otherwise    -> "Contributing Author"
 *
 * Scientists in `excludeScientistIds` (already linked) are skipped. A scientist
 * is only suggested once even if their name appears multiple times.
 */
export function suggestInternalAuthors(
  authorsText: string | null | undefined,
  scientists: MatchableScientist[],
  excludeScientistIds: Iterable<number> = [],
): AuthorSuggestion[] {
  if (!authorsText || !authorsText.trim()) return [];

  const entries = authorsText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (entries.length === 0) return [];

  const excluded = new Set<number>(excludeScientistIds);
  const used = new Set<number>();
  const suggestions: AuthorSuggestion[] = [];

  const roleForIndex = (index: number): string => {
    if (index === 0) return "First Author";
    if (index === entries.length - 1) return "Last Author";
    return "Contributing Author";
  };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    for (const scientist of scientists) {
      if (excluded.has(scientist.id) || used.has(scientist.id)) continue;
      // Match against this single author entry (matchesAuthorName splits on
      // commas internally, so a one-entry string keeps the position precise).
      if (matchesAuthorName(entry, scientist.firstName, scientist.lastName)) {
        used.add(scientist.id);
        suggestions.push({
          scientistId: scientist.id,
          authorshipType: roleForIndex(i),
          authorPosition: i + 1,
        });
        break;
      }
    }
  }

  return suggestions;
}

/**
 * Is a linked internal author considered "present" in the publication's
 * free-text author list? Mirrors the publication detail page's original
 * behaviour: when there is no author text or the names are missing we cannot
 * prove a mismatch, so the author is assumed present (no flag raised).
 */
export function isLinkedAuthorInAuthorsText(
  authorsText: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): boolean {
  if (!authorsText) return true; // If no authors text, assume all are valid
  if (!firstName || !lastName) return true; // Skip if missing names
  return matchesAuthorName(authorsText, firstName, lastName);
}
