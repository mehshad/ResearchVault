export const IP_VETTING_READY_STATUS = "Complete Draft";
export const IP_VETTED_STATUS = "Vetted for submission";

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