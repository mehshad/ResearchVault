/**
 * Every domain moved out of server/routes.ts (#42) registers exactly the routes
 * it took with it, and routes.ts -- now a registrar only -- registers none of them.
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
import { registerDashboardRoutes } from "./dashboardRoutes";
import { registerObjectStorageRoutes } from "./objectStorageRoutes";
import { registerProgramRoutes } from "./programRoutes";
import { registerProjectRoutes } from "./projectRoutes";
import { registerScientistRoutes } from "./scientistRoutes";
import { registerResearchActivityRoutes } from "./researchActivityRoutes";
import { registerDataManagementPlanRoutes } from "./dataManagementPlanRoutes";
import { registerPublicationRoutes } from "./publicationRoutes";
import { registerPublicationDiscoveryRoutes } from "./publicationDiscoveryRoutes";
import { registerPatentRoutes } from "./patentRoutes";
import { registerIrbRoutes } from "./irbRoutes";
import { registerRolePermissionRoutes } from "./rolePermissionRoutes";

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

test("registerDashboardRoutes registers exactly its 5 routes", () => {
  assert.deepEqual(registered(registerDashboardRoutes), [
    ["get", "/api/health/database"],
    ["get", "/api/dashboard/stats"],
    ["get", "/api/dashboard/recent-activity"],
    ["get", "/api/dashboard/recent-projects"],
    ["get", "/api/dashboard/upcoming-deadlines"],
  ]);
});
test("registerObjectStorageRoutes registers exactly its 5 routes", () => {
  assert.deepEqual(registered(registerObjectStorageRoutes), [
    ["post", "/api/objects/upload"],
    ["post", "/api/uploads/finalize"],
    ["post", "/api/uploads/request-url"],
    ["get", "/objects/:objectPath(*)"],
    ["put", "/api/objects/local-upload/:id"],
  ]);
});
test("registerProgramRoutes registers exactly its 6 routes", () => {
  assert.deepEqual(registered(registerProgramRoutes), [
    ["get", "/api/programs"],
    ["get", "/api/programs/:id"],
    ["get", "/api/programs/:id/projects"],
    ["post", "/api/programs"],
    ["patch", "/api/programs/:id"],
    ["delete", "/api/programs/:id"],
  ]);
});
test("registerProjectRoutes registers exactly its 10 routes", () => {
  assert.deepEqual(registered(registerProjectRoutes), [
    ["get", "/api/projects"],
    ["get", "/api/projects/:id"],
    ["post", "/api/projects"],
    ["patch", "/api/projects/:id"],
    ["delete", "/api/projects/:id"],
    ["get", "/api/projects/:id/research-activities"],
    ["get", "/api/projects/:id/members"],
    ["get", "/api/project-members"],
    ["post", "/api/projects/:id/members"],
    ["delete", "/api/projects/:projectId/members/:scientistId"],
  ]);
});
test("registerScientistRoutes registers exactly its 16 routes", () => {
  assert.deepEqual(registered(registerScientistRoutes), [
    ["get", "/api/scientists"],
    ["get", "/api/scientists/:id/research-activities"],
    ["get", "/api/scientists/export"],
    ["get", "/api/scientists/import/template"],
    ["get", "/api/scientists/investigators"],
    ["get", "/api/scientists/scientific-staff"],
    ["get", "/api/scientists/:id"],
    ["get", "/api/scientists/:id/publications"],
    ["get", "/api/scientists/:id/authorship-stats"],
    ["post", "/api/scientists/import/preview"],
    ["post", "/api/scientists/import/apply"],
    ["post", "/api/scientists"],
    ["patch", "/api/scientists/:id"],
    ["delete", "/api/scientists/:id"],
    ["get", "/api/staff"],
    ["get", "/api/principal-investigators"],
  ]);
});
test("registerResearchActivityRoutes registers exactly its 9 routes", () => {
  assert.deepEqual(registered(registerResearchActivityRoutes), [
    ["get", "/api/research-activities"],
    ["get", "/api/research-activities/:id"],
    ["get", "/api/research-activities/:id/staff"],
    ["post", "/api/research-activities"],
    ["put", "/api/research-activities/:id"],
    ["delete", "/api/research-activities/:id"],
    ["get", "/api/research-activities/:id/members"],
    ["post", "/api/research-activities/:id/members"],
    ["delete", "/api/research-activities/:id/members/:scientistId"],
  ]);
});
test("registerDataManagementPlanRoutes registers exactly its 5 routes", () => {
  assert.deepEqual(registered(registerDataManagementPlanRoutes), [
    ["get", "/api/data-management-plans"],
    ["get", "/api/data-management-plans/:id"],
    ["post", "/api/data-management-plans"],
    ["patch", "/api/data-management-plans/:id"],
    ["delete", "/api/data-management-plans/:id"],
  ]);
});
test("registerPublicationRoutes registers exactly its 34 routes", () => {
  assert.deepEqual(registered(registerPublicationRoutes), [
    ["get", "/api/publications/link-import/template"],
    ["post", "/api/publications/link-import/preview"],
    ["post", "/api/publications/link-import/apply"],
    ["get", "/api/publications"],
    ["get", "/api/publications/journal-counts"],
    ["get", "/api/publications/author-counts"],
    ["get", "/api/publications/author-map"],
    ["get", "/api/publications/needs-author-fix"],
    ["get", "/api/publications/invalid-issues"],
    ["get", "/api/publications/duplicates"],
    ["get", "/api/publications/duplicates/count"],
    ["post", "/api/publications/merge"],
    ["get", "/api/publications/preprint-repair-candidates"],
    ["post", "/api/publications/preprint-repair"],
    ["get", "/api/publications/:id"],
    ["post", "/api/publications"],
    ["patch", "/api/publications/:id"],
    ["delete", "/api/publications/:id"],
    ["get", "/api/publications/:id/research-activities"],
    ["put", "/api/publications/:id/research-activities"],
    ["get", "/api/publications/:id/history"],
    ["post", "/api/publications/:id/ip-vet"],
    ["post", "/api/publications/:id/mark-invalid"],
    ["post", "/api/publications/:id/submit-correction"],
    ["post", "/api/publications/:id/withdraw-invalid"],
    ["post", "/api/publications/:id/finalize"],
    ["patch", "/api/publications/:id/status"],
    ["post", "/api/publications/:id/revert-final"],
    ["get", "/api/publications/:id/authors"],
    ["post", "/api/publications/:id/authors"],
    ["delete", "/api/publications/:publicationId/authors/:scientistId"],
    ["get", "/api/publications/:id/author-suggestions"],
    ["post", "/api/publications/:id/authors/bulk"],
    ["post", "/api/publications/export"],
  ]);
});
test("registerPublicationDiscoveryRoutes registers exactly its 6 routes", () => {
  assert.deepEqual(registered(registerPublicationDiscoveryRoutes), [
    ["post", "/api/publications/discover"],
    ["post", "/api/publications/discover/import"],
    ["get", "/api/publications/import/pmid/:pmid"],
    ["get", "/api/publications/import/doi/:doi"],
    ["get", "/api/scientists/:id/missing-papers"],
    ["post", "/api/scientists/:id/import-papers"],
  ]);
});
test("registerPatentRoutes registers exactly its 5 routes", () => {
  assert.deepEqual(registered(registerPatentRoutes), [
    ["get", "/api/patents"],
    ["get", "/api/patents/:id"],
    ["post", "/api/patents"],
    ["patch", "/api/patents/:id"],
    ["delete", "/api/patents/:id"],
  ]);
});
test("registerIrbRoutes registers exactly its 11 routes", () => {
  assert.deepEqual(registered(registerIrbRoutes), [
    ["get", "/api/irb-applications"],
    ["get", "/api/irb-applications/:id"],
    ["post", "/api/irb-applications"],
    ["patch", "/api/irb-applications/:id"],
    ["delete", "/api/irb-applications/:id"],
    ["get", "/api/irb-board-members"],
    ["get", "/api/irb-board-members/active"],
    ["get", "/api/irb-board-members/:id"],
    ["post", "/api/irb-board-members"],
    ["patch", "/api/irb-board-members/:id"],
    ["delete", "/api/irb-board-members/:id"],
  ]);
});
test("registerRolePermissionRoutes registers exactly its 4 routes", () => {
  assert.deepEqual(registered(registerRolePermissionRoutes), [
    ["get", "/api/role-permissions"],
    ["post", "/api/role-permissions"],
    ["patch", "/api/role-permissions/:jobTitle/:navigationItem"],
    ["post", "/api/role-permissions/bulk"],
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
  "/api/dashboard/recent-activity",
  "/api/dashboard/recent-projects",
  "/api/dashboard/stats",
  "/api/dashboard/upcoming-deadlines",
  "/api/data-management-plans",
  "/api/data-management-plans/:id",
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
  "/api/health/database",
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
  "/api/irb-applications",
  "/api/irb-applications/:id",
  "/api/irb-board-members",
  "/api/irb-board-members/:id",
  "/api/irb-board-members/active",
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
  "/api/objects/local-upload/:id",
  "/api/objects/upload",
  "/api/ownership-overrides",
  "/api/ownership-overrides/:id",
  "/api/ownership-overrides/:module",
  "/api/patents",
  "/api/patents/:id",
  "/api/pdf-import-history",
  "/api/pdf-import-history/:id",
  "/api/pmo-applications",
  "/api/pmo-applications/:id",
  "/api/principal-investigators",
  "/api/programs",
  "/api/programs/:id",
  "/api/programs/:id/projects",
  "/api/project-members",
  "/api/projects",
  "/api/projects/:id",
  "/api/projects/:id/members",
  "/api/projects/:id/research-activities",
  "/api/projects/:projectId/members/:scientistId",
  "/api/publications",
  "/api/publications/:id",
  "/api/publications/:id/author-suggestions",
  "/api/publications/:id/authors",
  "/api/publications/:id/authors/bulk",
  "/api/publications/:id/finalize",
  "/api/publications/:id/history",
  "/api/publications/:id/ip-vet",
  "/api/publications/:id/mark-invalid",
  "/api/publications/:id/research-activities",
  "/api/publications/:id/revert-final",
  "/api/publications/:id/status",
  "/api/publications/:id/submit-correction",
  "/api/publications/:id/withdraw-invalid",
  "/api/publications/:publicationId/authors/:scientistId",
  "/api/publications/author-counts",
  "/api/publications/author-map",
  "/api/publications/discover",
  "/api/publications/discover/import",
  "/api/publications/duplicates",
  "/api/publications/duplicates/count",
  "/api/publications/export",
  "/api/publications/import/doi/:doi",
  "/api/publications/import/pmid/:pmid",
  "/api/publications/invalid-issues",
  "/api/publications/journal-counts",
  "/api/publications/link-import/apply",
  "/api/publications/link-import/preview",
  "/api/publications/link-import/template",
  "/api/publications/merge",
  "/api/publications/needs-author-fix",
  "/api/publications/preprint-repair",
  "/api/publications/preprint-repair-candidates",
  "/api/ra200-applications",
  "/api/ra205a-applications",
  "/api/register",
  "/api/research-activities",
  "/api/research-activities/:id",
  "/api/research-activities/:id/contracts",
  "/api/research-activities/:id/grants",
  "/api/research-activities/:id/ibc-applications",
  "/api/research-activities/:id/members",
  "/api/research-activities/:id/members/:scientistId",
  "/api/research-activities/:id/staff",
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
  "/api/role-permissions",
  "/api/role-permissions/:jobTitle/:navigationItem",
  "/api/role-permissions/bulk",
  "/api/rooms",
  "/api/rooms/:id",
  "/api/scientists",
  "/api/scientists/:id",
  "/api/scientists/:id/authorship-stats",
  "/api/scientists/:id/import-papers",
  "/api/scientists/:id/missing-papers",
  "/api/scientists/:id/publications",
  "/api/scientists/:id/research-activities",
  "/api/scientists/export",
  "/api/scientists/import/apply",
  "/api/scientists/import/preview",
  "/api/scientists/import/template",
  "/api/scientists/investigators",
  "/api/scientists/scientific-staff",
  "/api/sections",
  "/api/sections/:id",
  "/api/staff",
  "/api/system-configurations",
  "/api/system-configurations/:key",
  "/api/team-members",
  "/api/team-members/:id",
  "/api/team-members/category/:category",
  "/api/uploads/finalize",
  "/api/uploads/request-url",
  "/objects/:objectPath(*)",
  ];
  for (const path of moved) {
    const re = new RegExp(String.raw`app\.(get|post|put|patch|delete)\(\s*['"]` + path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + `['"]`);
    assert.ok(!re.test(source), `${path} is still registered in routes.ts as well as in its module`);
  }
});
