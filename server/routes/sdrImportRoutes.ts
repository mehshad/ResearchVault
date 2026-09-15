/**
 * SDR (research activity) import: template, preview and apply.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 * Registered after the grant routes, exactly where the block sat.
 */
import type { Express, Request, Response } from "express";
import { requireAuth } from "../auth";
import { storage } from "../databaseStorage";
import { resolveInvestigatorScientistIds } from "../investigatorRoleResolver";
import { logError } from "../logger";
import { parseUploadedFile } from "../scientistsImportExport";
import { buildSdrTemplateBuffer, previewSdrRows } from "../sdrImportExport";
import { scientists } from "@shared/schema";
import { buildStaffNameIndex } from "@shared/staffNameMatching";
import { and } from "drizzle-orm";

export function registerSdrImportRoutes(app: Express): void {
  // ── SDR import ──────────────────────────────────────────────────────────
  // Registered before the /api/research-activities/:id routes so "import" is
  // never read as an id.

  app.get('/api/research-activities/import/template', requireAuth, async (_req: Request, res: Response) => {
    try {
      // The real programs, so the Program column is a dropdown of things that
      // will actually match rather than free text that mostly will not.
      const programs = await storage.getPrograms();
      const buffer = await buildSdrTemplateBuffer(
        programs.map((p: any) => ({ programId: p.programId ?? null, name: p.name })),
      );
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="sdr-import-template.xlsx"');
      res.send(buffer);
    } catch (error) {
      logError('Error building SDR template', "routes", error);
      res.status(500).json({ message: "Failed to build the template" });
    }
  });

  // Shared by preview and apply, so what is applied is always what was shown:
  // the file is re-parsed server-side against current data rather than trusting
  // anything the browser sends back.
  async function computeSdrImportPreview(fileBase64: string, fileName: string) {
    if (fileBase64.length > 15_000_000) throw new Error("File too large (max ~10 MB)");
    const rawRows = await parseUploadedFile(fileBase64, fileName);
    if (rawRows.length > 2000) throw new Error("Too many rows in one import (max 2000)");

    const [activities, projects, scientists, programs, eligiblePiIds] = await Promise.all([
      storage.getResearchActivities(),
      storage.getProjects(),
      storage.getScientists(),
      storage.getPrograms(),
      resolveInvestigatorScientistIds(),
    ]);

    // Keyed by name and by PRM number, so whichever the office typed resolves.
    const programsByKey = new Map<string, { id: number; name: string }>();
    for (const program of programs as any[]) {
      const entry = { id: program.id, name: program.name };
      if (program.name) programsByKey.set(String(program.name).trim().toLowerCase(), entry);
      if (program.programId) programsByKey.set(String(program.programId).trim().toLowerCase(), entry);
    }

    return previewSdrRows(rawRows, {
      existingBySdrNumber: new Map(activities.map((a: any) => [String(a.sdrNumber).toLowerCase(), a])),
      projectsByNumber: new Map(projects.map((p: any) => [String(p.projectId).toLowerCase(), p])),
      scientistByEmail: new Map(
        scientists.filter((s: any) => s.email).map((s: any) => [s.email.toLowerCase(), s]),
      ),
      staffNameIndex: buildStaffNameIndex(scientists as any),
      eligiblePiIds,
      programsByKey,
    });
  }

  app.post('/api/research-activities/import/preview', requireAuth, async (req: Request, res: Response) => {
    try {
      const { fileBase64, fileName } = req.body ?? {};
      if (typeof fileBase64 !== 'string' || !fileBase64 || typeof fileName !== 'string') {
        return res.status(400).json({ message: "Provide fileBase64 and fileName" });
      }
      const previews = await computeSdrImportPreview(fileBase64, fileName);
      res.json({
        rows: previews,
        summary: {
          create: previews.filter((p) => p.action === 'create').length,
          update: previews.filter((p) => p.action === 'update').length,
          skip: previews.filter((p) => p.action === 'skip').length,
          newProjects: new Set(
            previews.filter((p) => p.createsProject).map((p) => p.createsProject!.projectNumber.toLowerCase()),
          ).size,
        },
      });
    } catch (error) {
      logError('Error previewing SDR import', "routes", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to preview" });
    }
  });

  app.post('/api/research-activities/import/apply', requireAuth, async (req: Request, res: Response) => {
    try {
      const { fileBase64, fileName } = req.body ?? {};
      if (typeof fileBase64 !== 'string' || !fileBase64 || typeof fileName !== 'string') {
        return res.status(400).json({ message: "Provide fileBase64 and fileName" });
      }

      const previews = await computeSdrImportPreview(fileBase64, fileName);
      let created = 0, updated = 0, projectsCreated = 0;
      const failed: { rowNumber: number; sdrNumber: string; reason: string }[] = [];

      // Projects created during this run, so two SDRs naming the same new
      // project share one rather than colliding on its unique number.
      const newProjectIds = new Map<string, number>();

      for (const p of previews) {
        if (p.action === 'skip' || !p.data) continue;
        try {
          let projectId = p.data.projectId;

          if (p.createsProject) {
            const key = p.createsProject.projectNumber.toLowerCase();
            const already = newProjectIds.get(key);
            if (already != null) {
              projectId = already;
            } else {
              const project = await storage.createProject({
                projectId: p.createsProject.projectNumber,
                name: p.createsProject.projectName,
                programId: p.createsProject.programId,
              } as any);
              newProjectIds.set(key, project.id);
              projectId = project.id;
              projectsCreated++;
            }
          }

          const payload = { ...p.data, ...(projectId != null ? { projectId } : {}) };

          if (p.action === 'create') {
            const activity = await storage.createResearchActivity(payload as any);
            // Same as creating one by hand: the SDR starts with its PI on the
            // team, or the team screen shows an SDR nobody belongs to.
            if (activity.budgetHolderId) {
              try {
                await storage.addProjectMember({
                  researchActivityId: activity.id,
                  scientistId: activity.budgetHolderId,
                  role: "Principal Investigator",
                });
              } catch (memberError) {
                logError(`Failed to add the PI to the team for ${activity.sdrNumber}`, "routes", memberError);
              }
            }
            created++;
          } else {
            const existing = (await storage.getResearchActivities()).find(
              (a: any) => String(a.sdrNumber).toLowerCase() === p.sdrNumber.toLowerCase(),
            );
            if (!existing) {
              failed.push({ rowNumber: p.rowNumber, sdrNumber: p.sdrNumber, reason: "SDR disappeared during import" });
              continue;
            }
            await storage.updateResearchActivity(existing.id, payload as any);
            updated++;
          }
        } catch (err) {
          failed.push({
            rowNumber: p.rowNumber,
            sdrNumber: p.sdrNumber,
            reason: err instanceof Error ? err.message : "Failed to save",
          });
        }
      }

      const skipped = previews
        .filter((p) => p.action === 'skip')
        .map((p) => ({ rowNumber: p.rowNumber, sdrNumber: p.sdrNumber, reason: p.reason }));

      res.json({ created, updated, projectsCreated, skipped, failed });
    } catch (error) {
      logError('Error applying SDR import', "routes", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to import" });
    }
  });
}
