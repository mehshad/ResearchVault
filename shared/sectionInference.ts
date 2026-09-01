/**
 * Line managers whose reports must not inherit a section.
 *
 * Someone at the top of the organisation has reports across every department,
 * so inheriting from them would file the whole organisation into one section.
 * Their reports lead sections of their own and are placed directly.
 */
export const SECTION_INFERENCE_EXCLUDED_MANAGERS = [
  "sdominguez@sidra.org",
] as const;

export interface LineManagerReaders<T, P> {
  /** The person's own email, lower-cased. */
  email: (person: T) => string;
  /** Their line manager's email, lower-cased, or nothing. */
  manager: (person: T) => string | null | undefined;
  /** Where they currently sit, or null when that is blank. */
  placement: (person: T) => P | null;
  /** Record an inherited placement. Only called when placement() was null. */
  assign: (person: T, placement: P) => void;
}

/**
 * Fill blank placements from each person's line manager, in a single pass.
 *
 * Most staff sit where their manager sits, so a roster that names managers but
 * leaves sections empty carries that information implicitly. This reads it out.
 *
 * Two rules:
 *
 *  - A placement already set is never replaced. What the file states, or what
 *    is already stored, always wins over anything inferred.
 *  - Managers in `excludedManagers` are not inherited from at all.
 *
 * One pass, deliberately. A manager whose own section is blank passes nothing
 * down: their report keeps a blank section rather than inheriting from further
 * up a chain nobody stated. That also means the result does not depend on the
 * order rows happen to appear in.
 *
 * Returns how many placements were filled, so a caller can report it.
 */
export function inferPlacementFromLineManagers<T, P>(
  people: readonly T[],
  read: LineManagerReaders<T, P>,
  seeded: Map<string, P>,
  excludedManagers: readonly string[] = SECTION_INFERENCE_EXCLUDED_MANAGERS,
): number {
  const excluded = new Set(excludedManagers.map((email) => email.toLowerCase()));

  // Everyone who states a placement, whether from the file or already stored,
  // is a source for the people reporting to them. Collected before anything is
  // assigned so an inferred placement is never itself inherited from.
  const stated = new Map(seeded);
  for (const person of people) {
    const placement = read.placement(person);
    if (placement != null) stated.set(read.email(person), placement);
  }

  let filled = 0;
  for (const person of people) {
    if (read.placement(person) != null) continue;
    const manager = read.manager(person)?.toLowerCase();
    if (!manager || excluded.has(manager)) continue;
    const placement = stated.get(manager);
    if (placement == null) continue;

    read.assign(person, placement);
    filled++;
  }
  return filled;
}
