/**
 * PMO applications (RA-200, RA-205A) and team members.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { storage } from "../databaseStorage";
import { log, logError } from "../logger";
import { insertRa200ApplicationSchema, insertRa205aApplicationSchema, insertTeamMemberSchema } from "@shared/schema";
import { and } from "drizzle-orm";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

export function registerPmoApplicationRoutes(app: Express): void {
  // PMO Applications routes
  app.get('/api/pmo-applications', async (req: Request, res: Response) => {
    try {
      const applications = await storage.getAllPmoApplications();
      res.json(applications);
    } catch (error) {
      logError("Error fetching PMO applications", "routes", error);
      res.status(500).json({ message: "Failed to fetch PMO applications" });
    }
  });

  app.get('/api/pmo-applications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid application ID" });
      }

      const application = await storage.getPmoApplication(id);
      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }

      res.json(application);
    } catch (error) {
      logError("Error fetching PMO application", "routes", error);
      res.status(500).json({ message: "Failed to fetch application" });
    }
  });

  // Create RA-200 Application
  app.post('/api/ra200-applications', async (req: Request, res: Response) => {
    try {
      const applicationData = insertRa200ApplicationSchema.parse(req.body);
      const application = await storage.createRa200Application(applicationData);
      res.status(201).json(application);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        logError("Error creating RA-200 application", "routes", error);
        res.status(500).json({ message: "Failed to create application" });
      }
    }
  });

  // Create RA-205A Application
  app.post('/api/ra205a-applications', async (req: Request, res: Response) => {
    try {
      const applicationData = insertRa205aApplicationSchema.parse(req.body);
      const application = await storage.createRa205aApplication(applicationData);
      res.status(201).json(application);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        logError("Error creating RA-205A application", "routes", error);
        res.status(500).json({ message: "Failed to create application" });
      }
    }
  });

  app.put('/api/pmo-applications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid application ID" });
      }

      // Handle status changes and comments
      if (req.body.statusChange) {
        const { status, comment, userId } = req.body.statusChange;

        const currentApp = await storage.getPmoApplication(id);
        if (!currentApp) {
          return res.status(404).json({ message: "Application not found" });
        }

        // Add to review history
        const newHistory = [
          ...(currentApp.reviewHistory as any[] || []),
          {
            timestamp: new Date().toISOString(),
            action: status,
            user: userId || 'PMO Office',
            comment: comment
          }
        ];

        // Add to office comments if it's from PMO office
        const newOfficeComments = [
          ...(currentApp.officeComments as any[] || []),
          {
            timestamp: new Date().toISOString(),
            user: userId || 'PMO Office',
            comment: comment,
            action: status
          }
        ];

        // If approved, create SDR entry
        if (status === 'approved') {
          // TODO: Create SDR entry from approved application
          log('Creating SDR entry for approved application', "routes", { detail: id });
        }

        const updatedApp = await storage.updatePmoApplication(id, {
          status,
          reviewHistory: newHistory,
          officeComments: newOfficeComments
        });

        return res.json(updatedApp);
      }

      // Regular update
      const updateData = insertPmoApplicationSchema.partial().parse(req.body);
      const updatedApp = await storage.updatePmoApplication(id, updateData);

      if (!updatedApp) {
        return res.status(404).json({ message: "Application not found" });
      }

      res.json(updatedApp);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        logError("Error updating PMO application", "routes", error);
        res.status(500).json({ message: "Failed to update application" });
      }
    }
  });

  app.delete('/api/pmo-applications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid application ID" });
      }

      const deleted = await storage.deletePmoApplication(id);
      if (!deleted) {
        return res.status(404).json({ message: "Application not found" });
      }

      res.json({ message: "Application deleted successfully" });
    } catch (error) {
      logError("Error deleting PMO application", "routes", error);
      res.status(500).json({ message: "Failed to delete application" });
    }
  });

  // Team Member routes (public - no auth required)
  app.get('/api/team-members', async (req: Request, res: Response) => {
    try {
      const members = await storage.getTeamMembers();
      res.json(members);
    } catch (error) {
      logError("Error fetching team members", "routes", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  app.get('/api/team-members/category/:category', async (req: Request, res: Response) => {
    try {
      const { category } = req.params;
      const members = await storage.getTeamMembersByCategory(category);
      res.json(members);
    } catch (error) {
      logError("Error fetching team members by category", "routes", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  app.get('/api/team-members/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid team member ID" });
      }

      const member = await storage.getTeamMember(id);
      if (!member) {
        return res.status(404).json({ message: "Team member not found" });
      }

      res.json(member);
    } catch (error) {
      logError("Error fetching team member", "routes", error);
      res.status(500).json({ message: "Failed to fetch team member" });
    }
  });

  app.post('/api/team-members', async (req: Request, res: Response) => {
    try {
      const memberData = insertTeamMemberSchema.parse(req.body);
      const newMember = await storage.createTeamMember(memberData);
      res.status(201).json(newMember);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        logError("Error creating team member", "routes", error);
        res.status(500).json({ message: "Failed to create team member" });
      }
    }
  });

  app.put('/api/team-members/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid team member ID" });
      }

      const updateData = insertTeamMemberSchema.partial().parse(req.body);
      const updatedMember = await storage.updateTeamMember(id, updateData);

      if (!updatedMember) {
        return res.status(404).json({ message: "Team member not found" });
      }

      res.json(updatedMember);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        logError("Error updating team member", "routes", error);
        res.status(500).json({ message: "Failed to update team member" });
      }
    }
  });

  app.delete('/api/team-members/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid team member ID" });
      }

      const deleted = await storage.deleteTeamMember(id);
      if (!deleted) {
        return res.status(404).json({ message: "Team member not found" });
      }

      res.json({ message: "Team member deleted successfully" });
    } catch (error) {
      logError("Error deleting team member", "routes", error);
      res.status(500).json({ message: "Failed to delete team member" });
    }
  });
}
