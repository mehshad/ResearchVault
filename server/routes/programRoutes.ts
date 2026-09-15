/**
 * Research programmes.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { storage } from "../databaseStorage";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { insertProgramSchema } from "@shared/schema";
import { getInvestigatorAssignmentError } from "../investigatorAssignment";
import { deleteRefusal } from "../deleteBlockers";
import { logError } from "../logger";

export function registerProgramRoutes(app: Express): void {
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
}
