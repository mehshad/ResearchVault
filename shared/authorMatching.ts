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
export function matchesAuthorName(
  authorsText: string | null | undefined,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): boolean {
  if (!authorsText) return false;

  const authorNames = authorsText.split(',').map(name => name.trim().toLowerCase());
  const scientistLastName = lastName?.toLowerCase() || '';
  const scientistFirstName = firstName?.toLowerCase() || '';

  if (!scientistLastName || !scientistFirstName) return false;

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
