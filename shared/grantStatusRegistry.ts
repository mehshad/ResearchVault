/**
 * Which statuses exist, and what each one means.
 *
 * The statuses live in a table the office edits, but the rules that read them
 * are called from dozens of places that have a status string and nothing else
 * -- `grantStatusImpliesAward(grant.status)` and its four siblings, on the
 * server and in the browser. Making those functions asynchronous, or making
 * every caller fetch a table first, would have rippled through the whole
 * application to express a lookup that answers in microseconds.
 *
 * So the registry is module state, set once and refreshed when the table
 * changes:
 *
 *   - the server loads it at startup and again after any status is written
 *   - the browser loads it with the rest of the page's data
 *   - both call setGrantStatusRegistry() with what they read
 *
 * Until something does, it holds the thirteen built-in statuses. That default
 * is not a placeholder: it is what the system meant before the table existed,
 * so a process that fails to load the table behaves exactly as it did before
 * rather than treating every grant as unknown.
 */
import {
  GRANT_STATUS_STAGE,
  isGrantStatusStage,
  type GrantStatusStage,
} from "./grantStatusStages";

export interface GrantStatusDefinition {
  /** Stored in grants.status. */
  value: string;
  /** What the dropdown shows. */
  label: string;
  /** What the rules read. */
  stage: GrantStatusStage;
  /** Order in the dropdown. */
  sortOrder: number;
  /**
   * One of the thirteen that ship with the system. They can be relabelled and
   * reordered but not deleted: existing grants hold them, and the lifecycle
   * reconciliation still names some of them when it moves a grant.
   */
  isBuiltIn: boolean;
}

/** The thirteen the system has always had, in the order they were listed. */
export const BUILT_IN_GRANT_STATUSES: readonly GrantStatusDefinition[] = [
  { value: "submitted", label: "Submitted" },
  { value: "pending", label: "Pending" },
  { value: "in_review", label: "In Review" },
  { value: "awarded", label: "Awarded" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "not_awarded", label: "Not Awarded" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "terminated", label: "Terminated" },
  { value: "transferred", label: "Transferred" },
  { value: "suspended", label: "Suspended" },
].map((status, index) => ({
  ...status,
  stage: GRANT_STATUS_STAGE[status.value],
  sortOrder: index,
  isBuiltIn: true,
}));

/**
 * Letters and digits only, for matching a status however it was written.
 *
 * The same normalisation normalizeGrantStatus() uses, and for the same reason:
 * "not awarded", "Not Awarded" and "not_awarded" are one status written three
 * ways, and the office's own spreadsheet was once refused 558 times because
 * something compared values while printing labels. A lookup that only matched
 * the exact stored spelling would reintroduce that on a smaller scale.
 */
const statusKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

let registry: readonly GrantStatusDefinition[] = BUILT_IN_GRANT_STATUSES;
let stageByValue = indexStages(registry);

/** Both the exact value and its normalised key resolve to the same stage. */
function indexStages(statuses: readonly GrantStatusDefinition[]) {
  const index = new Map<string, GrantStatusStage>();
  for (const status of statuses) {
    index.set(status.value, status.stage);
    // Exact values win, so a label that normalises onto another status's value
    // cannot displace it.
    if (!index.has(statusKey(status.value))) index.set(statusKey(status.value), status.stage);
    if (!index.has(statusKey(status.label))) index.set(statusKey(status.label), status.stage);
  }
  return index;
}

/**
 * Replace what the rules know about statuses.
 *
 * Ignores an empty list rather than adopting it. An empty table would mean no
 * status has any meaning, which turns every grant into an unknown and silently
 * strips the award from all of them; a load that returns nothing is far more
 * likely to be a failure than a deliberate state.
 */
export function setGrantStatusRegistry(statuses: readonly GrantStatusDefinition[]): void {
  if (statuses.length === 0) return;
  registry = [...statuses].sort((a, b) => a.sortOrder - b.sortOrder);
  stageByValue = indexStages(registry);
}

/** Back to the built-in thirteen. For tests, and for nothing else. */
export function resetGrantStatusRegistry(): void {
  registry = BUILT_IN_GRANT_STATUSES;
  stageByValue = indexStages(registry);
}

/** Every status, in dropdown order. */
export function grantStatusDefinitions(): readonly GrantStatusDefinition[] {
  return registry;
}

/**
 * The stage a status means, or null when the status is not on the list.
 *
 * Null rather than a guess. A status the registry does not know is a status
 * whose meaning nobody has declared, and the rules below each decide what to do
 * with that -- uniformly, "no": an unknown status does not imply an award, does
 * not require dates, and does not cross a section boundary.
 */
export function stageOfGrantStatus(
  status: string | null | undefined,
): GrantStatusStage | null {
  if (typeof status !== "string") return null;
  const exact = stageByValue.get(status);
  if (isGrantStatusStage(exact)) return exact;
  const loose = stageByValue.get(statusKey(status));
  return isGrantStatusStage(loose) ? loose : null;
}

/** The options a status dropdown should offer. */
export function grantStatusOptions(): Array<{ value: string; label: string }> {
  return registry.map(({ value, label }) => ({ value, label }));
}
