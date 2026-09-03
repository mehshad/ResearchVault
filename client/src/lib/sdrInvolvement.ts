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
  /**
   * Set when this SDR's PI of record -- me, or one of my people -- is not on
   * its research team. A discrepancy to correct, not a kind of membership.
   */
  piMissingFromTeam?: number;
}

export interface InvolvementActivity {
  id: number;
  /** The PI of record. */
  budgetHolderId?: number | null;
}

export interface InvolvementInputs {
  /** The staff record of the person looking, or null for an account with none. */
  myScientistId: number | null | undefined;
  members: readonly InvolvementMember[];
  scientists: readonly InvolvementPerson[];
  /** Whether to look at the team at all. Only investigators lead one. */
  includeTeam: boolean;
  /**
   * The SDRs themselves, so being the PI of record counts as being on it.
   *
   * Team membership and the PI field are maintained separately, and only the
   * create-an-SDR form ever wrote both: an SDR that arrived by import, or whose
   * PI was changed afterwards, names a PI who is absent from its own team.
   * Reading these lets that be flagged rather than passed over.
   */
  activities?: readonly InvolvementActivity[];
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

  // Being the PI of record and being on the research team are stored
  // separately, and only the create-an-SDR form ever wrote both. An SDR that
  // arrived by import, or whose PI was changed afterwards, names a PI who is
  // absent from its own team.
  //
  // Deliberately NOT treated as membership. Counting the PI as a member would
  // paper over the inconsistency in exactly the view most likely to reveal it;
  // it is surfaced as something to correct instead.
  for (const activity of inputs.activities ?? []) {
    const pi = activity.budgetHolderId;
    if (pi == null) continue;

    const isMine = pi === myScientistId;
    const isMyTeams = !isMine && teamIds.has(pi);
    if (!isMine && !isMyTeams) continue;

    const onTheTeam = members.some(
      (member) => member.researchActivityId === activity.id && member.scientistId === pi,
    );
    if (onTheTeam) continue;

    const entry = involvement.get(activity.id) ?? { mine: false, teamMembers: [] };
    entry.piMissingFromTeam = pi;
    involvement.set(activity.id, entry);
  }

  return involvement;
}
