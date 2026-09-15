/**
 * The role/navigation permission matrix.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { storage } from "../databaseStorage";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { insertRolePermissionSchema } from "@shared/schema";
import { requireAuth, requireAdmin } from "../auth";
import { logError } from "../logger";

export function registerRolePermissionRoutes(app: Express): void {
  // Readable by any signed-in user: every client loads the matrix on mount to
  // decide what to render for its own role. Writing it is a different matter --
  // see the administrator guards on the mutating routes below.
  app.get('/api/role-permissions', requireAuth, async (req: Request, res: Response) => {
    try {
      const permissions = await storage.getRolePermissions();
      res.json(permissions);
    } catch (error) {
      logError('Error fetching role permissions', "routes", error);
      res.status(500).json({ message: "Failed to fetch role permissions" });
    }
  });

  // The access matrix decides what every role may reach, so changing it is an
  // administrator action. Without this guard any signed-in account could grant
  // itself edit on any area, including the one the server enforces.
  app.post('/api/role-permissions', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const validateData = insertRolePermissionSchema.parse(req.body);
      const permission = await storage.createRolePermission(validateData);
      res.status(201).json(permission);
    } catch (error) {
      logError('Error creating role permission', "routes", error);
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      res.status(500).json({ message: "Failed to create role permission" });
    }
  });

  app.patch('/api/role-permissions/:jobTitle/:navigationItem', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { jobTitle, navigationItem } = req.params;
      const { accessLevel } = req.body;
      
      if (!accessLevel || !["hide", "view", "edit"].includes(accessLevel)) {
        return res.status(400).json({ message: "Invalid access level" });
      }

      const permission = await storage.updateRolePermission(jobTitle, navigationItem, accessLevel);
      if (!permission) {
        return res.status(404).json({ message: "Role permission not found" });
      }
      
      res.json(permission);
    } catch (error) {
      logError('Error updating role permission', "routes", error);
      res.status(500).json({ message: "Failed to update role permission" });
    }
  });

  app.post('/api/role-permissions/bulk', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { permissions } = req.body;
      if (!Array.isArray(permissions)) {
        return res.status(400).json({ message: "Permissions must be an array" });
      }

      const results = await storage.updateRolePermissionsBulk(
        permissions,
        req.session?.user?.id ?? undefined,
      );
      res.json(results);
    } catch (error) {
      logError('Error bulk updating role permissions', "routes", error);
      res.status(500).json({ message: "Failed to bulk update role permissions" });
    }
  });

  // Journal impact factors: server/routes/journalImpactFactorRoutes.ts
}
