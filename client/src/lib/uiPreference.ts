/**
 * Small per-viewer UI preferences, kept in localStorage.
 *
 * These are view choices, not data: which year range a profile's publication
 * list is showing, whether the grants card is including grants the person is
 * not lead PI on. They belong to one person on one browser and never need to
 * reach the server, which is the same reasoning behind `sidebar-collapsed`.
 *
 * Every access is wrapped: localStorage throws outright in some contexts
 * (private windows with site data blocked, embedded previews), and a view
 * preference is never worth taking the page down for.
 */

export function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // No storage available; the choice simply does not outlive the visit.
  }
}

/**
 * Read a preference constrained to a known set of values, falling back when
 * nothing is stored or the stored value is no longer one the app offers.
 */
export function readPreferenceOneOf<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const stored = readPreference(key);
  return allowed.includes(stored as T) ? (stored as T) : fallback;
}

/** Preference keys, kept together so they cannot collide by accident. */
export const PREFERENCE_KEYS = {
  /** Year range on a staff profile's publication list: "3" | "5" | "all". */
  profilePublicationYears: "profile-publication-years",
  /** Whether the grants card includes grants the person is not lead PI on. */
  profileGrantsIncludeOther: "profile-grants-include-other",
} as const;
