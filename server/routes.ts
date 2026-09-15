/**
 * The route registrar. Every domain lives in server/routes/<domain>Routes.ts
 * (or one of the older top-level *Routes.ts modules); this file only decides
 * the order they mount in, which matters where a literal path must beat a
 * parameterised one registered by another module.
 */
import type { Express } from "express";
import { createServer, type Server } from "http";
import { registerSidraScoreRoutes } from "./sidraScoreRoutes";
import { registerGrantListRoute } from "./grantIssueRoutes";
import { registerResearchPortfolioRoutes } from "./researchPortfolioRoutes";
import { registerInstitutionRoutes } from "./institutionRoutes";
import { registerContractTypeRoutes } from "./contractTypeRoutes";
import { registerGrantStatusRoutes, refreshGrantStatusRegistry } from "./grantStatusRoutes";
import { registerReferenceListAdminRoutes } from "./referenceListAdmin";
import { registerCertificateOcrRoutes } from "./routes/certificateOcrRoutes";
import { registerGrantRoutes } from "./routes/grantRoutes";
import { registerSdrImportRoutes } from "./routes/sdrImportRoutes";
import { registerCertificationRoutes } from "./routes/certificationRoutes";
import { registerSettingsRoutes } from "./routes/settingsRoutes";
import { registerPmoApplicationRoutes } from "./routes/pmoApplicationRoutes";
import { registerAdminUserRoutes } from "./routes/adminUserRoutes";
import { registerAccessRoutes } from "./routes/accessRoutes";
import { registerBulkDataRoutes } from "./routes/bulkDataRoutes";
import { registerAuditLogRoutes } from "./routes/auditLogRoutes";
import { registerIbcRoutes } from "./routes/ibcRoutes";
import { registerResearchContractRoutes } from "./routes/researchContractRoutes";
import { registerOrganisationRoutes } from "./routes/organisationRoutes";
import { registerJournalImpactFactorRoutes } from "./routes/journalImpactFactorRoutes";
import { registerDashboardRoutes } from "./routes/dashboardRoutes";
import { registerObjectStorageRoutes } from "./routes/objectStorageRoutes";
import { registerProgramRoutes } from "./routes/programRoutes";
import { registerProjectRoutes } from "./routes/projectRoutes";
import { registerScientistRoutes } from "./routes/scientistRoutes";
import { registerResearchActivityRoutes } from "./routes/researchActivityRoutes";
import { registerDataManagementPlanRoutes } from "./routes/dataManagementPlanRoutes";
import { registerPublicationRoutes } from "./routes/publicationRoutes";
import { registerPublicationDiscoveryRoutes } from "./routes/publicationDiscoveryRoutes";
import { registerPatentRoutes } from "./routes/patentRoutes";
import { registerIrbRoutes } from "./routes/irbRoutes";
import { registerRolePermissionRoutes } from "./routes/rolePermissionRoutes";
import { registerOfficeDashboardRoutes } from "./officeDashboardRoutes";
import { registerManagementReportRoutes } from "./managementReportRoutes";
import { log } from "./logger";








export async function registerRoutes(app: Express): Promise<Server> {
  // Set up API routes
  registerOfficeDashboardRoutes(app);
  registerManagementReportRoutes(app);

  // Sidra Score settings + per-scientist endpoints (registered early so literal
  // routes beat the /api/scientists/:id param route). Also registers
  // /api/scientists/sidra-scores (office-wide) and /api/scientists/:id/sidra-score.
  registerSidraScoreRoutes(app);

  // dashboardRoutes: server/routes/dashboardRoutes.ts
  registerDashboardRoutes(app);
  // objectStorageRoutes: server/routes/objectStorageRoutes.ts
  registerObjectStorageRoutes(app);
  registerCertificateOcrRoutes(app);

  // programRoutes: server/routes/programRoutes.ts
  registerProgramRoutes(app);
  // projectRoutes: server/routes/projectRoutes.ts
  registerProjectRoutes(app);
  // scientistRoutes: server/routes/scientistRoutes.ts
  registerScientistRoutes(app);
  // researchActivityRoutes: server/routes/researchActivityRoutes.ts
  registerResearchActivityRoutes(app);
  // dataManagementPlanRoutes: server/routes/dataManagementPlanRoutes.ts
  registerDataManagementPlanRoutes(app);
  // publicationRoutes: server/routes/publicationRoutes.ts
  registerPublicationRoutes(app);
  // publicationDiscoveryRoutes: server/routes/publicationDiscoveryRoutes.ts
  registerPublicationDiscoveryRoutes(app);
  // patentRoutes: server/routes/patentRoutes.ts
  registerPatentRoutes(app);
  // irbRoutes: server/routes/irbRoutes.ts
  registerIrbRoutes(app);
  registerIbcRoutes(app);

  // Research contracts: server/routes/researchContractRoutes.ts
  registerResearchContractRoutes(app);

  registerOrganisationRoutes(app);

  // rolePermissionRoutes: server/routes/rolePermissionRoutes.ts
  registerRolePermissionRoutes(app);
  registerJournalImpactFactorRoutes(app);

  registerGrantListRoute(app);

  // The researcher-facing views of grants and contracts. Registered here rather
  // than beside the office routes because they answer to a different matrix
  // area -- see server/researchPortfolioRoutes.ts.
  registerResearchPortfolioRoutes(app);

  // The shared institution list, read by the grant and contract forms.
  registerInstitutionRoutes(app);
  registerContractTypeRoutes(app);
  registerGrantStatusRoutes(app);
  registerReferenceListAdminRoutes(app);

  // Load the status list into the registry the lifecycle rules read. Failing
  // this leaves the built-in thirteen in place, which is what the system meant
  // before the table existed.
  void refreshGrantStatusRegistry();

  // Grants: server/routes/grantRoutes.ts
  registerGrantRoutes(app);

  // SDR import: server/routes/sdrImportRoutes.ts
  registerSdrImportRoutes(app);

  // Certifications: server/routes/certificationRoutes.ts
  registerCertificationRoutes(app);

  // System configuration, PDF import history, feature requests: server/routes/settingsRoutes.ts
  registerSettingsRoutes(app);

  // PMO applications: server/routes/pmoApplicationRoutes.ts
  registerPmoApplicationRoutes(app);

  // Admin user management: server/routes/adminUserRoutes.ts
  registerAdminUserRoutes(app);

  // Access check and ownership overrides: server/routes/accessRoutes.ts
  registerAccessRoutes(app);

  // Bulk data hub: server/routes/bulkDataRoutes.ts
  registerBulkDataRoutes(app);

  // Audit log: server/routes/auditLogRoutes.ts
  registerAuditLogRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
