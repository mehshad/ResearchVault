/**
 * The answer a delete route gives when other rows still point at the record.
 *
 * Four routes refuse a delete this way -- staff profiles, programs, projects
 * and SDRs -- and none of the referencing columns carries a foreign key, so
 * without the check Postgres would let the parent go and leave the children
 * pointing at nothing: a deleted SDR used to orphan its team rows,
 * publications and grant links silently (finding #6). The shape is the one
 * the staff-profile route already returned, so the client's handling of a
 * 409 "blocked" is the same for all four.
 */
export interface DeleteBlocker {
  table: string;
  column: string;
  count: number;
  sampleIds?: number[];
}

export interface DeleteRefusal {
  message: string;
  /** Rows per table, summed across columns of that table. */
  blockedBy: Record<string, number>;
  details: DeleteBlocker[];
}

export function deleteRefusal(blockers: DeleteBlocker[]): DeleteRefusal {
  const blockedBy: Record<string, number> = {};
  let total = 0;
  for (const blocker of blockers) {
    blockedBy[blocker.table] = (blockedBy[blocker.table] ?? 0) + blocker.count;
    total += blocker.count;
  }
  const tables = Object.keys(blockedBy).length;
  return {
    message:
      `Cannot delete: referenced by ${total} record${total === 1 ? "" : "s"} ` +
      `across ${tables} table${tables === 1 ? "" : "s"} (${Object.keys(blockedBy).join(", ")}). ` +
      `Remove or reassign those first.`,
    blockedBy,
    details: blockers,
  };
}
