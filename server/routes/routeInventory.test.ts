/**
 * The four domains moved out of server/routes.ts (#42) register exactly the
 * routes they took with them, and routes.ts no longer registers any of them.
 *
 * A mechanical move of ~2,500 lines is the kind of change that loses a route
 * or leaves one registered twice without any test noticing, because every
 * handler still exists. This pins the inventory. When a route is deliberately
 * added or removed, update the list here in the same commit.
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
test("registerJournalImpactFactorRoutes registers exactly its 14 routes", () => {
  assert.deepEqual(registered(registerJournalImpactFactorRoutes), [
    ["get", "/api/journal-impact-factors"],
    ["get", "/api/journal-impact-factors/years"],
    ["get", "/api/journal-impact-factors/export"],
    ["get", "/api/journal-impact-factors/fields"],
    // Mounted by registerImpactFactorSummaryRoutes from inside the module, and
    // it must stay ahead of /:id or "summary" is parsed as a journal id.
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

test("server/routes.ts no longer registers any route that moved", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, "..", "routes.ts"), "utf-8");
  const moved = [
  "/api/branches",
  "/api/branches/:id",
  "/api/buildings",
  "/api/buildings/:id",
  "/api/buildings/:id/rooms",
  "/api/departments",
  "/api/departments/:id",
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
  "/api/journal-impact-factors/years",
  "/api/research-activities/:id/contracts",
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
  ];
  for (const path of moved) {
    const re = new RegExp(String.raw`app\.(get|post|put|patch|delete)\(\s*['"]` + path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + `['"]`);
    assert.ok(!re.test(source), `${path} is still registered in routes.ts as well as in its module`);
  }
});
