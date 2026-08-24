import {
  isInvestigatorEligible,
  type InvestigatorEligibilitySubject,
} from "./investigatorEligibility";

export type RoomRoleEligibilitySubject = InvestigatorEligibilitySubject & {
  jobTitle?: string | null;
};

const ROOM_MANAGER_JOB_TITLE_MARKERS = [
  "management",
  "staff",
  "post-doctoral",
  "research",
] as const;

export function isRoomSupervisorEligible(
  subject: RoomRoleEligibilitySubject | null | undefined,
): boolean {
  return isInvestigatorEligible(subject);
}

export function isRoomManagerEligible(
  subject: RoomRoleEligibilitySubject | null | undefined,
): boolean {
  const jobTitle = subject?.jobTitle?.toLowerCase() ?? "";
  return ROOM_MANAGER_JOB_TITLE_MARKERS.some((marker) => jobTitle.includes(marker));
}

export const ROOM_SUPERVISOR_ELIGIBILITY_MESSAGE =
  "Room supervisor must have an eligible Investigator designation";

export const ROOM_MANAGER_ELIGIBILITY_MESSAGE =
  "Room manager must be a scientist with Management, Staff, Post-doctoral, or Research job title";