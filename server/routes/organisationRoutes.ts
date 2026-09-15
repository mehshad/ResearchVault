/**
 * Organisation structure (branches, departments, sections) and facilities
 * (buildings, rooms). Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { requireAuth } from "../auth";
import { storage } from "../databaseStorage";
import { db } from "../db";
import { logError } from "../logger";
import { hasAnyRole } from "@shared/effectiveRoles";
import { ROOM_MANAGER_ELIGIBILITY_MESSAGE, ROOM_SUPERVISOR_ELIGIBILITY_MESSAGE, isRoomManagerEligible, isRoomSupervisorEligible } from "@shared/roomRoleEligibility";
import { branches, departments, insertBranchSchema, insertBuildingSchema, insertDepartmentSchema, insertRoomSchema, insertSectionSchema, scientists, sections, users } from "@shared/schema";
import { and, count, eq, sql } from "drizzle-orm";
import { ZodError, z } from "zod";
import { fromZodError } from "zod-validation-error";

export function registerOrganisationRoutes(app: Express): void {
  // ── Organizational structure (Branch → Department → Section) ──────────────
  const requireOrgManager = (req: Request, res: Response): boolean => {
    // Every slot, not the primary alone. Administrator rights are normally
    // held as a secondary role, so reading users.role by itself refused
    // administrators the organisation editor -- adding a department came back
    // "only management or administrators can modify the organization
    // structure" to someone who was one.
    if (!hasAnyRole(req.session?.user, ['Management', 'admin', 'superadmin'])) {
      res.status(403).json({ message: 'Only management or administrators can modify the organization structure' });
      return false;
    }
    return true;
  };

  app.get('/api/branches', async (_req: Request, res: Response) => {
    try {
      res.json(await storage.getBranches());
    } catch (error) {
      logError('Error fetching branches', "routes", error);
      res.status(500).json({ message: 'Failed to fetch branches' });
    }
  });

  app.post('/api/branches', requireAuth, async (req: Request, res: Response) => {
    if (!requireOrgManager(req, res)) return;
    try {
      const data = insertBranchSchema.parse(req.body);
      res.status(201).json(await storage.createBranch(data));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid branch data', errors: error.errors });
      }
      logError('Error creating branch', "routes", error);
      res.status(500).json({ message: 'Failed to create branch' });
    }
  });

  app.patch('/api/branches/:id', requireAuth, async (req: Request, res: Response) => {
    if (!requireOrgManager(req, res)) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid branch ID' });
    try {
      const data = insertBranchSchema.partial().parse(req.body);
      const updated = await storage.updateBranch(id, data);
      if (!updated) return res.status(404).json({ message: 'Branch not found' });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid branch data', errors: error.errors });
      }
      logError('Error updating branch', "routes", error);
      res.status(500).json({ message: 'Failed to update branch' });
    }
  });

  app.delete('/api/branches/:id', requireAuth, async (req: Request, res: Response) => {
    if (!requireOrgManager(req, res)) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid branch ID' });
    try {
      const result = await storage.deleteBranch(id);
      if (result !== true) {
        const status = result === 'Branch not found.' ? 404 : 409;
        return res.status(status).json({ message: result });
      }
      res.json({ message: 'Branch deleted successfully' });
    } catch (error) {
      logError('Error deleting branch', "routes", error);
      res.status(500).json({ message: 'Failed to delete branch' });
    }
  });

  app.get('/api/departments', async (_req: Request, res: Response) => {
    try {
      res.json(await storage.getDepartments());
    } catch (error) {
      logError('Error fetching departments', "routes", error);
      res.status(500).json({ message: 'Failed to fetch departments' });
    }
  });

  app.post('/api/departments', requireAuth, async (req: Request, res: Response) => {
    if (!requireOrgManager(req, res)) return;
    try {
      const data = insertDepartmentSchema.parse(req.body);
      const [branch] = await db.select().from(branches).where(eq(branches.id, data.branchId));
      if (!branch) return res.status(400).json({ message: `Branch ${data.branchId} does not exist` });
      res.status(201).json(await storage.createDepartment(data));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid department data', errors: error.errors });
      }
      logError('Error creating department', "routes", error);
      res.status(500).json({ message: 'Failed to create department' });
    }
  });

  app.patch('/api/departments/:id', requireAuth, async (req: Request, res: Response) => {
    if (!requireOrgManager(req, res)) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid department ID' });
    try {
      const data = insertDepartmentSchema.partial().parse(req.body);
      if (data.branchId !== undefined) {
        const [branch] = await db.select().from(branches).where(eq(branches.id, data.branchId));
        if (!branch) return res.status(400).json({ message: `Branch ${data.branchId} does not exist` });
      }
      const updated = await storage.updateDepartment(id, data);
      if (!updated) return res.status(404).json({ message: 'Department not found' });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid department data', errors: error.errors });
      }
      logError('Error updating department', "routes", error);
      res.status(500).json({ message: 'Failed to update department' });
    }
  });

  app.delete('/api/departments/:id', requireAuth, async (req: Request, res: Response) => {
    if (!requireOrgManager(req, res)) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid department ID' });
    try {
      const result = await storage.deleteDepartment(id);
      if (result !== true) {
        const status = result === 'Department not found.' ? 404 : 409;
        return res.status(status).json({ message: result });
      }
      res.json({ message: 'Department deleted successfully' });
    } catch (error) {
      logError('Error deleting department', "routes", error);
      res.status(500).json({ message: 'Failed to delete department' });
    }
  });

  app.get('/api/sections', async (_req: Request, res: Response) => {
    try {
      res.json(await storage.getSections());
    } catch (error) {
      logError('Error fetching sections', "routes", error);
      res.status(500).json({ message: 'Failed to fetch sections' });
    }
  });

  app.post('/api/sections', requireAuth, async (req: Request, res: Response) => {
    if (!requireOrgManager(req, res)) return;
    try {
      const data = insertSectionSchema.parse(req.body);
      const [dept] = await db.select().from(departments).where(eq(departments.id, data.departmentId));
      if (!dept) return res.status(400).json({ message: `Department ${data.departmentId} does not exist` });
      res.status(201).json(await storage.createSection(data));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid section data', errors: error.errors });
      }
      logError('Error creating section', "routes", error);
      res.status(500).json({ message: 'Failed to create section' });
    }
  });

  app.patch('/api/sections/:id', requireAuth, async (req: Request, res: Response) => {
    if (!requireOrgManager(req, res)) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid section ID' });
    try {
      const data = insertSectionSchema.partial().parse(req.body);
      if (data.departmentId !== undefined) {
        const [dept] = await db.select().from(departments).where(eq(departments.id, data.departmentId));
        if (!dept) return res.status(400).json({ message: `Department ${data.departmentId} does not exist` });
        // Reparenting a section with staff assigned would leave those staff
        // pointing at a section owned by a different department — block it.
        const [current] = await db.select().from(sections).where(eq(sections.id, id));
        if (!current) return res.status(404).json({ message: 'Section not found' });
        if (current.departmentId !== data.departmentId) {
          const [{ count: staffCount }] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(scientists)
            .where(eq(scientists.sectionId, id));
          if (staffCount > 0) {
            return res.status(409).json({
              message: `Cannot move this section to another department: ${staffCount} staff member(s) are assigned to it. Reassign them first.`,
            });
          }
        }
      }
      const updated = await storage.updateSection(id, data);
      if (!updated) return res.status(404).json({ message: 'Section not found' });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid section data', errors: error.errors });
      }
      logError('Error updating section', "routes", error);
      res.status(500).json({ message: 'Failed to update section' });
    }
  });

  app.delete('/api/sections/:id', requireAuth, async (req: Request, res: Response) => {
    if (!requireOrgManager(req, res)) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid section ID' });
    try {
      const result = await storage.deleteSection(id);
      if (result !== true) {
        const status = result === 'Section not found.' ? 404 : 409;
        return res.status(status).json({ message: result });
      }
      res.json({ message: 'Section deleted successfully' });
    } catch (error) {
      logError('Error deleting section', "routes", error);
      res.status(500).json({ message: 'Failed to delete section' });
    }
  });

  // Buildings API routes
  app.get('/api/buildings', async (req: Request, res: Response) => {
    try {
      const buildings = await storage.getBuildings();
      res.json(buildings);
    } catch (error) {
      logError('Error fetching buildings', "routes", error);
      res.status(500).json({ message: "Failed to fetch buildings" });
    }
  });

  app.get('/api/buildings/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid building ID" });
      }

      const building = await storage.getBuilding(id);
      if (!building) {
        return res.status(404).json({ message: "Building not found" });
      }

      res.json(building);
    } catch (error) {
      logError('Error fetching building', "routes", error);
      res.status(500).json({ message: "Failed to fetch building" });
    }
  });

  app.post('/api/buildings', async (req: Request, res: Response) => {
    try {
      const parsedData = insertBuildingSchema.parse(req.body);
      const building = await storage.createBuilding(parsedData);
      res.status(201).json(building);
    } catch (error) {
      logError('Error creating building', "routes", error);
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      res.status(500).json({ message: "Failed to create building" });
    }
  });

  app.patch('/api/buildings/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid building ID" });
      }

      const parsedData = insertBuildingSchema.partial().parse(req.body);
      const building = await storage.updateBuilding(id, parsedData);
      if (!building) {
        return res.status(404).json({ message: "Building not found" });
      }

      res.json(building);
    } catch (error) {
      logError('Error updating building', "routes", error);
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      res.status(500).json({ message: "Failed to update building" });
    }
  });

  app.delete('/api/buildings/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid building ID" });
      }

      const success = await storage.deleteBuilding(id);
      if (!success) {
        return res.status(404).json({ message: "Building not found" });
      }

      res.json({ message: "Building deleted successfully" });
    } catch (error) {
      logError('Error deleting building', "routes", error);
      res.status(500).json({ message: "Failed to delete building" });
    }
  });

  // Rooms API routes
  app.get('/api/rooms', async (req: Request, res: Response) => {
    try {
      const buildingId = req.query.buildingId ? parseInt(req.query.buildingId as string) : undefined;
      
      if (buildingId) {
        const rooms = await storage.getRoomsByBuilding(buildingId);
        res.json(rooms);
      } else {
        const rooms = await storage.getRooms();
        res.json(rooms);
      }
    } catch (error) {
      logError('Error fetching rooms', "routes", error);
      res.status(500).json({ message: "Failed to fetch rooms" });
    }
  });

  app.get('/api/rooms/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid room ID" });
      }

      const room = await storage.getRoom(id);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      res.json(room);
    } catch (error) {
      logError('Error fetching room', "routes", error);
      res.status(500).json({ message: "Failed to fetch room" });
    }
  });

  app.post('/api/rooms', async (req: Request, res: Response) => {
    try {
      const parsedData = insertRoomSchema.parse(req.body);
      
      // Validate supervisor and manager roles if provided
      if (parsedData.roomSupervisorId) {
        const supervisor = await storage.getScientist(parsedData.roomSupervisorId);
        if (!isRoomSupervisorEligible(supervisor)) {
          return res.status(400).json({ 
            message: ROOM_SUPERVISOR_ELIGIBILITY_MESSAGE,
          });
        }
      }
      
      if (parsedData.roomManagerId) {
        const manager = await storage.getScientist(parsedData.roomManagerId);
        if (!isRoomManagerEligible(manager)) {
          return res.status(400).json({ 
            message: ROOM_MANAGER_ELIGIBILITY_MESSAGE,
          });
        }
      }

      const room = await storage.createRoom(parsedData);
      res.status(201).json(room);
    } catch (error) {
      logError('Error creating room', "routes", error);
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      res.status(500).json({ message: "Failed to create room" });
    }
  });

  app.patch('/api/rooms/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid room ID" });
      }

      const parsedData = insertRoomSchema.partial().parse(req.body);
      
      // Validate supervisor and manager roles if being updated
      if (parsedData.roomSupervisorId) {
        const supervisor = await storage.getScientist(parsedData.roomSupervisorId);
        if (!isRoomSupervisorEligible(supervisor)) {
          return res.status(400).json({ 
            message: ROOM_SUPERVISOR_ELIGIBILITY_MESSAGE,
          });
        }
      }
      
      if (parsedData.roomManagerId) {
        const manager = await storage.getScientist(parsedData.roomManagerId);
        if (!isRoomManagerEligible(manager)) {
          return res.status(400).json({ 
            message: ROOM_MANAGER_ELIGIBILITY_MESSAGE,
          });
        }
      }

      const room = await storage.updateRoom(id, parsedData);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      res.json(room);
    } catch (error) {
      logError('Error updating room', "routes", error);
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      res.status(500).json({ message: "Failed to update room" });
    }
  });

  app.delete('/api/rooms/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid room ID" });
      }

      const success = await storage.deleteRoom(id);
      if (!success) {
        return res.status(404).json({ message: "Room not found" });
      }

      res.json({ message: "Room deleted successfully" });
    } catch (error) {
      logError('Error deleting room', "routes", error);
      res.status(500).json({ message: "Failed to delete room" });
    }
  });

  // Additional utility routes for facilities
  app.get('/api/buildings/:id/rooms', async (req: Request, res: Response) => {
    try {
      const buildingId = parseInt(req.params.id);
      if (isNaN(buildingId)) {
        return res.status(400).json({ message: "Invalid building ID" });
      }

      const rooms = await storage.getRoomsByBuilding(buildingId);
      res.json(rooms);
    } catch (error) {
      logError('Error fetching building rooms', "routes", error);
      res.status(500).json({ message: "Failed to fetch building rooms" });
    }
  });
}
