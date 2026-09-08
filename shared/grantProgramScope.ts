/**
 * The programme a grant belongs to, and what it limits.
 *
 * A grant names its programme at submission. Much later -- SDRs cannot be
 * linked until the grant is awarded -- that choice narrows which SDRs may be
 * linked to it: only those whose own programme is the same one.
 *
 * This stacks on the Lead PI rule in grantSdrEligibility.ts rather than
 * replacing it. An SDR must still be run by the grant's Lead PI *and*, when the
 * grant names a programme, belong to that programme.
 *
 * An SDR reaches a programme only through its project:
 *
 *     programs <- projects.programId <- researchActivities.projectId
 *
 * Both of those links are nullable, and so is the grant's own programme, so
 * either side can resolve to no programme at all. **A missing programme on
 * either side restricts nothing.** The limit applies only where both are known,
 * and then they must match.
 *
 * That is the permissive reading, chosen deliberately. It is what keeps the 272
 * grants that predate the field working, and it means incomplete PMO data
 * cannot block an office from recording work that really happened. The cost is
 * that an SDR left without a project can be linked to any grant, so the limit
 * is a guide for well-formed records rather than a fence -- worth knowing when
 * reading it as a control. Nothing in the data relies on that today: every SDR
 * has a project and every project a programme.
 */

/** A grant, as this rule needs it. */
export interface GrantProgramScope {
  /** The programme chosen at submission. Null on a grant that names none. */
  programId?: number | null;
}

/** An SDR with its programme already resolved through its project. */
export interface SdrProgramMembership {
  id: number;
  sdrNumber?: string | null;
  /** Resolved from the SDR's project. Null when it has no project. */
  programId?: number | null;
}

/**
 * Whether the grant's programme admits this SDR.
 *
 * Either side naming no programme admits it: a grant that names none has
 * nothing to narrow by, and an SDR that reaches none is not excluded by a
 * programme it cannot be compared against.
 */
export function isSdrInGrantProgram(
  grantProgramId: number | null | undefined,
  sdrProgramId: number | null | undefined,
): boolean {
  if (grantProgramId == null) return true;
  if (sdrProgramId == null) return true;
  return sdrProgramId === grantProgramId;
}

/**
 * The SDRs already linked to a grant that the given programme would exclude.
 *
 * Used to refuse a programme change rather than to perform one. Changing the
 * programme out from under linked SDRs has three possible answers -- block,
 * grandfather, or silently unlink -- and this is the blocking one: the office
 * adjusts the SDRs first, so the grant never holds work its own programme
 * excludes and no link is ever destroyed on the way.
 *
 * Returns them rather than a boolean so the refusal can name them. "Three SDRs
 * are in the way" is not something anybody can act on.
 */
export function sdrsBlockingProgramChange<T extends SdrProgramMembership>(
  linkedSdrs: readonly T[],
  nextProgramId: number | null | undefined,
): T[] {
  if (nextProgramId == null) return [];
  return linkedSdrs.filter((sdr) => !isSdrInGrantProgram(nextProgramId, sdr.programId));
}

/**
 * The message shown when a programme change is refused.
 *
 * Names the SDRs, and says what to do about them. Kept here so the server's
 * refusal and anything the interface says ahead of it cannot drift apart.
 */
export function programChangeBlockedMessage(
  blocking: readonly SdrProgramMembership[],
): string {
  const names = blocking
    .map((sdr) => sdr.sdrNumber?.trim() || `SDR ${sdr.id}`)
    .join(", ");
  const isOne = blocking.length === 1;
  return (
    `This grant's programme cannot be changed while ${isOne ? "an SDR that belongs" : "SDRs that belong"} ` +
    `to another programme ${isOne ? "is" : "are"} linked to it: ${names}. ` +
    `Move ${isOne ? "it" : "them"} to the new programme or unlink ${isOne ? "it" : "them"} first.`
  );
}

/**
 * The SDRs a grant may be linked to, given the programme.
 *
 * Already-linked SDRs are kept in the list whatever their programme, the same
 * way the Lead PI filter keeps them: a picker that hides what is already linked
 * shows the office a shorter list than the record holds, and unlinking is how
 * the blocked programme change above gets resolved.
 */
export function filterSdrsByProgram<T extends SdrProgramMembership>(
  candidates: readonly T[],
  grantProgramId: number | null | undefined,
  linkedIds: readonly number[],
): T[] {
  if (grantProgramId == null) return [...candidates];
  const linked = new Set(linkedIds);
  return candidates.filter(
    (sdr) => isSdrInGrantProgram(grantProgramId, sdr.programId) || linked.has(sdr.id),
  );
}
