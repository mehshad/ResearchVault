export type InvestigatorEligibilitySubject = {
  /**
   * Whether this person holds the Investigator access role.
   *
   * Derived by the server from the account linked to the staff profile, not
   * stored on the profile. See resolveInvestigatorScientistIds.
   */
  isInvestigator?: boolean | null;
};

export const INVESTIGATOR_ROLE = "Investigator";

/**
 * Job titles a person may not choose for themselves; a manager assigns them.
 *
 * This no longer controls access -- a job title grants nothing since
 * investigator status moved to the access role. It remains because these
 * titles are a claim about someone's position, and self-registration should
 * not let anyone make it. Formerly INVESTIGATOR_ELIGIBLE_JOB_TITLES, when the
 * same list did decide who could lead a project.
 */
export const MANAGER_ASSIGNED_JOB_TITLES = [
  "Investigator",
  "Staff Scientist",
] as const;
export const PRINCIPAL_INVESTIGATOR_ROLE = "Principal Investigator";

/**
 * Whether someone may fill investigator-only roles.
 *
 * Eligibility is the Investigator access role, held on the person's account
 * either as their primary role or alongside it. Nothing else confers it.
 *
 * It used to come from the job title as well, and the eligible titles were
 * "Investigator" *and* "Staff Scientist" -- so the Investigators list showed
 * every staff scientist, and a title change silently granted or removed the
 * ability to lead a project. There was also a separate `isInvestigator` flag on
 * the staff profile, which meant three different places decided the same thing
 * and could disagree. Now an administrator grants Investigator in User
 * Management, and that is the whole answer.
 */
export function isInvestigatorEligible(
  subject: InvestigatorEligibilitySubject | null | undefined
): boolean {
  return subject?.isInvestigator === true;
}

export function isInvestigatorRoleAssignmentAllowed(
  role: string | null | undefined,
  subject: InvestigatorEligibilitySubject | null | undefined
): boolean {
  return role !== PRINCIPAL_INVESTIGATOR_ROLE || isInvestigatorEligible(subject);
}
