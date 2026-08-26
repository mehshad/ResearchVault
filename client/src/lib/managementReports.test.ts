import assert from "node:assert/strict";
import test from "node:test";
import {
  buildManagementReportRequest,
  filenameFromDisposition,
  type ManagementReportConfig,
} from "./managementReports";

const config: ManagementReportConfig = {
  targetType: "staff",
  targetId: 12,
  domains: ["publications", "overview"],
  lookbackYears: 5,
  activeSdrOnly: true,
  awardedGrantsOnly: false,
  publicationStatuses: ["Published", "Published"],
  contractStatuses: [],
  patentStatuses: ["Granted"],
};

test("report request validates and canonicalizes selections", () => {
  assert.deepEqual(buildManagementReportRequest(config), {
    ...config,
    targetId: 12,
    domains: ["overview", "publications"],
    publicationStatuses: ["Published"],
  });
});

test("report request requires a target and a domain", () => {
  assert.throws(
    () => buildManagementReportRequest({ ...config, targetId: null }),
    /Select a staff/,
  );
  assert.throws(
    () => buildManagementReportRequest({ ...config, domains: [] }),
    /at least one/,
  );
});

test("PDF filename supports encoded and quoted dispositions safely", () => {
  assert.equal(
    filenameFromDisposition("attachment; filename*=UTF-8''Section%20Report.pdf"),
    "Section Report.pdf",
  );
  assert.equal(
    filenameFromDisposition('attachment; filename="staff/report.pdf"'),
    "staff-report.pdf",
  );
});