export type OfficeDashboardKind = "pmo" | "research" | "outcome";

export type DashboardBucket = {
  period: string;
  total: number;
  byCategory: Record<string, number>;
};

export type DashboardWorkflowLink = {
  href: string;
  label: string;
};

/**
 * Converts API bucket data into the flat shape expected by Recharts. Categories
 * that are absent from a sparse bucket intentionally remain absent; the API is
 * responsible for supplying its complete period/category matrix.
 */
export function flattenDashboardBuckets(
  buckets: DashboardBucket[],
): Array<Record<string, string | number>> {
  return buckets.map((bucket) => ({
    period: bucket.period,
    total: bucket.total,
    ...bucket.byCategory,
  }));
}

export const dashboardWorkflowLinks: Record<
  OfficeDashboardKind,
  DashboardWorkflowLink[]
> = {
  pmo: [
    { href: "/pmo/office?status=submitted", label: "Review intake" },
    { href: "/pmo/office?status=under_review", label: "Open review queue" },
  ],
  research: [
    { href: "/grants", label: "Open grants" },
    { href: "/contracts", label: "Open contracts" },
  ],
  outcome: [
    { href: "/outcome-office?tab=ip-vetting", label: "IP vetting" },
    { href: "/outcome-office?tab=new-publications", label: "New publications" },
  ],
};