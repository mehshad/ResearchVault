export const IP_VETTING_READY_STATUS = "Complete Draft";
export const IP_VETTED_STATUS = "Vetted for submission";
export const PUBLISHED_STATUS = "Published";
export const PUBLISHED_INVALID_STATUS = "Published - Invalid";
export const PUBLISHED_FINAL_STATUS = "Published *";
export const WITHDRAWN_STATUS = "Withdrawn";
export const PUBLISHED_INVALID_LABEL = "7. Published - Invalid";
export const INVALID_REASON_MAX_LENGTH = 2000;

export function validateInvalidPublicationReason(reason: unknown):
  | { ok: true; reason: string }
  | { ok: false; message: string } {
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return { ok: false, message: "A reason is required to mark a publication invalid." };
  }
  const trimmed = reason.trim();
  if (trimmed.length > INVALID_REASON_MAX_LENGTH) {
    return {
      ok: false,
      message: `Reason must be ${INVALID_REASON_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, reason: trimmed };
}

type IpVettingPublication = {
  status?: string | null;
  vettedForSubmissionByIpOffice?: boolean | null;
};

export function isReadyForIpVetting(
  publication: IpVettingPublication
): boolean {
  return (
    publication.vettedForSubmissionByIpOffice !== true &&
    publication.status?.trim().toLowerCase() ===
      IP_VETTING_READY_STATUS.toLowerCase()
  );
}

export function approvePublicationForIp<T extends IpVettingPublication>(
  publication: T
): T & {
  status: typeof IP_VETTED_STATUS;
  vettedForSubmissionByIpOffice: true;
} {
  if (!isReadyForIpVetting(publication)) {
    throw new Error(
      `Only unvetted publications at the ${IP_VETTING_READY_STATUS} stage can be vetted for submission.`
    );
  }

  return {
    ...publication,
    status: IP_VETTED_STATUS,
    vettedForSubmissionByIpOffice: true,
  };
}