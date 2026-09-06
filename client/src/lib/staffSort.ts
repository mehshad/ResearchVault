/**
 * Choosing a sort on the staff directory.
 *
 * The directory offers two ways to sort — a "Sort by" dropdown and the column
 * headers — and they used to decide the direction separately. The headers set
 * one when they changed field; the dropdown set only the field, leaving
 * whatever direction the previous sort had used. Since Active SDRs opens
 * descending on purpose (busiest first), sorting by it and then picking Name
 * from the dropdown listed the whole directory Z to A under a control reading
 * "Sort by: Name".
 *
 * So the decision lives here, once, and both controls call it.
 */

export type SortField = "name" | "department" | "jobTitle" | "activeResearchActivities";
export type SortDirection = "asc" | "desc";

export interface SortState {
  field: SortField;
  direction: SortDirection;
}

/**
 * The direction a field opens on when it is first chosen.
 *
 * Counts open busiest-first: ascending would open on everyone with none, which
 * is not what anybody sorting by a workload count is looking for. Names,
 * departments and job titles open A to Z.
 */
export const DEFAULT_SORT_DIRECTION: Record<SortField, SortDirection> = {
  name: "asc",
  department: "asc",
  jobTitle: "asc",
  activeResearchActivities: "desc",
};

/**
 * The sort that results from choosing `field`.
 *
 * `reverse` is what a column header means by a second click on the column it
 * already sorts. The dropdown passes false: re-picking the entry you are
 * already on should not change anything, and there is a direction button
 * beside it for that.
 *
 * Changing field always sets the direction rather than inheriting it, which is
 * the whole point — an inherited direction is invisible, because the control
 * that would have shown it belongs to the field you just left.
 */
export function nextSort(current: SortState, field: SortField, reverse: boolean): SortState {
  if (current.field !== field) {
    return { field, direction: DEFAULT_SORT_DIRECTION[field] };
  }
  if (!reverse) return current;
  return { field, direction: current.direction === "asc" ? "desc" : "asc" };
}
