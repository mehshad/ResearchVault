/**
 * Which SDRs concern the person looking at the page, and why.
 *
 * Two different answers, and the difference is the point:
 *
 *  - **mine** — I am on the research team.
 *  - **team** — somebody who reports to me is on it and I am not. An
 *    investigator wants to see those: it is their lab's work, and being absent
 *    from the team of an SDR their own people are running is exactly the thing
 *    worth noticing.
 *
 * A team is read from `supervisorId`, the line manager already recorded on
 * every staff profile, rather than from a second notion of "team" invented for
 * this feature.
 */

export interface InvolvementMember {
  researchActivityId: number;
  scientistId: number;
}

export interface InvolvementPerson {
  id: number;
  supervisorId?: number | null;
}

export interface Involvement {
  /** I am on the team myself. */
  mine: boolean;
  /** People reporting to me who are on it, when I am not. */
  teamMembers: number[];
}

export interface InvolvementInputs {
  /** The staff record of the person looking, or null for an account with none. */
  myScientistId: number | null | undefined;
  members: readonly InvolvementMember[];
  scientists: readonly InvolvementPerson[];
  /** Whether to look at the team at all. Only investigators lead one. */
  includeTeam: boolean;
}

export function scientistsReportingTo(
  myScientistId: number | null | undefined,
  scientists: readonly InvolvementPerson[],
): Set<number> {
  if (myScientistId == null) return new Set();
  return new Set(
    scientists.filter((person) => person.supervisorId === myScientistId).map((person) => person.id),
  );
}

/**
 * Map of SDR id to why it concerns me. An SDR I am on is "mine" even when my
 * team is on it too -- being a member is the stronger fact, and labelling it
 * as my team's would bury that I am on it myself. The team members are still
 * listed in that case, because who else from my lab is on it is worth knowing;
 * it is only the label that gives way.
 */
export function computeSdrInvolvement(inputs: InvolvementInputs): Map<number, Involvement> {
  const involvement = new Map<number, Involvement>();
  const { myScientistId, members, scientists, includeTeam } = inputs;
  if (myScientistId == null) return involvement;

  const teamIds = includeTeam ? scientistsReportingTo(myScientistId, scientists) : new Set<number>();

  for (const member of members) {
    const isMe = member.scientistId === myScientistId;
    const isMyTeam = !isMe && teamIds.has(member.scientistId);
    if (!isMe && !isMyTeam) continue;

    const entry = involvement.get(member.researchActivityId) ?? { mine: false, teamMembers: [] };
    if (isMe) entry.mine = true;
    else if (!entry.teamMembers.includes(member.scientistId)) entry.teamMembers.push(member.scientistId);
    involvement.set(member.researchActivityId, entry);
  }

  return involvement;
}
