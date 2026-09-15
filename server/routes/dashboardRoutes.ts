/**
 * Database health and the home dashboard.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { storage } from "../databaseStorage";
import { db } from "../db";
import { and, sql } from "drizzle-orm";
import { logError } from "../logger";

export function registerDashboardRoutes(app: Express): void {
  app.get('/api/health/database', async (req: Request, res: Response) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.json(true);
    } catch (error) {
      logError("Database health check failed", "routes", error);
      res.json(false);
    }
  });

  // Object Storage Routes
  app.get('/api/dashboard/stats', async (req: Request, res: Response) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard statistics" });
    }
  });

  app.get('/api/dashboard/recent-activity', async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 8;
      const activity = await storage.getRecentActivity(limit);
      res.json(activity);
    } catch (error) {
      logError("Error fetching recent activity", "routes", error);
      res.status(500).json({ message: "Failed to fetch recent activity" });
    }
  });

  app.get('/api/dashboard/recent-projects', async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const activities = await storage.getRecentResearchActivities(limit);
      
      // Fetch lead scientist and PI info for each activity
      const enhancedActivities = await Promise.all(activities.map(async (activity) => {
        const members = await storage.getProjectMembers(activity.id);
        const leadMember = members.find(m => m.role === 'Lead Scientist');
        const piMember = members.find(m => m.role === 'Principal Investigator');
        
        let leadScientist = null;
        if (leadMember) {
          const scientist = await storage.getScientist(leadMember.scientistId);
          if (scientist) {
            leadScientist = {
              id: scientist.id,
              firstName: scientist.firstName,
              lastName: scientist.lastName,
              profileImageInitials: scientist.profileImageInitials
            };
          }
        }
        
        let principalInvestigator = null;
        if (piMember) {
          const scientist = await storage.getScientist(piMember.scientistId);
          if (scientist) {
            principalInvestigator = {
              id: scientist.id,
              firstName: scientist.firstName,
              lastName: scientist.lastName,
              profileImageInitials: scientist.profileImageInitials
            };
          }
        }
        
        return {
          ...activity,
          leadScientist,
          principalInvestigator
        };
      }));
      
      res.json(enhancedActivities);
    } catch (error) {
      logError("Error fetching recent research activities", "routes", error);
      res.status(500).json({ message: "Failed to fetch recent research activities" });
    }
  });

  app.get('/api/dashboard/upcoming-deadlines', async (req: Request, res: Response) => {
    try {
      const deadlines = await storage.getUpcomingDeadlines();
      res.json(deadlines);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch upcoming deadlines" });
    }
  });

  // Programs (PRM)
}
