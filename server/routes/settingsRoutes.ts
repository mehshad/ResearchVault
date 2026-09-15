/**
 * System configuration, PDF import history and feature requests.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { requireAdmin, requireAuth } from "../auth";
import { storage } from "../databaseStorage";
import { logError } from "../logger";
import { hasPublicationOfficerRole } from "../sidraScoreRoutes";
import { insertFeatureRequestSchema } from "@shared/schema";
import { isAdministrator } from "@shared/effectiveRoles";
import { SIDRA_SCORE_SETTINGS_KEY } from "@shared/sidraScore";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

export function registerSettingsRoutes(app: Express): void {
  // System Configuration endpoints
  /**
   * The only system-configuration keys readable without an administrator.
   *
   * These are applied while the page is still painting -- on the sign-in
   * screen, before anyone has said who they are -- so requiring a session to
   * read them would leave an unbranded, unthemed shell for every visitor.
   * Everything else about system configuration is administrative.
   */
  const PUBLIC_SYSTEM_CONFIG_KEYS = new Set([
    'app_theme_name',
    'app_institution_labels',
    'app_section_visibility',
    'color_mode_default',
  ]);

  const requireSystemConfigRead = (req: Request, res: Response, next: NextFunction) => {
    if (PUBLIC_SYSTEM_CONFIG_KEYS.has(req.params.key)) return next();
    return requireAdmin(req, res, next);
  };

  /**
   * Writes are administrator-only, with one standing exception: the Sidra Score
   * settings belong to the Outcome Office, who are not all administrators.
   */
  const requireSystemConfigWrite = (req: Request, res: Response, next: NextFunction) => {
    const key = req.params.key ?? (req.body as { key?: string } | undefined)?.key;
    if (key === SIDRA_SCORE_SETTINGS_KEY && hasPublicationOfficerRole(req)) return next();
    return requireAdmin(req, res, next);
  };

  app.get('/api/system-configurations', requireAdmin, async (req, res) => {
    try {
      const configs = await storage.getSystemConfigurations();
      res.json(configs);
    } catch (error) {
      logError('Error fetching system configurations', "routes", error);
      res.status(500).json({ error: 'Failed to fetch configurations' });
    }
  });

  app.get('/api/system-configurations/:key', requireSystemConfigRead, async (req, res) => {
    try {
      const config = await storage.getSystemConfiguration(req.params.key);
      if (!config) {
        return res.status(404).json({ error: 'Configuration not found' });
      }
      res.json(config);
    } catch (error) {
      logError('Error fetching system configuration', "routes", error);
      res.status(500).json({ error: 'Failed to fetch configuration' });
    }
  });

  app.post('/api/system-configurations', requireSystemConfigWrite, async (req, res) => {
    try {
      if (req.body?.key === SIDRA_SCORE_SETTINGS_KEY && !hasPublicationOfficerRole(req)) {
        return res.status(403).json({ error: 'Outcome Office access is required to change Sidra Score settings' });
      }
      const config = await storage.createSystemConfiguration(req.body);
      res.status(201).json(config);
    } catch (error) {
      logError('Error creating system configuration', "routes", error);
      res.status(500).json({ error: 'Failed to create configuration' });
    }
  });

  app.put('/api/system-configurations/:key', requireSystemConfigWrite, async (req, res) => {
    try {
      if (req.params.key === SIDRA_SCORE_SETTINGS_KEY && !hasPublicationOfficerRole(req)) {
        return res.status(403).json({ error: 'Outcome Office access is required to change Sidra Score settings' });
      }
      const config = await storage.updateSystemConfiguration(req.params.key, req.body);
      if (!config) {
        return res.status(404).json({ error: 'Configuration not found' });
      }
      res.json(config);
    } catch (error) {
      logError('Error updating system configuration', "routes", error);
      res.status(500).json({ error: 'Failed to update configuration' });
    }
  });

  app.delete('/api/system-configurations/:key', requireSystemConfigWrite, async (req, res) => {
    try {
      if (req.params.key === SIDRA_SCORE_SETTINGS_KEY && !hasPublicationOfficerRole(req)) {
        return res.status(403).json({ error: 'Outcome Office access is required to change Sidra Score settings' });
      }
      const result = await storage.deleteSystemConfiguration(req.params.key);
      if (!result) {
        return res.status(404).json({ error: 'Configuration not found' });
      }
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting system configuration', "routes", error);
      res.status(500).json({ error: 'Failed to delete configuration' });
    }
  });

  // PDF Import History routes
  app.get('/api/pdf-import-history', async (req: Request, res: Response) => {
    try {
      const { scientistName, courseName, dateFrom, dateTo, status, uploadedBy } = req.query;
      
      const filters: any = {};
      if (scientistName) filters.scientistName = scientistName as string;
      if (courseName) filters.courseName = courseName as string;
      if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
      if (dateTo) filters.dateTo = new Date(dateTo as string);
      if (status) filters.status = status as string;
      if (uploadedBy) filters.uploadedBy = parseInt(uploadedBy as string);
      
      const history = await storage.searchPdfImportHistory(filters);
      
      // Enhance with uploader information: one lookup covering both columns
      const personById = await storage.getScientistsByIds([
        ...history.map((entry) => entry.uploadedBy),
        ...history.map((entry) => entry.assignedScientistId),
      ]);
      const enhancedHistory = await Promise.all(history.map(async (entry) => {
        const uploader = entry.uploadedBy != null ? personById.get(entry.uploadedBy) : undefined;
        const assignedScientist = entry.assignedScientistId ? personById.get(entry.assignedScientistId) ?? null : null;

        return {
          ...entry,
          uploadedAt: entry.createdAt, // Map createdAt to uploadedAt for UI
          processingTimeMs: entry.processingDuration, // Map processingDuration to processingTimeMs for UI
          uploader: uploader ? {
            id: uploader.id,
            name: `${uploader.firstName} ${uploader.lastName}`,
            email: uploader.email
          } : null,
          assignedScientist: assignedScientist ? {
            id: assignedScientist.id,
            name: `${assignedScientist.firstName} ${assignedScientist.lastName}`,
            email: assignedScientist.email
          } : null
        };
      }));
      
      res.json(enhancedHistory);
    } catch (error) {
      logError("Error fetching PDF import history", "routes", error);
      res.status(500).json({ message: "Failed to fetch PDF import history" });
    }
  });

  app.get('/api/pdf-import-history/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid history entry ID" });
      }

      const entry = await storage.getPdfImportHistoryEntry(id);
      if (!entry) {
        return res.status(404).json({ message: "PDF import history entry not found" });
      }

      // Enhance with additional information
      const uploader = await storage.getScientist(entry.uploadedBy);
      const assignedScientist = entry.assignedScientistId ? await storage.getScientist(entry.assignedScientistId) : null;

      const enhancedEntry = {
        ...entry,
        uploadedAt: entry.createdAt, // Map createdAt to uploadedAt for UI
        processingTimeMs: entry.processingDuration, // Map processingDuration to processingTimeMs for UI  
        uploader: uploader ? {
          id: uploader.id,
          name: `${uploader.firstName} ${uploader.lastName}`,
          email: uploader.email
        } : null,
        assignedScientist: assignedScientist ? {
          id: assignedScientist.id,
          name: `${assignedScientist.firstName} ${assignedScientist.lastName}`,
          email: assignedScientist.email
        } : null
      };

      res.json(enhancedEntry);
    } catch (error) {
      logError("Error fetching PDF import history entry", "routes", error);
      res.status(500).json({ message: "Failed to fetch PDF import history entry" });
    }
  });

  // Feature Request routes. Signed in only; the vote and the requester's name
  // are the session's, never the body's, and a request is changed or removed
  // by its requester or an administrator (#22).
  const featureRequestWriteSchema = insertFeatureRequestSchema.omit({
    upvotes: true,
    upvotedBy: true,
    requestedBy: true,
  });
  const requesterName = (req: Request): string | null => {
    const user = req.session?.user;
    return user ? (user.name?.trim() || user.username) : null;
  };
  const mayManage = (req: Request, request: { requestedBy: string }): boolean => {
    const user = req.session?.user;
    if (!user) return false;
    return isAdministrator(user) || [user.name, user.username].includes(request.requestedBy);
  };

  app.get('/api/feature-requests', requireAuth, async (req: Request, res: Response) => {
    try {
      const requests = await storage.getFeatureRequests();
      res.json(requests);
    } catch (error) {
      logError("Error fetching feature requests", "routes", error);
      res.status(500).json({ message: "Failed to fetch feature requests" });
    }
  });

  app.get('/api/feature-requests/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid feature request ID" });
      }

      const request = await storage.getFeatureRequest(id);
      if (!request) {
        return res.status(404).json({ message: "Feature request not found" });
      }

      res.json(request);
    } catch (error) {
      logError("Error fetching feature request", "routes", error);
      res.status(500).json({ message: "Failed to fetch feature request" });
    }
  });

  app.post('/api/feature-requests', requireAuth, async (req: Request, res: Response) => {
    try {
      const featureRequestData = featureRequestWriteSchema.parse(req.body);
      const newRequest = await storage.createFeatureRequest({
        ...featureRequestData,
        requestedBy: requesterName(req) ?? "Anonymous User",
      });
      res.status(201).json(newRequest);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        logError("Error creating feature request", "routes", error);
        res.status(500).json({ message: "Failed to create feature request" });
      }
    }
  });

  app.put('/api/feature-requests/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid feature request ID" });
      }
      const currentRequest = await storage.getFeatureRequest(id);
      if (!currentRequest) {
        return res.status(404).json({ message: "Feature request not found" });
      }

      // A vote toggles for the signed-in account. `upvoteUserId` still works
      // as the trigger for an older client, but its value is ignored.
      if (req.body.upvote !== undefined || req.body.upvoteUserId !== undefined) {
        const voter = String(req.session!.user!.id);
        const upvotedBy = currentRequest.upvotedBy || [];
        const newUpvotedBy = upvotedBy.includes(voter)
          ? upvotedBy.filter((v) => v !== voter)
          : [...upvotedBy, voter];
        const updatedRequest = await storage.updateFeatureRequest(id, {
          upvotes: newUpvotedBy.length,
          upvotedBy: newUpvotedBy,
        });
        return res.json(updatedRequest);
      }

      if (!mayManage(req, currentRequest)) {
        return res.status(403).json({ message: "Only the requester or an administrator can change this request." });
      }
      const updateData = featureRequestWriteSchema.partial().parse(req.body);
      const updatedRequest = await storage.updateFeatureRequest(id, updateData);
      if (!updatedRequest) {
        return res.status(404).json({ message: "Feature request not found" });
      }

      res.json(updatedRequest);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        logError("Error updating feature request", "routes", error);
        res.status(500).json({ message: "Failed to update feature request" });
      }
    }
  });

  app.delete('/api/feature-requests/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid feature request ID" });
      }
      const existing = await storage.getFeatureRequest(id);
      if (!existing) {
        return res.status(404).json({ message: "Feature request not found" });
      }
      if (!mayManage(req, existing)) {
        return res.status(403).json({ message: "Only the requester or an administrator can delete this request." });
      }

      const deleted = await storage.deleteFeatureRequest(id);
      if (!deleted) {
        return res.status(404).json({ message: "Feature request not found" });
      }
      await req.audit.logDelete("feature_requests", id, existing as Record<string, unknown>);

      res.json({ message: "Feature request deleted successfully" });
    } catch (error) {
      logError("Error deleting feature request", "routes", error);
      res.status(500).json({ message: "Failed to delete feature request" });
    }
  });
}
