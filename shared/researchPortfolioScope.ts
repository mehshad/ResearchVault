/**
 * Whose grant is this, and whose contract -- answered from the section.
 *
 * The Research Office pages show the office everything. These two answer a
 * different question, for the people whose work the records describe: which of
 * these are mine, and which are my section's.
 *
 * Both pages withhold something, though they withhold different amounts. A
 * contract outside the viewer's section is not shown at all. A grant outside it
 * is shown only while it is in good standing -- awarded, running or finished --
 * so another section's applications, refusals and bad endings stay theirs.
 *
 * A **section** is the team here, read from `scientists.sectionId`, the
 * structured organisation already recorded on every staff profile. That is a
 * deliberate second notion of team alongside the one in `sdrInvolvement.ts`,
 * which reads `supervisorId`. They answer different questions: a line manager's
 * direct reports are the people who report to *me*, while a section is the unit
 * a grant or contract is administered by, and the people in it need not report
 * to one another at all. Neither is a substitute for the other, so neither is
 * expressed in terms of the other.
 *
 * Management sees everything, so for them the section is the institution. That
 * is not a special case bolted on at the edge -- it is the same question with a
 * wider answer, and it is resolved here rather than by each caller remembering
 * to check.
 */

/** The person looking, as this module needs them. */
export interface PortfolioViewer {
  /** Their staff record, or null for an account not linked to one. */
  scientistId: number | null;
  /** The section that staff record belongs to, or null when unplaced. */
  sectionId: number | null;
  /** Management and administrators: the whole institution is their section. */
  seesEverything: boolean;
}

export interface SectionMember {
  id: number;
  sectionId?: number | null;
}

/** How a record concerns the viewer. `null` means it does not. */
export type Involvement = "mine" | "team" | null;

/**
 * The only grant statuses visible outside the viewer's own section.
 *
 * A grant in good standing: won, running, or finished. Everything else is a
 * section's own affair.
 *
 * Two kinds of thing are deliberately kept in, and it is worth being explicit
 * about which, because the obvious shortcut gets it wrong in both directions:
 *
 *  - **The pipeline and the refusals.** An application still under review, or
 *    one the funder declined, is that section's business while it is theirs to
 *    manage. `not_awarded` alone is 153 of the 272 grants on record.
 *  - **The endings.** `withdrawn`, `terminated`, `suspended` and `transferred`
 *    all follow a real award, so a test on the `awarded` flag would let every
 *    one of them across. They are also the ones a section would least like
 *    broadcast, and none of them is what a colleague elsewhere is looking for.
 *
 * That second point is why this is a status list and not `awarded === true`.
 * The flag answers "was this ever won", which is a different question from
 * "may other sections see it", and the two differ on exactly the four statuses
 * nobody wants published.
 *
 * `active` is on the list because it is what a won, running grant carries. An
 * earlier version listed only awarded and completed, which showed other
 * sections' finished work and hid the work in progress.
 *
 * One list, named once: changing what crosses a section boundary should be an
 * edit here and nowhere else.
 */
export const STATUSES_VISIBLE_OUTSIDE_SECTION = ["awarded", "active", "completed"] as const;

/**
 * Whether a grant may be listed for this viewer at all.
 *
 * Anything the viewer or their section is on is visible whatever its status --
 * your own refused application is still your lab's work. Everything else has
 * to be in good standing.
 */
export function grantVisibleToViewer(
  involvement: Involvement,
  status: string | null | undefined,
): boolean {
  if (involvement !== null) return true;
  const normalised = (status ?? "").trim().toLowerCase();
  return (STATUSES_VISIBLE_OUTSIDE_SECTION as readonly string[]).includes(normalised);
}

/**
 * Everyone in the viewer's section, including the viewer.
 *
 * `null` means "no section boundary applies" -- Management, for whom every
 * record is in scope. That is distinct from an empty set, which is what an
 * unplaced account gets: a person with no section is in a section with nobody
 * in it, so nothing is their team's. Returning an empty set there rather than
 * null is what keeps the contracts page fail-closed for an account whose staff
 * profile has never been placed in the organisation.
 */
export function sectionColleagueIds(
  viewer: PortfolioViewer,
  scientists: readonly SectionMember[],
): Set<number> | null {
  if (viewer.seesEverything) return null;
  if (viewer.sectionId == null) return new Set();
  return new Set(
    scientists
      .filter((person) => person.sectionId === viewer.sectionId)
      .map((person) => person.id),
  );
}

/** True when `scientistId` is inside the scope `colleagues` describes. */
function inScope(scientistId: number | null | undefined, colleagues: Set<number> | null): boolean {
  if (scientistId == null) return false;
  return colleagues === null || colleagues.has(scientistId);
}

export interface GrantParticipants {
  /** The Sidra Lead PI of record. */
  lpiId?: number | null;
  /** Staff named as co-investigators, from `grant_co_investigators`. */
  coInvestigatorIds?: readonly number[];
}

/**
 * How a grant concerns the viewer.
 *
 * Being on it yourself wins over your section being on it. Otherwise a grant
 * you lead would be filed as somebody else's work simply because a colleague is
 * also named on it, which is the opposite of what the filter is for.
 *
 * Lead PI and co-investigator both count as "mine". A researcher named as a
 * co-investigator did the work and is answerable for it; showing them the grant
 * only when they happen to lead it would leave most of a bench scientist's
 * funding invisible to them.
 */
export function grantInvolvement(
  grant: GrantParticipants,
  viewer: PortfolioViewer,
  colleagues: Set<number> | null,
): Involvement {
  const participants = [grant.lpiId, ...(grant.coInvestigatorIds ?? [])].filter(
    (id): id is number => id != null,
  );

  if (viewer.scientistId != null && participants.includes(viewer.scientistId)) return "mine";
  if (participants.some((id) => inScope(id, colleagues))) return "team";
  return null;
}

export interface ContractParticipants {
  /** The lead PI's staff record. */
  leadPIId?: number | null;
  /**
   * The staff record behind the account that raised the request, resolved by
   * the caller from `requestedByUserId`.
   */
  requestedByScientistId?: number | null;
}

/**
 * The staff record whose section owns a contract.
 *
 * The lead PI, falling back to whoever raised the request when no PI is
 * recorded yet. A contract in flight has a requester before it has a PI, and
 * scoping on the PI alone would hide a request from the very section that made
 * it until the office got round to filling the field in.
 *
 * Null when neither is known. Such a contract belongs to no section, so only
 * someone who sees everything sees it -- it is not quietly shown to all.
 */
export function contractOwnerScientistId(contract: ContractParticipants): number | null {
  return contract.leadPIId ?? contract.requestedByScientistId ?? null;
}

/** How a contract concerns the viewer. */
export function contractInvolvement(
  contract: ContractParticipants,
  viewer: PortfolioViewer,
  colleagues: Set<number> | null,
): Involvement {
  const owner = contractOwnerScientistId(contract);
  if (owner == null) return colleagues === null ? "team" : null;
  if (viewer.scientistId != null && owner === viewer.scientistId) return "mine";
  return inScope(owner, colleagues) ? "team" : null;
}

/**
 * The contracts the viewer may see at all.
 *
 * Unlike the grants page, which lists everything and offers the filter as a
 * convenience, this is a restriction: a contract outside the viewer's section
 * is not theirs to read, so it never leaves the server. Anything this drops is
 * dropped for good, which is why it lives beside the involvement rules rather
 * than being re-derived at the call site.
 */
export function visibleContracts<T extends ContractParticipants>(
  contracts: readonly T[],
  viewer: PortfolioViewer,
  colleagues: Set<number> | null,
): Array<T & { involvement: Exclude<Involvement, null> }> {
  const visible: Array<T & { involvement: Exclude<Involvement, null> }> = [];
  for (const contract of contracts) {
    const involvement = contractInvolvement(contract, viewer, colleagues);
    if (involvement === null) continue;
    visible.push({ ...contract, involvement });
  }
  return visible;
}
