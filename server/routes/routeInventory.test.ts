/**
 * Every domain moved out of server/routes.ts (#42) registers exactly the routes
 * it took with it, and routes.ts no longer registers any of them.
 *
 * A mechanical move of thousands of lines is the kind of change that loses a
 * route or leaves one registered twice without any test noticing, because
 * every handler still exists. This pins the inventory. When a route is
 * deliberately added or removed, update the list here in the same commit.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";

import { registerIbcRoutes } from "./ibcRoutes";
import { registerResearchContractRoutes } from "./researchContractRoutes";
import { registerOrganisationRoutes } from "./organisationRoutes";
import { registerJournalImpactFactorRoutes } from "./journalImpactFactorRoutes";
import { registerCertificateOcrRoutes } from "./certificateOcrRoutes";
import { registerGrantRoutes } from "./grantRoutes";
import { registerSdrImportRoutes } from "./sdrImportRoutes";
import { registerCertificationRoutes } from "./certificationRoutes";
import { registerSettingsRoutes } from "./settingsRoutes";
import { registerPmoApplicationRoutes } from "./pmoApplicationRoutes";
import { registerAdminUserRoutes } from "./adminUserRoutes";
import { registerAccessRoutes } from "./accessRoutes";
import { registerBulkDataRoutes } from "./bulkDataRoutes";
import { registerAuditLogRoutes } from "./auditLogRoutes";

/** [method, path] for every route a register function mounts, in order. */
function registered(register: (app: express.Express) => void): Array<[string, string]> {
  const app = express();
  register(app);
  const stack: any[] = (app as any)._router?.stack ?? [];
  const out: Array<[string, string]> = [];
  for (const layer of stack) {
    if (!layer.route) continue;
    for (const method of Object.keys(layer.route.methods)) out.push([method, layer.route.path]);
  }
  return out;
}

test("registerIbcRoutes registers exactly its 36 routes", () => {
  assert.deepEqual(registered(registerIbcRoutes), [
    ["get", "/api/ibc-applications"],
    ["get", "/api/ibc-applications/:id"],
    ["post", "/api/ibc-applications"],
    ["patch", "/api/ibc-applications/:id"],
    ["delete", "/api/ibc-applications/:id"],
    ["get", "/api/ibc-applications/:id/research-activities"],
    ["get", "/api/ibc-applications/:id/personnel"],
    ["post", "/api/ibc-applications/:id/research-activities"],
    ["delete", "/api/ibc-applications/:id/research-activities/:activityId"],
    ["post", "/api/ibc-applications/:id/reviewer-feedback"],
    ["get", "/api/ibc-applications/:id/comments"],
    ["post", "/api/ibc-applications/:id/pi-comment"],
    ["get", "/api/ibc-applications/:id/rooms"],
    ["post", "/api/ibc-applications/:id/rooms"],
    ["delete", "/api/ibc-applications/:id/rooms/:roomId"],
    ["get", "/api/ibc-applications/:id/backbone-source-rooms"],
    ["post", "/api/ibc-applications/:id/backbone-source-rooms"],
    ["delete", "/api/ibc-applications/:id/backbone-source-rooms/:backboneSource/:roomId"],
    ["get", "/api/ibc-applications/:id/ppe"],
    ["post", "/api/ibc-applications/:id/ppe"],
    ["delete", "/api/ibc-applications/:id/ppe/:roomId/:ppeItem"],
    ["get", "/api/ibc-board-members"],
    ["get", "/api/ibc-board-members/:id"],
    ["post", "/api/ibc-board-members"],
    ["patch", "/api/ibc-board-members/:id"],
    ["delete", "/api/ibc-board-members/:id"],
    ["get", "/api/ibc-submissions"],
    ["get", "/api/ibc-submissions/:id"],
    ["post", "/api/ibc-submissions"],
    ["patch", "/api/ibc-submissions/:id"],
    ["delete", "/api/ibc-submissions/:id"],
    ["get", "/api/ibc-documents"],
    ["get", "/api/ibc-documents/:id"],
    ["post", "/api/ibc-documents"],
    ["patch", "/api/ibc-documents/:id"],
    ["delete", "/api/ibc-documents/:id"],
  ]);
});
test("registerResearchContractRoutes registers exactly its 20 routes", () => {
  assert.deepEqual(registered(registerResearchContractRoutes), [
    ["get", "/api/research-contracts"],
    ["get", "/api/research-contracts/:id"],
    ["post", "/api/research-contracts"],
    ["patch", "/api/research-contracts/:id"],
    ["delete", "/api/research-contracts/:id"],
    ["get", "/api/research-contracts/:contractId/scope-items"],
    ["post", "/api/research-contracts/:contractId/scope-items"],
    ["patch", "/api/research-contracts/scope-items/:id"],
    ["delete", "/api/research-contracts/scope-items/:id"],
    ["get", "/api/research-contracts/:contractId/extensions"],
    ["post", "/api/research-contracts/:contractId/extensions"],
    ["patch", "/api/research-contracts/extensions/:id"],
    ["delete", "/api/research-contracts/extensions/:id"],
    ["get", "/api/research-contracts/:contractId/documents"],
    ["get", "/api/research-contracts/extensions/:extensionId/documents"],
    ["post", "/api/research-contracts/:contractId/documents"],
    ["post", "/api/research-contracts/extensions/:extensionId/documents"],
    ["patch", "/api/research-contracts/documents/:id"],
    ["delete", "/api/research-contracts/documents/:id"],
    ["get", "/api/research-activities/:id/contracts"],
  ]);
});
test("registerOrganisationRoutes registers exactly its 23 routes", () => {
  assert.deepEqual(registered(registerOrganisationRoutes), [
    ["get", "/api/branches"],
    ["post", "/api/branches"],
    ["patch", "/api/branches/:id"],
    ["delete", "/api/branches/:id"],
    ["get", "/api/departments"],
    ["post", "/api/departments"],
    ["patch", "/api/departments/:id"],
    ["delete", "/api/departments/:id"],
    ["get", "/api/sections"],
    ["post", "/api/sections"],
    ["patch", "/api/sections/:id"],
    ["delete", "/api/sections/:id"],
    ["get", "/api/buildings"],
    ["get", "/api/buildings/:id"],
    ["post", "/api/buildings"],
    ["patch", "/api/buildings/:id"],
    ["delete", "/api/buildings/:id"],
    ["get", "/api/rooms"],
    ["get", "/api/rooms/:id"],
    ["post", "/api/rooms"],
    ["patch", "/api/rooms/:id"],
    ["delete", "/api/rooms/:id"],
    ["get", "/api/buildings/:id/rooms"],
  ]);
});
test("registerJournalImpactFactorRoutes registers exactly its 15 routes", () => {
  // /summary is mounted by registerImpactFactorSummaryRoutes from inside the
  // module and must stay ahead of /:id.
  assert.deepEqual(registered(registerJournalImpactFactorRoutes), [
    ["get", "/api/journal-impact-factors"],
    ["get", "/api/journal-impact-factors/years"],
    ["get", "/api/journal-impact-factors/export"],
    ["get", "/api/journal-impact-factors/fields"],
    ["get", "/api/journal-impact-factors/summary"],
    ["get", "/api/journal-impact-factors/:id"],
    ["get", "/api/journal-impact-factors/:id/history"],
    ["get", "/api/journal-impact-factors/:id/field-distribution"],
    ["patch", "/api/journal-impact-factors/:id/field"],
    ["get", "/api/journal-impact-factors/journal/:journalName/year/:year"],
    ["get", "/api/journal-impact-factors/historical/:journalName"],
    ["post", "/api/journal-impact-factors"],
    ["post", "/api/journal-impact-factors/import-csv"],
    ["patch", "/api/journal-impact-factors/:id"],
    ["delete", "/api/journal-impact-factors/:id"],
  ]);
});
test("registerCertificateOcrRoutes registers exactly its 3 routes", () => {
  assert.deepEqual(registered(registerCertificateOcrRoutes), [
    ["post", "/api/certificates/process-batch"],
    ["post", "/api/certificates/test-parse"],
    ["post", "/api/certificates/confirm-batch"],
  ]);
});
test("registerGrantRoutes registers exactly its 20 routes", () => {
  assert.deepEqual(registered(registerGrantRoutes), [
    ["get", "/api/grants/:id"],
    ["post", "/api/grants"],
    ["put", "/api/grants/:id"],
    ["delete", "/api/grants/:id"],
    ["get", "/api/grants/export/csv"],
    ["get", "/api/grants/import/template"],
    ["post", "/api/grants/import/preview"],
    ["post", "/api/grants/import/missing-staff"],
    ["post", "/api/grants/import/apply"],
    ["get", "/api/grants/cleanup/incomplete"],
    ["delete", "/api/grants/cleanup/incomplete"],
    ["get", "/api/grants/:id/research-activities"],
    ["post", "/api/grants/:grantId/research-activities/:researchActivityId"],
    ["delete", "/api/grants/:grantId/research-activities/:researchActivityId"],
    ["get", "/api/research-activities/:id/grants"],
    ["get", "/api/research-activities/:id/ibc-applications"],
    ["get", "/api/grants/:id/progress-reports"],
    ["post", "/api/grants/:id/progress-reports"],
    ["put", "/api/grant-progress-reports/:id"],
    ["delete", "/api/grant-progress-reports/:id"],
  ]);
});
test("registerSdrImportRoutes registers exactly its 3 routes", () => {
  assert.deepEqual(registered(registerSdrImportRoutes), [
    ["get", "/api/research-activities/import/template"],
    ["post", "/api/research-activities/import/preview"],
    ["post", "/api/research-activities/import/apply"],
  ]);
});
test("registerCertificationRoutes registers exactly its 13 routes", () => {
  assert.deepEqual(registered(registerCertificationRoutes), [
    ["get", "/api/certification-modules"],
    ["post", "/api/certification-modules"],
    ["put", "/api/certification-modules/:id"],
    ["delete", "/api/certification-modules/:id"],
    ["get", "/api/certifications"],
    ["get", "/api/certifications/matrix"],
    ["get", "/api/certifications/scientist/:scientistId"],
    ["post", "/api/certifications"],
    ["put", "/api/certifications/:id"],
    ["delete", "/api/certifications/:id"],
    ["get", "/api/certification-config"],
    ["post", "/api/certification-config"],
    ["put", "/api/certification-config/:id"],
  ]);
});
test("registerSettingsRoutes registers exactly its 12 routes", () => {
  assert.deepEqual(registered(registerSettingsRoutes), [
    ["get", "/api/system-configurations"],
    ["get", "/api/system-configurations/:key"],
    ["post", "/api/system-configurations"],
    ["put", "/api/system-configurations/:key"],
    ["delete", "/api/system-configurations/:key"],
    ["get", "/api/pdf-import-history"],
    ["get", "/api/pdf-import-history/:id"],
    ["get", "/api/feature-requests"],
    ["get", "/api/feature-requests/:id"],
    ["post", "/api/feature-requests"],
    ["put", "/api/feature-requests/:id"],
    ["delete", "/api/feature-requests/:id"],
  ]);
});
test("registerPmoApplicationRoutes registers exactly its 17 routes", () => {
  assert.deepEqual(registered(registerPmoApplicationRoutes), [
    ["get", "/api/pmo-applications"],
    ["get", "/api/pmo-applications/:id"],
    ["post", "/api/pmo-applications"],
    ["post", "/api/ra200-applications"],
    ["post", "/api/ra205a-applications"],
    ["get", "/api/ra200-applications/:id"],
    ["put", "/api/ra200-applications/:id"],
    ["get", "/api/ra205a-applications/:id"],
    ["put", "/api/ra205a-applications/:id"],
    ["put", "/api/pmo-applications/:id"],
    ["delete", "/api/pmo-applications/:id"],
    ["get", "/api/team-members"],
    ["get", "/api/team-members/category/:category"],
    ["get", "/api/team-members/:id"],
    ["post", "/api/team-members"],
    ["put", "/api/team-members/:id"],
    ["delete", "/api/team-members/:id"],
  ]);
});
test("registerAdminUserRoutes registers exactly its 6 routes", () => {
  assert.deepEqual(registered(registerAdminUserRoutes), [
    ["get", "/api/admin/users"],
    ["get", "/api/admin/roles"],
    ["put", "/api/admin/users/:id/secondary-roles"],
    ["patch", "/api/admin/users/:id/role"],
    ["post", "/api/admin/users/provision-by-job-title"],
    ["post", "/api/register"],
  ]);
});
test("registerAccessRoutes registers exactly its 5 routes", () => {
  assert.deepEqual(registered(registerAccessRoutes), [
    ["get", "/api/access-check"],
    ["get", "/api/ownership-overrides"],
    ["get", "/api/ownership-overrides/:module"],
    ["put", "/api/ownership-overrides"],
    ["delete", "/api/ownership-overrides/:id"],
  ]);
});
test("registerBulkDataRoutes registers exactly its 9 routes", () => {
  assert.deepEqual(registered(registerBulkDataRoutes), [
    ["get", "/api/bulk-data/export-all"],
    ["get", "/api/bulk-data/archives"],
    ["post", "/api/bulk-data/archives"],
    ["get", "/api/bulk-data/archives/:id/download"],
    ["get", "/api/bulk-data/sections"],
    ["get", "/api/bulk-data/:sectionId/export"],
    ["get", "/api/bulk-data/:sectionId/template"],
    ["post", "/api/bulk-data/:sectionId/preview"],
    ["post", "/api/bulk-data/:sectionId/apply"],
  ]);
});
test("registerAuditLogRoutes registers exactly its 2 routes", () => {
  assert.deepEqual(registered(registerAuditLogRoutes), [
    ["get", "/api/audit-log"],
    ["get", "/api/audit-log/:table/:recordId"],
  ]);
});

test("server/routes.ts no longer registers any route that moved", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, "..", "routes.ts"), "utf-8");
  const moved = [
  "/api/access-check",
  "/api/admin/roles",
  "/api/admin/users",
  "/api/admin/users/:id/role",
  "/api/admin/users/:id/secondary-roles",
  "/api/admin/users/provision-by-job-title",
  "/api/audit-log",
  "/api/audit-log/:table/:recordId",
  "/api/branches",
  "/api/branches/:id",
  "/api/buildings",
  "/api/buildings/:id",
  "/api/buildings/:id/rooms",
  "/api/bulk-data/:sectionId/apply",
  "/api/bulk-data/:sectionId/export",
  "/api/bulk-data/:sectionId/preview",
  "/api/bulk-data/:sectionId/template",
  "/api/bulk-data/archives",
  "/api/bulk-data/archives/:id/download",
  "/api/bulk-data/export-all",
  "/api/bulk-data/sections",
  "/api/certificates/confirm-batch",
  "/api/certificates/process-batch",
  "/api/certificates/test-parse",
  "/api/certification-config",
  "/api/certification-config/:id",
  "/api/certification-modules",
  "/api/certification-modules/:id",
  "/api/certifications",
  "/api/certifications/:id",
  "/api/certifications/matrix",
  "/api/certifications/scientist/:scientistId",
  "/api/departments",
  "/api/departments/:id",
  "/api/feature-requests",
  "/api/feature-requests/:id",
  "/api/grant-progress-reports/:id",
  "/api/grants",
  "/api/grants/:grantId/research-activities/:researchActivityId",
  "/api/grants/:id",
  "/api/grants/:id/progress-reports",
  "/api/grants/:id/research-activities",
  "/api/grants/cleanup/incomplete",
  "/api/grants/export/csv",
  "/api/grants/import/apply",
  "/api/grants/import/missing-staff",
  "/api/grants/import/preview",
  "/api/grants/import/template",
  "/api/ibc-applications",
  "/api/ibc-applications/:id",
  "/api/ibc-applications/:id/backbone-source-rooms",
  "/api/ibc-applications/:id/backbone-source-rooms/:backboneSource/:roomId",
  "/api/ibc-applications/:id/comments",
  "/api/ibc-applications/:id/personnel",
  "/api/ibc-applications/:id/pi-comment",
  "/api/ibc-applications/:id/ppe",
  "/api/ibc-applications/:id/ppe/:roomId/:ppeItem",
  "/api/ibc-applications/:id/research-activities",
  "/api/ibc-applications/:id/research-activities/:activityId",
  "/api/ibc-applications/:id/reviewer-feedback",
  "/api/ibc-applications/:id/rooms",
  "/api/ibc-applications/:id/rooms/:roomId",
  "/api/ibc-board-members",
  "/api/ibc-board-members/:id",
  "/api/ibc-documents",
  "/api/ibc-documents/:id",
  "/api/ibc-submissions",
  "/api/ibc-submissions/:id",
  "/api/journal-impact-factors",
  "/api/journal-impact-factors/:id",
  "/api/journal-impact-factors/:id/field",
  "/api/journal-impact-factors/:id/field-distribution",
  "/api/journal-impact-factors/:id/history",
  "/api/journal-impact-factors/export",
  "/api/journal-impact-factors/fields",
  "/api/journal-impact-factors/historical/:journalName",
  "/api/journal-impact-factors/import-csv",
  "/api/journal-impact-factors/journal/:journalName/year/:year",
  "/api/journal-impact-factors/summary",
  "/api/journal-impact-factors/years",
  "/api/ownership-overrides",
  "/api/ownership-overrides/:id",
  "/api/ownership-overrides/:module",
  "/api/pdf-import-history",
  "/api/pdf-import-history/:id",
  "/api/pmo-applications",
  "/api/pmo-applications/:id",
  "/api/ra200-applications",
  "/api/ra205a-applications",
  "/api/register",
  "/api/research-activities/:id/contracts",
  "/api/research-activities/:id/grants",
  "/api/research-activities/:id/ibc-applications",
  "/api/research-activities/import/apply",
  "/api/research-activities/import/preview",
  "/api/research-activities/import/template",
  "/api/research-contracts",
  "/api/research-contracts/:contractId/documents",
  "/api/research-contracts/:contractId/extensions",
  "/api/research-contracts/:contractId/scope-items",
  "/api/research-contracts/:id",
  "/api/research-contracts/documents/:id",
  "/api/research-contracts/extensions/:extensionId/documents",
  "/api/research-contracts/extensions/:id",
  "/api/research-contracts/scope-items/:id",
  "/api/rooms",
  "/api/rooms/:id",
  "/api/sections",
  "/api/sections/:id",
  "/api/system-configurations",
  "/api/system-configurations/:key",
  "/api/team-members",
  "/api/team-members/:id",
  "/api/team-members/category/:category",
  ];
  for (const path of moved) {
    const re = new RegExp(String.raw`app\.(get|post|put|patch|delete)\(\s*['"]` + path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + `['"]`);
    assert.ok(!re.test(source), `${path} is still registered in routes.ts as well as in its module`);
  }
});
