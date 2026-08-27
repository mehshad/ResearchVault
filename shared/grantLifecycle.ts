export const GRANT_STATUS_OPTIONS = [
  { value: "submitted", label: "Submitted" },
  { value: "pending", label: "Pending" },
  { value: "in_review", label: "In Review" },
  { value: "awarded", label: "Awarded" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export const GRANT_STATUS_VALUES = GRANT_STATUS_OPTIONS.map(
  (option) => option.value,
) as [
  "submitted",
  "pending",
  "in_review",
  "awarded",
  "active",
  "completed",
  "rejected",
  "cancelled",
];

export type GrantStatus = (typeof GRANT_STATUS_VALUES)[number];

const AWARD_IMPLYING_STATUSES = new Set<GrantStatus>([
  "awarded",
  "active",
  "completed",
]);

const PRE_AWARD_STATUSES = new Set<GrantStatus>([
  "submitted",
  "pending",
  "in_review",
]);

const START_DATE_REQUIRED_STATUSES = new Set<GrantStatus>([
  "active",
  "completed",
]);

export type GrantLifecycleInput = {
  status?: string | null;
  awarded?: boolean | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
};

export type NormalizedGrantLifecycle = {
  status: GrantStatus;
  awarded: boolean;
};

export class GrantLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GrantLifecycleError";
  }
}

export function grantStatusImpliesAward(
  status: string | null | undefined,
): boolean {
  return AWARD_IMPLYING_STATUSES.has(status as GrantStatus);
}

export function grantStatusRequiresStartDate(
  status: string | null | undefined,
): boolean {
  return START_DATE_REQUIRED_STATUSES.has(status as GrantStatus);
}

export function grantStatusAllowsProgressTracking(
  status: string | null | undefined,
): boolean {
  return START_DATE_REQUIRED_STATUSES.has(status as GrantStatus);
}

export function canGrantSetSchedule(
  grant: Pick<GrantLifecycleInput, "awarded" | "status">,
): boolean {
  return grant.awarded === true || grantStatusImpliesAward(grant.status);
}

export function canGrantLinkSdrs(
  grant: Pick<GrantLifecycleInput, "awarded">,
): boolean {
  return grant.awarded === true;
}

function isGrantStatus(value: string): value is GrantStatus {
  return (GRANT_STATUS_VALUES as readonly string[]).includes(value);
}

function dateValue(value: string | Date | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
}

export function reconcileGrantLifecycle(
  input: GrantLifecycleInput,
  current?: GrantLifecycleInput,
): NormalizedGrantLifecycle {
  const requestedStatus = input.status ?? current?.status ?? "submitted";
  if (!requestedStatus || !isGrantStatus(requestedStatus)) {
    throw new GrantLifecycleError(
      `Grant status must be one of: ${GRANT_STATUS_OPTIONS.map((option) => option.label).join(", ")}.`,
    );
  }

  const explicitlyChangedAward =
    Object.prototype.hasOwnProperty.call(input, "awarded") &&
    input.awarded != null;
  let awarded = explicitlyChangedAward
    ? input.awarded === true
    : current?.awarded === true;
  let status = requestedStatus;

  if (grantStatusImpliesAward(status)) {
    awarded = true;
  } else if (status === "rejected" && awarded) {
    throw new GrantLifecycleError(
      "An awarded grant cannot be marked Rejected. Use Cancelled if an awarded project will not proceed.",
    );
  } else if (PRE_AWARD_STATUSES.has(status) && awarded) {
    const isNewAward =
      !current?.awarded && explicitlyChangedAward && input.awarded === true;
    if (isNewAward) {
      status = "awarded";
    } else {
      throw new GrantLifecycleError(
        "An awarded grant cannot return to a pre-award status unless the award designation is cleared.",
      );
    }
  }

  const startDate = input.startDate !== undefined
    ? input.startDate
    : current?.startDate;
  const endDate = input.endDate !== undefined
    ? input.endDate
    : current?.endDate;
  const startTime = dateValue(startDate);
  const endTime = dateValue(endDate);

  if (grantStatusRequiresStartDate(status) && startTime == null) {
    throw new GrantLifecycleError(
      `${GRANT_STATUS_OPTIONS.find((option) => option.value === status)?.label} grants require a start date.`,
    );
  }

  if (startTime != null && endTime != null && endTime < startTime) {
    throw new GrantLifecycleError(
      "Grant end date cannot be before the start date.",
    );
  }

  return { status, awarded };
}