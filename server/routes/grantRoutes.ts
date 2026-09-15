/**
 * Grants: the record, its SDR links, import/export, progress reports, and the
 * per-SDR grant and IBC lists.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 * (The list route and the reference-list routes register from routes.ts, as before.)
 */
import type { Express, Request, Response } from "express";
import { requireAuth } from "../auth";
import { GrantSdrLifecycleStorageError, storage } from "../databaseStorage";
import { GRANT_COLUMNS, buildGrantsTemplateBuffer, buildGrantsWorkbookBuffer, buildMissingGrantStaffWorkbookBuffer, collectMissingGrantStaff, grantsToRows, previewGrantRows } from "../grantsImportExport";
import { logError } from "../logger";
import { nullifyEmptyStrings } from "../publicationDiscovery";
import { parseUploadedFile } from "../scientistsImportExport";
import { GrantLifecycleError, canGrantLinkSdrs, grantStatusAllowsProgressTracking, reconcileGrantLifecycle } from "@shared/grantLifecycle";
import { insertGrantSchema, scientists } from "@shared/schema";
import { buildStaffNameIndex, matchStaffByName } from "@shared/staffNameMatching";
import { and } from "drizzle-orm";
import { ZodError, z } from "zod";
import { fromZodError } from "zod-validation-error";

export function registerGrantRoutes(app: Express): void {
  app.get('/api/grants/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid grant ID" });
      }

      const grant = await storage.getGrant(id);
      if (!grant) {
        return res.status(404).json({ message: "Grant not found" });
      }

      res.json(grant);
    } catch (error) {
      logError('Error fetching grant', "routes", error);
      res.status(500).json({ message: "Failed to fetch grant" });
    }
  });

  app.post('/api/grants', async (req: Request, res: Response) => {
    try {
      // Pulled out before validation: the collaboration tree is its own tables,
      // not columns on grants, so insertGrantSchema would reject it.
      const { collaboratingInstitutions, coInvestigatorLinks, ...grantBody } = req.body ?? {};
      const parsedData = insertGrantSchema.parse(nullifyEmptyStrings(grantBody));
      const lifecycle = reconcileGrantLifecycle(parsedData);
      const validatedData = insertGrantSchema.parse({
        ...parsedData,
        ...lifecycle,
      });
      // Recorded for audit: the office both imports grants and enters them by
      // hand, and nothing used to say which, or who.
      const grant = await storage.createGrant(validatedData, req.session?.user?.id);
      if (Array.isArray(collaboratingInstitutions)) {
        await storage.replaceGrantCollaborations(grant.id, collaboratingInstitutions);
      }
      if (Array.isArray(coInvestigatorLinks)) {
        await storage.replaceGrantCoInvestigators(grant.id, coInvestigatorLinks);
      }
      await req.audit.logInsert("grants", grant.id, grant as Record<string, unknown>);
      res.status(201).json(grant);
    } catch (error) {
      if (error instanceof GrantLifecycleError) {
        return res.status(400).json({ message: error.message });
      }
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Invalid grant data",
          details: fromZodError(error).toString()
        });
      }
      logError('Error creating grant', "routes", error);
      res.status(500).json({ message: "Failed to create grant" });
    }
  });

  app.put('/api/grants/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid grant ID" });
      }

      const existingGrant = await storage.getGrant(id);
      if (!existingGrant) {
        return res.status(404).json({ message: "Grant not found" });
      }

      const {
        researchActivityIds: rawResearchActivityIds,
        collaboratingInstitutions,
        coInvestigatorLinks,
        ...rawGrantData
      } = req.body ?? {};
      const desiredResearchActivityIds = rawResearchActivityIds === undefined
        ? undefined
        : z.array(z.coerce.number().int().positive()).parse(rawResearchActivityIds);
      const parsedData = insertGrantSchema.partial().parse(
        nullifyEmptyStrings(rawGrantData),
      );
      const lifecycle = reconcileGrantLifecycle(parsedData, existingGrant);

      if (existingGrant.awarded && !lifecycle.awarded) {
        if (
          desiredResearchActivityIds !== undefined &&
          desiredResearchActivityIds.length > 0
        ) {
          return res.status(409).json({
            message:
              "Unlink all SDRs before clearing the Grant Awarded designation. Existing links were left unchanged.",
          });
        }
      }

      const validatedData = insertGrantSchema.partial().parse({
        ...parsedData,
        ...lifecycle,
      });
      const grant = await storage.updateGrantWithResearchActivities(
        id,
        validatedData,
        desiredResearchActivityIds,
        req.session?.user?.id,
      );
      // Only when the editor sent a tree. An update that does not mention
      // collaborations leaves them alone rather than deleting them.
      if (Array.isArray(collaboratingInstitutions)) {
        await storage.replaceGrantCollaborations(id, collaboratingInstitutions);
      }
      if (Array.isArray(coInvestigatorLinks)) {
        await storage.replaceGrantCoInvestigators(id, coInvestigatorLinks);
      }
      await req.audit.logUpdate(
        "grants", id,
        existingGrant as Record<string, unknown>,
        grant as Record<string, unknown>,
        req.body?.reason,
      );
      res.json(grant);
    } catch (error) {
      if (error instanceof GrantSdrLifecycleStorageError) {
        const status = error.code === "GRANT_NOT_FOUND" ||
          error.code === "RESEARCH_ACTIVITY_NOT_FOUND"
          ? 404
          : 409;
        return res.status(status).json({ message: error.message });
      }
      if (error instanceof GrantLifecycleError) {
        return res.status(400).json({ message: error.message });
      }
      if (error instanceof ZodError) {
        logError('Validation error', "routes", fromZodError(error).toString());
        return res.status(400).json({ 
          message: "Invalid grant data", 
          details: fromZodError(error).toString() 
        });
      }
      logError('Error updating grant', "routes", error);
      res.status(500).json({ message: "Failed to update grant" });
    }
  });

  app.delete('/api/grants/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid grant ID" });
      }

      const existing = await storage.getGrant(id);
      const success = await storage.deleteGrant(id);
      if (!success) {
        return res.status(404).json({ message: "Grant not found" });
      }

      if (existing) {
        await req.audit.logDelete("grants", id, existing as Record<string, unknown>);
      }
      res.status(204).send();
    } catch (error) {
      if (error instanceof GrantSdrLifecycleStorageError) {
        return res.status(409).json({ message: error.message });
      }
      logError('Error deleting grant', "routes", error);
      res.status(500).json({ message: "Failed to delete grant" });
    }
  });

  // Grants export. Same column list as the import template so exported files
  // can be edited and re-imported. ?format=xlsx (default) or ?format=csv.
  app.get('/api/grants/export/csv', requireAuth, async (req: Request, res: Response) => {
    try {
      const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
      const [grants, scientists, programs] = await Promise.all([storage.getGrants(), storage.getScientists(), storage.getPrograms()]);
      const scientistById = new Map(scientists.map((s: any) => [s.id, s]));
      const programById = new Map(programs.map((p: any) => [p.id, p]));
      const rows = grantsToRows(grants, scientistById, programById);
      const stamp = new Date().toISOString().slice(0, 10);

      if (format === 'xlsx') {
        const buffer = await buildGrantsWorkbookBuffer(rows);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=grants-export-${stamp}.xlsx`);
        return res.send(buffer);
      }

      const headers = GRANT_COLUMNS.map((c) => c.header);
      const csvContent = [headers, ...rows.map((r) => headers.map((h) => r[h]))]
        .map(row => row.map(field => `"${String(field ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=grants-export-${stamp}.csv`);
      res.send(csvContent);
    } catch (error) {
      logError('Error exporting grants', "routes", error);
      res.status(500).json({ message: "Failed to export grants" });
    }
  });

  // Grants Excel import: template download, dry-run preview, and apply.
  app.get('/api/grants/import/template', requireAuth, async (_req: Request, res: Response) => {
    try {
      const buffer = await buildGrantsTemplateBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=grants-import-template.xlsx');
      res.send(buffer);
    } catch (error) {
      logError('Error building grants import template', "routes", error);
      res.status(500).json({ message: "Failed to build template" });
    }
  });

  // Shared by preview and apply: parse the uploaded file and compute
  // create/update/skip decisions against current DB state.
  async function computeGrantImportPreview(fileBase64: string, fileName: string) {
    if (fileBase64.length > 15_000_000) throw new Error("File too large (max ~10 MB)");
    const rawRows = await parseUploadedFile(fileBase64, fileName);
    if (rawRows.length > 2000) throw new Error("Too many rows in one import (max 2000)");
    const [grants, scientists, programs] = await Promise.all([storage.getGrants(), storage.getScientists(), storage.getPrograms()]);
    const existingByProjectNumber = new Map(grants.map((g: any) => [String(g.projectNumber).toLowerCase(), g]));
    const scientistByEmail = new Map(scientists.filter((s: any) => s.email).map((s: any) => [s.email.toLowerCase(), s]));
    // Indexed rather than keyed on an exact "first last" string: the office's
    // files write the title into the name field and sometimes a middle name,
    // so "Dr. Khalid Fakhro" never matched the record "Khalid Fakhro".
    const scientistByName = buildStaffNameIndex(scientists as any);
    // A grant's programme, keyed for import by its PRM code, its name, and the
    // "PRM-001 — Name" label an export writes, so any of the three resolves.
    const programByKey = new Map<string, number>();
    for (const program of programs as any[]) {
      const add = (raw: string) => { const key = String(raw).trim().toLowerCase(); if (key) programByKey.set(key, program.id); };
      if (program.programId) add(program.programId);
      if (program.name) add(program.name);
      if (program.programId && program.name) add(`${program.programId} — ${program.name}`);
    }
    return previewGrantRows(rawRows, existingByProjectNumber, scientistByEmail, scientistByName, programByKey);
  }

  app.post('/api/grants/import/preview', requireAuth, async (req: Request, res: Response) => {
    try {
      const { fileBase64, fileName } = req.body ?? {};
      if (typeof fileBase64 !== 'string' || !fileBase64 || typeof fileName !== 'string') {
        return res.status(400).json({ message: "Provide fileBase64 and fileName" });
      }
      const previews = await computeGrantImportPreview(fileBase64, fileName);
      res.json({
        rows: previews,
        summary: {
          create: previews.filter((p) => p.action === 'create').length,
          update: previews.filter((p) => p.action === 'update').length,
          skip: previews.filter((p) => p.action === 'skip').length,
          missingStaff: collectMissingGrantStaff(previews).length,
        },
      });
    } catch (error) {
      logError('Error previewing grants import', "routes", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to parse file" });
    }
  });

  app.post('/api/grants/import/missing-staff', requireAuth, async (req: Request, res: Response) => {
    try {
      const { fileBase64, fileName } = req.body ?? {};
      if (typeof fileBase64 !== 'string' || !fileBase64 || typeof fileName !== 'string') {
        return res.status(400).json({ message: "Provide fileBase64 and fileName" });
      }
      const previews = await computeGrantImportPreview(fileBase64, fileName);
      const missingStaff = collectMissingGrantStaff(previews);
      if (missingStaff.length === 0) {
        return res.status(400).json({ message: "No missing staff found in this grant import" });
      }
      const buffer = await buildMissingGrantStaffWorkbookBuffer(previews);
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=missing-grant-staff-${stamp}.xlsx`);
      res.send(buffer);
    } catch (error) {
      logError('Error exporting missing grant staff', "routes", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to export missing staff" });
    }
  });

  app.post('/api/grants/import/apply', requireAuth, async (req: Request, res: Response) => {
    try {
      const { fileBase64, fileName } = req.body ?? {};
      if (typeof fileBase64 !== 'string' || !fileBase64 || typeof fileName !== 'string') {
        return res.status(400).json({ message: "Provide fileBase64 and fileName" });
      }
      // Re-run the preview server-side so the applied changes always reflect
      // the uploaded file + current DB state, not client-editable data.
      const previews = await computeGrantImportPreview(fileBase64, fileName);
      let created = 0, updated = 0;
      const failed: { rowNumber: number; projectNumber: string; reason: string }[] = [];

      // The Collaborators and Co-Investigators columns used to land only in
      // the text arrays those fields were refactored away from, so an import
      // filled columns nothing displays any more while the editor and the
      // list showed the grant as having neither. Mirrored into the relational
      // tables here.
      //
      // Additive, matching what the import does to the text itself: it merges
      // and dedupes rather than overwriting, so a re-run adds nothing and
      // never removes a partner someone recorded by hand.
      const staffIndex = buildStaffNameIndex(await storage.getScientists() as any);
      const seedGrantLinks = async (grantId: number, data: any): Promise<number> => {
        let added = 0;

        const institutions: string[] = Array.isArray(data.collaborators) ? data.collaborators : [];
        if (institutions.length > 0) {
          added += await storage.addGrantCollaboratingInstitutions(grantId, institutions);
        }

        const names: string[] = Array.isArray(data.coInvestigators) ? data.coInvestigators : [];
        if (names.length > 0) {
          // Same rule as the Lead PI: a name matching nobody, or matching two
          // people, is left unlinked rather than guessed at. These are our own
          // staff, so an unmatched one means no record exists yet.
          const ids = names
            .map((name) => matchStaffByName(staffIndex, name))
            .filter((match) => match.status === "matched")
            .map((match) => (match as { scientist: { id: number } }).scientist.id);
          if (ids.length > 0) added += await storage.addGrantCoInvestigators(grantId, ids);
        }

        return added;
      };
      for (const p of previews) {
        if (p.action === 'skip' || !p.data) continue;
        try {
          if (p.action === 'create') {
            const parsedData = insertGrantSchema.parse(p.data);
            const lifecycle = reconcileGrantLifecycle(parsedData);
            // Same audit trail as a hand-entered grant. Without this the
            // provenance columns stayed empty on exactly the path they were
            // added for: a bulk import is where "who put this here" is
            // hardest to answer afterwards.
            const createdGrant = await storage.createGrant(insertGrantSchema.parse({
              ...parsedData,
              ...lifecycle,
            }), req.session?.user?.id);
            created++;
          } else {
            const existing = await storage.getGrants().then((gs: any[]) =>
              gs.find((g) => String(g.projectNumber).toLowerCase() === p.projectNumber.toLowerCase()));
            if (!existing) { failed.push({ rowNumber: p.rowNumber, projectNumber: p.projectNumber, reason: "Grant disappeared during import" }); continue; }
            const parsedData = insertGrantSchema.partial().parse(p.data);
            const lifecycle = reconcileGrantLifecycle(parsedData, existing);
            if (existing.awarded && !lifecycle.awarded) {
              const linkedSdrs = await storage.getGrantResearchActivities(existing.id);
              if (linkedSdrs.length > 0) {
                throw new GrantLifecycleError(
                  "Unlink all SDRs before clearing the Grant Awarded designation.",
                );
              }
            }
            await storage.updateGrantWithResearchActivities(
              existing.id,
              insertGrantSchema.partial().parse({
                ...parsedData,
                ...lifecycle,
              }),
              undefined,
              req.session?.user?.id,
            );
            updated++;
          }
        } catch (err) {
          failed.push({
            rowNumber: p.rowNumber,
            projectNumber: p.projectNumber,
            reason: err instanceof ZodError ? fromZodError(err).message : (err instanceof Error ? err.message : "Failed to save"),
          });
        }
      }
      // Second pass, over every parsed row rather than only the ones that were
      // written. A row whose fields all match the database is marked "No
      // changes" and never reaches the loop above -- and that is precisely the
      // row most likely to be missing its collaborator and co-investigator
      // links, having been imported before those tables existed. Re-running
      // the import is what backfills them.
      const grantIdByProjectNumber = new Map(
        (await storage.getGrants()).map((g: any) => [String(g.projectNumber).toLowerCase(), g.id]),
      );
      let linked = 0;
      for (const p of previews) {
        if (!p.data) continue;
        const grantId = grantIdByProjectNumber.get(p.projectNumber.toLowerCase());
        if (grantId == null) continue;
        try {
          linked += await seedGrantLinks(grantId, p.data);
        } catch (err) {
          // A link that will not seed must not fail the grant it belongs to.
          logError(`Failed to seed links for grant ${p.projectNumber}`, "routes", err);
        }
      }

      const skipped = previews.filter((p) => p.action === 'skip').map((p) => ({ rowNumber: p.rowNumber, projectNumber: p.projectNumber, reason: p.reason }));
      res.json({ created, updated, skipped, failed, linked });
    } catch (error) {
      logError('Error applying grants import', "routes", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to import grants" });
    }
  });

  // ── Clean-up: grants too incomplete to act on ───────────────────────────
  // Registered before the /api/grants/:id/... routes. Nothing below matches
  // these paths today -- the third segment is a literal in every one of them
  // -- but a later /api/grants/:id/:section would swallow "cleanup" as an id,
  // and the ordering costs nothing now.
  //
  // Both inherit the research-office matrix guard mounted on the /api/grants
  // prefix: GET needs view, DELETE needs edit.

  app.get('/api/grants/cleanup/incomplete', requireAuth, async (_req: Request, res: Response) => {
    try {
      const grants = await storage.findIncompleteGrants();
      res.json({
        grants,
        // Counted here so the page does not have to agree with the server
        // about what it is looking at.
        total: grants.length,
        deletable: grants.filter((grant) => grant.deletable).length,
        blocked: grants.filter((grant) => !grant.deletable).length,
        withOtherContent: grants.filter((grant) => grant.hasOtherContent).length,
      });
    } catch (error) {
      logError('Error listing incomplete grants', "routes", error);
      res.status(500).json({ message: "Failed to list incomplete grants" });
    }
  });

  app.delete('/api/grants/cleanup/incomplete', requireAuth, async (req: Request, res: Response) => {
    try {
      // Explicit ids only. A body-less "delete everything invalid" would act
      // on whatever the table holds at that instant rather than on the list
      // someone actually read and approved.
      const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : null;
      if (!rawIds) {
        return res.status(400).json({
          message: "Send the ids to delete, as chosen from the clean-up preview.",
        });
      }

      const ids = Array.from(
        new Set(
          rawIds
            .map((value: unknown) => Number(value))
            .filter((value: number) => Number.isInteger(value) && value > 0),
        ),
      ) as number[];

      if (ids.length === 0) {
        return res.status(400).json({ message: "No valid grant ids were sent." });
      }

      // Snapshot first: the audit entry for each deleted grant needs the row.
      const snapshots = new Map(
        (await Promise.all(ids.map((id) => storage.getGrant(id))))
          .flatMap((grant) => (grant ? [[grant.id, grant] as const] : [])),
      );
      const result = await storage.deleteIncompleteGrants(ids);
      for (const id of result.deleted) {
        const row = snapshots.get(id);
        if (row) await req.audit.logDelete("grants", id, row as Record<string, unknown>, "Clean-up of incomplete grants");
      }
      res.json({
        ...result,
        deletedCount: result.deleted.length,
        skippedCount: result.skipped.length,
      });
    } catch (error) {
      logError('Error deleting incomplete grants', "routes", error);
      res.status(500).json({ message: "Failed to delete incomplete grants" });
    }
  });

  // Grant-Research Activity relationship routes
  app.get('/api/grants/:id/research-activities', async (req: Request, res: Response) => {
    try {
      const grantId = parseInt(req.params.id);
      if (isNaN(grantId)) {
        return res.status(400).json({ message: "Invalid grant ID" });
      }

      const researchActivities = await storage.getGrantResearchActivities(grantId);
      res.json(researchActivities);
    } catch (error) {
      logError('Error fetching grant research activities', "routes", error);
      res.status(500).json({ message: "Failed to fetch grant research activities" });
    }
  });

  app.post('/api/grants/:grantId/research-activities/:researchActivityId', async (req: Request, res: Response) => {
    try {
      const grantId = parseInt(req.params.grantId);
      const researchActivityId = parseInt(req.params.researchActivityId);
      
      if (isNaN(grantId) || isNaN(researchActivityId)) {
        return res.status(400).json({ message: "Invalid grant or research activity ID" });
      }

      const [grant, researchActivity] = await Promise.all([
        storage.getGrant(grantId),
        storage.getResearchActivity(researchActivityId),
      ]);
      if (!grant) {
        return res.status(404).json({ message: "Grant not found" });
      }
      if (!researchActivity) {
        return res.status(404).json({ message: "Research activity not found" });
      }
      if (!canGrantLinkSdrs(grant)) {
        return res.status(409).json({
          message:
            "SDRs can only be linked after the grant has been awarded.",
        });
      }

      const relationship = await storage.addGrantResearchActivity(grantId, researchActivityId);
      res.status(201).json(relationship);
    } catch (error) {
      if (error instanceof GrantSdrLifecycleStorageError) {
        const status = error.code === "GRANT_NOT_FOUND" ||
          error.code === "RESEARCH_ACTIVITY_NOT_FOUND"
          ? 404
          : 409;
        return res.status(status).json({ message: error.message });
      }
      logError('Error linking grant to research activity', "routes", error);
      res.status(500).json({ message: "Failed to link grant to research activity" });
    }
  });

  app.delete('/api/grants/:grantId/research-activities/:researchActivityId', async (req: Request, res: Response) => {
    try {
      const grantId = parseInt(req.params.grantId);
      const researchActivityId = parseInt(req.params.researchActivityId);
      
      if (isNaN(grantId) || isNaN(researchActivityId)) {
        return res.status(400).json({ message: "Invalid grant or research activity ID" });
      }

      const success = await storage.removeGrantResearchActivity(grantId, researchActivityId);
      if (!success) {
        return res.status(404).json({ message: "Relationship not found" });
      }

      res.status(204).send();
    } catch (error) {
      logError('Error unlinking grant from research activity', "routes", error);
      res.status(500).json({ message: "Failed to unlink grant from research activity" });
    }
  });

  app.get('/api/research-activities/:id/grants', async (req: Request, res: Response) => {
    try {
      const researchActivityId = parseInt(req.params.id);
      if (isNaN(researchActivityId)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const grants = await storage.getResearchActivityGrants(researchActivityId);
      res.json(grants);
    } catch (error) {
      logError('Error fetching research activity grants', "routes", error);
      res.status(500).json({ message: "Failed to fetch research activity grants" });
    }
  });

  app.get('/api/research-activities/:id/ibc-applications', async (req: Request, res: Response) => {
    try {
      const researchActivityId = parseInt(req.params.id);
      if (isNaN(researchActivityId)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const ibcApplications = await storage.getResearchActivityIbcApplications(researchActivityId);
      res.json(ibcApplications);
    } catch (error) {
      logError('Error fetching research activity IBC applications', "routes", error);
      res.status(500).json({ message: "Failed to fetch research activity IBC applications" });
    }
  });

  // Grant Progress Reports endpoints
  app.get('/api/grants/:id/progress-reports', async (req: Request, res: Response) => {
    try {
      const grantId = parseInt(req.params.id);
      if (isNaN(grantId)) {
        return res.status(400).json({ message: "Invalid grant ID" });
      }

      const progressReports = await storage.getGrantProgressReports(grantId);
      res.json(progressReports);
    } catch (error) {
      logError('Error fetching grant progress reports', "routes", error);
      res.status(500).json({ message: "Failed to fetch grant progress reports" });
    }
  });

  app.post('/api/grants/:id/progress-reports', async (req: Request, res: Response) => {
    try {
      const grantId = parseInt(req.params.id);
      if (isNaN(grantId)) {
        return res.status(400).json({ message: "Invalid grant ID" });
      }

      const grant = await storage.getGrant(grantId);
      if (!grant) {
        return res.status(404).json({ message: "Grant not found" });
      }
      if (!grantStatusAllowsProgressTracking(grant.status)) {
        return res.status(409).json({
          message: "Progress reports are available after the grant becomes Active.",
        });
      }

      const reportData = {
        ...req.body,
        grantId,
        uploadedBy: 1 // TODO: Get from authenticated user
      };

      const newReport = await storage.createGrantProgressReport(reportData);
      res.status(201).json(newReport);
    } catch (error) {
      logError('Error creating grant progress report', "routes", error);
      res.status(500).json({ message: "Failed to create grant progress report" });
    }
  });

  app.put('/api/grant-progress-reports/:id', async (req: Request, res: Response) => {
    try {
      const reportId = parseInt(req.params.id);
      if (isNaN(reportId)) {
        return res.status(400).json({ message: "Invalid report ID" });
      }

      const updatedReport = await storage.updateGrantProgressReport(reportId, req.body);
      res.json(updatedReport);
    } catch (error) {
      logError('Error updating grant progress report', "routes", error);
      res.status(500).json({ message: "Failed to update grant progress report" });
    }
  });

  app.delete('/api/grant-progress-reports/:id', async (req: Request, res: Response) => {
    try {
      const reportId = parseInt(req.params.id);
      if (isNaN(reportId)) {
        return res.status(400).json({ message: "Invalid report ID" });
      }

      const success = await storage.deleteGrantProgressReport(reportId);
      if (!success) {
        return res.status(404).json({ message: "Progress report not found" });
      }

      res.status(204).send();
    } catch (error) {
      logError('Error deleting grant progress report', "routes", error);
      res.status(500).json({ message: "Failed to delete grant progress report" });
    }
  });
}
