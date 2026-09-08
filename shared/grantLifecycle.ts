import { grantStatusDefinitions, stageOfGrantStatus } from "./grantStatusRegistry";
import {
  stageImpliesAward,
  stageRequiresAward,
  stageRequiresSchedule,
} from "./grantStatusStages";

export const GRANT_STATUS_OPTIONS = [
  { value: "submitted", label: "Submitted" },
  { value: "pending", label: "Pending" },
  { value: "in_review", label: "In Review" },
  { value: "awarded", label: "Awarded" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  // The funder decided against it. Distinct from Rejected, which this
  // organisation uses for an application refused before it reached a funding
  // decision; both are terminal and neither implies an award.
  { value: "not_awarded", label: "Not Awarded" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  // Post-award endings, all of which the Research Office already records: a
  // grant that was won and then stopped, moved or paused. Every row carrying
  // one in the office's own spreadsheet also carries Awarded = Yes, which is
  // why they require the award rather than implying it.
  { value: "withdrawn", label: "Withdrawn" },
  { value: "terminated", label: "Terminated" },
  { value: "transferred", label: "Transferred" },
  { value: "suspended", label: "Suspended" },
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
  "not_awarded",
  "rejected",
  "cancelled",
  "withdrawn",
  "terminated",
  "transferred",
  "suspended",
];

export type GrantStatus = (typeof GRANT_STATUS_VALUES)[number];

const AWARD_IMPLYING_STATUSES = new Set<GrantStatus>([
  "awarded",
  "active",
  "completed",
]);

/**
 * Statuses that only make sense once money was granted.
 *
 * Cancelled is here but deliberately NOT in AWARD_IMPLYING_STATUSES: moving a
 * grant to Cancelled must not silently flip the award on. It means an awarded
 * project that will not proceed. An application that never won funding is
 * Not Awarded or Rejected, which is the distinction Not Awarded exists to make.
 */
const REQUIRES_AWARD_STATUSES = new Set<GrantStatus>([
  "awarded",
  "active",
  "completed",
  "cancelled",
  "withdrawn",
  "terminated",
  "transferred",
  "suspended",
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
  /** A registry value, not one of thirteen literals. */
  status: string;
  awarded: boolean;
};

export class GrantLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GrantLifecycleError";
  }
}

/**
 * Every rule below asks the same question first: what stage is this status?
 *
 * The sets above are no longer consulted. They named the thirteen built-in
 * statuses, and the office can now add its own -- so the meaning has to come
 * from what the status *declares* rather than from a list of words this file
 * happens to know. See shared/grantStatusRegistry.ts.
 *
 * A status the registry does not recognise resolves to null, and every rule
 * treats that as no: it does not imply an award, does not require dates, and
 * does not cross a section boundary. Refusing to guess is the safe direction
 * for all four.
 */
export function grantStatusImpliesAward(
  status: string | null | undefined,
): boolean {
  const stage = stageOfGrantStatus(status);
  return stage !== null && stageImpliesAward(stage);
}

/** Whether a status is only valid on a grant that was actually awarded. */
export function grantStatusRequiresAward(
  status: string | null | undefined,
): boolean {
  const stage = stageOfGrantStatus(status);
  return stage !== null && stageRequiresAward(stage);
}

export function grantStatusRequiresStartDate(
  status: string | null | undefined,
): boolean {
  const stage = stageOfGrantStatus(status);
  return stage !== null && stageRequiresSchedule(stage);
}

export function grantStatusAllowsProgressTracking(
  status: string | null | undefined,
): boolean {
  const stage = stageOfGrantStatus(status);
  return stage !== null && stageRequiresSchedule(stage);
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

/**
 * Whether the registry knows this status.
 *
 * Was a check against the thirteen hardcoded values, which is what rejected
 * every status the office added -- after the schema had already accepted it.
 */
function isGrantStatus(value: string): boolean {
  return stageOfGrantStatus(value) !== null;
}

const statusKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");



/**
 * The stored status a written one means, comparing letters only.
 *
 * "not awarded", "Not Awarded" and "not_awarded" are one status written three
 * ways. Before this, the office's own spreadsheet was refused 558 times by an
 * error message that listed "Not Awarded" among the values it would accept --
 * because it prints labels and compares values.
 */
export function normalizeGrantStatus(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const written = String(value);
  const key = statusKey(written);
  for (const status of grantStatusDefinitions()) {
    // Both spellings resolve: the stored value and the label people read.
    if (statusKey(status.value) === key || statusKey(status.label) === key) return status.value;
  }
  return null;
}

/** A status''s display name, from the registry. */
function statusLabel(value: string): string {
  return grantStatusDefinitions().find((s) => s.value === value)?.label ?? value;
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
  const rawStatus = input.status ?? current?.status ?? "submitted";
  // Accept the label, the value, or any spacing or case of either.
  const requestedStatus = normalizeGrantStatus(rawStatus) ?? rawStatus;
  if (!requestedStatus || !isGrantStatus(requestedStatus)) {
    throw new GrantLifecycleError(
      `Grant status must be one of: ${grantStatusDefinitions().map((s) => s.label).join(", ")}.`,
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
  } else if (grantStatusRequiresAward(status) && !awarded) {
    throw new GrantLifecycleError(
      `${statusLabel(status)} describes a grant that was awarded. Use Not Awarded if the funder declined, or Rejected if the application was refused.`,
    );
  } else if ((status === "rejected" || status === "not_awarded") && awarded) {
    // Same reasoning as Rejected: an award already made cannot be undone by
    // relabelling the outcome, or the awarded flag and the status would
    // disagree about whether money was granted.
    const label = status === "rejected" ? "Rejected" : "Not Awarded";
    throw new GrantLifecycleError(
      `An awarded grant cannot be marked ${label}. Use Cancelled if an awarded project will not proceed.`,
    );
  } else if (stageOfGrantStatus(status) === "application" && awarded) {
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
      `${statusLabel(status)} grants require a start date.`,
    );
  }

  if (startTime != null && endTime != null && endTime < startTime) {
    throw new GrantLifecycleError(
      "Grant end date cannot be before the start date.",
    );
  }

  return { status, awarded };
}