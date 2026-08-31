export const IP_VETTING_READY_STATUS = "Complete Draft";
export const IP_VETTED_STATUS = "Vetted for submission";
export const PUBLISHED_STATUS = "Published";
export const PUBLISHED_INVALID_STATUS = "Published - Invalid";
export const PUBLISHED_FINAL_STATUS = "Published *";
export const WITHDRAWN_STATUS = "Withdrawn";
export const PUBLISHED_INVALID_LABEL = "Published - Invalid";
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

/**
 * A publication normally links to a Scientific Data Record. The exception is
 * work done for a collaborator at another institution: the scientist is an
 * author, but there is no research activity here to link.
 *
 * The reason replaces the link rather than excusing its absence, so it is
 * required and bounded exactly like the invalid-publication reason.
 */
export const SDR_EXEMPTION_REASON_MAX_LENGTH = 2000;

export function validateSdrExemptionReason(reason: unknown):
  | { ok: true; reason: string }
  | { ok: false; message: string } {
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return {
      ok: false,
      message: "Explain why no SDR applies to this publication.",
    };
  }
  const trimmed = reason.trim();
  if (trimmed.length > SDR_EXEMPTION_REASON_MAX_LENGTH) {
    return {
      ok: false,
      message: `The explanation must be ${SDR_EXEMPTION_REASON_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, reason: trimmed };
}

type SdrLinkable = {
  researchActivityId?: number | null;
  sdrExemptionReason?: string | null;
};

/**
 * True when a publication accounts for its research activity — either by
 * linking one, or by explaining why none applies.
 *
 * The single place that answers "does this publication satisfy the SDR
 * requirement". The office list, the finalize gate and the forms all ask it, so
 * they cannot drift into disagreeing about what counts.
 */
export function hasSdrOrExemption(publication: SdrLinkable): boolean {
  return (
    publication.researchActivityId != null ||
    (publication.sdrExemptionReason?.trim().length ?? 0) > 0
  );
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

/**
 * The publication workflow as staff refer to it ("state 7", "published with a
 * star"). Stage numbers were previously written out by hand in the create and
 * edit pages; they live here so every surface counts and labels them the same.
 *
 * `statuses` lists every stored status that maps to the stage — stage 4 covers
 * both submission variants.
 */
export interface PublicationWorkflowStage {
  stage: number;
  label: string;
  statuses: string[];
  /** Terminal sealed stage: reached via finalize, left only by an office revert. */
  sealed?: boolean;
}

export const PUBLICATION_WORKFLOW_STAGES: PublicationWorkflowStage[] = [
  { stage: 1, label: "Concept", statuses: ["Concept"] },
  { stage: 2, label: "Complete Draft", statuses: [IP_VETTING_READY_STATUS] },
  { stage: 3, label: "Vetted for submission", statuses: [IP_VETTED_STATUS] },
  {
    stage: 4,
    label: "Submitted for review",
    statuses: [
      "Submitted for review with pre-publication",
      "Submitted for review without pre-publication",
    ],
  },
  { stage: 5, label: "Under review", statuses: ["Under review"] },
  { stage: 6, label: "Accepted/In Press", statuses: ["Accepted/In Press"] },
  { stage: 7, label: "Published", statuses: [PUBLISHED_STATUS] },
  { stage: 8, label: "Published *", statuses: [PUBLISHED_FINAL_STATUS], sealed: true },
];

/**
 * States that sit outside the linear progression. They are reachable from
 * several stages and are shown apart from the flow rather than inside it.
 */
export const PUBLICATION_OFF_FLOW_STATES: Array<{ label: string; statuses: string[] }> = [
  { label: PUBLISHED_INVALID_LABEL, statuses: [PUBLISHED_INVALID_STATUS] },
  { label: "Rejected", statuses: ["Rejected"] },
  { label: "Withdrawn", statuses: [WITHDRAWN_STATUS] },
];

/** Stage number for a stored status, or undefined when it sits off the flow. */
export function publicationStageOf(status: string | null | undefined): number | undefined {
  if (!status) return undefined;
  const normalized = status.trim().toLowerCase();
  return PUBLICATION_WORKFLOW_STAGES.find((stage) =>
    stage.statuses.some((value) => value.toLowerCase() === normalized),
  )?.stage;
}
