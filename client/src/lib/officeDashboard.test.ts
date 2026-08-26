import assert from "node:assert/strict";
import test from "node:test";

import {
  dashboardWorkflowLinks,
  flattenDashboardBuckets,
} from "./officeDashboard";

test("flattens sparse dashboard category buckets without losing period totals", () => {
  const rows = flattenDashboardBuckets([
    {
      period: "2024-01",
      total: 2,
      byCategory: { submitted: 2 },
    },
    {
      period: "2024-02",
      total: 1,
      byCategory: { awarded: 1 },
    },
  ]);

  assert.deepEqual(rows, [
    { period: "2024-01", total: 2, submitted: 2 },
    { period: "2024-02", total: 1, awarded: 1 },
  ]);
});

test("maps every office dashboard to its workflow drill-down routes", () => {
  assert.deepEqual(dashboardWorkflowLinks, {
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
  });
});