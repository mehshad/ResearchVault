/**
 * Data management plans.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { storage } from "../databaseStorage";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { and } from "drizzle-orm";
import { insertDataManagementPlanSchema } from "@shared/schema";

export function registerDataManagementPlanRoutes(app: Express): void {
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
      
      // Enhance plans with the SDR they belong to. This looked up a project by
      // a column plans no longer have, so every plan came back with
      // project: null and the list never showed its SDR.
      const activityById = new Map((await storage.getResearchActivities()).map((activity) => [activity.id, activity]));
      const enhancedPlans = plans.map((plan) => {
        const activity = activityById.get(plan.researchActivityId);
        return {
          ...plan,
          researchActivity: activity ? { id: activity.id, sdrNumber: activity.sdrNumber, title: activity.title } : null,
        };
      });
      
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

      const activity = await storage.getResearchActivity(plan.researchActivityId);
      
      const enhancedPlan = {
        ...plan,
        researchActivity: activity ? { id: activity.id, sdrNumber: activity.sdrNumber, title: activity.title } : null,
      };

      res.json(enhancedPlan);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch data management plan" });
    }
  });

  app.post('/api/data-management-plans', async (req: Request, res: Response) => {
    try {
      const validateData = insertDataManagementPlanSchema.parse(req.body);
      
      // The SDR must exist
      const activity = await storage.getResearchActivity(validateData.researchActivityId);
      if (!activity) {
        return res.status(404).json({ message: "Research activity not found" });
      }
      
      // One plan per SDR
      const existingPlan = await storage.getDataManagementPlanForResearchActivity(validateData.researchActivityId);
      if (existingPlan) {
        return res.status(409).json({ message: "A data management plan already exists for this research activity" });
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
}
