export type GrantSdrCandidate = {
  id: number;
  sdrNumber?: string | null;
  budgetHolderId?: number | null;
};

export function isGrantSdrEligible(
  grantLpiId: number | null | undefined,
  sdrBudgetHolderId: number | null | undefined,
): boolean {
  return grantLpiId != null && sdrBudgetHolderId === grantLpiId;
}

export function getGrantSdrCandidates<T extends GrantSdrCandidate>(
  activities: readonly T[],
  grantLpiId: number | null | undefined,
  linkedIds: readonly number[],
): T[] {
  const linked = new Set(linkedIds);
  return activities
    .filter((activity) =>
      isGrantSdrEligible(grantLpiId, activity.budgetHolderId) || linked.has(activity.id),
    )
    .sort((left, right) =>
      (left.sdrNumber ?? "").localeCompare(
        right.sdrNumber ?? "",
        undefined,
        { numeric: true, sensitivity: "base" },
      ),
    );
}