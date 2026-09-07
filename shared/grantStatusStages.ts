/**
 * What a grant status *means*, as distinct from what it is called.
 *
 * The office wanted its own vocabulary in the status dropdown -- "LoI
 * Submitted", "Award Pending - Vetted", "IRP RO Vetted" and the rest of the
 * funder's pipeline -- and to be able to add to it. The obstacle was that
 * status strings were load-bearing: five lifecycle rules, two database CHECK
 * constraints and the cross-section visibility boundary all branched on the
 * exact words "awarded", "active" and "completed". A status somebody invented
 * would have been rejected by the database, and if it had not been, nothing
 * could have said whether it meant the money had been won.
 *
 * So a status now declares a **stage**, and the rules read the stage. The
 * office owns the words; the system owns what they imply. Adding "Award Pending
 * - Vetted" is a matter of saying which of five things it is.
 *
 * The five stages are not a taxonomy invented here. They are exactly the
 * distinct combinations the old rules already made among the thirteen built-in
 * statuses -- see GRANT_STATUS_STAGE below, which reproduces the previous
 * behaviour row for row.
 */

export const GRANT_STATUS_STAGES = [
  "application",
  "refused",
  "awarded",
  "scheduled",
  "ended",
] as const;

export type GrantStatusStage = (typeof GRANT_STATUS_STAGES)[number];

/** What each stage means, for the screen that asks an administrator to pick one. */
export const GRANT_STATUS_STAGE_DESCRIPTIONS: Record<GrantStatusStage, string> = {
  application:
    "In flight. The application exists and no decision has been made. No award, no dates, and not visible to other sections.",
  refused:
    "Decided against. The application never won funding. Treated like an application for every rule, and kept inside the section that submitted it.",
  awarded:
    "Won, but the work has no dates yet. Marks the grant as awarded, opens SDR linking, and is visible to other sections.",
  scheduled:
    "Won and dated. Everything Awarded allows, and the grant additionally requires a start date and can carry progress reports.",
  ended:
    "Was won, then stopped, moved or paused. Only valid on a grant that was actually awarded, but does not by itself mark one as awarded, and is not shown to other sections.",
};

/**
 * Whether reaching this stage means the money was won.
 *
 * `ended` is deliberately absent. Moving a grant to Terminated must not
 * silently flip the award on: it means an awarded project that stopped, and an
 * application that never won is `refused`. That distinction is the whole reason
 * Not Awarded exists as a separate status from Cancelled.
 */
export function stageImpliesAward(stage: GrantStatusStage): boolean {
  return stage === "awarded" || stage === "scheduled";
}

/** Whether this stage is only valid on a grant that was actually awarded. */
export function stageRequiresAward(stage: GrantStatusStage): boolean {
  return stageImpliesAward(stage) || stage === "ended";
}

/**
 * Whether the work has dates.
 *
 * The same answer serves two questions the old code asked separately with the
 * same set: whether a start date is required, and whether progress reports can
 * be recorded. They were never actually different questions.
 */
export function stageRequiresSchedule(stage: GrantStatusStage): boolean {
  return stage === "scheduled";
}

/**
 * Whether a grant at this stage crosses a section boundary.
 *
 * Good standing only -- won, running or finished. Another section's
 * applications, refusals and bad endings stay theirs. See
 * shared/researchPortfolioScope.ts, which used to hold this as a list of three
 * status strings and now asks the stage instead.
 */
export function stageVisibleOutsideSection(stage: GrantStatusStage): boolean {
  return stageImpliesAward(stage);
}

/**
 * The stage of each status that ships with the system.
 *
 * Reproduces the previous behaviour exactly. Every one of these was derived by
 * reading which of the four old sets each status belonged to:
 *
 *   AWARD_IMPLYING     awarded, active, completed
 *   REQUIRES_AWARD     those three, plus cancelled, withdrawn, terminated,
 *                      transferred, suspended
 *   START_DATE/REPORTS active, completed
 *   VISIBLE OUTSIDE    awarded, active, completed
 *
 * A test asserts this table still produces the old answers for all thirteen,
 * so the migration cannot quietly change what an existing grant means.
 */
export const GRANT_STATUS_STAGE: Record<string, GrantStatusStage> = {
  submitted: "application",
  pending: "application",
  in_review: "application",
  not_awarded: "refused",
  rejected: "refused",
  awarded: "awarded",
  active: "scheduled",
  completed: "scheduled",
  cancelled: "ended",
  withdrawn: "ended",
  terminated: "ended",
  transferred: "ended",
  suspended: "ended",
};

/** True when `value` is one of the five stages. */
export function isGrantStatusStage(value: unknown): value is GrantStatusStage {
  return (
    typeof value === "string" &&
    (GRANT_STATUS_STAGES as readonly string[]).includes(value)
  );
}
