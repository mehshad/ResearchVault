/**
 * IRB applications and board members.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { storage } from "../databaseStorage";
import { scientistDisplayName } from "@shared/scientistName";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { and } from "drizzle-orm";
import { insertIrbApplicationSchema } from "@shared/schema";
import { getInvestigatorAssignmentError } from "../investigatorAssignment";
import { log, logError } from "../logger";

export function registerIrbRoutes(app: Express): void {
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
            name: scientistDisplayName(pi),
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

      // Related details. The application is filed against an SDR; a project
      // lookup here read a column IRB applications never had.
      const activity = application.researchActivityId ? await storage.getResearchActivity(application.researchActivityId) : undefined;
      const pi = await storage.getScientist(application.principalInvestigatorId);
      
      const enhancedApplication = {
        ...application,
        researchActivity: activity ? { id: activity.id, sdrNumber: activity.sdrNumber, title: activity.title } : null,
        principalInvestigator: pi ? {
          id: pi.id,
          name: scientistDisplayName(pi),
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
          let existingResponses: Record<string, unknown> = {};
          
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
              existingResponses = currentApp.piResponses as Record<string, unknown>;
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
      res.status(500).json({ message: "Failed to update IRB application", error: error instanceof Error ? error.message : String(error) });
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
      res.status(500).json({ message: "Failed to create IRB board member", error: error instanceof Error ? error.message : String(error) });
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
      res.status(500).json({ message: "Failed to update IRB board member", error: error instanceof Error ? error.message : String(error) });
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
      res.status(500).json({ message: "Failed to delete IRB board member", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Organisation structure and facilities: server/routes/organisationRoutes.ts
}
