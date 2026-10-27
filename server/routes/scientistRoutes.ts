/**
 * Staff profiles: directory, import/export, create, update, delete.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { storage } from "../databaseStorage";
import { canViewUnpublishedScientistPublications } from "../scientistPublicationVisibility";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { db } from "../db";
import { scientists, branches, departments, sections } from "@shared/schema";
import { and, eq, count } from "drizzle-orm";
import { buildExportBuffer, buildTemplateBuffer, parseUploadedFile, buildImportPreview, rowToInsertScientist, findReferencingRecords } from "../scientistsImportExport";
import { insertScientistSchema } from "@shared/schema";
import { requireAuth, requireAdmin, requirePublicationOfficer } from "../auth";
import { registerSidraScoreRoutes, isOwnScientistProfile, hasManagementRole } from "../sidraScoreRoutes";
import { requireInvestigatorDesignationManager } from "../investigatorDesignationPolicy";
import { rejectRestrictedUserProfileAccessChanges } from "../restrictedUserPolicy";
import { deleteRefusal } from "../deleteBlockers";
import { respondWriteFailure } from "../writeFailureDetail";
import { logError } from "../logger";
import { getScientistPublicationViewer } from "./publicationRoutes";

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

export function registerScientistRoutes(app: Express): void {
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
}
