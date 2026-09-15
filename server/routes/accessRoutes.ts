/**
 * The access check and the ownership-override rules.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { requireAdmin, requireAuth } from "../auth";
import { storage } from "../databaseStorage";
import { db } from "../db";
import { logError } from "../logger";
import { resolveOwnershipAccess } from "../ownershipResolver";
import { isAdministrator } from "@shared/effectiveRoles";
import { users } from "@shared/schema";
import { and, sql } from "drizzle-orm";

export function registerAccessRoutes(app: Express): void {
  // ── Access level helpers ─────────────────────────────────────────────────────
  const ACCESS_LEVEL_ORDER: Record<string, number> = { edit: 3, create: 2, view: 1, hide: 0 };
  function maxAccessLevel(a: string | null, b: string | null): string | null {
    if (a === null && b === null) return null;
    if (a === null) return b;
    if (b === null) return a;
    return (ACCESS_LEVEL_ORDER[a] ?? -1) >= (ACCESS_LEVEL_ORDER[b] ?? -1) ? a : b;
  }

  // ── GET /api/access-check ─────────────────────────────────────────────────
  app.get('/api/access-check', requireAuth, async (req: Request, res: Response) => {
    try {
      const sessionUser = (req.session as any)?.user;
      if (!sessionUser) return res.status(401).json({ message: 'Not authenticated' });

      const { module, recordId: recordIdStr } = req.query as { module?: string; recordId?: string };
      if (!module) return res.status(400).json({ message: 'module query param required' });
      const recordId = recordIdStr ? parseInt(recordIdStr) : NaN;
      if (isNaN(recordId)) return res.status(400).json({ message: 'recordId must be an integer' });

      // Get role-based access for this user's role groups
      let roleAccess: string | null = null;
      try {
        // Get user's role group assignments
        const assignments = await db.execute(
          sql`SELECT role_group_id FROM user_role_assignments WHERE user_id = ${sessionUser.id}`
        );
        const assignmentRows: any[] = (assignments as any).rows ?? (assignments as any);
        if (assignmentRows.length > 0) {
          const groupIds = assignmentRows.map((r: any) => r.role_group_id);
          const perms = await db.execute(
            sql`SELECT access_level FROM role_permissions WHERE role_group_id = ANY(${groupIds}::int[]) AND navigation_item = ${module}`
          );
          const permRows: any[] = (perms as any).rows ?? (perms as any);
          for (const row of permRows) {
            roleAccess = maxAccessLevel(roleAccess, row.access_level);
          }
        }
      } catch {
        // role_permissions lookup failed — leave roleAccess at default
      }

      // Administrators get edit by default, wherever they hold it -- admin is
      // normally a secondary role, so reading users.role alone left an
      // administrator on 'hide' here while every other guard admitted them.
      if (!roleAccess && isAdministrator(sessionUser)) {
        roleAccess = 'edit';
      }
      if (!roleAccess) roleAccess = 'hide';

      const ownershipAccess = await resolveOwnershipAccess(sessionUser.id, module, recordId);
      const effectiveAccess = maxAccessLevel(roleAccess, ownershipAccess as string | null) ?? 'hide';

      res.json({ roleAccess, ownershipAccess: ownershipAccess ?? null, effectiveAccess });
    } catch (error) {
      logError('Error in access-check', "routes", error);
      res.status(500).json({ message: 'Failed to check access' });
    }
  });

  // ── Ownership overrides CRUD (admin only) ──────────────────────────────────
  app.get('/api/ownership-overrides', requireAdmin, async (req: Request, res: Response) => {
    try {
      const overrides = await storage.getOwnershipOverrides();
      res.json(overrides);
    } catch (error) {
      logError('Error fetching ownership overrides', "routes", error);
      res.status(500).json({ message: 'Failed to fetch ownership overrides' });
    }
  });

  app.get('/api/ownership-overrides/:module', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { module } = req.params;
      const overrides = await storage.getOwnershipOverridesForModule(module);
      res.json(overrides);
    } catch (error) {
      logError('Error fetching ownership overrides for module', "routes", error);
      res.status(500).json({ message: 'Failed to fetch ownership overrides' });
    }
  });

  app.put('/api/ownership-overrides', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { module, relationship, grantedAccess, description } = req.body as {
        module?: string; relationship?: string; grantedAccess?: string; description?: string;
      };
      if (!module || !relationship || !grantedAccess) {
        return res.status(400).json({ message: 'module, relationship, and grantedAccess are required' });
      }
      if (!['view', 'create', 'edit'].includes(grantedAccess)) {
        return res.status(400).json({ message: 'grantedAccess must be view, create, or edit' });
      }
      const result = await storage.upsertOwnershipOverride(module, relationship, grantedAccess, description);
      res.json(result);
    } catch (error) {
      logError('Error upserting ownership override', "routes", error);
      res.status(500).json({ message: 'Failed to upsert ownership override' });
    }
  });

  app.delete('/api/ownership-overrides/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
      const deleted = await storage.deleteOwnershipOverride(id);
      if (!deleted) return res.status(404).json({ message: 'Ownership override not found' });
      res.json({ message: 'Deleted successfully' });
    } catch (error) {
      logError('Error deleting ownership override', "routes", error);
      res.status(500).json({ message: 'Failed to delete ownership override' });
    }
  });
}
