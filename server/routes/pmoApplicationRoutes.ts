/**
 * PMO applications (RA-200, RA-205A) and team members.
 * Moved out of server/routes.ts as one domain (#42). The two forms live in
 * their own tables and share an id space, so a form type travels with every
 * single-record request: ?type= on GET/DELETE, formType in a PUT/POST body,
 * or the form-specific path (#61).
 */
import type { Express, Request, Response } from "express";
import { storage, type PmoFormType } from "../databaseStorage";
import { log, logError } from "../logger";
import { insertRa200ApplicationSchema, insertRa205aApplicationSchema, insertTeamMemberSchema } from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

const FORM_TYPES: readonly PmoFormType[] = ['RA-200', 'RA-205A'];

/** The form type named by a request, or undefined when it did not say. */
function formTypeOf(value: unknown): PmoFormType | undefined {
  return typeof value === 'string' && (FORM_TYPES as readonly string[]).includes(value)
    ? (value as PmoFormType)
    : undefined;
}

function updateSchemaFor(formType: PmoFormType) {
  return formType === 'RA-200'
    ? insertRa200ApplicationSchema.partial()
    : insertRa205aApplicationSchema.partial();
}

function sendZodOr500(res: Response, error: unknown, what: string, message: string) {
  if (error instanceof ZodError) {
    res.status(400).json({ message: fromZodError(error).message });
  } else {
    logError(what, "routes", error);
    res.status(500).json({ message });
  }
}

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

      const application = await storage.getPmoApplication(id, formTypeOf(req.query.type));
      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }

      res.json(application);
    } catch (error) {
      logError("Error fetching PMO application", "routes", error);
      res.status(500).json({ message: "Failed to fetch application" });
    }
  });

  // Create either form from one endpoint; the body says which.
  app.post('/api/pmo-applications', async (req: Request, res: Response) => {
    const formType = formTypeOf(req.body?.formType);
    if (!formType) {
      return res.status(400).json({ message: "formType must be RA-200 or RA-205A" });
    }
    try {
      const application = formType === 'RA-200'
        ? await storage.createRa200Application(insertRa200ApplicationSchema.parse(req.body))
        : await storage.createRa205aApplication(insertRa205aApplicationSchema.parse(req.body));
      res.status(201).json({ ...application, form_type: formType });
    } catch (error) {
      sendZodOr500(res, error, `Error creating ${formType} application`, "Failed to create application");
    }
  });

  // Create RA-200 Application
  app.post('/api/ra200-applications', async (req: Request, res: Response) => {
    try {
      const applicationData = insertRa200ApplicationSchema.parse(req.body);
      const application = await storage.createRa200Application(applicationData);
      res.status(201).json(application);
    } catch (error) {
      sendZodOr500(res, error, "Error creating RA-200 application", "Failed to create application");
    }
  });

  // Create RA-205A Application
  app.post('/api/ra205a-applications', async (req: Request, res: Response) => {
    try {
      const applicationData = insertRa205aApplicationSchema.parse(req.body);
      const application = await storage.createRa205aApplication(applicationData);
      res.status(201).json(application);
    } catch (error) {
      sendZodOr500(res, error, "Error creating RA-205A application", "Failed to create application");
    }
  });

  // The edit pages read and save one form by its own path.
  for (const [path, formType] of [
    ['/api/ra200-applications/:id', 'RA-200'],
    ['/api/ra205a-applications/:id', 'RA-205A'],
  ] as const) {
    app.get(path, async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ message: "Invalid application ID" });
        }
        const application = await storage.getPmoApplication(id, formType);
        if (!application) {
          return res.status(404).json({ message: "Application not found" });
        }
        res.json(application);
      } catch (error) {
        logError(`Error fetching ${formType} application`, "routes", error);
        res.status(500).json({ message: "Failed to fetch application" });
      }
    });

    app.put(path, async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ message: "Invalid application ID" });
        }
        const updateData = updateSchemaFor(formType).parse(req.body);
        const updatedApp = await storage.updatePmoApplication(id, updateData, formType);
        if (!updatedApp) {
          return res.status(404).json({ message: "Application not found" });
        }
        res.json(updatedApp);
      } catch (error) {
        sendZodOr500(res, error, `Error updating ${formType} application`, "Failed to update application");
      }
    });
  }

  app.put('/api/pmo-applications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid application ID" });
      }
      const requestedType = formTypeOf(req.body?.formType) ?? formTypeOf(req.query.type);
      const currentApp = await storage.getPmoApplication(id, requestedType);
      if (!currentApp) {
        return res.status(404).json({ message: "Application not found" });
      }

      // Handle status changes and comments
      if (req.body.statusChange) {
        const { status, comment, userId } = req.body.statusChange;

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
        }, currentApp.form_type);

        return res.json(updatedApp);
      }

      // Regular update, validated against the form the record belongs to
      const updateData = updateSchemaFor(currentApp.form_type).parse(req.body);
      const updatedApp = await storage.updatePmoApplication(id, updateData, currentApp.form_type);

      if (!updatedApp) {
        return res.status(404).json({ message: "Application not found" });
      }

      res.json(updatedApp);
    } catch (error) {
      sendZodOr500(res, error, "Error updating PMO application", "Failed to update application");
    }
  });

  app.delete('/api/pmo-applications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid application ID" });
      }

      const deleted = await storage.deletePmoApplication(id, formTypeOf(req.query.type));
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
      sendZodOr500(res, error, "Error creating team member", "Failed to create team member");
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
      sendZodOr500(res, error, "Error updating team member", "Failed to update team member");
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
