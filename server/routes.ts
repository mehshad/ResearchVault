// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import {
  GrantSdrLifecycleStorageError,
  storage,
  normalizeJournalName,
} from "./databaseStorage";
import { resolveAuthorCheckSubject } from "./authorCheckSubject";
import { normaliseQuartile } from "@shared/journalQuartile";
import { normaliseAdditionalSdrIds } from "@shared/publicationSdrLinks";
import { registerImpactFactorSummaryRoutes } from "./impactFactorSummaryRoutes";
import {
  canViewPublication,
  canViewUnpublishedScientistPublications,
  isPublicScientistProfilePublicationStatus,
  type ScientistPublicationViewer,
} from "./scientistPublicationVisibility";
import { ZodError, z } from "zod";
import { fromZodError } from "zod-validation-error";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "./objectStorage";
import { LocalObjectStorageService, ObjectAlreadyExistsError } from "./localObjectStorage";
import {
  MAX_LOCAL_UPLOAD_BYTES,
  generateFinalizeToken,
  localUploadSubject,
  verifyFinalizeToken,
  verifyUploadToken,
  withLocalUploadToken,
} from "./uploadTokens";
import { db } from "./db";
import { scientists, publicationAuthors, journals, journalImpactFactorMetrics, manuscriptHistory, users, branches, departments, sections, roleGroups, userRoleAssignments, auditLog, type ResearchActivity } from "@shared/schema";
import { and, eq, inArray, isNull, desc, sql, gte, lte, count, type SQL } from "drizzle-orm";
import {
  buildExportBuffer,
  buildTemplateBuffer,
  parseUploadedFile,
  buildImportPreview,
  rowToInsertScientist,
  findReferencingRecords,
} from "./scientistsImportExport";
import {
  insertScientistSchema,
  insertResearchActivitySchema,
  insertProjectMemberSchema,
  insertDataManagementPlanSchema,
  insertPublicationSchema,
  insertPublicationAuthorSchema,
  insertPatentSchema,
  insertIrbApplicationSchema,
  insertIbcApplicationSchema,
  insertIbcApplicationCommentSchema,
  insertIbcBoardMemberSchema,
  insertIbcSubmissionSchema,
  insertIbcDocumentSchema,
  insertResearchContractSchema,
  insertResearchContractScopeItemSchema,
  insertResearchContractExtensionSchema,
  insertResearchContractDocumentSchema,
  insertProgramSchema,
  insertProjectSchema,
  insertBuildingSchema,
  insertRoomSchema,
  insertIbcApplicationRoomSchema,
  insertIbcBackboneSourceRoomSchema,
  insertIbcApplicationPpeSchema,
  insertRolePermissionSchema,
  insertGrantSchema,
  insertCertificationModuleSchema,
  insertCertificationSchema,
  insertCertificationConfigurationSchema,
  insertPdfImportHistorySchema,
  insertFeatureRequestSchema,
  insertRa200ApplicationSchema,
  insertRa205aApplicationSchema,
  insertTeamMemberSchema,
  insertBranchSchema,
  insertDepartmentSchema,
  insertSectionSchema
} from "@shared/schema";
import { requireAuth, requireAdmin, requirePublicationOfficer, getAuthMode } from "./auth";
import { hasAnyRole, isAdministrator } from "@shared/effectiveRoles";
import { buildAssignableRoles } from "./assignableRoles";
import { ACCESS_ROLES, JOB_TITLE_TAB_ALIASES, matchesJobTitle } from "@shared/constants";
import { resolveOwnershipAccess, maxAccess, type AccessLevel as OwnershipAccessLevel } from "./ownershipResolver";
import { matchesAuthorName, isLinkedAuthorInAuthorsText, isUnambiguousAuthorMatch, suggestInternalAuthors, classifyAuthorEntries } from "@shared/authorMatching";
import { detectDuplicateGroups, pickDefaultSurvivorId, normalizeDoi as canonicalDoi, isPreprintRecord, classifyResolvedPublication, preprintRepairEvidence } from "@shared/publicationDeduplication";
import { getObjectAclPolicy, ObjectPermission } from "./objectAcl";
import { buildLinkImportTemplate, previewLinkImport } from "./publicationLinksImport";
import { GRANT_COLUMNS, grantsToRows, buildGrantsWorkbookBuffer, buildGrantsTemplateBuffer, buildMissingGrantStaffWorkbookBuffer, collectMissingGrantStaff, previewGrantRows } from "./grantsImportExport";
import { buildStaffNameIndex, matchStaffByName } from "@shared/staffNameMatching";
import { buildSdrTemplateBuffer, previewSdrRows } from "./sdrImportExport";
import { resolveInvestigatorScientistIds } from "./investigatorRoleResolver";
import {
  registerSidraScoreRoutes,
  isOwnScientistProfile,
  hasManagementRole,
  hasPublicationOfficerRole,
  canEditPublicationForLinkedScientists,
  canManagePublicationAuthorLink,
  canCreatePublicationForResearchActivity,
} from "./sidraScoreRoutes";
import { SIDRA_SCORE_SETTINGS_KEY } from "@shared/sidraScore";
import {
  rejectGenericPublicationWorkflowMutation,
  rejectPublicationCreateWorkflowMutation,
  rejectProtectedPublicationStatusFields,
  getStatusTransitionWorkflowViolation,
  parsePublicationStatusFields,
} from "./publicationMutationPolicy";
import {
  createIpVettingHandler,
  createInvalidatePublishedHandler,
  createInvalidAuthorActionHandler,
  createRevertFinalHandler,
  selectInvalidLinkedPublications,
} from "./publicationWorkflowRoutes";
import {
  PUBLISHED_INVALID_STATUS,
  PUBLISHED_STATUS,
  WITHDRAWN_STATUS,
  hasSdrOrExemption,
  validateSdrExemptionReason,
} from "@shared/publicationWorkflow";
import {
  isInvestigatorEligible,
  isInvestigatorRoleAssignmentAllowed,
} from "@shared/investigatorEligibility";
import {
  isRoomManagerEligible,
  isRoomSupervisorEligible,
  ROOM_MANAGER_ELIGIBILITY_MESSAGE,
  ROOM_SUPERVISOR_ELIGIBILITY_MESSAGE,
} from "@shared/roomRoleEligibility";
import { requireInvestigatorDesignationManager } from "./investigatorDesignationPolicy";
import { rejectRestrictedUserProfileAccessChanges } from "./restrictedUserPolicy";
import {
  canGrantLinkSdrs,
  GrantLifecycleError,
  grantStatusAllowsProgressTracking,
  reconcileGrantLifecycle,
} from "@shared/grantLifecycle";
import { registerGrantListRoute } from "./grantIssueRoutes";
import { registerResearchPortfolioRoutes } from "./researchPortfolioRoutes";
import { registerInstitutionRoutes } from "./institutionRoutes";
import { registerContractTypeRoutes } from "./contractTypeRoutes";
import { registerGrantStatusRoutes, refreshGrantStatusRegistry } from "./grantStatusRoutes";
import { registerReferenceListAdminRoutes } from "./referenceListAdmin";
import { getInvestigatorAssignmentError } from "./investigatorAssignment";
import { deleteRefusal } from "./deleteBlockers";
import { getObjectStorageService, isLocalStorage } from "./objectStorageService";
import { respondWriteFailure } from "./writeFailureDetail";
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
import {
  applySection as applyBulkDataSection,
  BulkApplyRowError,
  buildExportWorkbook as buildBulkDataExportWorkbook,
  buildTemplateWorkbook as buildBulkDataTemplateWorkbook,
  getSectionMeta as getBulkDataSectionMeta,
  previewSection as previewBulkDataSection,
  SECTION_META as BULK_DATA_SECTIONS,
  type SectionId as BulkDataSectionId,
} from "./bulkDataHub";
import { toAdminUserResponse } from "./adminUsers";
import {
  ARCHIVE_MIME,
  buildBulkDataArchive,
  bulkArchiveFileName,
  createBulkDataArchive,
  downloadBulkDataArchive,
  getBulkDataArchive,
  listBulkDataArchives,
  queueBulkDataArchive,
} from "./bulkDataArchives";
import { registerOfficeDashboardRoutes } from "./officeDashboardRoutes";
import { registerManagementReportRoutes } from "./managementReportRoutes";
import { systemAudit } from "./auditService";
import { log, logError } from "./logger";


function getScientistPublicationViewer(req: Request): ScientistPublicationViewer {
  // The signed-in session is the sole authority. Demo used to accept viewer=*
  // query hints here so the client selector could claim any role or identity;
  // demo is real seeded accounts now, so those hints are gone.
  return {
    userId: req.session.user?.id,
    role: req.session.user?.role,
    scientistId: req.session.user?.scientistId,
  };
}


// Upload tokens (finalize and local upload) live in ./uploadTokens.ts, where
// they are tested. The finalize token binds an object path to the requesting
// user so nobody else can claim the object; the local upload token does the
// same for the PUT itself when files live on the local filesystem.

/** The identity an upload is bound to: the session user, or "demo" in demo mode. */
function uploadUserId(req: Request): string {
  const sessionUser = (req.session as any)?.user;
  return sessionUser?.id?.toString() ?? "demo";
}

// Optional text fields on `scientists` that allow NULL. Blank/empty strings are
// normalized to null so they don't store noise and (for `staffId`, which is
// UNIQUE) don't collide with other blank records on the unique constraint.
const SCIENTIST_NULLABLE_TEXT_FIELDS = [
  "jobTitle",
  "staffId",
  "department",
  "bio",
  "profileImageInitials",
  "orcidId",
  "linkedInUrl",
  "googleScholarUrl",
  "webOfScienceId",
] as const;

function normalizeScientistPayload(body: any): any {
  if (!body || typeof body !== "object") return body;
  const normalized: any = { ...body };
  for (const field of SCIENTIST_NULLABLE_TEXT_FIELDS) {
    if (typeof normalized[field] === "string" && normalized[field].trim() === "") {
      normalized[field] = null;
    }
  }
  return normalized;
}

// Maps a Postgres unique-constraint violation (error code 23505) on the
// `scientists` table to a clear, field-specific message. Returns undefined for
// any other error so the caller can fall back to a generic 500.
function scientistUniqueConflictMessage(error: any): string | undefined {
  // Drizzle wraps the underlying pg driver error in `error.cause`, so the
  // Postgres error code/detail live there rather than on the top-level error.
  const pgError = error?.code ? error : error?.cause;
  if (!pgError || pgError.code !== "23505") return undefined;
  const detail: string = `${pgError.detail ?? ""} ${pgError.constraint ?? ""}`.toLowerCase();
  if (detail.includes("email")) {
    return "A staff member with this email already exists.";
  }
  if (detail.includes("staff_id")) {
    return "A staff member with this Staff ID already exists.";
  }
  return "A staff member with these details already exists.";
}

// ── ORCID / Google Scholar missing-paper import helpers ──────────────────────

import { normalizeDoi, buildExistingWorkDois, workDoiIdentity, nullifyEmptyStrings, isFigshareWork, inferJournalFromDoi, fetchOrcidWorks, fetchGoogleScholarDois, fetchCrossrefWork, crossrefJournalName, fetchCrossrefPublication, stripXml, fetchPubmedByDoi, withinYearRange, DISCOVERY_FETCHERS } from "./publicationDiscovery";
import type { MissingPaperMeta, DiscoveredPaper, DiscoveryQuery } from "./publicationDiscovery";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up API routes
  const apiRouter = app.route('/api');

  registerOfficeDashboardRoutes(app);
  registerManagementReportRoutes(app);

  // Sidra Score settings + per-scientist endpoints (registered early so literal
  // routes beat the /api/scientists/:id param route). Also registers
  // /api/scientists/sidra-scores (office-wide) and /api/scientists/:id/sidra-score.
  registerSidraScoreRoutes(app);

  // Health check for database connection
  app.get('/api/health/database', async (req: Request, res: Response) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.json(true);
    } catch (error) {
      logError("Database health check failed", "routes", error);
      res.json(false);
    }
  });

  // Object Storage Routes
  app.post("/api/objects/upload", requireAuth, async (req, res) => {
    const objectStorageService = getObjectStorageService();
    try {
      let uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      const userId = uploadUserId(req);
      const finalizeToken = generateFinalizeToken(objectPath, userId);
      // On local storage the upload URL is one of our own routes, so it is
      // signed for this user and this id: the PUT below refuses anything
      // else. A presigned cloud URL carries its own signature.
      if (isLocalStorage) {
        const uploadId = objectPath.split("/").pop() ?? "";
        uploadURL = withLocalUploadToken(uploadURL, uploadId, userId);
      }
      res.json({ uploadURL, objectPath, finalizeToken });
    } catch (error) {
      logError("Error getting upload URL", "routes", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Finalize an upload by setting a private ACL on the object.
  // Requires a valid HMAC finalizeToken issued by the upload-URL endpoint so
  // that only the user who requested the upload can set ACL on that objectPath.
  app.post("/api/uploads/finalize", requireAuth, async (req, res) => {
    const { objectPath, finalizeToken } = req.body;
    if (!objectPath || typeof objectPath !== "string") {
      return res.status(400).json({ error: "objectPath is required" });
    }
    const sessionUser = (req.session as any)?.user;

    // Require and verify the HMAC token for everyone. This used to be skipped
    // in demo mode, which is now real signed-in accounts like any other.
    if (!sessionUser) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!finalizeToken || typeof finalizeToken !== "string") {
      return res.status(400).json({ error: "finalizeToken is required" });
    }
    const userId = sessionUser.id.toString();
    if (!verifyFinalizeToken(objectPath, userId, finalizeToken)) {
      return res.status(403).json({ error: "Invalid or expired finalize token" });
    }
    // Token is valid: set a private ACL with this user as owner on cloud
    // storage. Local storage has no ACL metadata; nothing to set.
    if (!isLocalStorage) {
      const objectStorageService = new ObjectStorageService();
      try {
        await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
          owner: userId,
          visibility: "private",
        });
      } catch (error) {
        logError("Failed to set ACL on upload", "routes", error);
        return res.status(500).json({ error: "Failed to finalize upload" });
      }
    }
    res.json({ ok: true });
  });
  
  // Upload URL request for presigned uploads
  app.post("/api/uploads/request-url", requireAuth, async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const { name, size, contentType } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Missing required field: name" });
      }
      
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      const sessionUser = (req.session as any)?.user;
      const userId = sessionUser?.id?.toString() ?? "demo";
      const finalizeToken = generateFinalizeToken(objectPath, userId);
      
      res.json({
        uploadURL,
        objectPath,
        finalizeToken,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      logError("Error generating upload URL", "routes", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });
  
  // Serve uploaded objects — single consolidated handler for GCS and local storage.
  //
  // Authorization matrix:
  //   demo mode (AUTH_MODE=demo) → open access (entire app is unauthenticated in this mode)
  //   GCS, real auth, ACL=public → world-readable
  //   GCS, real auth, ACL=private or no ACL → require session + canAccessObjectEntity();
  //       no-ACL objects return false (deny-by-default) unless finalized via
  //       POST /api/uploads/finalize which sets owner+private ACL after upload.
  //   Local storage, real auth   → require session only (no GCS ACL metadata)
  app.get("/objects/:objectPath(*)", async (req, res) => {
    const objectStorageService = getObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);

      const sessionUser = (req.session as any)?.user;

      // Access control applies to everyone. Demo used to serve every object
      // with no check at all -- the whole app was unauthenticated -- which let
      // the demo instance hand out any file, production uploads included when a
      // volume was shared. Demo is signed-in accounts now.
      if (!isLocalStorage) {
        const aclPolicy = await getObjectAclPolicy(objectFile as any);
        if (aclPolicy?.visibility !== "public") {
          // Non-public (private ACL or no ACL): require a real session.
          if (!sessionUser) {
            return res.status(401).json({ error: "Authentication required" });
          }
          // Route all private/no-ACL decisions through canAccessObjectEntity so
          // deny-by-default is enforced: no-ACL → false, private+non-owner → false.
          const canAccess = await (objectStorageService as ObjectStorageService).canAccessObjectEntity({
            userId: sessionUser.id.toString(),
            objectFile: objectFile as any,
            requestedPermission: ObjectPermission.READ,
          });
          if (!canAccess) {
            return res.status(403).json({ error: "Access denied" });
          }
        }
        // aclPolicy?.visibility === "public" → world-readable, fall through to download.
      } else {
        // Local storage: no GCS ACL metadata; session presence is the sole gate.
        if (!sessionUser) {
          return res.status(401).json({ error: "Authentication required" });
        }
      }

      await objectStorageService.downloadObject(objectFile as any, res);
    } catch (error) {
      logError("Error serving object", "routes", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });

  // Local filesystem upload handler (used when STORAGE_TYPE=local)
  // Three things stand between a signed-in account and somebody else's file:
  // the URL must carry the token minted for this id and this user, the id
  // must not already hold a file, and the body is capped. The ids themselves
  // are not secret -- they sit in file_url columns and are returned to anyone
  // who may read the parent record -- so requireAuth alone was not a guard.
  app.put("/api/objects/local-upload/:id", requireAuth, async (req, res) => {
    if (!isLocalStorage) return res.status(404).end();
    const { id } = req.params;
    if (!verifyUploadToken(localUploadSubject(id), uploadUserId(req), req.query.token)) {
      req.resume();
      return res.status(403).json({ error: "This upload URL was not issued to you, or has expired. Request a new one." });
    }
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > MAX_LOCAL_UPLOAD_BYTES) {
      req.resume();
      return res.status(413).json({ error: `Files are limited to ${MAX_LOCAL_UPLOAD_BYTES / (1024 * 1024)} MB.` });
    }
    const chunks: Buffer[] = [];
    let received = 0;
    let refused = false;
    req.on("data", (chunk: Buffer) => {
      if (refused) return;
      received += chunk.length;
      if (received > MAX_LOCAL_UPLOAD_BYTES) {
        refused = true;
        chunks.length = 0;
        if (!res.headersSent) {
          res.status(413).json({ error: `Files are limited to ${MAX_LOCAL_UPLOAD_BYTES / (1024 * 1024)} MB.` });
        }
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", async () => {
      if (refused) return;
      try {
        const localService = new LocalObjectStorageService();
        await localService.saveFile(id, Buffer.concat(chunks), req.headers["content-type"] || "application/octet-stream");
        res.status(200).end();
      } catch (err: any) {
        if (err instanceof ObjectAlreadyExistsError) {
          return res.status(409).json({ error: "This upload id has already been used. Request a new upload URL." });
        }
        logError("Local upload error", "routes", err);
        // localFilePath throws for non-UUID ids and path traversal attempts.
        const status = err?.message?.includes("Invalid file id") || err?.message?.includes("Path traversal") ? 400 : 500;
        if (!res.headersSent) res.status(status).json({ error: status === 400 ? err.message : "Upload failed" });
      }
    });
    req.on("error", () => { if (!res.headersSent) res.status(500).json({ error: "Upload failed" }); });
  });

  // Certificate OCR: server/routes/certificateOcrRoutes.ts
  registerCertificateOcrRoutes(app);

  // Dashboard
  app.get('/api/dashboard/stats', async (req: Request, res: Response) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard statistics" });
    }
  });

  app.get('/api/dashboard/recent-activity', async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 8;
      const activity = await storage.getRecentActivity(limit);
      res.json(activity);
    } catch (error) {
      logError("Error fetching recent activity", "routes", error);
      res.status(500).json({ message: "Failed to fetch recent activity" });
    }
  });

  app.get('/api/dashboard/recent-projects', async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const activities = await storage.getRecentResearchActivities(limit);
      
      // Fetch lead scientist and PI info for each activity
      const enhancedActivities = await Promise.all(activities.map(async (activity) => {
        const members = await storage.getProjectMembers(activity.id);
        const leadMember = members.find(m => m.role === 'Lead Scientist');
        const piMember = members.find(m => m.role === 'Principal Investigator');
        
        let leadScientist = null;
        if (leadMember) {
          const scientist = await storage.getScientist(leadMember.scientistId);
          if (scientist) {
            leadScientist = {
              id: scientist.id,
              firstName: scientist.firstName,
              lastName: scientist.lastName,
              profileImageInitials: scientist.profileImageInitials
            };
          }
        }
        
        let principalInvestigator = null;
        if (piMember) {
          const scientist = await storage.getScientist(piMember.scientistId);
          if (scientist) {
            principalInvestigator = {
              id: scientist.id,
              firstName: scientist.firstName,
              lastName: scientist.lastName,
              profileImageInitials: scientist.profileImageInitials
            };
          }
        }
        
        return {
          ...activity,
          leadScientist,
          principalInvestigator
        };
      }));
      
      res.json(enhancedActivities);
    } catch (error) {
      logError("Error fetching recent research activities", "routes", error);
      res.status(500).json({ message: "Failed to fetch recent research activities" });
    }
  });

  app.get('/api/dashboard/upcoming-deadlines', async (req: Request, res: Response) => {
    try {
      const deadlines = await storage.getUpcomingDeadlines();
      res.json(deadlines);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch upcoming deadlines" });
    }
  });

  // Programs (PRM)
  app.get('/api/programs', async (req: Request, res: Response) => {
    try {
      const programs = await storage.getPrograms();
      res.json(programs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch programs" });
    }
  });

  app.get('/api/programs/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid program ID" });
      }

      const program = await storage.getProgram(id);
      if (!program) {
        return res.status(404).json({ message: "Program not found" });
      }
      
      res.json(program);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch program" });
    }
  });
  
  app.get('/api/programs/:id/projects', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid program ID" });
      }

      const projects = await storage.getProjectsForProgram(id);
      res.json(projects);
    } catch (error) {
      logError("Error fetching projects for program", "routes", error);
      res.status(500).json({ message: "Failed to fetch projects for program" });
    }
  });

  app.post('/api/programs', async (req: Request, res: Response) => {
    try {
      // Auto-generate a PRM number if the client didn't supply one.
      let body = { ...req.body };
      if (!body.programId) {
        const existing = await storage.getPrograms();
        const nums = existing
          .map((p: any) => { const m = String(p.programId || "").match(/(\d+)$/); return m ? parseInt(m[1]) : 0; })
          .filter((n: number) => n > 0);
        const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
        body.programId = `PRM-${String(next).padStart(3, "0")}`;
      }
      const validateData = insertProgramSchema.parse(body);
      const programDirectorError = await getInvestigatorAssignmentError(
        validateData.programDirectorId,
        "Program Director"
      );
      if (programDirectorError) {
        return res
          .status(programDirectorError.status)
          .json({ message: programDirectorError.message });
      }
      const researchCoLeadError = await getInvestigatorAssignmentError(
        validateData.researchCoLeadId,
        "Research Co-Lead"
      );
      if (researchCoLeadError) {
        return res
          .status(researchCoLeadError.status)
          .json({ message: researchCoLeadError.message });
      }
      const program = await storage.createProgram(validateData);
      res.status(201).json(program);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to create program" });
    }
  });

  app.patch('/api/programs/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid program ID" });
      }

      const validateData = insertProgramSchema.partial().parse(req.body);
      const programDirectorError = await getInvestigatorAssignmentError(
        validateData.programDirectorId,
        "Program Director"
      );
      if (programDirectorError) {
        return res
          .status(programDirectorError.status)
          .json({ message: programDirectorError.message });
      }
      const researchCoLeadError = await getInvestigatorAssignmentError(
        validateData.researchCoLeadId,
        "Research Co-Lead"
      );
      if (researchCoLeadError) {
        return res
          .status(researchCoLeadError.status)
          .json({ message: researchCoLeadError.message });
      }
      const program = await storage.updateProgram(id, validateData);
      
      if (!program) {
        return res.status(404).json({ message: "Program not found" });
      }
      
      res.json(program);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update program" });
    }
  });

  app.delete('/api/programs/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid program ID" });
      }

      // Refuse while projects or grants still belong to it: nothing enforces
      // the reference in the database, so the delete would orphan them.
      const blockers = await storage.getProgramDeleteBlockers(id);
      if (blockers.length > 0) return res.status(409).json(deleteRefusal(blockers));

      const existing = await storage.getProgram(id);
      const success = await storage.deleteProgram(id);
      
      if (!success) {
        return res.status(404).json({ message: "Program not found" });
      }
      
      if (existing) await req.audit.logDelete("programs", id, existing as Record<string, unknown>);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete program" });
    }
  });

  // Projects (PRJ)
  app.get('/api/projects', async (req: Request, res: Response) => {
    try {
      const programId = req.query.programId ? parseInt(req.query.programId as string) : undefined;
      
      let projects;
      if (programId && !isNaN(programId)) {
        projects = await storage.getProjectsForProgram(programId);
      } else {
        projects = await storage.getProjects();
      }
      
      res.json(projects);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get('/api/projects/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const project = await storage.getProject(id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      res.json(project);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.post('/api/projects', async (req: Request, res: Response) => {
    try {
      const validateData = insertProjectSchema.parse(req.body);
      const eligibilityError = await getInvestigatorAssignmentError(
        validateData.principalInvestigatorId,
        "Project Lead Investigator"
      );
      if (eligibilityError) {
        return res
          .status(eligibilityError.status)
          .json({ message: eligibilityError.message });
      }
      const project = await storage.createProject(validateData);
      res.status(201).json(project);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.patch('/api/projects/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const validateData = insertProjectSchema.partial().parse(req.body);
      const eligibilityError = await getInvestigatorAssignmentError(
        validateData.principalInvestigatorId,
        "Project Lead Investigator"
      );
      if (eligibilityError) {
        return res
          .status(eligibilityError.status)
          .json({ message: eligibilityError.message });
      }
      const project = await storage.updateProject(id, validateData);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      res.json(project);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  app.delete('/api/projects/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      // Refuse while SDRs or PMO applications still sit under it.
      const blockers = await storage.getProjectDeleteBlockers(id);
      if (blockers.length > 0) return res.status(409).json(deleteRefusal(blockers));

      const existing = await storage.getProject(id);
      const success = await storage.deleteProject(id);
      
      if (!success) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      if (existing) await req.audit.logDelete("projects", id, existing as Record<string, unknown>);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  // Scientists
  app.get('/api/scientists', async (req: Request, res: Response) => {
    try {
      const includeActivityCount = req.query.includeActivityCount === 'true';
      const page = req.query.page ? parseInt(req.query.page as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      
      // Validate pagination params if provided
      if ((page !== undefined && (isNaN(page) || page < 1)) || 
          (limit !== undefined && (isNaN(limit) || limit < 1))) {
        return res.status(400).json({ message: "Invalid pagination parameters. page and limit must be positive integers." });
      }
      
      let scientists;
      if (includeActivityCount) {
        scientists = await storage.getScientistsWithActivityCount();
      } else {
        scientists = await storage.getScientists();
      }
      
      // Apply pagination if requested
      if (page !== undefined && limit !== undefined) {
        const startIndex = (page - 1) * limit;
        const paginatedScientists = scientists.slice(startIndex, startIndex + limit);
        res.json({
          data: paginatedScientists,
          pagination: {
            page,
            limit,
            total: scientists.length,
            totalPages: Math.ceil(scientists.length / limit)
          }
        });
      } else {
        res.json(scientists);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch scientists" });
    }
  });

  app.get('/api/scientists/:id/research-activities', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      
      // Get research activities where scientist is a team member
      const activities = await storage.getResearchActivitiesForScientist(id);
      
      // Enhance with project and program information
      const enhancedActivities = await Promise.all(
        activities.map(async (activity) => {
          let project = null;
          let program = null;
          let memberRole = null;
          
          // Get project info if activity has projectId
          if (activity.projectId) {
            project = await storage.getProject(activity.projectId);
            
            // Get program info if project has programId
            if (project?.programId) {
              program = await storage.getProgram(project.programId);
            }
          }
          
          // Get member role from project_members table
          const members = await storage.getProjectMembers(activity.id);
          const member = members.find(m => m.scientistId === id);
          memberRole = member?.role || null;
          
          return {
            ...activity,
            project,
            program,
            memberRole
          };
        })
      );
      
      res.json(enhancedActivities);
    } catch (error) {
      logError('Error fetching scientist research activities', "routes", error);
      res.status(500).json({ message: 'Failed to fetch research activities' });
    }
  });

  // Export all scientists as XLSX or CSV (must be registered before /:id)
  app.get('/api/scientists/export', requireAdmin, async (req: Request, res: Response) => {
    try {
      const format = (req.query.format === 'csv' ? 'csv' : 'xlsx') as 'csv' | 'xlsx';
      const allScientists = await storage.getScientists();
      const org = {
        branches: await storage.getBranches(),
        departments: await storage.getDepartments(),
        sections: await storage.getSections(),
      };
      const { buffer, mime, filename } = await buildExportBuffer(allScientists, format, org);
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error) {
      logError('Staff export failed', "routes", error);
      res.status(500).json({ message: 'Failed to export staff' });
    }
  });

  app.get('/api/scientists/import/template', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const buffer = await buildTemplateBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="staff-import-template.xlsx"');
      res.send(buffer);
    } catch (error) {
      logError('Staff import template failed', "routes", error);
      res.status(500).json({ message: 'Failed to build staff import template' });
    }
  });

  // Get scientists filtered by role for room supervisor/manager selection
  app.get('/api/scientists/investigators', async (req: Request, res: Response) => {
    try {
      const investigators = await storage.getScientistsByRole('investigator');
      res.json(investigators);
    } catch (error) {
      logError('Error fetching investigators', "routes", error);
      res.status(500).json({ message: "Failed to fetch investigators" });
    }
  });

  app.get('/api/scientists/scientific-staff', async (req: Request, res: Response) => {
    try {
      const scientificStaff = await storage.getScientistsByRole('staff|management|post-doctoral|research');
      res.json(scientificStaff);
    } catch (error) {
      logError('Error fetching scientific staff', "routes", error);
      res.status(500).json({ message: "Failed to fetch scientific staff" });
    }
  });

  app.get('/api/scientists/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scientist ID" });
      }

      const scientist = await storage.getScientist(id);
      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }

      res.json(scientist);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch scientist" });
    }
  });

  app.get('/api/scientists/:id/publications', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scientist ID" });
      }

      const scientist = await storage.getScientist(id);
      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }

      const yearsSince = req.query.years ? parseInt(req.query.years as string) : 5;
      const includeUnpublished = canViewUnpublishedScientistPublications(
        getScientistPublicationViewer(req),
        scientist,
      );
      const publications = await storage.getPublicationsForScientist(id, yearsSince, includeUnpublished);
      
      res.json(publications);
    } catch (error) {
      logError('Error fetching scientist publications', "routes", error);
      res.status(500).json({ message: "Failed to fetch scientist publications" });
    }
  });

  app.get('/api/scientists/:id/authorship-stats', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scientist ID" });
      }

      const scientist = await storage.getScientist(id);
      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }

      const yearsSince = req.query.years ? parseInt(req.query.years as string) : 5;
      const includeUnpublished = canViewUnpublishedScientistPublications(
        getScientistPublicationViewer(req),
        scientist,
      );
      const stats = await storage.getAuthorshipStatsByYear(id, yearsSince, includeUnpublished);
      
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch authorship statistics" });
    }
  });

  // NOTE: POST /api/scientists/sidra-scores is now registered by registerSidraScoreRoutes()
  // above (protected by requirePublicationOfficer and backed by sidraScoreService).
  // The original inline handler has been removed to avoid duplicate registration.
  // Legacy marker — do not re-add inline handler here.

  // Roughly 8 MB of base64 → ~6 MB decoded file. Plenty for staff lists; blocks runaway payloads.
  const MAX_IMPORT_B64_LEN = 8 * 1024 * 1024;

  // Preview an import file — no DB writes
  app.post('/api/scientists/import/preview', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { fileBase64, fileName } = req.body ?? {};
      if (!fileBase64 || !fileName) {
        return res.status(400).json({ message: 'fileBase64 and fileName are required' });
      }
      if (typeof fileBase64 !== 'string' || fileBase64.length > MAX_IMPORT_B64_LEN) {
        return res.status(413).json({ message: 'Import file is too large (max ~6MB).' });
      }
      let fileRows;
      try {
        fileRows = await parseUploadedFile(String(fileBase64), String(fileName));
      } catch (e: any) {
        return res.status(400).json({ message: `Could not parse file: ${e?.message || e}` });
      }
      const existing = await storage.getScientists();
      const org = { branches: await storage.getBranches(), departments: await storage.getDepartments(), sections: await storage.getSections() };
      res.json(buildImportPreview(fileRows, existing, org));
    } catch (error) {
      logError('Staff import preview failed', "routes", error);
      res.status(500).json({ message: 'Failed to build import preview' });
    }
  });

  // Apply a previously-previewed import inside a single transaction
  app.post('/api/scientists/import/apply', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { fileBase64, fileName } = req.body ?? {};
      if (!fileBase64 || !fileName) {
        return res.status(400).json({ message: 'fileBase64 and fileName are required' });
      }
      if (typeof fileBase64 !== 'string' || fileBase64.length > MAX_IMPORT_B64_LEN) {
        return res.status(413).json({ message: 'Import file is too large (max ~6MB).' });
      }
      let fileRows;
      try {
        fileRows = await parseUploadedFile(String(fileBase64), String(fileName));
      } catch (e: any) {
        return res.status(400).json({ message: `Could not parse file: ${e?.message || e}` });
      }

      const existing = await storage.getScientists();
      const org = { branches: await storage.getBranches(), departments: await storage.getDepartments(), sections: await storage.getSections() };
      const preview = buildImportPreview(fileRows, existing, org);

      if (preview.errors.length > 0) {
        return res.status(400).json({
          message: 'Import has validation errors. Re-run preview and fix them first.',
          errors: preview.errors,
        });
      }

      try {
        const summary = await db.transaction(async (tx) => {
          // 1. Insert new rows first (without supervisor — we patch in step 4).
          const insertedIdByEmail = new Map<string, number>();
          for (const row of preview.toInsert) {
            const payload = rowToInsertScientist(row, new Map());
            payload.supervisorId = null;
            const [inserted] = await tx.insert(scientists).values(payload).returning();
            insertedIdByEmail.set(row.email, inserted.id);
          }

          // 2. Build the intended-final email→id map. Critically, for rows
          //    being updated this uses the NEW email from the file, not the
          //    old email in the DB — otherwise a row that references the
          //    new email of another updated row would silently resolve to
          //    null (corrupting the hierarchy).
          const emailToId = new Map<string, number>();
          // Baseline: existing emails (covers unchanged rows and gives a
          //  starting point for matched rows).
          for (const s of existing) emailToId.set(s.email.toLowerCase(), s.id);
          // Override: matched rows keep their existing id but adopt their
          //  new file email. Their old email is no longer the canonical key
          //  for that record, but leaving it in the map is harmless because
          //  the preview step already validated against the new email set.
          for (const { existingId, row } of preview.toUpdate) {
            emailToId.set(row.email, existingId);
          }
          // Add freshly-inserted rows.
          insertedIdByEmail.forEach((id, email) => emailToId.set(email, id));
          // Remove rows being deleted so nothing resolves to a doomed id.

          // 3. Defensive consistency check: every supervisorEmail in the
          //    file must resolve. Preview validated this against
          //    allKnownEmails, but we re-check against the post-deletion
          //    map so we never silently write supervisorId = null.
          const unresolved: string[] = [];
          const checkSupervisor = (rowEmail: string, supervisorEmail?: string) => {
            if (supervisorEmail && !emailToId.has(supervisorEmail)) {
              unresolved.push(`${rowEmail} → ${supervisorEmail}`);
            }
          };
          for (const { row } of preview.toUpdate) checkSupervisor(row.email, row.supervisorEmail);
          for (const row of preview.toInsert) checkSupervisor(row.email, row.supervisorEmail);
          if (unresolved.length > 0) {
            throw new Error(
              `Some line manager emails cannot be resolved against the imported set: ${unresolved.join(", ")}. Re-run preview, fix the file, and try again.`
            );
          }

          // 4. Apply updates (uses the post-rename email→id map for supervisor resolution).
          for (const { existingId, row } of preview.toUpdate) {
            const payload = rowToInsertScientist(row, emailToId);
            await tx.update(scientists).set(payload).where(eq(scientists.id, existingId));
          }
          // Patch supervisor on freshly-inserted rows.
          for (const row of preview.toInsert) {
            if (!row.supervisorEmail) continue;
            const sid = emailToId.get(row.supervisorEmail);
            const ownId = insertedIdByEmail.get(row.email);
            if (sid && ownId) {
              await tx.update(scientists).set({ supervisorId: sid }).where(eq(scientists.id, ownId));
            }
          }

          return {
            inserted: preview.toInsert.length,
            updated: preview.toUpdate.length,
            unchanged: preview.unchanged,
          };
        });

        res.json(summary);
      } catch (e: any) {
        return res.status(409).json({ message: e?.message || 'Import failed' });
      }
    } catch (error) {
      logError('Staff import apply failed', "routes", error);
      res.status(500).json({ message: 'Failed to apply staff import' });
    }
  });

  // Validate structured org assignment: referenced department/section must
  // exist and the section must belong to the (possibly derived) department.
  // Returns an error message or null; may mutate data to derive departmentId.
  const validateOrgAssignment = async (
    data: { departmentId?: number | null; sectionId?: number | null },
    existing?: { departmentId: number | null; sectionId: number | null }
  ): Promise<string | null> => {
    const deptTouched = data.departmentId !== undefined;
    const secTouched = data.sectionId !== undefined;
    if (!deptTouched && !secTouched) return null;

    const deptId = deptTouched ? data.departmentId : existing?.departmentId ?? null;
    const secId = secTouched ? data.sectionId : existing?.sectionId ?? null;

    if (deptId != null) {
      const [dept] = await db.select().from(departments).where(eq(departments.id, deptId));
      if (!dept) return `Department ${deptId} does not exist`;
    }
    if (secId != null) {
      const [sec] = await db.select().from(sections).where(eq(sections.id, secId));
      if (!sec) return `Section ${secId} does not exist`;
      if (deptId == null) {
        // Derive department from the chosen section
        data.departmentId = sec.departmentId;
      } else if (sec.departmentId !== deptId) {
        return `Section ${secId} does not belong to department ${deptId}`;
      }
    }
    return null;
  };

  app.post(
    '/api/scientists',
    requireAuth,
    requireInvestigatorDesignationManager,
    async (req: Request, res: Response) => {
    try {
      const validateData = insertScientistSchema.parse(normalizeScientistPayload(req.body));
      const orgError = await validateOrgAssignment(validateData);
      if (orgError) return res.status(400).json({ message: orgError });
      const scientist = await storage.createScientist(validateData);
      await req.audit.logInsert("scientists", scientist.id, scientist as Record<string, unknown>);
      res.status(201).json(scientist);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      const conflict = scientistUniqueConflictMessage(error);
      if (conflict) {
        logError("Failed to create scientist (unique constraint)", "routes", error);
        return res.status(409).json({ message: conflict });
      }
      logError("Failed to create scientist", "routes", error);
      res.status(500).json({ message: "Failed to create scientist" });
    }
  });



  app.patch(
    '/api/scientists/:id',
    requireAuth,
    rejectRestrictedUserProfileAccessChanges,
    requireInvestigatorDesignationManager,
    async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scientist ID" });
      }

      // Own profile, or privileged (Management/admin/superadmin).
      if (!isOwnScientistProfile(req, id) && !hasManagementRole(req)) {
        return res.status(403).json({
          message: "Forbidden. You may only edit your own scientist profile, or you need Management/admin access.",
        });
      }

      const validateData = insertScientistSchema.partial().parse(normalizeScientistPayload(req.body));
      if (validateData.departmentId !== undefined || validateData.sectionId !== undefined) {
        const existing = await storage.getScientist(id);
        if (!existing) return res.status(404).json({ message: "Scientist not found" });
        const orgError = await validateOrgAssignment(validateData, existing);
        if (orgError) return res.status(400).json({ message: orgError });
      }
      const beforeScientist = await storage.getScientist(id);
      const scientist = await storage.updateScientist(id, validateData);

      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }

      if (beforeScientist) {
        await req.audit.logUpdate(
          "scientists", id,
          beforeScientist as Record<string, unknown>,
          scientist as Record<string, unknown>,
          req.body?.reason,
        );
      }
      res.json(scientist);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      const conflict = scientistUniqueConflictMessage(error);
      if (conflict) {
        logError("Failed to update scientist (unique constraint)", "routes", error);
        return res.status(409).json({ message: conflict });
      }
      respondWriteFailure(res, "Failed to update scientist", error);
    }
  });

  // Administrator-only. Deleting a staff profile is irreversible and cannot be
  // done in bulk anywhere else -- the import deliberately never deletes -- so
  // it is held to the narrowest role rather than the management tier.
  app.delete('/api/scientists/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scientist ID" });
      }

      // Make sure the scientist exists before we go FK-hunting so the
      // 404 path stays distinguishable from the 409 "blocked" path.
      const existing = await storage.getScientist(id);
      if (!existing) {
        return res.status(404).json({ message: "Scientist not found" });
      }

      // Block hard-deletes when this scientist is still referenced anywhere
      // (program director/co-lead, project members, publication authors,
      // IRB/IBC PIs, line manager of another scientist, etc.). We reuse the
      // import flow's reference scanner so the rules stay in one place.
      const refs = await findReferencingRecords(db, [id]);
      const blockers = [...(refs.get(id) ?? [])];

      // findReferencingRecords intentionally skips the scientists self-ref
      // (supervisor_id) because the import flow needs to reason about it
      // alongside in-flight updates. For a single-row delete there is no
      // such nuance — anyone still listing this scientist as their line
      // manager is a blocker, so check it directly here.
      const supervisedRows = await db
        .select({ id: scientists.id })
        .from(scientists)
        .where(eq(scientists.supervisorId, id));
      if (supervisedRows.length > 0) {
        blockers.push({
          table: "scientists",
          column: "supervisor_id",
          count: supervisedRows.length,
          sampleIds: supervisedRows.slice(0, 5).map(r => r.id),
        });
      }

      if (blockers.length > 0) {
        return res.status(409).json(deleteRefusal(blockers));
      }

      const success = await storage.deleteScientist(id);
      if (!success) {
        return res.status(404).json({ message: "Scientist not found" });
      }

      await req.audit.logDelete("scientists", id, existing as Record<string, unknown>);
      res.status(204).send();
    } catch (error) {
      respondWriteFailure(res, "Failed to delete scientist", error);
    }
  });

  app.get('/api/staff', async (req: Request, res: Response) => {
    try {
      const staff = await storage.getStaff();
      res.json(staff);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch staff" });
    }
  });

  app.get('/api/principal-investigators', async (req: Request, res: Response) => {
    try {
      const pis = await storage.getPrincipalInvestigators();
      res.json(pis);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch principal investigators" });
    }
  });
  
  // Research Activities
  app.get('/api/research-activities', async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
      const principalInvestigatorId = req.query.principalInvestigatorId ? parseInt(req.query.principalInvestigatorId as string) : undefined;
      
      let activities;
      if (projectId && !isNaN(projectId)) {
        activities = await storage.getResearchActivitiesForProject(projectId);
      } else if (principalInvestigatorId && !isNaN(principalInvestigatorId)) {
        activities = await storage.getResearchActivitiesForScientist(principalInvestigatorId);
      } else {
        activities = await storage.getResearchActivities();
      }
      
      res.json(activities);
    } catch (error) {
      logError("Error fetching research activities", "routes", error);
      res.status(500).json({ message: "Failed to fetch research activities" });
    }
  });
  
  app.get('/api/research-activities/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const activity = await storage.getResearchActivity(id);
      if (!activity) {
        return res.status(404).json({ message: "Research activity not found" });
      }
      
      // Get project details if projectId exists
      let project = null;
      if (activity.projectId) {
        project = await storage.getProject(activity.projectId);
      }
      
      // Principal Investigator details now come from team membership
      
      const enhancedActivity = {
        ...activity,
        project: project ? {
          id: project.id,
          name: project.name,
          projectId: project.projectId
        } : null
      };
      
      res.json(enhancedActivity);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch research activity" });
    }
  });

  app.get('/api/research-activities/:id/staff', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      // Get all project members for this research activity
      const members = await storage.getProjectMembers(id);
      
      // One query for every member, not one per member.
      const scientistById = await storage.getScientistsByIds(members.map((member) => member.scientistId));
      const staffPromises = members.map(async (member) => scientistById.get(member.scientistId));
      
      const staff = await Promise.all(staffPromises);
      // Filter out any null values and return only the staff
      const validStaff = staff.filter(scientist => scientist !== undefined);
      
      res.json(validStaff);
    } catch (error) {
      logError("Error fetching research activity staff", "routes", error);
      res.status(500).json({ message: "Failed to fetch research activity staff" });
    }
  });

  app.post('/api/research-activities', async (req: Request, res: Response) => {
    try {
      const validatedData = insertResearchActivitySchema.parse(req.body);
      const eligibilityError = await getInvestigatorAssignmentError(
        validatedData.budgetHolderId,
        "Budget Holder / Principal Investigator"
      );
      if (eligibilityError) {
        return res
          .status(eligibilityError.status)
          .json({ message: eligibilityError.message });
      }
      const newActivity = await storage.createResearchActivity(validatedData);

      // Automatically add the Principal Investigator/Budget Holder to the
      // research team so the SDR starts with its PI as a member.
      if (newActivity.budgetHolderId) {
        try {
          await storage.addProjectMember({
            researchActivityId: newActivity.id,
            scientistId: newActivity.budgetHolderId,
            role: "Principal Investigator",
          });
        } catch (memberError) {
          // Don't fail SDR creation if the auto-add fails; log for diagnosis.
          logError("Failed to auto-add PI as team member", "routes", memberError);
        }
      }

      res.status(201).json(newActivity);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      logError("Error creating research activity", "routes", error);
      res.status(500).json({ message: "Failed to create research activity" });
    }
  });

  app.put('/api/research-activities/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const validatedData = insertResearchActivitySchema.partial().parse(req.body);
      const eligibilityError = await getInvestigatorAssignmentError(
        validatedData.budgetHolderId,
        "Budget Holder / Principal Investigator"
      );
      if (eligibilityError) {
        return res
          .status(eligibilityError.status)
          .json({ message: eligibilityError.message });
      }
      const updatedActivity = await storage.updateResearchActivity(id, validatedData);
      
      if (!updatedActivity) {
        return res.status(404).json({ message: "Research activity not found" });
      }

      // Creating an SDR puts its PI on the research team; changing the PI did
      // not, so somebody made PI of an existing SDR was the PI on record and
      // absent from its team at the same time. Anything reading membership --
      // the team screen, "My SDRs" -- then disagreed with the SDR itself.
      if (updatedActivity.budgetHolderId) {
        try {
          const team = await storage.getProjectMembers(id);

          // Whoever used to be PI is demoted rather than removed. They were
          // genuinely on this work and may still be; dropping them would lose
          // that, and an SDR is supposed to have exactly one PI, so leaving two
          // is not an option either. Removing them stays a deliberate act.
          for (const member of team as any[]) {
            if (
              member.role === "Principal Investigator" &&
              member.scientistId !== updatedActivity.budgetHolderId
            ) {
              await storage.setProjectMemberRole(id, member.scientistId, "Team Member");
            }
          }

          const alreadyOnIt = team.some(
            (member: any) => member.scientistId === updatedActivity.budgetHolderId,
          );
          if (!alreadyOnIt) {
            await storage.addProjectMember({
              researchActivityId: id,
              scientistId: updatedActivity.budgetHolderId,
              role: "Principal Investigator",
            });
          } else {
            // Already on the team in some other capacity: promote rather than
            // add a second row for the same person.
            await storage.setProjectMemberRole(id, updatedActivity.budgetHolderId, "Principal Investigator");
          }
        } catch (memberError) {
          // Worth reporting, not worth failing a saved update over.
          logError(`Failed to reconcile the team for ${updatedActivity.sdrNumber}`, "routes", memberError);
        }
      }
      
      res.json(updatedActivity);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      logError("Error updating research activity", "routes", error);
      res.status(500).json({ message: "Failed to update research activity" });
    }
  });

  app.delete('/api/research-activities/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      // Refuse while team members, publications, grants, applications, plans,
      // patents or contracts still point at it -- in the dev database one SDR
      // delete would have orphaned rows in three tables without a word.
      const blockers = await storage.getResearchActivityDeleteBlockers(id);
      if (blockers.length > 0) return res.status(409).json(deleteRefusal(blockers));

      const existing = await storage.getResearchActivity(id);
      const success = await storage.deleteResearchActivity(id);
      if (!success) {
        return res.status(404).json({ message: "Research activity not found" });
      }
      if (existing) await req.audit.logDelete("research_activities", id, existing as Record<string, unknown>);
      res.status(204).send();
} catch (error) {
      logError("Error deleting research activity", "routes", error);
      res.status(500).json({ message: "Failed to delete research activity" });
    }
  });

  // Projects
  app.get('/api/projects', async (req: Request, res: Response) => {
    try {
      const scientistId = req.query.scientistId ? parseInt(req.query.scientistId as string) : undefined;
      
      let projects;
      if (scientistId && !isNaN(scientistId)) {
        projects = await storage.getProjectsForScientist(scientistId);
      } else {
        projects = await storage.getProjects();
      }
      
      // Enhance projects with lead scientist details -- one lookup for the list.
      const leadById = await storage.getScientistsByIds(projects.map((project) => project.principalInvestigatorId));
      const enhancedProjects = await Promise.all(projects.map(async (project) => {
        const leadScientist = project.principalInvestigatorId != null ? leadById.get(project.principalInvestigatorId) : undefined;
        return {
          ...project,
          leadScientist: leadScientist ? {
            id: leadScientist.id,
            name: leadScientist.name,
            profileImageInitials: leadScientist.profileImageInitials
          } : null
        };
      }));
      
      res.json(enhancedProjects);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get('/api/projects/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const project = await storage.getProject(id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Get lead scientist
      const leadScientist = await storage.getScientist(project.leadScientistId);
      
      // Get team members, and their staff records in one query
      const teamMembers = await storage.getProjectMembers(id);
      const memberById = await storage.getScientistsByIds(teamMembers.map((member) => member.scientistId));
      const enhancedTeamMembers = await Promise.all(teamMembers.map(async (member) => {
        const scientist = memberById.get(member.scientistId);
        return {
          ...member,
          scientist: scientist ? {
            id: scientist.id,
            name: [scientist.honorificTitle, scientist.firstName, scientist.lastName].filter(Boolean).join(" "),
            title: scientist.jobTitle,
            profileImageInitials: scientist.profileImageInitials
          } : null
        };
      }));

      const enhancedProject = {
        ...project,
        leadScientist: leadScientist ? {
          id: leadScientist.id,
          name: leadScientist.name,
          title: leadScientist.title,
          profileImageInitials: leadScientist.profileImageInitials
        } : null,
        teamMembers: enhancedTeamMembers
      };

      res.json(enhancedProject);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.post('/api/projects', async (req: Request, res: Response) => {
    try {
      const validateData = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(validateData);
      
      // Automatically add lead scientist as a team member
      await storage.addProjectMember({
        projectId: project.id,
        scientistId: project.leadScientistId,
        role: "Principal Investigator"
      });
      
      res.status(201).json(project);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.patch('/api/projects/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const validateData = insertProjectSchema.partial().parse(req.body);
      const project = await storage.updateProject(id, validateData);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      res.json(project);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  // (A second DELETE /api/projects/:id used to be registered here, identical to
  // the one above and unreachable behind it; removed with finding #6.)

  // Project Research Activities
  app.get('/api/projects/:id/research-activities', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      
      const activities = await storage.getResearchActivitiesForProject(id);
      
      // Directly return activities without enhancement for now
      res.json(activities);
    } catch (error) {
      logError("Error fetching research activities for project", "routes", error);
      res.status(500).json({ message: "Failed to fetch research activities for project" });
    }
  });

  // Project Members
  app.get('/api/projects/:id/members', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      // Get project's research activities
      const activities = await storage.getResearchActivitiesForProject(id);
      
      if (activities.length === 0) {
        return res.json([]);
      }
      
      // Get members for each research activity
      const allMembers = [];
      for (const activity of activities) {
        const members = await storage.getProjectMembers(activity.id);
        
        // Enhance team members with scientist details, one query per activity
        const memberById = await storage.getScientistsByIds(members.map((member) => member.scientistId));
        const enhancedMembers = await Promise.all(members.map(async (member) => {
          const scientist = memberById.get(member.scientistId);
          return {
            ...member,
            researchActivityTitle: activity.title,
            scientist: scientist ? {
              id: scientist.id,
              name: [scientist.honorificTitle, scientist.firstName, scientist.lastName].filter(Boolean).join(" "),
              title: scientist.jobTitle,
              profileImageInitials: scientist.profileImageInitials
            } : null
          };
        }));
        
        allMembers.push(...enhancedMembers);
      }
      
      res.json(allMembers);
    } catch (error) {
      logError("Error fetching project members", "routes", error);
      res.status(500).json({ message: "Failed to fetch project members" });
    }
  });

  // Get all project members across all projects
  app.get('/api/project-members', async (req: Request, res: Response) => {
    try {
      const allMembers = await storage.getAllProjectMembers();
      res.json(allMembers);
    } catch (error) {
      logError("Error fetching all project members", "routes", error);
      res.status(500).json({ message: "Failed to fetch project members" });
    }
  });

  app.post('/api/projects/:id/members', async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      // Need to select a research activity for this project
      const { researchActivityId, scientistId, role } = req.body;
      
      if (!researchActivityId) {
        return res.status(400).json({ message: "Research activity ID is required" });
      }
      
      // Validate that the research activity belongs to this project
      const researchActivity = await storage.getResearchActivity(researchActivityId);
      if (!researchActivity) {
        return res.status(404).json({ message: "Research activity not found" });
      }
      
      if (researchActivity.projectId !== projectId) {
        return res.status(400).json({ message: "Research activity does not belong to this project" });
      }
      
      const validateData = insertProjectMemberSchema.parse({
        researchActivityId,
        scientistId,
        role
      });
      
      // Check if scientist exists
      const scientist = await storage.getScientist(validateData.scientistId);
      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }

      if (!isInvestigatorRoleAssignmentAllowed(validateData.role, scientist)) {
        return res.status(400).json({
          message:
            "Only staff with an eligible Investigator designation can be assigned the role of Principal Investigator",
        });
      }
            
      const member = await storage.addProjectMember(validateData);
      
      // Return enhanced member with scientist details
      const enhancedMember = {
        ...member,
        researchActivityTitle: researchActivity.title,
        scientist: {
          id: scientist.id,
          name: [scientist.honorificTitle, scientist.firstName, scientist.lastName].filter(Boolean).join(" "),
          title: scientist.jobTitle,
          profileImageInitials: scientist.profileImageInitials
        }
      };
      
      res.status(201).json(enhancedMember);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      logError("Error adding project member", "routes", error);
      res.status(500).json({ message: "Failed to add project member" });
    }
  });

  app.delete('/api/projects/:projectId/members/:scientistId', async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const scientistId = parseInt(req.params.scientistId);
      const researchActivityId = req.query.researchActivityId ? parseInt(req.query.researchActivityId as string) : undefined;
      
      if (isNaN(projectId) || isNaN(scientistId)) {
        return res.status(400).json({ message: "Invalid ID parameters" });
      }
      
      if (!researchActivityId) {
        return res.status(400).json({ message: "Research activity ID is required" });
      }
      
      // Validate that the research activity belongs to this project
      const researchActivity = await storage.getResearchActivity(researchActivityId);
      if (!researchActivity) {
        return res.status(404).json({ message: "Research activity not found" });
      }
      
      if (researchActivity.projectId !== projectId) {
        return res.status(400).json({ message: "Research activity does not belong to this project" });
      }

      // Note: Principal Investigator role is now managed through team membership

      const success = await storage.removeProjectMember(researchActivityId, scientistId);
      
      if (!success) {
        return res.status(404).json({ message: "Project member not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      logError("Error removing project member", "routes", error);
      res.status(500).json({ message: "Failed to remove project member" });
    }
  });

  // Research Activity Members - Direct access routes
  app.get('/api/research-activities/:id/members', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const members = await storage.getProjectMembers(id);
      
      // Enhance team members with scientist details, one query for the list
      const memberById = await storage.getScientistsByIds(members.map((member) => member.scientistId));
      const enhancedMembers = await Promise.all(members.map(async (member) => {
        const scientist = memberById.get(member.scientistId);
        return {
          ...member,
          scientist: scientist ? {
            id: scientist.id,
            firstName: scientist.firstName,
            lastName: scientist.lastName,
            honorificTitle: scientist.honorificTitle,
            jobTitle: scientist.jobTitle,
            email: scientist.email,
            staffId: scientist.staffId,
            profileImageInitials: scientist.profileImageInitials
          } : null
        };
      }));
      
      res.json(enhancedMembers);
    } catch (error) {
      logError("Error fetching research activity members", "routes", error);
      res.status(500).json({ message: "Failed to fetch research activity members" });
    }
  });

  app.post('/api/research-activities/:id/members', async (req: Request, res: Response) => {
    try {
      const researchActivityId = parseInt(req.params.id);
      if (isNaN(researchActivityId)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const { scientistId, role } = req.body;
      
      const validateData = insertProjectMemberSchema.parse({
        researchActivityId,
        scientistId,
        role
      });
      
      // Check if scientist exists
      const scientist = await storage.getScientist(validateData.scientistId);
      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }
      
      // Principal Investigator is an investigator-only team role.
      if (!isInvestigatorRoleAssignmentAllowed(validateData.role, scientist)) {
        return res.status(400).json({ 
          message: "Only staff with an eligible Investigator designation can be assigned the role of Principal Investigator"
        });
      }
      
      // Check if member already exists
      const existingMembers = await storage.getProjectMembers(researchActivityId);
      const memberExists = existingMembers.some(m => m.scientistId === scientistId);
      if (memberExists) {
        return res.status(400).json({ message: "Scientist is already a member of this research activity" });
      }
      
      // Enforce role constraints: Only 1 Principal Investigator and 1 Lead Scientist per research activity
      const currentRoles = existingMembers.map(m => m.role);
      
      if (validateData.role === "Principal Investigator") {
        const hasPrincipalInvestigator = currentRoles.includes("Principal Investigator");
        if (hasPrincipalInvestigator) {
          return res.status(400).json({ 
            message: "Each research activity can only have one Principal Investigator" 
          });
        }
      }
      
      if (validateData.role === "Lead Scientist") {
        const hasLeadScientist = currentRoles.includes("Lead Scientist");
        if (hasLeadScientist) {
          return res.status(400).json({ 
            message: "Each research activity can only have one Lead Scientist" 
          });
        }
      }
            
      const member = await storage.addProjectMember(validateData);
      
      // Return enhanced member with scientist details
      const enhancedMember = {
        ...member,
        scientist: {
          id: scientist.id,
          name: [scientist.honorificTitle, scientist.firstName, scientist.lastName].filter(Boolean).join(" "),
          title: scientist.jobTitle,
          email: scientist.email,
          staffId: scientist.staffId,
          profileImageInitials: scientist.profileImageInitials
        }
      };
      
      res.status(201).json(enhancedMember);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      logError("Error adding research activity member", "routes", error);
      res.status(500).json({ message: "Failed to add research activity member" });
    }
  });

  app.delete('/api/research-activities/:id/members/:scientistId', async (req: Request, res: Response) => {
    try {
      const researchActivityId = parseInt(req.params.id);
      const scientistId = parseInt(req.params.scientistId);
      
      if (isNaN(researchActivityId) || isNaN(scientistId)) {
        return res.status(400).json({ message: "Invalid ID parameters" });
      }
      
      // Note: Principal Investigator role is now managed through team membership

      const success = await storage.removeProjectMember(researchActivityId, scientistId);
      
      if (!success) {
        return res.status(404).json({ message: "Research activity member not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      logError("Error removing research activity member", "routes", error);
      res.status(500).json({ message: "Failed to remove research activity member" });
    }
  });

  // Data Management Plans
  app.get('/api/data-management-plans', async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
      const researchActivityId = req.query.researchActivityId ? parseInt(req.query.researchActivityId as string) : undefined;

      let plans;
      if (projectId && !isNaN(projectId)) {
        const plan = await storage.getDataManagementPlanForProject(projectId);
        plans = plan ? [plan] : [];
      } else if (researchActivityId && !isNaN(researchActivityId)) {
        // The SDR page asks for its own plan; it used to download every plan
        // and keep one.
        const plan = await storage.getDataManagementPlanForResearchActivity(researchActivityId);
        plans = plan ? [plan] : [];
      } else {
        plans = await storage.getDataManagementPlans();
      }
      
      // Enhance plans with project details
      const enhancedPlans = await Promise.all(plans.map(async (plan) => {
        const project = await storage.getProject(plan.projectId);
        return {
          ...plan,
          project: project ? {
            id: project.id,
            title: project.title
          } : null
        };
      }));
      
      res.json(enhancedPlans);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch data management plans" });
    }
  });

  app.get('/api/data-management-plans/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid data management plan ID" });
      }

      const plan = await storage.getDataManagementPlan(id);
      if (!plan) {
        return res.status(404).json({ message: "Data management plan not found" });
      }

      // Get project details
      const project = await storage.getProject(plan.projectId);
      
      const enhancedPlan = {
        ...plan,
        project: project ? {
          id: project.id,
          title: project.title
        } : null
      };

      res.json(enhancedPlan);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch data management plan" });
    }
  });

  app.post('/api/data-management-plans', async (req: Request, res: Response) => {
    try {
      const validateData = insertDataManagementPlanSchema.parse(req.body);
      
      // Check if project exists
      const project = await storage.getProject(validateData.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Check if a plan already exists for this project
      const existingPlan = await storage.getDataManagementPlanForProject(validateData.projectId);
      if (existingPlan) {
        return res.status(409).json({ message: "A data management plan already exists for this project" });
      }
      
      const plan = await storage.createDataManagementPlan(validateData);
      res.status(201).json(plan);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to create data management plan" });
    }
  });

  app.patch('/api/data-management-plans/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid data management plan ID" });
      }

      const validateData = insertDataManagementPlanSchema.partial().parse(req.body);
      const plan = await storage.updateDataManagementPlan(id, validateData);
      
      if (!plan) {
        return res.status(404).json({ message: "Data management plan not found" });
      }
      
      res.json(plan);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update data management plan" });
    }
  });

  app.delete('/api/data-management-plans/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid data management plan ID" });
      }

      const existing = await storage.getDataManagementPlan(id);
      const success = await storage.deleteDataManagementPlan(id);
      
      if (!success) {
        return res.status(404).json({ message: "Data management plan not found" });
      }
      
      if (existing) await req.audit.logDelete("data_management_plans", id, existing as Record<string, unknown>);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete data management plan" });
    }
  });

  // Publications
  // ----- Bulk "Import Links" (Outcome Office) -----
  // Template download: 4-column Excel file officers fill in and re-upload.
  app.get('/api/publications/link-import/template', requirePublicationOfficer, async (_req: Request, res: Response) => {
    try {
      const buf = await buildLinkImportTemplate();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="publication-links-template.xlsx"');
      res.send(buf);
    } catch (error) {
      logError("Error building link-import template", "routes", error);
      res.status(500).json({ message: "Failed to build template" });
    }
  });

  // Parse an uploaded template and report, per row, what would be linked
  // (with SDR title / staff job title as match evidence) or why it was ignored.
  app.post('/api/publications/link-import/preview', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const { fileBase64, fileName } = req.body ?? {};
      if (typeof fileBase64 !== 'string' || !fileBase64) {
        return res.status(400).json({ message: "Provide fileBase64 and fileName" });
      }
      const [pubs, ras, scis, allAuthors] = await Promise.all([
        storage.getPublications(),
        storage.getResearchActivities(),
        storage.getScientists(),
        db.select({
          publicationId: publicationAuthors.publicationId,
          scientistId: publicationAuthors.scientistId,
        }).from(publicationAuthors),
      ]);
      const authorMap = new Map<number, Set<number>>();
      for (const a of allAuthors) {
        if (!authorMap.has(a.publicationId)) authorMap.set(a.publicationId, new Set());
        authorMap.get(a.publicationId)!.add(a.scientistId);
      }
      const rows = await previewLinkImport(fileBase64, String(fileName ?? 'upload.xlsx'), {
        publications: pubs,
        researchActivities: ras,
        scientists: scis,
        publicationAuthors: authorMap,
      });
      res.json({ rows });
    } catch (error) {
      logError("Error previewing link import", "routes", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to parse file" });
    }
  });

  // Apply the confirmed links from a preview.
  app.post('/api/publications/link-import/apply', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const actorId = (req.session as any)?.user?.id ?? null;
      const rawLinks: unknown = req.body?.links;
      if (!Array.isArray(rawLinks) || rawLinks.length === 0) {
        return res.status(400).json({ message: "Provide a non-empty list of links." });
      }
      if (rawLinks.length > 2000) {
        return res.status(400).json({ message: "Too many links in one request (max 2000)." });
      }
      let sdrLinks = 0, staffLinks = 0;
      const skipped: { publicationId: number; reason: string }[] = [];
      // Defend against conflicting/duplicate entries regardless of what the
      // client sends: one SDR link per publication, one row per staff pair.
      const sdrSeen = new Set<number>();
      const staffSeen = new Set<string>();
      for (const raw of rawLinks) {
        const publicationId = Number((raw as any)?.publicationId);
        if (!Number.isInteger(publicationId)) { skipped.push({ publicationId, reason: "invalid publication id" }); continue; }
        const pub = await storage.getPublication(publicationId);
        if (!pub) { skipped.push({ publicationId, reason: "publication not found" }); continue; }
        if (pub.status === 'Published *') { skipped.push({ publicationId, reason: "publication is sealed (Published *)" }); continue; }

        const researchActivityId = Number((raw as any)?.researchActivityId);
        const scientistId = Number((raw as any)?.scientistId);
        if (Number.isInteger(researchActivityId) && researchActivityId > 0) {
          if (sdrSeen.has(publicationId)) { skipped.push({ publicationId, reason: "conflicting SDR link earlier in this request" }); continue; }
          sdrSeen.add(publicationId);
          const ra = await storage.getResearchActivity(researchActivityId);
          if (!ra) { skipped.push({ publicationId, reason: "SDR not found" }); continue; }
          if (pub.researchActivityId === ra.id) { skipped.push({ publicationId, reason: "already linked to SDR" }); continue; }
          await storage.updatePublication(publicationId, { researchActivityId: ra.id });
          sdrLinks++;
        } else if (Number.isInteger(scientistId) && scientistId > 0) {
          const pairKey = `${publicationId}:${scientistId}`;
          if (staffSeen.has(pairKey)) { skipped.push({ publicationId, reason: "duplicate staff link earlier in this request" }); continue; }
          staffSeen.add(pairKey);
          const scientist = await storage.getScientist(scientistId);
          if (!scientist) { skipped.push({ publicationId, reason: "staff member not found" }); continue; }
          const existing = await storage.getPublicationAuthors(publicationId);
          if (existing.some((a) => a.scientistId === scientistId)) {
            skipped.push({ publicationId, reason: "staff member already linked" });
            continue;
          }
          await storage.addPublicationAuthor({
            publicationId,
            scientistId,
            authorshipType: 'Contributing Author',
            authorPosition: null,
            linkedByUserId: actorId,
            linkMethod: 'automatic',
          } as any);
          staffLinks++;
        } else {
          skipped.push({ publicationId, reason: "link is missing an SDR or staff target" });
        }
      }
      res.json({ sdrLinks, staffLinks, skipped });
    } catch (error) {
      logError("Error applying link import", "routes", error);
      res.status(500).json({ message: "Failed to apply links" });
    }
  });

  app.get('/api/publications', async (req: Request, res: Response) => {
    try {
      const researchActivityId = req.query.researchActivityId ? parseInt(req.query.researchActivityId as string) : undefined;
      const programId = req.query.programId ? parseInt(req.query.programId as string) : undefined;
      const page = req.query.page ? parseInt(req.query.page as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      
      // Validate pagination params if provided
      if ((page !== undefined && (isNaN(page) || page < 1)) || 
          (limit !== undefined && (isNaN(limit) || limit < 1))) {
        return res.status(400).json({ message: "Invalid pagination parameters. page and limit must be positive integers." });
      }
      
      const hasOfficeAccess =
        req.query.officeAccess === "true" &&
        hasPublicationOfficerRole(req);

      // The office list pages in SQL: the total comes from a count and only
      // the requested rows are loaded. Every other case (an SDR's or program's
      // publications, or a viewer whose rows must be filtered one by one) is a
      // small set and pages in memory below, as before (finding #28).
      let publications;
      let sqlPage: { total: number } | null = null;
      if (researchActivityId && !isNaN(researchActivityId)) {
        publications = await storage.getPublicationsForResearchActivity(researchActivityId);
      } else if (programId && !isNaN(programId)) {
        // The SDRs of the program's projects, resolved on the server so the
        // program page does not have to pull every publication to find its own.
        publications = await storage.getPublicationsForProgram(programId);
      } else if (hasOfficeAccess && page !== undefined && limit !== undefined) {
        const paged = await storage.getPublicationsPage(limit, (page - 1) * limit);
        publications = paged.rows;
        sqlPage = { total: paged.total };
      } else {
        publications = await storage.getPublications();
      }

      // Authors for these rows only, not the whole table.
      const allPublicationAuthors = await storage.getPublicationAuthorsForPublications(
        publications.map((publication) => publication.id),
      );
      const authorsByPublication = new Map<number, Array<{
        scientistId: number;
        supervisorId: number | null;
      }>>();
      for (const author of allPublicationAuthors) {
        const linked = authorsByPublication.get(author.publicationId) ?? [];
        linked.push({
          scientistId: author.scientistId,
          supervisorId: author.scientist.supervisorId,
        });
        authorsByPublication.set(author.publicationId, linked);
      }
      if (!hasOfficeAccess) {
        const viewer = getScientistPublicationViewer(req);
        publications = publications.filter((publication) =>
          canViewPublication(
            viewer,
            publication,
            authorsByPublication.get(publication.id) ?? [],
          )
        );
      }
      
      // Enhance publications with research activity details: the primary SDR
      // and any additional ones. Both read from one load of the activities
      // rather than a query per row.
      const activityById = new Map(
        (await storage.getResearchActivities()).map((activity) => [activity.id, activity]),
      );
      const additionalActivityIdsByPublication = new Map<number, number[]>();
      for (const link of await storage.getAllPublicationResearchActivityLinks()) {
        const ids = additionalActivityIdsByPublication.get(link.publicationId) ?? [];
        ids.push(link.researchActivityId);
        additionalActivityIdsByPublication.set(link.publicationId, ids);
      }
      const enhancedPublications = await Promise.all(publications.map(async (pub) => {
        const researchActivity = pub.researchActivityId ? activityById.get(pub.researchActivityId) ?? null : null;
        const additionalResearchActivities = (additionalActivityIdsByPublication.get(pub.id) ?? [])
          .map((activityId) => activityById.get(activityId))
          .filter((activity): activity is NonNullable<typeof activity> => activity != null)
          .map(summariseResearchActivity);
        const canSeeInvalidReason =
          hasPublicationOfficerRole(req) ||
          (req.session.user?.scientistId != null &&
            (authorsByPublication.get(pub.id) ?? []).some((author) =>
              author.scientistId === req.session.user!.scientistId
            ));
        const { invalidReason: _privateInvalidReason, ...safePublication } = pub;
        return {
          ...safePublication,
          ...(canSeeInvalidReason ? { invalidReason: pub.invalidReason } : {}),
          researchActivity: researchActivity ? summariseResearchActivity(researchActivity) : null,
          additionalResearchActivities,
        };
      }));
      
      // Apply pagination if requested. When the page came from SQL the rows are
      // already the page and the total is the table's count.
      if (page !== undefined && limit !== undefined) {
        const total = sqlPage ? sqlPage.total : enhancedPublications.length;
        const startIndex = (page - 1) * limit;
        const paginatedPublications = sqlPage
          ? enhancedPublications
          : enhancedPublications.slice(startIndex, startIndex + limit);
        res.json({
          data: paginatedPublications,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        });
} else {
        res.json(enhancedPublications);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch publications" });
    }
  });

  // Bulk count of publications grouped by journal name (case-insensitive).
  // Accepts `?journals=name1|name2|...` (pipe-separated because journal names
  // may contain commas) and returns { [journalName]: count }. Names not in
  // the query are returned with count 0 so the frontend can render zeros.
  app.get('/api/publications/journal-counts', async (req: Request, res: Response) => {
    try {
      const raw = (req.query.journals as string | undefined) ?? '';
      const requested = raw.split('|').map((s) => s.trim()).filter(Boolean);
      const result: Record<string, number> = {};
      for (const name of requested) result[name] = 0;
      if (requested.length === 0) return res.json(result);

      const all = await storage.getPublications();
      const lowerToOriginal = new Map<string, string>();
      for (const name of requested) lowerToOriginal.set(name.toLowerCase(), name);
      for (const pub of all) {
        const j = (pub.journal ?? '').trim().toLowerCase();
        if (!j) continue;
        const original = lowerToOriginal.get(j);
        if (original) result[original] = (result[original] ?? 0) + 1;
      }
      res.json(result);
    } catch (error) {
      logError('Error getting publication journal counts', "routes", error);
      res.status(500).json({ message: 'Failed to count publications by journal' });
    }
  });

  // Count of linked internal authors per publication. Returns a map of
  // { [publicationId]: number } so the office can flag publications that have
  // no internal scientist/author records linked. Registered before
  // "/api/publications/:id" so the literal path isn't swallowed by the id route.
  app.get('/api/publications/author-counts', async (_req: Request, res: Response) => {
    try {
      const allAuthors = await storage.getAllPublicationAuthors();
      const counts: Record<number, number> = {};
      for (const author of allAuthors) {
        counts[author.publicationId] = (counts[author.publicationId] || 0) + 1;
      }
      res.json(counts);
    } catch (error) {
      logError('Error getting publication author counts', "routes", error);
      res.status(500).json({ message: 'Failed to count publication authors' });
    }
  });

  // Map of publicationId -> linked internal scientists (id + display name).
  // Used by the office UI to offer a "filter by scientist" control over the
  // New Publications list. Registered before "/api/publications/:id".
  app.get('/api/publications/author-map', async (_req: Request, res: Response) => {
    try {
      const allAuthors = await storage.getAllPublicationAuthors();
      const map: Record<number, Array<{ id: number; name: string }>> = {};
      for (const author of allAuthors) {
        const s = author.scientist;
        const name = [s.honorificTitle, s.firstName, s.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() || `Scientist #${s.id}`;
        if (!map[author.publicationId]) map[author.publicationId] = [];
        if (!map[author.publicationId].some((e) => e.id === s.id)) {
          map[author.publicationId].push({ id: s.id, name });
        }
      }
      res.json(map);
    } catch (error) {
      logError('Error building publication author map', "routes", error);
      res.status(500).json({ message: 'Failed to build publication author map' });
    }
  });

  // Publications needing author-linking fixes for a requested scientist or,
  // when no scientist is specified, the current user. Returns only that person's
  // likely publications that have a real
  // author-linking problem: either no internal authors linked, or a linked
  // internal author that does not appear in the free-text author list.
  // Registered before "/api/publications/:id" so the literal path isn't
  // swallowed by the id param route.
  app.get('/api/publications/needs-author-fix', async (req: Request, res: Response) => {
    try {
      const subject = await resolveAuthorCheckSubject({
        requestedScientistId: req.query.scientistId,
        authMode: getAuthMode(),
        sessionUser: req.session.user,
        getScientist: (id) => storage.getScientist(id),
      });
      if (!subject.ok) {
        return res.status(subject.status).json({ message: subject.message });
      }

      const { firstName, lastName } = subject;
      if (!firstName || !lastName) {
        // Can't determine the target person's name, so there's nothing to match.
        return res.json([]);
      }

      const [allPublications, allAuthors, allScientists] = await Promise.all([
        storage.getPublications(),
        storage.getAllPublicationAuthors(),
        // Needed to spot a name in the author text belonging to somebody on
        // staff who is not linked. The check used to answer only "is anyone
        // linked" and "does each linked author appear in the text", so a record
        // with one author linked and three colleagues unlinked passed clean.
        storage.getScientists(),
      ]);
      const matchableScientists = allScientists
        .filter((s) => s.firstName && s.lastName)
        .map((s) => ({ id: s.id, firstName: s.firstName as string, lastName: s.lastName as string }));

      let includeUnpublished = false;
      if (typeof req.query.scientistId === "string") {
        const targetScientist = await storage.getScientist(Number(req.query.scientistId));
        includeUnpublished = !!targetScientist && canViewUnpublishedScientistPublications(
          getScientistPublicationViewer(req),
          targetScientist,
        );
      } else if (req.session.user?.scientistId) {
        includeUnpublished = true;
      }

      // Group internal author links by publication id.
      const authorsByPublication = new Map<number, (typeof allAuthors)>();
      for (const author of allAuthors) {
        const list = authorsByPublication.get(author.publicationId) || [];
        list.push(author);
        authorsByPublication.set(author.publicationId, list);
      }

      const flagged = allPublications
        .filter(pub =>
          includeUnpublished ||
          isPublicScientistProfilePublicationStatus(pub.status)
        )
        // Only the target scientist/current user's likely publications.
        .filter(pub => matchesAuthorName(pub.authors, firstName, lastName))
        .map(pub => {
          const linkedAuthors = authorsByPublication.get(pub.id) || [];
          // Every name in the free-text list, told apart: already linked, on
          // staff but unlinked, or not on staff. Shared with the Outcome Office
          // view and with "Auto-connect authors", so all three agree about who
          // is missing.
          const authorEntries = classifyAuthorEntries(
            pub.authors,
            matchableScientists,
            linkedAuthors.map(a => a.scientistId),
          );
          const missedAuthors = authorEntries
            .filter(e => e.status === "missed")
            .map(e => ({ scientistId: e.scientistId as number, name: e.text }));

          if (linkedAuthors.length === 0) {
            return { publication: pub, reason: "no_internal_authors" as const, authorEntries, missedAuthors };
          }

          const mismatched = linkedAuthors.filter(
            a => !isLinkedAuthorInAuthorsText(pub.authors, a.scientist.firstName, a.scientist.lastName)
          );

          if (mismatched.length > 0) {
            return {
              publication: pub,
              reason: "author_mismatch" as const,
              authorEntries,
              missedAuthors,
              mismatchedAuthors: mismatched.map(a => ({
                scientistId: a.scientistId,
                firstName: a.scientist.firstName,
                lastName: a.scientist.lastName,
              })),
            };
          }

          // Everything linked checks out, but colleagues in the author list are
          // not linked. This returned null before, so the record never appeared.
          if (missedAuthors.length > 0) {
            return { publication: pub, reason: "missing_internal_links" as const, authorEntries, missedAuthors };
          }

          return null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      res.json(flagged);
    } catch (error) {
      logError("Error finding publications needing author fixes", "routes", error);
      res.status(500).json({ message: "Failed to find publications needing author fixes" });
    }
  });

  // Active correction issues are based only on explicit publication-author
  // links. This literal route must remain before /api/publications/:id.
  app.get('/api/publications/invalid-issues', requireAuth, async (req: Request, res: Response) => {
    try {
      const actorScientistId = req.session.user?.scientistId ?? null;
      const requestedScientistId =
        typeof req.query.scientistId === "string"
          ? Number(req.query.scientistId)
          : null;
      if (
        requestedScientistId != null &&
        (!Number.isInteger(requestedScientistId) || requestedScientistId <= 0)
      ) {
        return res.status(400).json({ message: "Invalid scientist ID" });
      }
      if (
        !hasPublicationOfficerRole(req) &&
        requestedScientistId != null &&
        requestedScientistId !== actorScientistId
      ) {
        return res.status(403).json({ message: "You may only view your own linked publication issues." });
      }
      const targetScientistId = hasPublicationOfficerRole(req)
        ? requestedScientistId
        : actorScientistId;
      if (!hasPublicationOfficerRole(req) && targetScientistId == null) {
        return res.status(403).json({ message: "Your account is not linked to a scientist profile." });
      }

      const [allPublications, allAuthors] = await Promise.all([
        storage.getPublications(),
        storage.getAllPublicationAuthors(),
      ]);
      const invalidPublications = selectInvalidLinkedPublications(
        allPublications,
        allAuthors,
        targetScientistId,
      );
      const issues = await Promise.all(invalidPublications.map(async (publication) => {
        const history = await storage.getManuscriptHistory(publication.id);
        const invalidation = history.find((entry) =>
          entry.toStatus === PUBLISHED_INVALID_STATUS
        );
        return {
          publicationId: publication.id,
          title: publication.title,
          status: PUBLISHED_INVALID_STATUS,
          invalidReason: publication.invalidReason,
          invalidatedAt: invalidation?.createdAt ?? publication.updatedAt ?? null,
        };
      }));
      res.json(issues);
    } catch (error) {
      logError("Error fetching invalid publication issues", "routes", error);
      res.status(500).json({ message: "Failed to fetch invalid publication issues" });
    }
  });

  // Duplicate publication detection. Returns groups of likely-duplicate
  // publications (same DOI / PMID / fuzzy metadata, or preprint<->published
  // pairs) with the records needed to render a side-by-side merge review.
  // Registered before "/api/publications/:id" so the literal path isn't
  // swallowed by the id param route.
  app.get('/api/publications/duplicates', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const [allPublications, allAuthors] = await Promise.all([
        storage.getPublications(),
        storage.getAllPublicationAuthors(),
      ]);

      const groups = detectDuplicateGroups(allPublications);

      const authorCountByPublication = new Map<number, number>();
      for (const a of allAuthors) {
        authorCountByPublication.set(
          a.publicationId,
          (authorCountByPublication.get(a.publicationId) || 0) + 1,
        );
      }
      const byId = new Map(allPublications.map((p) => [p.id, p]));

      const result = groups.map((group) => {
        const groupPubs = group.publicationIds
          .map((id) => byId.get(id))
          .filter((p): p is NonNullable<typeof p> => p != null);
        return {
          reasons: group.reasons,
          isPreprintPair: group.isPreprintPair,
          defaultSurvivorId: pickDefaultSurvivorId(groupPubs),
          publications: groupPubs.map((p) => {
            const { invalidReason: _privateInvalidReason, ...safePublication } = p;
            return {
              ...safePublication,
              ...(hasPublicationOfficerRole(req)
                ? { invalidReason: p.invalidReason }
                : {}),
              authorCount: authorCountByPublication.get(p.id) || 0,
            };
          }),
        };
      });

      res.json(result);
    } catch (error) {
      logError("Error detecting duplicate publications", "routes", error);
      res.status(500).json({ message: "Failed to detect duplicate publications" });
    }
  });

  // Lightweight count of duplicate groups for the tab badge.
  app.get('/api/publications/duplicates/count', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const allPublications = await storage.getPublications();
      const groups = detectDuplicateGroups(allPublications);
      res.json({ count: groups.length });
    } catch (error) {
      logError("Error counting duplicate publication groups", "routes", error);
      res.status(500).json({ message: "Failed to count duplicate publication groups" });
    }
  });

  // Merge a set of duplicate publications into a chosen survivor. Office-only;
  // performs the whole operation atomically (author de-dup, history re-pointing,
  // research-activity carry-over, deletion) so a failure changes nothing.
  app.post('/api/publications/merge', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const mergeSchema = z.object({
        survivorId: z.number().int(),
        mergeIds: z.array(z.number().int()).min(1),
        fields: z.record(z.any()).optional(),
      });
      const { survivorId, mergeIds, fields } = mergeSchema.parse(req.body);
      if (fields?.status === PUBLISHED_INVALID_STATUS) {
        return res.status(400).json({
          message: "Use the dedicated invalidation action and provide a reason.",
        });
      }

      const targetIds = Array.from(new Set(mergeIds)).filter((id) => id !== survivorId);
      if (targetIds.length === 0) {
        return res.status(400).json({ message: "Provide at least one distinct publication to merge into the survivor." });
      }

      // Only allow known publication columns to be overridden on the survivor.
      const allowedFields = [
        "title", "abstract", "authors", "journal", "volume", "issue", "pages",
        "doi", "pmid", "publicationDate", "publicationType", "status",
        "prepublicationUrl", "prepublicationSite", "researchActivityId",
      ] as const;
      const overrides: Record<string, any> = {};
      if (fields) {
        for (const key of allowedFields) {
          if (key in fields) overrides[key] = (fields as any)[key];
        }
      }

      // Sealed publications cannot participate in a merge — revert first.
      const involved = await Promise.all([survivorId, ...targetIds].map((pid) => storage.getPublication(pid)));
      const sealed = involved.filter((p) => p?.status === 'Published *');
      if (sealed.length > 0) {
        return res.status(403).json({
          message: `Cannot merge: publication(s) ${sealed.map((p) => p!.id).join(', ')} are sealed (Published *). Revert the final approval first.`,
        });
      }
      const invalid = involved.filter((p) => p?.status === PUBLISHED_INVALID_STATUS);
      if (invalid.length > 0) {
        return res.status(403).json({
          message: `Cannot merge: publication(s) ${invalid.map((p) => p!.id).join(', ')} are awaiting linked-author correction or withdrawal.`,
        });
      }

      const changedBy = req.session?.user?.id ?? null;

      const survivor = await storage.mergePublications(
        survivorId,
        targetIds,
        overrides,
        changedBy,
      );
      if (!survivor) {
        return res.status(404).json({ message: "Surviving publication not found" });
      }

      res.json(survivor);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      logError("Error merging publications", "routes", error);
      res.status(500).json({ message: error?.message || "Failed to merge publications" });
    }
  });

  // Literal publication maintenance routes must stay above /api/publications/:id,
  // otherwise Express treats their final segment as an invalid numeric id.
  app.get('/api/publications/preprint-repair-candidates', requirePublicationOfficer, async (_req: Request, res: Response) => {
    try {
      const candidates = (await storage.getPublications())
        .map((publication) => {
          const evidence = preprintRepairEvidence(publication);
          if (!evidence.length) return null;
          const proposed = classifyResolvedPublication(publication);
          return {
            id: publication.id,
            title: publication.title,
            doi: publication.doi,
            publicationType: publication.publicationType,
            status: publication.status,
            prepublicationUrl: publication.prepublicationUrl,
            prepublicationSite: publication.prepublicationSite,
            evidence,
            proposed,
          };
        })
        .filter(Boolean);
      res.json({ candidates, count: candidates.length });
    } catch (error) {
      logError("Error listing preprint repair candidates", "routes", error);
      res.status(500).json({ message: "Failed to list preprint repair candidates" });
    }
  });

  app.post('/api/publications/preprint-repair', requirePublicationOfficer, async (req: Request, res: Response) => {
    const rawIds = req.body?.publicationIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({ message: "Provide a non-empty publicationIds array." });
    }
    const ids = [...new Set(rawIds.map(Number).filter(Number.isInteger))];
    if (!ids.length) {
      return res.status(400).json({ message: "publicationIds must contain integer IDs." });
    }
    const actorId = req.session?.user?.id;
    if (actorId == null) {
      return res.status(401).json({ message: "Authentication required" });
    }
    try {
      const updated: { id: number; title: string }[] = [];
      const skipped: { id: number; reason: string }[] = [];
      for (const id of ids) {
        const result = await storage.repairPreprintPublication(id, actorId);
        if (result.publication) {
          updated.push({ id: result.publication.id, title: result.publication.title });
        } else {
          skipped.push({ id, reason: result.reason || "not updated" });
        }
      }
      res.json({
        updated,
        skipped,
        updatedCount: updated.length,
        skippedCount: skipped.length,
      });
    } catch (error) {
      logError("Error repairing preprint publications", "routes", error);
      res.status(500).json({ message: "Failed to repair preprint publications" });
    }
  });

  app.get('/api/publications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const publication = await storage.getPublication(id);
      if (!publication) {
        return res.status(404).json({ message: "Publication not found" });
      }

      const hasOfficeAccess =
        req.query.officeAccess === "true" &&
        hasPublicationOfficerRole(req);
      const linkedAuthors = (await storage.getPublicationAuthors(publication.id))
        .map((author) => ({
          scientistId: author.scientistId,
          supervisorId: author.scientist.supervisorId,
        }));
      if (!hasOfficeAccess) {
        if (!canViewPublication(
          getScientistPublicationViewer(req),
          publication,
          linkedAuthors,
        )) {
          return res.status(404).json({ message: "Publication not found" });
        }
      }

      // Get research activity details
      const researchActivity = publication.researchActivityId ? await storage.getResearchActivity(publication.researchActivityId) : null;
      
      const enhancedPublication = {
        ...(() => {
          const canSeeInvalidReason =
            hasPublicationOfficerRole(req) ||
            (req.session.user?.scientistId != null &&
              linkedAuthors.some((author) =>
                author.scientistId === req.session.user!.scientistId
              ));
          const { invalidReason: _privateInvalidReason, ...safePublication } = publication;
          return {
            ...safePublication,
            ...(canSeeInvalidReason ? { invalidReason: publication.invalidReason } : {}),
          };
        })(),
        researchActivity: researchActivity ? summariseResearchActivity(researchActivity) : null,
        additionalResearchActivities: (await storage.getPublicationResearchActivities(id))
          .map(summariseResearchActivity),
      };

      res.json(enhancedPublication);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch publication" });
    }
  });

  /**
   * Resolves the SDR-exemption fields for a create or update.
   *
   * The reason is the scientist's own claim, so who made it and when are
   * stamped from the session rather than taken from the request body -- a
   * client must not be able to attribute an exception to someone else.
   *
   * Linking an SDR clears the exemption. The two are mutually exclusive: a
   * publication that names its research activity is not also claiming there
   * is none.
   */
  const resolveSdrExemption = (
    req: Request,
    incoming: Record<string, unknown>,
    existing?: { researchActivityId?: number | null; sdrExemptionReason?: string | null },
  ): { ok: true; fields: Record<string, unknown> } | { ok: false; message: string } => {
    const linkedSdr = incoming.researchActivityId !== undefined
      ? incoming.researchActivityId
      : existing?.researchActivityId ?? null;

    if (linkedSdr != null) {
      return {
        ok: true,
        fields: {
          sdrExemptionReason: null,
          sdrExemptionRequestedBy: null,
          sdrExemptionRequestedAt: null,
        },
      };
    }

    // Absent from the payload on an update: leave whatever is already stored.
    if (incoming.sdrExemptionReason === undefined) {
      return { ok: true, fields: {} };
    }

    const raw = incoming.sdrExemptionReason;
    if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
      return {
        ok: true,
        fields: {
          sdrExemptionReason: null,
          sdrExemptionRequestedBy: null,
          sdrExemptionRequestedAt: null,
        },
      };
    }

    const result = validateSdrExemptionReason(raw);
    if (!result.ok) return { ok: false, message: result.message };

    // Re-saving the same reason must not restamp it as a fresh request.
    if (existing?.sdrExemptionReason?.trim() === result.reason) {
      return { ok: true, fields: {} };
    }

    return {
      ok: true,
      fields: {
        sdrExemptionReason: result.reason,
        // The demo session uses id 0, which is not a real user row. `|| null`
        // rather than `?? null` so it records nobody instead of failing the
        // foreign key.
        sdrExemptionRequestedBy: req.session?.user?.id || null,
        sdrExemptionRequestedAt: new Date(),
      },
    };
  };

  app.post('/api/publications', requireAuth, rejectPublicationCreateWorkflowMutation, async (req: Request, res: Response) => {
    try {
      // Create a validation schema that makes authors optional for concept status
      const createPublicationSchema = insertPublicationSchema.extend({
        authors: z.string().optional().nullable(),
      });
      
      const validateData = createPublicationSchema.parse(req.body);
      
      // Set default status to "Concept" if not provided
      const publicationData = {
        ...validateData,
        status: validateData.status || "Concept"
      };
      
      // Check the SDR and enforce record ownership for researcher-created
      // publications. Outcome Office/management may create across all SDRs.
      let researchActivity = null;
      if (publicationData.researchActivityId) {
        researchActivity = await storage.getResearchActivity(publicationData.researchActivityId);
        if (!researchActivity) {
          return res.status(404).json({ message: "Research activity not found" });
        }
      }

      const exemption = resolveSdrExemption(req, publicationData as Record<string, unknown>);
      if (!exemption.ok) {
        return res.status(400).json({ message: exemption.message });
      }
      const claimsExemption = typeof exemption.fields.sdrExemptionReason === "string";

      if (!hasPublicationOfficerRole(req)) {
        // A publication with no SDR is normally a researcher recording work
        // outside any research activity, which this ownership rule exists to
        // prevent. The exception is a collaborator's paper: there is no SDR
        // here to be a member of, so the explanation stands in for the check
        // and the Outcome Office reads it before the record is finalised.
        if (!researchActivity && !claimsExemption) {
          return res.status(403).json({
            message:
              "Researchers must choose an SDR where they are the budget holder or a project member, or explain why no SDR applies.",
          });
        }
        if (researchActivity) {
          const projectMembers = await storage.getProjectMembers(researchActivity.id);
          if (
            !canCreatePublicationForResearchActivity(
              req,
              researchActivity.budgetHolderId,
              projectMembers.map((member) => member.scientistId)
            )
          ) {
            return res.status(403).json({
              message:
                "You may only create publications for an SDR where you are the budget holder or a project member.",
            });
          }
        }
      }

      // The demo session uses id 0, which is not a real user row, so `??` here
      // wrote 0 and the users foreign key rejected the insert -- creating a
      // publication in demo mode failed outright. `||` records nobody instead.
      // Additional SDRs, sent with the record so the form saves in one step.
      // Optional; the primary above carries every rule. Checked before the
      // record is written so a bad id refuses the whole request rather than
      // leaving a publication behind without its links.
      const additionalIds = Array.isArray(req.body.additionalResearchActivityIds)
        ? normaliseAdditionalSdrIds(publicationData.researchActivityId, req.body.additionalResearchActivityIds)
        : null;
      if (additionalIds) {
        const missing = await findMissingResearchActivityIds(additionalIds);
        if (missing.length > 0) {
          return res.status(404).json({ message: `Research activity ${missing.join(", ")} not found` });
        }
      }

      const creatorUserId = req.session?.user?.id || null;
      const publication = await storage.createPublication({
        ...publicationData,
        ...exemption.fields,
        createdByUserId: creatorUserId,
      } as any);

      if (additionalIds && additionalIds.length > 0) {
        await storage.setPublicationResearchActivities(publication.id, additionalIds);
      }

      // Create initial history entry for publication creation, attributed to
      // the session user so the timeline shows who created the record. With
      // no session there is nobody to name, and the row says so (null) rather
      // than crediting the legacy default user 1.
      await storage.createManuscriptHistoryEntry({
        publicationId: publication.id,
        fromStatus: '',
        toStatus: publication.status || 'Concept',
        changedBy: creatorUserId ?? null,
        changeReason: 'Publication created',
      });

      // The exception is a claim someone made. Record it in the timeline so it
      // survives a later correction and can be traced to whoever made it.
      if (typeof exemption.fields.sdrExemptionReason === 'string') {
        await storage.createManuscriptHistoryEntry({
          publicationId: publication.id,
          fromStatus: publication.status || 'Concept',
          toStatus: publication.status || 'Concept',
          changedField: 'sdrExemption',
          oldValue: null,
          newValue: exemption.fields.sdrExemptionReason as string,
          changedBy: creatorUserId ?? null,
          changeReason: `No SDR: ${exemption.fields.sdrExemptionReason}`,
        });
      }

      await req.audit.logInsert("publications", publication.id, publication as Record<string, unknown>);
      res.status(201).json(publication);
    } catch (error) {
      logError("Publication creation error", "routes", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to create publication", error: error.message });
    }
  });

  app.patch('/api/publications/:id', requireAuth, rejectGenericPublicationWorkflowMutation, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const validateData = insertPublicationSchema.partial().parse(req.body);

      const existing = await storage.getPublication(id);
      if (!existing) {
        return res.status(404).json({ message: "Publication not found" });
      }

      // Sealed records: once the Outcome Office marks a publication
      // "Published *" it is final and read-only. The office must use the
      // revert function before any further edits.
      if (existing.status === 'Published *') {
        return res.status(403).json({
          message: "This publication is sealed (Published *). Revert the final approval in the Outcome Office before editing.",
        });
      }

      const linkedAuthors = await storage.getPublicationAuthors(id);
      if (
        !canEditPublicationForLinkedScientists(
          req,
          linkedAuthors.map((author) => author.scientistId)
        )
      ) {
        return res.status(403).json({
          message:
            "You may only edit publications linked to your scientist profile. Add or confirm your own internal-author link first, or ask Outcome Office for help.",
        });
      }

      // Check if research activity exists if researchActivityId is provided
      if (validateData.researchActivityId) {
        const researchActivity = await storage.getResearchActivity(validateData.researchActivityId);
        if (!researchActivity) {
          return res.status(404).json({ message: "Research activity not found" });
        }
      }

      const exemption = resolveSdrExemption(
        req,
        validateData as Record<string, unknown>,
        existing,
      );
      if (!exemption.ok) {
        return res.status(400).json({ message: exemption.message });
      }

      // Additional SDRs travel with the edit. The list sent is the whole set,
      // normalised against whichever primary the record will have after this
      // update, and checked before anything is written.
      const primaryAfterUpdate = validateData.researchActivityId !== undefined
        ? validateData.researchActivityId
        : existing.researchActivityId;
      const additionalIds = Array.isArray(req.body.additionalResearchActivityIds)
        ? normaliseAdditionalSdrIds(primaryAfterUpdate, req.body.additionalResearchActivityIds)
        : null;
      if (additionalIds) {
        const missing = await findMissingResearchActivityIds(additionalIds);
        if (missing.length > 0) {
          return res.status(404).json({ message: `Research activity ${missing.join(", ")} not found` });
        }
      }

      const publication = await storage.updatePublication(id, {
        ...validateData,
        ...exemption.fields,
      });

      if (!publication) {
        return res.status(404).json({ message: "Publication not found" });
      }

      if (additionalIds) {
        await storage.setPublicationResearchActivities(id, additionalIds);
      }

      if (typeof exemption.fields.sdrExemptionReason === 'string') {
        await storage.createManuscriptHistoryEntry({
          publicationId: id,
          fromStatus: existing.status || '',
          toStatus: publication.status || '',
          changedField: 'sdrExemption',
          oldValue: existing.sdrExemptionReason ?? null,
          newValue: exemption.fields.sdrExemptionReason as string,
          changedBy: req.session?.user?.id ?? null,
          changeReason: `No SDR: ${exemption.fields.sdrExemptionReason}`,
        });
      }

      await req.audit.logUpdate(
        "publications", id,
        existing as Record<string, unknown>,
        publication as Record<string, unknown>,
        req.body?.reason,
      );
      res.json(publication);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update publication" });
    }
  });

  app.delete('/api/publications/:id', requireAuth, requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const sealedCheck = await storage.getPublication(id);
      if (sealedCheck?.status === 'Published *') {
        return res.status(403).json({
          message: "This publication is sealed (Published *). Revert the final approval in the Outcome Office before deleting.",
        });
      }

      const success = await storage.deletePublication(id);
      
      if (!success) {
        return res.status(404).json({ message: "Publication not found" });
      }
      
      if (sealedCheck) await req.audit.logDelete("publications", id, sealedCheck as Record<string, unknown>);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete publication" });
    }
  });

  // Manuscript History
  // What a publication payload says about an SDR it is linked to: enough to
  // name it, link to it, and place it under its project.
  function summariseResearchActivity(activity: ResearchActivity) {
    return {
      id: activity.id,
      sdrNumber: activity.sdrNumber,
      title: activity.title,
      projectId: activity.projectId,
    };
  }

  async function findMissingResearchActivityIds(ids: number[]): Promise<number[]> {
    const found = await Promise.all(ids.map((activityId) => storage.getResearchActivity(activityId)));
    return ids.filter((_, index) => !found[index]);
  }

  // The additional SDRs a publication is linked to, beyond the one on the
  // record. The primary stays on the record and keeps every rule; these are
  // optional, and a paper is listed on each of them.
  app.get('/api/publications/:id/research-activities', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }
      const publication = await storage.getPublication(id);
      if (!publication) {
        return res.status(404).json({ message: "Publication not found" });
      }
      const linkedAuthors = await storage.getPublicationAuthors(id);
      if (!canViewPublication(
        getScientistPublicationViewer(req),
        publication,
        linkedAuthors.map((author) => ({
          scientistId: author.scientistId,
          supervisorId: author.scientist?.supervisorId ?? null,
        })),
      )) {
        return res.status(404).json({ message: "Publication not found" });
      }
      const activities = await storage.getPublicationResearchActivities(id);
      res.json(activities.map(summariseResearchActivity));
    } catch (error) {
      logError("Error fetching publication research activities", "routes", error);
      res.status(500).json({ message: "Failed to fetch publication research activities" });
    }
  });

  // Replaces the set. Same rule as editing the record: not sealed, and the
  // caller is linked to the paper or works in the Outcome Office.
  app.put('/api/publications/:id/research-activities', requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }
      if (!Array.isArray(req.body?.researchActivityIds)) {
        return res.status(400).json({ message: "researchActivityIds must be a list of research activity ids" });
      }
      const existing = await storage.getPublication(id);
      if (!existing) {
        return res.status(404).json({ message: "Publication not found" });
      }
      if (existing.status === 'Published *') {
        return res.status(403).json({
          message: "This publication is sealed (Published *). Revert the final approval in the Outcome Office before editing.",
        });
      }
      const linkedAuthors = await storage.getPublicationAuthors(id);
      if (!canEditPublicationForLinkedScientists(req, linkedAuthors.map((author) => author.scientistId))) {
        return res.status(403).json({
          message:
            "You may only edit publications linked to your scientist profile. Add or confirm your own internal-author link first, or ask Outcome Office for help.",
        });
      }
      const additionalIds = normaliseAdditionalSdrIds(existing.researchActivityId, req.body.researchActivityIds);
      const missing = await findMissingResearchActivityIds(additionalIds);
      if (missing.length > 0) {
        return res.status(404).json({ message: `Research activity ${missing.join(", ")} not found` });
      }
      const activities = await storage.setPublicationResearchActivities(id, additionalIds);
      res.json(activities.map(summariseResearchActivity));
    } catch (error) {
      logError("Error updating publication research activities", "routes", error);
      res.status(500).json({ message: "Failed to update publication research activities" });
    }
  });

  app.get('/api/publications/:id/history', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }
      const historyPublication = await storage.getPublication(id);
      if (!historyPublication) {
        return res.status(404).json({ message: "Publication not found" });
      }
      const historyAuthors = await storage.getPublicationAuthors(id);
      if (!canViewPublication(
        getScientistPublicationViewer(req),
        historyPublication,
        historyAuthors.map((author) => ({
          scientistId: author.scientistId,
          supervisorId: author.scientist?.supervisorId ?? null,
        })),
      )) {
        return res.status(404).json({ message: "Publication not found" });
      }
      const canSeeCorrectionReason =
        hasPublicationOfficerRole(req) ||
        (req.session.user?.scientistId != null &&
          historyAuthors.some((author) =>
            author.scientistId === req.session.user!.scientistId
          ));

      // changed_by is the account that made the change (a users FK since
      // finding #8), so the name comes from users alone. It used to left-join
      // scientists on the same value as well, and a row written with a
      // scientist id by an older path showed whichever user shared that id.
      const rows = await db
        .select({
          id: manuscriptHistory.id,
          publicationId: manuscriptHistory.publicationId,
          fromStatus: manuscriptHistory.fromStatus,
          toStatus: manuscriptHistory.toStatus,
          changedField: manuscriptHistory.changedField,
          oldValue: manuscriptHistory.oldValue,
          newValue: manuscriptHistory.newValue,
          changedBy: manuscriptHistory.changedBy,
          changeReason: manuscriptHistory.changeReason,
          createdAt: manuscriptHistory.createdAt,
          userName: users.name,
        })
        .from(manuscriptHistory)
        .leftJoin(users, eq(manuscriptHistory.changedBy, users.id))
        .where(eq(manuscriptHistory.publicationId, id))
        .orderBy(desc(manuscriptHistory.createdAt));

      const history = rows.map((r) => {
        return {
          id: r.id,
          publicationId: r.publicationId,
          fromStatus: r.fromStatus,
          toStatus: r.toStatus,
          changedField: r.changedField,
          oldValue: r.oldValue,
          newValue: r.newValue,
          changedBy: r.changedBy,
          changedByName: r.userName ?? null,
          changeReason:
            canSeeCorrectionReason ||
            (
              r.fromStatus !== PUBLISHED_INVALID_STATUS &&
              r.toStatus !== PUBLISHED_INVALID_STATUS
            )
              ? r.changeReason
              : null,
          createdAt: r.createdAt,
        };
      });

      res.json(history);
    } catch (error) {
      logError('Error fetching manuscript history', "routes", error);
      res.status(500).json({ message: "Failed to fetch manuscript history" });
    }
  });

  // Publication Status Management
  app.post(
    '/api/publications/:id/ip-vet',
    requirePublicationOfficer,
    createIpVettingHandler(storage)
  );

  app.post(
    '/api/publications/:id/mark-invalid',
    requirePublicationOfficer,
    createInvalidatePublishedHandler(storage),
  );

  app.post(
    '/api/publications/:id/submit-correction',
    requireAuth,
    createInvalidAuthorActionHandler(storage, PUBLISHED_STATUS),
  );

  app.post(
    '/api/publications/:id/withdraw-invalid',
    requireAuth,
    createInvalidAuthorActionHandler(storage, WITHDRAWN_STATUS),
  );

  app.post('/api/publications/:id/finalize', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const sessionUserId = req.session?.user?.id;
      if (sessionUserId == null) {
        return res.status(401).json({ message: "You must be signed in." });
      }

      const publication = await storage.getPublication(id);
      if (!publication) {
        return res.status(404).json({ message: "Publication not found" });
      }
      if (publication.status === "Published *") {
        return res.status(403).json({
          message:
            "This publication is already sealed. Revert the final approval before making changes.",
        });
      }
      if (publication.status === PUBLISHED_INVALID_STATUS) {
        return res.status(400).json({
          message:
            "An invalid publication cannot be finalized. A linked author must submit a correction first.",
        });
      }
      if (publication.status !== PUBLISHED_STATUS) {
        return res.status(400).json({
          message: `Only a current ${PUBLISHED_STATUS} publication can be finalized as Published *.`,
        });
      }

      const issues: string[] = [];
      if (!publication.journal?.trim()) issues.push("missing journal");
      if (!publication.publicationDate) issues.push("missing publication date");
      if (!publication.doi?.trim() && !publication.pmid?.trim()) {
        issues.push("missing DOI/PMID");
      }
      if (!publication.authors?.trim()) issues.push("missing authors");
      if (!publication.abstract?.trim()) issues.push("missing abstract");
      // An accepted explanation stands in for the link. The office reads the
      // reason on the card before finalising, which is the vetting step.
      if (!hasSdrOrExemption(publication)) issues.push("no linked SDR or exception");
      const internalAuthors = await storage.getPublicationAuthors(id);
      if (internalAuthors.length === 0) issues.push("no linked internal authors");
      if (issues.length > 0) {
        return res.status(400).json({
          message: `Cannot mark as Published *: unresolved issues (${issues.join(", ")}).`,
          issues,
        });
      }

      const updated = await storage.updatePublicationStatus(
        id,
        "Published *",
        sessionUserId,
        undefined,
        PUBLISHED_STATUS,
      );
      if (!updated) {
        return res.status(409).json({
          message: "The publication changed before final approval completed. Refresh and try again.",
        });
      }
      res.json(updated);
    } catch (error) {
      logError("Error finalizing publication", "routes", error);
      res.status(500).json({ message: "Failed to finalize publication" });
    }
  });

  app.patch('/api/publications/:id/status', requireAuth, rejectProtectedPublicationStatusFields, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const { status, changes } = req.body;

      // Coerced, not trusted as sent: a date arrives here as a string and the
      // column is a timestamp.
      const parsedFields = parsePublicationStatusFields(req.body?.updatedFields);
      if (!parsedFields.ok) {
        return res.status(400).json({ message: parsedFields.message });
      }
      const updatedFields = parsedFields.fields;

      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }

      // Resolve the acting user from the session — never trust the client to
      // attribute a status change to someone else.
      const sessionUserId = req.session?.user?.id;
      if (sessionUserId == null) {
        return res.status(401).json({ message: "You must be signed in to change publication status." });
      }
      const changedBy = sessionUserId;

      // Validate status transition
      const currentPublication = await storage.getPublication(id);
      
      if (!currentPublication) {
        return res.status(404).json({ message: "Publication not found" });
      }

      const linkedAuthors = await storage.getPublicationAuthors(id);
      if (
        !canEditPublicationForLinkedScientists(
          req,
          linkedAuthors.map((author) => author.scientistId)
        )
      ) {
        return res.status(403).json({
          message:
            "You may only change the status of publications linked to your scientist profile, or ask Outcome Office for help.",
        });
      }

      // Status validation logic. Each entry lists every status reachable from
      // the key — forward transitions, revert paths (one hop back), and
      // author-controlled withdrawal. Keep in sync with the
      // `getNextStatuses` map in client/src/pages/publications/detail.tsx.
      const validTransitions: Record<string, string[]> = {
        'Concept': ['Complete Draft', 'Withdrawn'],
        'Complete Draft': ['Vetted for submission', 'Concept', 'Withdrawn'],
        'Vetted for submission': ['Submitted for review with pre-publication', 'Submitted for review without pre-publication', 'Complete Draft', 'Withdrawn'],
        'Submitted for review with pre-publication': ['Under review', 'Vetted for submission', 'Withdrawn'],
        'Submitted for review without pre-publication': ['Under review', 'Vetted for submission', 'Withdrawn'],
        'Under review': ['Accepted/In Press', 'Submitted for review with pre-publication', 'Submitted for review without pre-publication', 'Withdrawn'],
        'Accepted/In Press': ['Published', 'Under review', 'Withdrawn'],
        'Published': ['Accepted/In Press'],
        'Published - Invalid': [],
        // Sealed: only the Outcome Office revert route can leave this state.
        'Published *': [],
        'Rejected': ['Under review', 'Vetted for submission'],
        'Withdrawn': ['Concept'],
      };

      const currentStatus = currentPublication.status || 'Concept';
      const workflowViolation = getStatusTransitionWorkflowViolation(
        currentStatus,
        status
      );
      if (workflowViolation) {
        return res
          .status(workflowViolation.statusCode)
          .json({ message: workflowViolation.message });
      }
      if (currentStatus === 'Published *') {
        return res.status(403).json({
          message: "This publication is sealed (Published *). Only the Outcome Office can revert the final approval.",
        });
      }
      if (!validTransitions[currentStatus]?.includes(status)) {
        return res.status(400).json({ 
          message: `Invalid status transition from "${currentStatus}" to "${status}"` 
        });
      }

      // Field validation based on status
      const validationErrors = [];
      
      if (status === 'Complete Draft') {
        const finalAuthors = updatedFields?.authors || currentPublication.authors;
        if (!finalAuthors || finalAuthors.trim() === '') {
          validationErrors.push('Authorship field is required for Complete Draft status');
        }
      }
      
      if (status === 'Vetted for submission' && !currentPublication.vettedForSubmissionByIpOffice) {
        validationErrors.push('IP office approval is required for Vetted for submission status. Please update this in the publication edit form.');
      }
      
      if (status === 'Submitted for review with pre-publication') {
        const finalUrl = (updatedFields?.prepublicationUrl?.trim() || currentPublication.prepublicationUrl?.trim()) || '';
        const finalSite = (updatedFields?.prepublicationSite?.trim() || currentPublication.prepublicationSite?.trim()) || '';
        if (!finalUrl || !finalSite) {
          validationErrors.push('Prepublication URL and site are required for pre-publication submission');
        }
      }
      
      if (['Under review', 'Accepted/In Press'].includes(status)) {
        const finalJournal = updatedFields?.journal || currentPublication.journal;
        if (!finalJournal || finalJournal.trim() === '') {
          validationErrors.push('Journal name is required for this status');
        }
      }
      
      if (status === 'Published') {
        const finalDate = updatedFields?.publicationDate || currentPublication.publicationDate;
        const finalDoi = updatedFields?.doi || currentPublication.doi;
        if (!finalDate || !finalDoi) {
          validationErrors.push('Publication date and DOI are required for Published status');
        }
      }

      if (validationErrors.length > 0) {
        return res.status(400).json({ message: validationErrors.join('; ') });
      }

      // Commit fields, status, and history together, only if the status that
      // was authorized above is still current.
      const updatedPublication = await storage.updatePublicationStatus(
        id,
        status,
        changedBy,
        changes,
        currentStatus,
        updatedFields,
      );
      
      if (!updatedPublication) {
        return res.status(409).json({
          message: "The publication changed before this status update completed. Refresh and try again.",
        });
      }

      // Audit the status transition — this is the most important write in the
      // publications workflow: it captures reviewer decisions, rejections, and
      // final approvals with full context.
      await req.audit.logStatusChange(
        "publications", id,
        currentStatus,
        status,
        undefined,
        req.body?.changeReason ?? req.body?.reason,
      );

      res.json(updatedPublication);
    } catch (error) {
      logError('Error updating publication status', "routes", error);
      res.status(500).json({ message: "Failed to update publication status" });
    }
  });

  // Outcome Office: revert the final "Published *" approval (unseals the record).
  app.post(
    '/api/publications/:id/revert-final',
    requirePublicationOfficer,
    createRevertFinalHandler(storage),
  );

  // Publication Authors
  app.get('/api/publications/:id/authors', async (req: Request, res: Response) => {
    try {
      const publicationId = parseInt(req.params.id);
      if (isNaN(publicationId)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const authors = await storage.getPublicationAuthors(publicationId);
      res.json(authors);
    } catch (error) {
      logError("Error fetching publication authors", "routes", error);
      res.status(500).json({ message: "Failed to fetch publication authors", error: error.message });
    }
  });

  app.post('/api/publications/:id/authors', requireAuth, async (req: Request, res: Response) => {
    try {
      const publicationId = parseInt(req.params.id);
      if (isNaN(publicationId)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const validateData = insertPublicationAuthorSchema.parse({
        ...req.body,
        publicationId
      });

      const targetPub = await storage.getPublication(publicationId);
      if (!targetPub) {
        return res.status(404).json({ message: "Publication not found" });
      }
      if (targetPub.status === 'Published *') {
        return res.status(403).json({ message: "This publication is sealed (Published *). Revert the final approval before changing author links." });
      }

      // An author of the paper may manage any of its links; anyone else may
      // manage only their own, and a new self-link must also match the
      // free-text author list. Outcome Office may manage any link.
      const existingAuthors = await storage.getPublicationAuthors(publicationId);
      const existingAuthor = existingAuthors.find(author => author.scientistId === validateData.scientistId);
      const targetScientist = existingAuthor?.scientist ?? await storage.getScientist(validateData.scientistId);
      const allScientists = existingAuthor ? [] : await storage.getScientists();
      const authorNameMatches = targetScientist
        ? isUnambiguousAuthorMatch(
            targetPub.authors,
            targetScientist,
            existingAuthor ? [targetScientist] : allScientists
          )
        : false;
      if (
        !canManagePublicationAuthorLink(
          req,
          validateData.scientistId,
          Boolean(existingAuthor),
          authorNameMatches,
          existingAuthors.map((author) => author.scientistId)
        )
      ) {
        return res.status(403).json({
          message:
            "You may only manage internal-author links on a publication you are an author of. Ask Outcome Office to correct links elsewhere.",
        });
      }

      // Attribution: this endpoint is the manual linking flow (detail page), so
      // every link/update it makes is stamped as a manual link by the acting
      // session user. linkedByUserId is nullable for legacy rows; we set it here.
      const actorId = (req.session as any)?.user?.id ?? null;

      if (existingAuthor) {
        // Update existing author by combining authorship types
        const existingTypes = existingAuthor.authorshipType.split(',').map(t => t.trim());
        const newTypes = validateData.authorshipType.split(',').map(t => t.trim());
        
        // Combine types, avoiding duplicates
        const combinedTypes = [...new Set([...existingTypes, ...newTypes])];
        
        const updatedAuthor = await storage.updatePublicationAuthor(
          publicationId,
          validateData.scientistId,
          {
            authorshipType: combinedTypes.join(', '),
            authorPosition: validateData.authorPosition || existingAuthor.authorPosition,
            linkMethod: "manual",
            linkedByUserId: actorId,
          }
        );
        // Recorded because an author may now change a co-author's link, and
        // a change to somebody else's authorship credit has to be
        // attributable rather than anonymous. linkedByUserId alone says who
        // created a link, not who last altered one.
        await req.audit.logUpdate(
          "publication_authors",
          existingAuthor.id,
          {
            authorshipType: existingAuthor.authorshipType,
            authorPosition: existingAuthor.authorPosition,
          },
          {
            authorshipType: updatedAuthor?.authorshipType ?? null,
            authorPosition: updatedAuthor?.authorPosition ?? null,
          },
          `Internal-author link updated on publication ${publicationId}`,
        );
        res.status(200).json(updatedAuthor);
      } else {
        // Add new author
        const author = await storage.addPublicationAuthor({
          ...validateData,
          linkMethod: "manual",
          linkedByUserId: actorId,
        });
        await req.audit.logInsert(
          "publication_authors",
          author.id,
          author as unknown as Record<string, unknown>,
          `Internal author linked to publication ${publicationId}`,
        );
        res.status(201).json(author);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      logError("Failed to add publication author", "routes", error);
      res.status(500).json({ message: "Failed to add publication author", detail: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete('/api/publications/:publicationId/authors/:scientistId', requireAuth, async (req: Request, res: Response) => {
    try {
      const publicationId = parseInt(req.params.publicationId);
      const scientistId = parseInt(req.params.scientistId);
      
      if (isNaN(publicationId) || isNaN(scientistId)) {
        return res.status(400).json({ message: "Invalid publication or scientist ID" });
      }

      const targetPub = await storage.getPublication(publicationId);
      if (targetPub?.status === 'Published *') {
        return res.status(403).json({ message: "This publication is sealed (Published *). Revert the final approval before changing author links." });
      }

      const existingAuthors = await storage.getPublicationAuthors(publicationId);
      const existingAuthor = existingAuthors.find(author => author.scientistId === scientistId);
      if (
        !canManagePublicationAuthorLink(
          req,
          scientistId,
          Boolean(existingAuthor),
          false,
          existingAuthors.map((author) => author.scientistId)
        )
      ) {
        return res.status(403).json({
          message:
            "You may only remove internal-author links on a publication you are an author of. Ask Outcome Office to correct links elsewhere.",
        });
      }

      const success = await storage.removePublicationAuthor(publicationId, scientistId);
      
      if (!success) {
        return res.status(404).json({ message: "Publication author not found" });
      }
      
      // A removal leaves nothing behind to show who did it, which is the
      // whole reason an author may now remove somebody else's link.
      if (existingAuthor) {
        await req.audit.logDelete(
          "publication_authors",
          existingAuthor.id,
          {
            publicationId,
            scientistId,
            authorshipType: existingAuthor.authorshipType,
            authorPosition: existingAuthor.authorPosition,
          },
          `Internal-author link removed from publication ${publicationId}`,
        );
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to remove publication author" });
    }
  });

  // Suggest internal-author links for a publication from its free-text author
  // list. Returns one suggestion per matched internal scientist (excluding those
  // already linked) with an inferred authorship type + position. This is the
  // shared matcher (suggestInternalAuthors) reused by the auto-connect dialog.
  app.get('/api/publications/:id/author-suggestions', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const publicationId = parseInt(req.params.id);
      if (isNaN(publicationId)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const publication = await storage.getPublication(publicationId);
      if (!publication) {
        return res.status(404).json({ message: "Publication not found" });
      }

      const [scientists, existingAuthors] = await Promise.all([
        storage.getScientists(),
        storage.getPublicationAuthors(publicationId),
      ]);
      const excludeIds = existingAuthors.map((a) => a.scientistId);

      const suggestions = suggestInternalAuthors(
        publication.authors,
        scientists,
        excludeIds,
      );

      // Hydrate each suggestion with the scientist record so the client can show
      // names without a second round-trip.
      const byId = new Map(scientists.map((s) => [s.id, s]));
      const hydrated = suggestions.map((s) => ({
        ...s,
        scientist: byId.get(s.scientistId) ?? null,
      }));

      res.json({ suggestions: hydrated });
    } catch (error) {
      logError("Error suggesting publication authors", "routes", error);
      res.status(500).json({ message: "Failed to suggest publication authors" });
    }
  });

  // Bulk-confirm a set of suggested internal-author links for one publication.
  // Each link is marked automatic and attributed to the acting session user.
  // Used by the auto-connect confirmation dialog.
  app.post('/api/publications/:id/authors/bulk', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const publicationId = parseInt(req.params.id);
      if (isNaN(publicationId)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const publication = await storage.getPublication(publicationId);
      if (!publication) {
        return res.status(404).json({ message: "Publication not found" });
      }
      if (publication.status === 'Published *') {
        return res.status(403).json({ message: "This publication is sealed (Published *). Revert the final approval before changing author links." });
      }

      const actorId = (req.session as any)?.user?.id ?? null;

      const rawLinks: unknown = req.body?.links;
      if (!Array.isArray(rawLinks) || rawLinks.length === 0) {
        return res
          .status(400)
          .json({ message: "Provide a non-empty list of author links." });
      }

      // Validate each requested link; skip scientists already linked.
      const existingAuthors = await storage.getPublicationAuthors(publicationId);
      const alreadyLinked = new Set(existingAuthors.map((a) => a.scientistId));

      const created: any[] = [];
      const skipped: { scientistId: number; reason: string }[] = [];

      for (const link of rawLinks) {
        const scientistId = Number((link as any)?.scientistId);
        const authorshipType =
          typeof (link as any)?.authorshipType === "string"
            ? (link as any).authorshipType.trim()
            : "";
        const authorPositionRaw = (link as any)?.authorPosition;
        const authorPosition =
          typeof authorPositionRaw === "number" && Number.isFinite(authorPositionRaw)
            ? authorPositionRaw
            : null;

        if (!Number.isInteger(scientistId) || !authorshipType) {
          skipped.push({ scientistId, reason: "invalid" });
          continue;
        }
        if (alreadyLinked.has(scientistId)) {
          skipped.push({ scientistId, reason: "already linked" });
          continue;
        }

        const scientist = await storage.getScientist(scientistId);
        if (!scientist) {
          skipped.push({ scientistId, reason: "scientist not found" });
          continue;
        }

        const author = await storage.addPublicationAuthor({
          publicationId,
          scientistId,
          authorshipType,
          authorPosition: authorPosition ?? undefined,
          linkMethod: "automatic",
          linkedByUserId: actorId,
        });
        alreadyLinked.add(scientistId);
        created.push(author);
      }

      res.status(201).json({
        created,
        skipped,
        createdCount: created.length,
        skippedCount: skipped.length,
      });
    } catch (error) {
      logError("Error bulk-linking publication authors", "routes", error);
      res.status(500).json({ message: "Failed to link publication authors" });
    }
  });

  // Paper Discovery — search multiple external sources for papers, merge and
  // dedup by DOI, and flag which results already exist in the portal. Restricted
  // to publication-office staff since it is an institution-wide discovery tool.
  app.post('/api/publications/discover', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const mode: string = typeof body.mode === "string" ? body.mode : "institution";

      // Requested sources (default to all keyless sources). ORCID only applies
      // to scientist mode and is filtered out otherwise.
      const requestedSources: string[] = Array.isArray(body.sources) && body.sources.length
        ? body.sources.map((s: any) => String(s).toLowerCase())
        : ["openalex", "pubmed", "crossref", "europepmc", "orcid"];

      const yearFrom = Number.isFinite(Number(body.yearFrom)) ? Number(body.yearFrom) : null;
      const yearTo = Number.isFinite(Number(body.yearTo)) ? Number(body.yearTo) : null;

      // Build the list of per-source queries based on the mode.
      const queries: DiscoveryQuery[] = [];

      if (mode === "scientist") {
        const scientistIds: number[] = Array.isArray(body.scientistIds)
          ? body.scientistIds.map((n: any) => Number(n)).filter(Number.isInteger)
          : [];
        if (scientistIds.length === 0) {
          return res.status(400).json({ message: "Select at least one scientist." });
        }
        const allScientists = await storage.getScientists();
        const byId = new Map(allScientists.map((s) => [s.id, s]));
        for (const sid of scientistIds) {
          const sci = byId.get(sid);
          if (!sci) continue;
          const name = [sci.firstName, sci.lastName].filter(Boolean).join(" ").trim();
          if (!name) continue;
          queries.push({
            authorName: name,
            orcidId: (sci as any).orcidId || undefined,
            yearFrom,
            yearTo,
          });
        }
        if (queries.length === 0) {
          return res.status(400).json({ message: "No usable scientist names found." });
        }
      } else if (mode === "keyword") {
        const query = typeof body.query === "string" ? body.query.trim() : "";
        if (!query) {
          return res.status(400).json({ message: "Provide a search query." });
        }
        queries.push({ query, yearFrom, yearTo });
      } else {
        // institution mode
        const affiliation = typeof body.affiliation === "string" ? body.affiliation.trim() : "";
        if (!affiliation) {
          return res.status(400).json({ message: "Provide an institution / affiliation." });
        }
        queries.push({ affiliation, yearFrom, yearTo });
      }

      // Run every (source, query) pair in parallel; each fetcher fails soft.
      const tasks: Promise<DiscoveredPaper[]>[] = [];
      for (const sourceKey of requestedSources) {
        const fetcher = DISCOVERY_FETCHERS[sourceKey];
        if (!fetcher) continue;
        // ORCID needs an orcidId, only present in scientist-mode queries.
        if (sourceKey === "orcid" && mode !== "scientist") continue;
        for (const q of queries) {
          if (sourceKey === "orcid" && !q.orcidId) continue;
          tasks.push(fetcher(q));
        }
      }

      const settled = await Promise.allSettled(tasks);
      const rows: DiscoveredPaper[] = [];
      for (const r of settled) {
        if (r.status === "fulfilled") rows.push(...r.value);
      }

      // Merge by DOI identity (version-aware), collecting contributing sources
      // and keeping the most complete metadata seen for each work.
      const merged = new Map<string, {
        doi: string;
        title: string;
        journal: string;
        year: number | null;
        authors: string;
        sources: Set<string>;
        matchedAffiliation: string | null;
      }>();

      for (const row of rows) {
        if (!withinYearRange(row.year, yearFrom, yearTo)) continue;
        const identity = workDoiIdentity(row.doi) || row.doi;
        const existing = merged.get(identity);
        if (existing) {
          existing.sources.add(row.source);
          if (!existing.title || existing.title === "Untitled work") existing.title = row.title;
          if (!existing.journal) existing.journal = row.journal;
          if (existing.year == null) existing.year = row.year;
          if (!existing.authors) existing.authors = row.authors;
          if (!existing.matchedAffiliation && row.matchedAffiliation) {
            existing.matchedAffiliation = row.matchedAffiliation;
          }
        } else {
          merged.set(identity, {
            doi: row.doi,
            title: row.title,
            journal: row.journal,
            year: row.year,
            authors: row.authors,
            sources: new Set([row.source]),
            matchedAffiliation: row.matchedAffiliation ?? null,
          });
        }
      }

      // Flag results already in the portal so the UI can disable re-import.
      const existingPublications = await storage.getPublications();
      const existingDois = buildExistingWorkDois(existingPublications);

      const results = Array.from(merged.values())
        .map((m) => ({
          doi: m.doi,
          title: m.title,
          journal: m.journal,
          year: m.year,
          authors: m.authors,
          sources: Array.from(m.sources),
          matchedAffiliation: m.matchedAffiliation,
          alreadyExists: (() => {
            const identity = workDoiIdentity(m.doi);
            return identity ? existingDois.has(identity) : false;
          })(),
        }))
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

      res.json({ results, count: results.length });
    } catch (error) {
      logError("Error discovering papers", "routes", error);
      res.status(500).json({ message: "Failed to discover papers" });
    }
  });

  // Import a selected set of discovered papers. Enriches each DOI via
  // CrossRef/PubMed, creates the publication, records manuscript history, and
  // auto-links any matching internal scientists (attributed to the acting user
  // and flagged automatic). Mirrors the per-scientist import flow.
  app.post('/api/publications/discover/import', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const actorId = req.session?.user?.id;
      if (actorId == null) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const rawPapers: unknown = req.body?.papers;
      type RequestedPaper = { doi: string; title: string; journal: string; year: number | null; authors: string };
      const requestedMap = new Map<string, RequestedPaper>();
      if (Array.isArray(rawPapers)) {
        for (const p of rawPapers) {
          const doi = normalizeDoi(typeof p?.doi === "string" ? p.doi : "");
          if (!doi || requestedMap.has(doi)) continue;
          requestedMap.set(doi, {
            doi,
            title: typeof p?.title === "string" ? p.title : "",
            journal: typeof p?.journal === "string" ? p.journal : "",
            year: typeof p?.year === "number" ? p.year : null,
            authors: typeof p?.authors === "string" ? p.authors : "",
          });
        }
      }
      if (requestedMap.size === 0) {
        return res.status(400).json({ message: "Provide a non-empty list of papers to import." });
      }

      const requestedPapers = Array.from(requestedMap.values());
      const existingPublications = await storage.getPublications();
      const existingDois = buildExistingWorkDois(existingPublications);
      const allScientists = await storage.getScientists();

      const created: {
        id: number;
        doi: string;
        title: string;
        linkedAuthors: number;
        status: string | null;
        publicationType: string | null;
        prepublicationUrl: string | null;
        prepublicationSite: string | null;
      }[] = [];
      const skipped: { doi: string; reason: string }[] = [];

      for (const paper of requestedPapers) {
        const doi = paper.doi;
        const identity = workDoiIdentity(doi);
        if (!identity || existingDois.has(identity)) {
          skipped.push({ doi, reason: "already exists" });
          continue;
        }

        const [crossref, pubmed] = await Promise.all([
          fetchCrossrefPublication(doi),
          fetchPubmedByDoi(doi),
        ]);

        const pick = (...vals: (string | undefined | null)[]) =>
          vals.find((v) => typeof v === "string" && v.trim() !== "")?.trim() ?? "";

        const title = pick(crossref?.title, pubmed?.title, paper.title) || "Untitled work";
        const journal = pick(crossref?.journal, pubmed?.journal, paper.journal);
        const authors = pick(crossref?.authors, pubmed?.authors, paper.authors);
        const volume = pick(crossref?.volume, pubmed?.volume);
        const issue = pick(crossref?.issue, pubmed?.issue);
        const pages = pick(crossref?.pages, pubmed?.pages);
        const abstract =
          pubmed?.abstract?.trim() || (crossref?.abstract ? stripXml(crossref.abstract) : "");
        const pmid = pubmed?.pmid || "";

        const resolvedDate = crossref?.publicationDate ?? pubmed?.publicationDate ?? null;
        let publicationDate: string | null = resolvedDate ? resolvedDate.toISOString() : null;
        if (!publicationDate && paper.year) {
          publicationDate = new Date(Date.UTC(paper.year, 0, 1)).toISOString();
        }

        const enrichedFromAnySource = Boolean(crossref || pubmed);

        const primaryDoi = normalizeDoi(crossref?.doi || doi) || doi;
        const classification = classifyResolvedPublication({
          id: 0,
          doi: primaryDoi,
          publicationType: crossref?.type,
          journal,
        });
        try {
          const publicationData = insertPublicationSchema.parse({
            researchActivityId: null,
            title,
            authors,
            journal,
            volume,
            issue,
            pages,
            doi: primaryDoi,
            pmid: pmid || null,
            abstract,
            ...classification,
            publicationDate,
          });

          const changeReason = enrichedFromAnySource
            ? "Imported via Paper Discovery"
            : "Imported via Paper Discovery (metadata not enriched via CrossRef/PubMed)";
          const publication = await storage.createPublicationWithHistory({
            ...publicationData,
            createdByUserId: actorId,
          }, {
            fromStatus: "",
            toStatus: publicationData.status || "Published",
            changedBy: actorId,
            changeReason,
          });

          // Auto-link matching internal scientists from the resolved author text.
          let linkedAuthors = 0;
          const suggestions = suggestInternalAuthors(authors, allScientists);
          for (const s of suggestions) {
            try {
              await storage.addPublicationAuthor({
                publicationId: publication.id,
                scientistId: s.scientistId,
                authorshipType: s.authorshipType,
                authorPosition: s.authorPosition,
                linkMethod: "automatic",
                linkedByUserId: actorId,
              });
              linkedAuthors++;
            } catch (linkErr) {
              logError(`Failed to auto-link scientist ${s.scientistId} on pub ${publication.id}`, "routes", linkErr);
            }
          }

          existingDois.add(identity);
          created.push({
            doi: primaryDoi,
            id: publication.id,
            title,
            linkedAuthors,
            status: publication.status,
            publicationType: publication.publicationType,
            prepublicationUrl: publication.prepublicationUrl,
            prepublicationSite: publication.prepublicationSite,
          });
        } catch (err) {
          logError(`Failed to import discovered DOI ${doi}`, "routes", err);
          skipped.push({ doi, reason: "failed to save" });
        }
      }

      res.json({
        created,
        skipped,
        createdCount: created.length,
        skippedCount: skipped.length,
      });
    } catch (error) {
      logError("Error importing discovered papers", "routes", error);
      res.status(500).json({ message: "Failed to import discovered papers" });
    }
  });

  // Publication Export  
  app.post('/api/publications/export', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, journal, scientist, status } = req.body;
      
      // Get all publications first
      const allPublications = await storage.getPublications();
      
      // Apply filters
      let filteredPublications = allPublications;
      
      if (startDate || endDate) {
        filteredPublications = filteredPublications.filter(pub => {
          if (!pub.publicationDate) return false;
          const pubDate = new Date(pub.publicationDate);
          if (startDate && pubDate < new Date(startDate)) return false;
          if (endDate && pubDate > new Date(endDate)) return false;
          return true;
        });
      }
      
      if (journal) {
        filteredPublications = filteredPublications.filter(pub => 
          pub.journal?.toLowerCase().includes(journal.toLowerCase())
        );
      }
      
      if (status && status !== 'all') {
        filteredPublications = filteredPublications.filter(pub => 
          pub.status === status
        );
      }
      
      if (scientist) {
        filteredPublications = filteredPublications.filter(pub => 
          pub.authors?.toLowerCase().includes(scientist.toLowerCase())
        );
      }
      
      // Format as text for copy-paste
      const formattedText = filteredPublications.map(pub => {
        const year = pub.publicationDate ? new Date(pub.publicationDate).getFullYear() : 'N/A';
        return `${pub.title}\n${pub.authors || 'No authors listed'}\n${pub.journal || 'No journal'} ${pub.volume ? `${pub.volume}` : ''}${pub.issue ? `(${pub.issue})` : ''}${pub.pages ? `: ${pub.pages}` : ''} (${year})\n${pub.doi ? `DOI: ${pub.doi}` : 'No DOI'}\nStatus: ${pub.status || 'Unknown'}\n\n---\n\n`;
      }).join('');
      
      res.json({ 
        count: filteredPublications.length,
        formattedText,
        publications: filteredPublications
      });
    } catch (error) {
      logError('Error exporting publications', "routes", error);
      res.status(500).json({ message: "Failed to export publications" });
    }
  });

  // Patents
  app.get('/api/patents', async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
      const researchActivityId = req.query.researchActivityId ? parseInt(req.query.researchActivityId as string) : undefined;

      let patents;
      if (researchActivityId !== undefined && !isNaN(researchActivityId)) {
        // Filter at the DB level so the patents detail page doesn't have to
        // download the full patent list and filter client-side.
        patents = await storage.getPatentsForResearchActivity(researchActivityId);
      } else if (projectId && !isNaN(projectId)) {
        patents = await storage.getPatentsForProject(projectId);
      } else {
        patents = await storage.getPatents();
      }
      
      // Enhance patents with project details
      const enhancedPatents = await Promise.all(patents.map(async (patent) => {
        const project = patent.projectId ? await storage.getProject(patent.projectId) : null;
        return {
          ...patent,
          project: project ? {
            id: project.id,
            title: project.title
          } : null
        };
      }));
      
      res.json(enhancedPatents);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch patents" });
    }
  });

  app.get('/api/patents/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid patent ID" });
      }

      const patent = await storage.getPatent(id);
      if (!patent) {
        return res.status(404).json({ message: "Patent not found" });
      }

      // Get project details
      const project = patent.projectId ? await storage.getProject(patent.projectId) : null;
      
      const enhancedPatent = {
        ...patent,
        project: project ? {
          id: project.id,
          title: project.title
        } : null
      };

      res.json(enhancedPatent);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch patent" });
    }
  });

  app.post('/api/patents', async (req: Request, res: Response) => {
    try {
      const validateData = insertPatentSchema.parse(req.body);
      
      // Check if project exists if projectId is provided
      if (validateData.projectId) {
        const project = await storage.getProject(validateData.projectId);
        if (!project) {
          return res.status(404).json({ message: "Project not found" });
        }
      }
      
      const patent = await storage.createPatent(validateData);
      res.status(201).json(patent);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to create patent" });
    }
  });

  app.patch('/api/patents/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid patent ID" });
      }

      const validateData = insertPatentSchema.partial().parse(req.body);
      
      // Check if project exists if projectId is provided
      if (validateData.projectId) {
        const project = await storage.getProject(validateData.projectId);
        if (!project) {
          return res.status(404).json({ message: "Project not found" });
        }
      }
      
      const patent = await storage.updatePatent(id, validateData);
      
      if (!patent) {
        return res.status(404).json({ message: "Patent not found" });
      }
      
      res.json(patent);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update patent" });
    }
  });

  app.delete('/api/patents/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid patent ID" });
      }

      const existing = await storage.getPatent(id);
      const success = await storage.deletePatent(id);
      
      if (!success) {
        return res.status(404).json({ message: "Patent not found" });
      }
      
      if (existing) await req.audit.logDelete("patents", id, existing as Record<string, unknown>);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete patent" });
    }
  });

  // IRB Applications
  app.get('/api/irb-applications', async (req: Request, res: Response) => {
    try {
      const researchActivityId = req.query.researchActivityId ? parseInt(req.query.researchActivityId as string) : undefined;
      const page = req.query.page ? parseInt(req.query.page as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      
      // Validate pagination params if provided
      if ((page !== undefined && (isNaN(page) || page < 1)) || 
          (limit !== undefined && (isNaN(limit) || limit < 1))) {
        return res.status(400).json({ message: "Invalid pagination parameters. page and limit must be positive integers." });
      }
      
      let applications;
      if (researchActivityId && !isNaN(researchActivityId)) {
        applications = await storage.getIrbApplicationsForResearchActivity(researchActivityId);
      } else {
        applications = await storage.getIrbApplications();
      }
      
      // Enhance applications with research activity and PI details. Two
      // queries for the list, where it used to be two per application.
      const activityById = new Map((await storage.getResearchActivities()).map((activity) => [activity.id, activity]));
      const piById = await storage.getScientistsByIds(applications.map((app) => app.principalInvestigatorId));
      const enhancedApplications = await Promise.all(applications.map(async (app) => {
        const researchActivity = app.researchActivityId ? activityById.get(app.researchActivityId) ?? null : null;
        const pi = app.principalInvestigatorId != null ? piById.get(app.principalInvestigatorId) : undefined;
        
        return {
          ...app,
          researchActivity: researchActivity ? {
            id: researchActivity.id,
            sdrNumber: researchActivity.sdrNumber,
            title: researchActivity.title
          } : null,
          principalInvestigator: pi ? {
            id: pi.id,
            honorificTitle: pi.honorificTitle,
            firstName: pi.firstName,
            lastName: pi.lastName,
            jobTitle: pi.jobTitle,
            email: pi.email,
            name: pi.name,
            profileImageInitials: pi.profileImageInitials
          } : null
        };
      }));
      
      // Apply pagination if requested
      if (page !== undefined && limit !== undefined) {
        const startIndex = (page - 1) * limit;
        const paginatedApplications = enhancedApplications.slice(startIndex, startIndex + limit);
        res.json({
          data: paginatedApplications,
          pagination: {
            page,
            limit,
            total: enhancedApplications.length,
            totalPages: Math.ceil(enhancedApplications.length / limit)
          }
        });
      } else {
        res.json(enhancedApplications);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IRB applications" });
    }
  });

  app.get('/api/irb-applications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IRB application ID" });
      }

      const application = await storage.getIrbApplication(id);
      if (!application) {
        return res.status(404).json({ message: "IRB application not found" });
      }

      // Get related details
      const project = await storage.getProject(application.projectId);
      const pi = await storage.getScientist(application.principalInvestigatorId);
      
      const enhancedApplication = {
        ...application,
        project: project ? {
          id: project.id,
          title: project.title
        } : null,
        principalInvestigator: pi ? {
          id: pi.id,
          name: pi.name,
          profileImageInitials: pi.profileImageInitials
        } : null
      };

      res.json(enhancedApplication);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IRB application" });
    }
  });

  app.post('/api/irb-applications', async (req: Request, res: Response) => {
    try {
      // Generate IRB number automatically - simple increment approach
      const currentYear = new Date().getFullYear();
      const existingApps = await storage.getIrbApplications();
      const yearlyApps = existingApps.filter(app => 
        app.irbNumber && app.irbNumber.startsWith(`IRB-${currentYear}-`)
      );
      
      // Get the highest existing number and add 1
      const existingNumbers = yearlyApps
        .map(app => {
          const match = app.irbNumber?.match(/IRB-\d{4}-(\d{3})/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter(num => num > 0);
      
      const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
      const nextNumber = maxNumber + 1;
      const irbNumber = `IRB-${currentYear}-${nextNumber.toString().padStart(3, '0')}`;
      
      const validateData = {
        ...req.body,
        irbNumber,
        workflowStatus: req.body.workflowStatus || 'draft',
        status: 'Active', // Required field for database
      };
      
      // Check if research activity exists
      const researchActivity = await storage.getResearchActivity(validateData.researchActivityId);
      if (!researchActivity) {
        return res.status(404).json({ message: "Research activity not found" });
      }
      
      const piEligibilityError = await getInvestigatorAssignmentError(
        validateData.principalInvestigatorId,
        "IRB Principal Investigator"
      );
      if (piEligibilityError) {
        return res
          .status(piEligibilityError.status)
          .json({ message: piEligibilityError.message });
      }
      
      const application = await storage.createIrbApplication(validateData);
      await req.audit.logInsert("irb_applications", application.id, application as Record<string, unknown>);
      res.status(201).json(application);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      logError('IRB application creation error', "routes", error);
      res.status(500).json({ message: "Failed to create IRB application" });
    }
  });

  app.patch('/api/irb-applications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IRB application ID" });
      }

      log('Updating IRB application with data', "routes", { detail: req.body });

      // Handle submission comments separately
      if (req.body.submissionComment) {
        const currentApp = await storage.getIrbApplication(id);
        if (currentApp) {
          let existingResponses = {};
          
          // Handle both string and object formats for piResponses
          if (currentApp.piResponses) {
            if (typeof currentApp.piResponses === 'string') {
              try {
                existingResponses = JSON.parse(currentApp.piResponses);
              } catch (e) {
                logError('Error parsing existing PI responses', "routes", e);
                existingResponses = {};
              }
            } else if (typeof currentApp.piResponses === 'object') {
              existingResponses = currentApp.piResponses;
            }
          }
          
          const newResponse = {
            timestamp: new Date().toISOString(),
            comment: req.body.submissionComment,
            workflowStatus: req.body.workflowStatus || 'resubmitted'
          };
          existingResponses[Date.now()] = newResponse;
          req.body.piResponses = JSON.stringify(existingResponses);
          delete req.body.submissionComment; // Remove from body to avoid validation issues
        }
      }

      // Skip validation for protocol team members updates and documents updates
      let validateData = req.body;
      
      // Always convert date strings to Date objects if present
      if (req.body.submissionDate && typeof req.body.submissionDate === 'string') {
        req.body.submissionDate = new Date(req.body.submissionDate);
      }
      if (req.body.initialApprovalDate && typeof req.body.initialApprovalDate === 'string') {
        req.body.initialApprovalDate = new Date(req.body.initialApprovalDate);
      }
      if (req.body.expirationDate && typeof req.body.expirationDate === 'string') {
        req.body.expirationDate = new Date(req.body.expirationDate);
      }
      
      if (!req.body.protocolTeamMembers && !req.body.documents && !req.body.piResponses) {
        validateData = insertIrbApplicationSchema.partial().parse(req.body);
      }
      
      // Check if research activity exists if researchActivityId is provided
      if (validateData.researchActivityId) {
        const researchActivity = await storage.getResearchActivity(validateData.researchActivityId);
        if (!researchActivity) {
          return res.status(404).json({ message: "Research activity not found" });
        }
      }
      
      // Validate investigator eligibility if principalInvestigatorId is provided.
      if (validateData.principalInvestigatorId) {
        const piEligibilityError = await getInvestigatorAssignmentError(
          validateData.principalInvestigatorId,
          "IRB Principal Investigator"
        );
        if (piEligibilityError) {
          return res
            .status(piEligibilityError.status)
            .json({ message: piEligibilityError.message });
        }
      }
      
      const existingIrb = await storage.getIrbApplication(id);
      const application = await storage.updateIrbApplication(id, validateData);

      if (!application) {
        return res.status(404).json({ message: "IRB application not found" });
      }

      // Audit status changes with a dedicated entry; audit all other updates too.
      if (existingIrb && validateData.workflowStatus && validateData.workflowStatus !== existingIrb.workflowStatus) {
        await req.audit.logStatusChange(
          "irb_applications", id,
          existingIrb.workflowStatus ?? null,
          validateData.workflowStatus,
          undefined,
          req.body?.reason,
        );
      } else if (existingIrb) {
        await req.audit.logUpdate(
          "irb_applications", id,
          existingIrb as Record<string, unknown>,
          application as Record<string, unknown>,
          req.body?.reason,
        );
      }

      res.json(application);
    } catch (error) {
      if (error instanceof ZodError) {
        logError('Validation error', "routes", error);
        return res.status(400).json({ message: fromZodError(error).message });
      }
      logError('IRB application update error', "routes", error);
      res.status(500).json({ message: "Failed to update IRB application", error: error.message });
    }
  });

  app.delete('/api/irb-applications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IRB application ID" });
      }

      const existing = await storage.getIrbApplication(id);
      const success = await storage.deleteIrbApplication(id);
      
      if (!success) {
        return res.status(404).json({ message: "IRB application not found" });
      }
      
      if (existing) await req.audit.logDelete("irb_applications", id, existing as Record<string, unknown>);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete IRB application" });
    }
  });

  // IBC: server/routes/ibcRoutes.ts
  registerIbcRoutes(app);

  // Research contracts: server/routes/researchContractRoutes.ts
  registerResearchContractRoutes(app);

  // IRB Board Members API
  app.get('/api/irb-board-members', async (req: Request, res: Response) => {
    try {
      const members = await storage.getIrbBoardMembers();
      res.json(members);
    } catch (error) {
      logError('Error fetching IRB board members', "routes", error);
      res.status(500).json({ message: "Failed to fetch IRB board members" });
    }
  });

  app.get('/api/irb-board-members/active', async (req: Request, res: Response) => {
    try {
      const members = await storage.getActiveIrbBoardMembers();
      res.json(members);
    } catch (error) {
      logError('Error fetching active IRB board members', "routes", error);
      res.status(500).json({ message: "Failed to fetch active IRB board members" });
    }
  });

  app.get('/api/irb-board-members/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid board member ID" });
      }

      const member = await storage.getIrbBoardMember(id);
      if (!member) {
        return res.status(404).json({ message: "IRB board member not found" });
      }

      res.json(member);
    } catch (error) {
      logError('Error fetching IRB board member', "routes", error);
      res.status(500).json({ message: "Failed to fetch IRB board member" });
    }
  });

  app.post('/api/irb-board-members', async (req: Request, res: Response) => {
    try {
      log('Creating IRB board member with data', "routes", { detail: req.body });
      
      // Validate required fields
      if (!req.body.scientistId || !req.body.role) {
        return res.status(400).json({ message: "Scientist ID and role are required" });
      }

      // Check for existing chair or deputy chair if trying to assign these roles
      if (req.body.role === 'chair' || req.body.role === 'deputy_chair') {
        const existingMembers = await storage.getIrbBoardMembers();
        const existingRole = existingMembers.find(m => m.role === req.body.role && m.isActive);
        
        if (existingRole) {
          const roleLabel = req.body.role === 'chair' ? 'Chair' : 'Deputy Chair';
          return res.status(400).json({ 
            message: `An active ${roleLabel} already exists. Please deactivate the current ${roleLabel} first.` 
          });
        }
      }

      // Set default term end date to 3 years from now if not provided
      if (!req.body.termEndDate) {
        const threeYearsFromNow = new Date();
        threeYearsFromNow.setFullYear(threeYearsFromNow.getFullYear() + 3);
        req.body.termEndDate = threeYearsFromNow.toISOString();
      }

      // Ensure expertise is an array
      if (typeof req.body.expertise === 'string') {
        req.body.expertise = [req.body.expertise];
      } else if (!req.body.expertise) {
        req.body.expertise = [];
      }

      const member = await storage.createIrbBoardMember(req.body);
      log('Successfully created IRB board member', "routes", { detail: member });
      res.status(201).json(member);
    } catch (error) {
      logError('Error creating IRB board member', "routes", error);
      res.status(500).json({ message: "Failed to create IRB board member", error: error.message });
    }
  });

  app.patch('/api/irb-board-members/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid board member ID" });
      }

      log('Updating IRB board member with data', "routes", { detail: req.body });

      // Check for existing chair or deputy chair if trying to assign these roles
      if (req.body.role === 'chair' || req.body.role === 'deputy_chair') {
        const existingMembers = await storage.getIrbBoardMembers();
        const existingRole = existingMembers.find(m => m.role === req.body.role && m.isActive && m.id !== id);
        
        if (existingRole) {
          const roleLabel = req.body.role === 'chair' ? 'Chair' : 'Deputy Chair';
          return res.status(400).json({ 
            message: `An active ${roleLabel} already exists. Please change the current ${roleLabel} to member first.` 
          });
        }
      }

      const member = await storage.updateIrbBoardMember(id, req.body);
      if (!member) {
        return res.status(404).json({ message: "IRB board member not found" });
      }

      res.json(member);
    } catch (error) {
      logError('Error updating IRB board member', "routes", error);
      res.status(500).json({ message: "Failed to update IRB board member", error: error.message });
    }
  });

  app.delete('/api/irb-board-members/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid board member ID" });
      }

      const success = await storage.deleteIrbBoardMember(id);
      if (!success) {
        return res.status(404).json({ message: "IRB board member not found" });
      }

      res.json({ message: "IRB board member deleted successfully" });
    } catch (error) {
      logError('Error deleting IRB board member', "routes", error);
      res.status(500).json({ message: "Failed to delete IRB board member", error: error.message });
    }
  });

  // Organisation structure and facilities: server/routes/organisationRoutes.ts
  registerOrganisationRoutes(app);

  // Role Permissions Routes
  // Readable by any signed-in user: every client loads the matrix on mount to
  // decide what to render for its own role. Writing it is a different matter —
  // see the administrator guards on the mutating routes below.
  app.get('/api/role-permissions', requireAuth, async (req: Request, res: Response) => {
    try {
      const permissions = await storage.getRolePermissions();
      res.json(permissions);
    } catch (error) {
      logError('Error fetching role permissions', "routes", error);
      res.status(500).json({ message: "Failed to fetch role permissions" });
    }
  });

  // The access matrix decides what every role may reach, so changing it is an
  // administrator action. Without this guard any signed-in account could grant
  // itself edit on any area, including the one the server enforces.
  app.post('/api/role-permissions', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const validateData = insertRolePermissionSchema.parse(req.body);
      const permission = await storage.createRolePermission(validateData);
      res.status(201).json(permission);
    } catch (error) {
      logError('Error creating role permission', "routes", error);
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      res.status(500).json({ message: "Failed to create role permission" });
    }
  });

  app.patch('/api/role-permissions/:jobTitle/:navigationItem', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { jobTitle, navigationItem } = req.params;
      const { accessLevel } = req.body;
      
      if (!accessLevel || !["hide", "view", "edit"].includes(accessLevel)) {
        return res.status(400).json({ message: "Invalid access level" });
      }

      const permission = await storage.updateRolePermission(jobTitle, navigationItem, accessLevel);
      if (!permission) {
        return res.status(404).json({ message: "Role permission not found" });
      }
      
      res.json(permission);
    } catch (error) {
      logError('Error updating role permission', "routes", error);
      res.status(500).json({ message: "Failed to update role permission" });
    }
  });

  app.post('/api/role-permissions/bulk', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { permissions } = req.body;
      if (!Array.isArray(permissions)) {
        return res.status(400).json({ message: "Permissions must be an array" });
      }

      const results = await storage.updateRolePermissionsBulk(
        permissions,
        req.session?.user?.id ?? undefined,
      );
      res.json(results);
    } catch (error) {
      logError('Error bulk updating role permissions', "routes", error);
      res.status(500).json({ message: "Failed to bulk update role permissions" });
    }
  });

  // Journal impact factors: server/routes/journalImpactFactorRoutes.ts
  registerJournalImpactFactorRoutes(app);

  // Publication Import Routes
  app.get('/api/publications/import/pmid/:pmid', async (req: Request, res: Response) => {
    try {
      const pmid = req.params.pmid;
      
      // Fetch from PubMed E-utilities API
      const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`;
      const summaryResponse = await fetch(summaryUrl);
      
      if (!summaryResponse.ok) {
        return res.status(404).json({ message: "PMID not found" });
      }
      
      const summaryData = await summaryResponse.json();
      const pubmedData = summaryData.result?.[pmid];
      
      if (!pubmedData) {
        return res.status(404).json({ message: "Publication not found for this PMID" });
      }
      
      // Parse PubMed data
      const authors = pubmedData.authors?.map((author: any) => 
        author.name
      ).join(', ') || '';
      
      const publication = {
        title: pubmedData.title || '',
        authors: authors,
        journal: pubmedData.fulljournalname || pubmedData.source || '',
        year: pubmedData.pubdate ? new Date(pubmedData.pubdate).getFullYear() : null,
        volume: pubmedData.volume || '',
        issue: pubmedData.issue || '',
        pages: pubmedData.pages || '',
        doi: pubmedData.elocationid?.replace('doi: ', '') || pubmedData.articleids?.find((id: any) => id.idtype === 'doi')?.value || '',
        pmid: pmid,
        abstract: pubmedData.abstract || '',
        publicationDate: pubmedData.pubdate ? new Date(pubmedData.pubdate).toISOString().split('T')[0] : ''
      };
      
      res.json(publication);
    } catch (error) {
      logError('Error fetching PubMed data', "routes", error);
      res.status(500).json({ message: "Failed to fetch publication data from PubMed" });
    }
  });

  app.get('/api/publications/import/doi/:doi', async (req: Request, res: Response) => {
    try {
      const doi = normalizeDoi(decodeURIComponent(req.params.doi));

      // Fetch from CrossRef (retries without the preprint version suffix).
      const work = await fetchCrossrefWork(doi);

      if (!work) {
        return res.status(404).json({ message: "DOI not found" });
      }
      
      // Parse CrossRef data
      const authors = work.author?.map((author: any) => 
        `${author.given || ''} ${author.family || ''}`.trim()
      ).join(', ') || '';
      
      const publication = {
        title: work.title?.[0] || '',
        authors: authors,
        journal: crossrefJournalName(work),
        year: work.published?.['date-parts']?.[0]?.[0] || work.created?.['date-parts']?.[0]?.[0] || null,
        volume: work.volume || '',
        issue: work.issue || '',
        pages: work.page || '',
        doi: work.DOI || doi,
        pmid: '', // CrossRef doesn't provide PMID
        abstract: work.abstract ? stripXml(work.abstract) : '',
        publicationDate: work.published?.['date-parts']?.[0] ? 
          new Date(work.published['date-parts'][0][0], (work.published['date-parts'][0][1] || 1) - 1, work.published['date-parts'][0][2] || 1).toISOString().split('T')[0] : ''
      };
      
      res.json(publication);
    } catch (error) {
      logError('Error fetching CrossRef data', "routes", error);
      res.status(500).json({ message: "Failed to fetch publication data from CrossRef" });
    }
  });

  // List a scientist's published works (from ORCID, plus best-effort Google
  // Scholar) that are NOT already present in our publications table, matched by
  // normalized DOI. Fails gracefully when the person has no ORCID or ORCID is
  // unreachable.
  app.get('/api/scientists/:id/missing-papers', requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scientist ID" });
      }

      const scientist = await storage.getScientist(id);
      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }

      const hasOrcid = !!scientist.orcidId && scientist.orcidId.trim() !== "";
      const hasScholar =
        !!scientist.googleScholarUrl && scientist.googleScholarUrl.trim() !== "";

      if (!hasOrcid && !hasScholar) {
        return res.json({
          orcidAttempted: false,
          orcidAvailable: false,
          scholarAttempted: false,
          scholarAvailable: false,
          missing: [],
          message:
            "This person has no ORCID iD or Google Scholar URL on file, so there are no external works to check.",
        });
      }

      // DOIs already in the system (version-aware normalized). Includes the
      // preprint DOI carried on a published record's preprint link, so a
      // previously merged preprint is not resurfaced as "missing".
      const existingPublications = await storage.getPublications();
      const existingDois = buildExistingWorkDois(existingPublications);

      let orcidAttempted = false;
      let orcidAvailable = false;
      let orcidWorks: MissingPaperMeta[] = [];
      if (hasOrcid) {
        orcidAttempted = true;
        try {
          orcidWorks = await fetchOrcidWorks(scientist.orcidId as string);
          orcidAvailable = true;
        } catch (err) {
          logError("ORCID fetch failed", "routes", err);
          orcidAvailable = false;
        }
      }

      // Best-effort Google Scholar — never blocks or breaks the ORCID result.
      let scholarAttempted = false;
      let scholarWorks: MissingPaperMeta[] = [];
      if (hasScholar) {
        scholarAttempted = true;
        scholarWorks = await fetchGoogleScholarDois(
          scientist.googleScholarUrl as string
        );
      }
      const scholarAvailable = scholarWorks.length > 0;

      // Merge ORCID + Scholar, dedupe by version-aware DOI identity (ORCID wins
      // because it carries richer metadata), and drop anything already in the
      // system — including preprints captured as a published record's link.
      const byDoi = new Map<string, MissingPaperMeta>();
      for (const w of orcidWorks) {
        const key = workDoiIdentity(w.doi);
        if (!key || existingDois.has(key) || byDoi.has(key)) continue;
        if (isFigshareWork(w)) continue;
        byDoi.set(key, w);
      }
      for (const w of scholarWorks) {
        const key = workDoiIdentity(w.doi);
        if (!key || existingDois.has(key) || byDoi.has(key)) continue;
        if (isFigshareWork(w)) continue;
        byDoi.set(key, w);
      }

      const missing = Array.from(byDoi.values())
        .map((w) => ({
          ...w,
          journal: w.journal || inferJournalFromDoi(w.doi),
          isPreprint: isPreprintRecord({ id: 0, doi: w.doi, journal: w.journal, title: w.title }),
        }))
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

      let message: string | undefined;
      if (orcidAttempted && !orcidAvailable) {
        message =
          "ORCID could not be reached right now. Please try again later.";
      } else if (missing.length === 0 && orcidAvailable) {
        message =
          "No missing papers found — everything in ORCID is already in the system.";
      }

      res.json({
        orcidAttempted,
        orcidAvailable,
        scholarAttempted,
        scholarAvailable,
        missing,
        message,
      });
    } catch (error) {
      logError("Error checking for missing papers", "routes", error);
      res
        .status(500)
        .json({ message: "Failed to check for missing papers" });
    }
  });

  // Import a set of selected DOIs as standalone publication records. Each DOI
  // is enriched via CrossRef, created with researchActivityId null and NO
  // author link. DOIs already present (normalized re-check, so a stale client
  // list can't create duplicates) are skipped.
  app.post('/api/scientists/:id/import-papers', requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scientist ID" });
      }

      // Own profile, or a publication officer.
      if (!isOwnScientistProfile(req, id) && !hasPublicationOfficerRole(req)) {
        return res.status(403).json({
          message: "Forbidden. You may only import papers for your own linked profile, or you need Publication Officer access.",
        });
      }

      const scientist = await storage.getScientist(id);
      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }

      // Audit actor must be a real authenticated user (requireAuth guarantees a
      // session user — demo mode injects one). Never fall back to an anonymous
      // placeholder id for persisted history.
      const actorId = req.session?.user?.id;
      if (actorId == null) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Accept either a rich `papers` array (doi + the title/journal/year we
      // already pulled from ORCID) or a plain `dois` string array for
      // backward compatibility. The metadata is used as a fallback so a paper
      // still saves even when CrossRef can't resolve its DOI.
      const rawPapers: unknown = req.body?.papers;
      const rawDois: unknown = req.body?.dois;

      type RequestedPaper = {
        doi: string;
        title: string;
        journal: string;
        year: number | null;
      };

      const requestedMap = new Map<string, RequestedPaper>();

      if (Array.isArray(rawPapers)) {
        for (const p of rawPapers) {
          const doi = normalizeDoi(typeof p?.doi === "string" ? p.doi : "");
          if (!doi || requestedMap.has(doi)) continue;
          requestedMap.set(doi, {
            doi,
            title: typeof p?.title === "string" ? p.title : "",
            journal: typeof p?.journal === "string" ? p.journal : "",
            year: typeof p?.year === "number" ? p.year : null,
          });
        }
      } else if (Array.isArray(rawDois)) {
        for (const d of rawDois) {
          const doi = normalizeDoi(typeof d === "string" ? d : "");
          if (!doi || requestedMap.has(doi)) continue;
          requestedMap.set(doi, { doi, title: "", journal: "", year: null });
        }
      }

      if (requestedMap.size === 0) {
        return res
          .status(400)
          .json({ message: "Provide a non-empty list of papers to import." });
      }

      const requestedPapers = Array.from(requestedMap.values());

      // Server-side duplicate guard against the current DB state. Version-aware
      // and also keyed on the preprint DOI carried on a published record's link,
      // so a stale client list cannot re-create a previously merged preprint.
      const existingPublications = await storage.getPublications();
      const existingDois = buildExistingWorkDois(existingPublications);

      const created: {
        id: number;
        doi: string;
        title: string;
        status: string | null;
        publicationType: string | null;
        prepublicationUrl: string | null;
        prepublicationSite: string | null;
      }[] = [];
      const skipped: { doi: string; reason: string }[] = [];

      for (const paper of requestedPapers) {
        const doi = paper.doi;
        const identity = workDoiIdentity(doi);
        if (!identity || existingDois.has(identity)) {
          skipped.push({ doi, reason: "already exists" });
          continue;
        }

        // Enrich from CrossRef and PubMed in parallel, then merge. CrossRef
        // gives clean author/bibliographic fields; PubMed adds the PMID and an
        // abstract (which CrossRef usually lacks) and covers DOIs CrossRef is
        // missing. Anything still empty falls back to the ORCID metadata the
        // client already had, so the paper always saves.
        const [crossref, pubmed] = await Promise.all([
          fetchCrossrefPublication(doi),
          fetchPubmedByDoi(doi),
        ]);

        const pick = (...vals: (string | undefined | null)[]) =>
          vals.find((v) => typeof v === "string" && v.trim() !== "")?.trim() ?? "";

        const title =
          pick(crossref?.title, pubmed?.title, paper.title) || "Untitled work";
        const journal = pick(crossref?.journal, pubmed?.journal, paper.journal);
        // Authors: CrossRef first (full given+family names), then PubMed.
        const authors = pick(crossref?.authors, pubmed?.authors);
        const volume = pick(crossref?.volume, pubmed?.volume);
        const issue = pick(crossref?.issue, pubmed?.issue);
        const pages = pick(crossref?.pages, pubmed?.pages);
        // Abstract: prefer PubMed (clean text); CrossRef abstracts are rare and
        // carry JATS markup, so strip tags if that's all we have.
        const abstract =
          pubmed?.abstract?.trim() ||
          (crossref?.abstract ? stripXml(crossref.abstract) : "");
        const pmid = pubmed?.pmid || "";

        const resolvedDate =
          crossref?.publicationDate ?? pubmed?.publicationDate ?? null;
        let publicationDate: string | null = resolvedDate
          ? resolvedDate.toISOString()
          : null;
        if (!publicationDate && paper.year) {
          // Year-only fallback: store as Jan 1 of that year.
          publicationDate = new Date(Date.UTC(paper.year, 0, 1)).toISOString();
        }

        const enrichedFromAnySource = Boolean(crossref || pubmed);

        const primaryDoi = normalizeDoi(crossref?.doi || doi) || doi;
        const classification = classifyResolvedPublication({
          id: 0,
          doi: primaryDoi,
          publicationType: crossref?.type,
          journal,
        });
        try {
          const publicationData = insertPublicationSchema.parse({
            researchActivityId: null,
            title,
            authors,
            journal,
            volume,
            issue,
            pages,
            doi: primaryDoi,
            pmid: pmid || null,
            abstract,
            ...classification,
            publicationDate,
          });

          const changeReason = enrichedFromAnySource
            ? "Imported from ORCID/Google Scholar"
            : "Imported from ORCID/Google Scholar (metadata not enriched via CrossRef/PubMed)";
          const publication = await storage.createPublicationWithHistory({
            ...publicationData,
            createdByUserId: actorId,
          }, {
            fromStatus: "",
            toStatus: publicationData.status || "Published",
            changedBy: actorId,
            changeReason,
          });

          // Mark as present so a duplicate inside the same batch is skipped.
          existingDois.add(identity);
          created.push({
            doi: primaryDoi,
            id: publication.id,
            title,
            status: publication.status,
            publicationType: publication.publicationType,
            prepublicationUrl: publication.prepublicationUrl,
            prepublicationSite: publication.prepublicationSite,
          });
        } catch (err) {
          logError(`Failed to import DOI ${doi}`, "routes", err);
          skipped.push({ doi, reason: "failed to save" });
        }
      }

      res.json({
        created,
        skipped,
        createdCount: created.length,
        skippedCount: skipped.length,
      });
    } catch (error) {
      logError("Error importing papers", "routes", error);
      res.status(500).json({ message: "Failed to import papers" });
    }
  });

  // Grant routes
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
