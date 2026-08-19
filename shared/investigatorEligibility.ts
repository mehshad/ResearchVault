export type InvestigatorEligibilitySubject = {
  jobTitle?: string | null;
  isInvestigator?: boolean | null;
};

export const INVESTIGATOR_ELIGIBLE_JOB_TITLES = [
  "Investigator",
  "Staff Scientist",
] as const;
export const PRINCIPAL_INVESTIGATOR_ROLE = "Principal Investigator";

/**
 * A staff member can fill investigator-only roles when eligibility comes from
 * either their primary job title or the additional management designation.
 */
export function isInvestigatorEligible(
  subject: InvestigatorEligibilitySubject | null | undefined
): boolean {
  if (!subject) return false;
  return (
    subject.isInvestigator === true ||
    INVESTIGATOR_ELIGIBLE_JOB_TITLES.includes(
      subject.jobTitle as (typeof INVESTIGATOR_ELIGIBLE_JOB_TITLES)[number]
    )
  );
}

export function isInvestigatorRoleAssignmentAllowed(
  role: string | null | undefined,
  subject: InvestigatorEligibilitySubject | null | undefined
): boolean {
  return role !== PRINCIPAL_INVESTIGATOR_ROLE || isInvestigatorEligible(subject);
}