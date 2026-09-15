/**
 * Patents.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { storage } from "../databaseStorage";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { and } from "drizzle-orm";
import { insertPatentSchema } from "@shared/schema";

export function registerPatentRoutes(app: Express): void {
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
      
      // Enhance patents with the SDR they belong to. This looked up a project
      // by a column patents no longer have, so every patent came back with
      // project: null and the list never showed where a patent came from.
      const activityById = new Map((await storage.getResearchActivities()).map((activity) => [activity.id, activity]));
      const enhancedPatents = patents.map((patent) => {
        const activity = patent.researchActivityId ? activityById.get(patent.researchActivityId) : undefined;
        return {
          ...patent,
          researchActivity: activity ? { id: activity.id, sdrNumber: activity.sdrNumber, title: activity.title } : null,
        };
      });
      
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

      const activity = patent.researchActivityId ? await storage.getResearchActivity(patent.researchActivityId) : undefined;
      
      const enhancedPatent = {
        ...patent,
        researchActivity: activity ? { id: activity.id, sdrNumber: activity.sdrNumber, title: activity.title } : null,
      };

      res.json(enhancedPatent);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch patent" });
    }
  });

  app.post('/api/patents', async (req: Request, res: Response) => {
    try {
      const validateData = insertPatentSchema.parse(req.body);
      
      // The SDR must exist when one is given
      if (validateData.researchActivityId) {
        const activity = await storage.getResearchActivity(validateData.researchActivityId);
        if (!activity) {
          return res.status(404).json({ message: "Research activity not found" });
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
      
      // The SDR must exist when one is given
      if (validateData.researchActivityId) {
        const activity = await storage.getResearchActivity(validateData.researchActivityId);
        if (!activity) {
          return res.status(404).json({ message: "Research activity not found" });
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
}
