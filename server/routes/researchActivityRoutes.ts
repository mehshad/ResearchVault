/**
 * Research activities (SDRs) and their team members.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { storage } from "../databaseStorage";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { and } from "drizzle-orm";
import { insertResearchActivitySchema, insertProjectMemberSchema } from "@shared/schema";
import { isInvestigatorRoleAssignmentAllowed } from "@shared/investigatorEligibility";
import { getInvestigatorAssignmentError } from "../investigatorAssignment";
import { deleteRefusal } from "../deleteBlockers";
import { log, logError } from "../logger";

export function registerResearchActivityRoutes(app: Express): void {
  app.get('/api/research-activities', async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
      const principalInvestigatorId = req.query.principalInvestigatorId ? parseInt(req.query.principalInvestigatorId as string) : undefined;
      
      let activities;
      if (projectId && !isNaN(projectId)) {
        activities = await storage.getResearchActivitiesForProject(projectId);
      } else if (principalInvestigatorId && !isNaN(principalInvestigatorId)) {
        activities = await storage.getResearchActivitiesForScientist(principalInvestigatorId);
      } else {
        activities = await storage.getResearchActivities();
      }
      
      res.json(activities);
    } catch (error) {
      logError("Error fetching research activities", "routes", error);
      res.status(500).json({ message: "Failed to fetch research activities" });
    }
  });
  
  app.get('/api/research-activities/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const activity = await storage.getResearchActivity(id);
      if (!activity) {
        return res.status(404).json({ message: "Research activity not found" });
      }
      
      // Get project details if projectId exists
      let project = null;
      if (activity.projectId) {
        project = await storage.getProject(activity.projectId);
      }
      
      // Principal Investigator details now come from team membership
      
      const enhancedActivity = {
        ...activity,
        project: project ? {
          id: project.id,
          name: project.name,
          projectId: project.projectId
        } : null
      };
      
      res.json(enhancedActivity);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch research activity" });
    }
  });

  app.get('/api/research-activities/:id/staff', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      // Get all project members for this research activity
      const members = await storage.getProjectMembers(id);
      
      // One query for every member, not one per member.
      const scientistById = await storage.getScientistsByIds(members.map((member) => member.scientistId));
      const staffPromises = members.map(async (member) => scientistById.get(member.scientistId));
      
      const staff = await Promise.all(staffPromises);
      // Filter out any null values and return only the staff
      const validStaff = staff.filter(scientist => scientist !== undefined);
      
      res.json(validStaff);
    } catch (error) {
      logError("Error fetching research activity staff", "routes", error);
      res.status(500).json({ message: "Failed to fetch research activity staff" });
    }
  });

  app.post('/api/research-activities', async (req: Request, res: Response) => {
    try {
      const validatedData = insertResearchActivitySchema.parse(req.body);
      const eligibilityError = await getInvestigatorAssignmentError(
        validatedData.budgetHolderId,
        "Budget Holder / Principal Investigator"
      );
      if (eligibilityError) {
        return res
          .status(eligibilityError.status)
          .json({ message: eligibilityError.message });
      }
      const newActivity = await storage.createResearchActivity(validatedData);

      // Automatically add the Principal Investigator/Budget Holder to the
      // research team so the SDR starts with its PI as a member.
      if (newActivity.budgetHolderId) {
        try {
          await storage.addProjectMember({
            researchActivityId: newActivity.id,
            scientistId: newActivity.budgetHolderId,
            role: "Principal Investigator",
          });
        } catch (memberError) {
          // Don't fail SDR creation if the auto-add fails; log for diagnosis.
          logError("Failed to auto-add PI as team member", "routes", memberError);
        }
      }

      res.status(201).json(newActivity);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      logError("Error creating research activity", "routes", error);
      res.status(500).json({ message: "Failed to create research activity" });
    }
  });

  app.put('/api/research-activities/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const validatedData = insertResearchActivitySchema.partial().parse(req.body);
      const eligibilityError = await getInvestigatorAssignmentError(
        validatedData.budgetHolderId,
        "Budget Holder / Principal Investigator"
      );
      if (eligibilityError) {
        return res
          .status(eligibilityError.status)
          .json({ message: eligibilityError.message });
      }
      const updatedActivity = await storage.updateResearchActivity(id, validatedData);
      
      if (!updatedActivity) {
        return res.status(404).json({ message: "Research activity not found" });
      }

      // Creating an SDR puts its PI on the research team; changing the PI did
      // not, so somebody made PI of an existing SDR was the PI on record and
      // absent from its team at the same time. Anything reading membership --
      // the team screen, "My SDRs" -- then disagreed with the SDR itself.
      if (updatedActivity.budgetHolderId) {
        try {
          const team = await storage.getProjectMembers(id);

          // Whoever used to be PI is demoted rather than removed. They were
          // genuinely on this work and may still be; dropping them would lose
          // that, and an SDR is supposed to have exactly one PI, so leaving two
          // is not an option either. Removing them stays a deliberate act.
          for (const member of team as any[]) {
            if (
              member.role === "Principal Investigator" &&
              member.scientistId !== updatedActivity.budgetHolderId
            ) {
              await storage.setProjectMemberRole(id, member.scientistId, "Team Member");
            }
          }

          const alreadyOnIt = team.some(
            (member: any) => member.scientistId === updatedActivity.budgetHolderId,
          );
          if (!alreadyOnIt) {
            await storage.addProjectMember({
              researchActivityId: id,
              scientistId: updatedActivity.budgetHolderId,
              role: "Principal Investigator",
            });
          } else {
            // Already on the team in some other capacity: promote rather than
            // add a second row for the same person.
            await storage.setProjectMemberRole(id, updatedActivity.budgetHolderId, "Principal Investigator");
          }
        } catch (memberError) {
          // Worth reporting, not worth failing a saved update over.
          logError(`Failed to reconcile the team for ${updatedActivity.sdrNumber}`, "routes", memberError);
        }
      }
      
      res.json(updatedActivity);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      logError("Error updating research activity", "routes", error);
      res.status(500).json({ message: "Failed to update research activity" });
    }
  });

  app.delete('/api/research-activities/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      // Refuse while team members, publications, grants, applications, plans,
      // patents or contracts still point at it -- in the dev database one SDR
      // delete would have orphaned rows in three tables without a word.
      const blockers = await storage.getResearchActivityDeleteBlockers(id);
      if (blockers.length > 0) return res.status(409).json(deleteRefusal(blockers));

      const existing = await storage.getResearchActivity(id);
      const success = await storage.deleteResearchActivity(id);
      if (!success) {
        return res.status(404).json({ message: "Research activity not found" });
      }
      if (existing) await req.audit.logDelete("research_activities", id, existing as Record<string, unknown>);
      res.status(204).send();
    } catch (error) {
      logError("Error deleting research activity", "routes", error);
      res.status(500).json({ message: "Failed to delete research activity" });
    }
  });

  // Projects
  app.get('/api/research-activities/:id/members', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const members = await storage.getProjectMembers(id);
      
      // Enhance team members with scientist details, one query for the list
      const memberById = await storage.getScientistsByIds(members.map((member) => member.scientistId));
      const enhancedMembers = await Promise.all(members.map(async (member) => {
        const scientist = memberById.get(member.scientistId);
        return {
          ...member,
          scientist: scientist ? {
            id: scientist.id,
            firstName: scientist.firstName,
            lastName: scientist.lastName,
            honorificTitle: scientist.honorificTitle,
            jobTitle: scientist.jobTitle,
            email: scientist.email,
            staffId: scientist.staffId,
            profileImageInitials: scientist.profileImageInitials
          } : null
        };
      }));
      
      res.json(enhancedMembers);
    } catch (error) {
      logError("Error fetching research activity members", "routes", error);
      res.status(500).json({ message: "Failed to fetch research activity members" });
    }
  });

  app.post('/api/research-activities/:id/members', async (req: Request, res: Response) => {
    try {
      const researchActivityId = parseInt(req.params.id);
      if (isNaN(researchActivityId)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const { scientistId, role } = req.body;
      
      const validateData = insertProjectMemberSchema.parse({
        researchActivityId,
        scientistId,
        role
      });
      
      // Check if scientist exists
      const scientist = await storage.getScientist(validateData.scientistId);
      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }
      
      // Principal Investigator is an investigator-only team role.
      if (!isInvestigatorRoleAssignmentAllowed(validateData.role, scientist)) {
        return res.status(400).json({ 
          message: "Only staff with an eligible Investigator designation can be assigned the role of Principal Investigator"
        });
      }
      
      // Check if member already exists
      const existingMembers = await storage.getProjectMembers(researchActivityId);
      const memberExists = existingMembers.some(m => m.scientistId === scientistId);
      if (memberExists) {
        return res.status(400).json({ message: "Scientist is already a member of this research activity" });
      }
      
      // Enforce role constraints: Only 1 Principal Investigator and 1 Lead Scientist per research activity
      const currentRoles = existingMembers.map(m => m.role);
      
      if (validateData.role === "Principal Investigator") {
        const hasPrincipalInvestigator = currentRoles.includes("Principal Investigator");
        if (hasPrincipalInvestigator) {
          return res.status(400).json({ 
            message: "Each research activity can only have one Principal Investigator" 
          });
        }
      }
      
      if (validateData.role === "Lead Scientist") {
        const hasLeadScientist = currentRoles.includes("Lead Scientist");
        if (hasLeadScientist) {
          return res.status(400).json({ 
            message: "Each research activity can only have one Lead Scientist" 
          });
        }
      }
            
      const member = await storage.addProjectMember(validateData);
      
      // Return enhanced member with scientist details
      const enhancedMember = {
        ...member,
        scientist: {
          id: scientist.id,
          name: [scientist.honorificTitle, scientist.firstName, scientist.lastName].filter(Boolean).join(" "),
          title: scientist.jobTitle,
          email: scientist.email,
          staffId: scientist.staffId,
          profileImageInitials: scientist.profileImageInitials
        }
      };
      
      res.status(201).json(enhancedMember);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      logError("Error adding research activity member", "routes", error);
      res.status(500).json({ message: "Failed to add research activity member" });
    }
  });

  app.delete('/api/research-activities/:id/members/:scientistId', async (req: Request, res: Response) => {
    try {
      const researchActivityId = parseInt(req.params.id);
      const scientistId = parseInt(req.params.scientistId);
      
      if (isNaN(researchActivityId) || isNaN(scientistId)) {
        return res.status(400).json({ message: "Invalid ID parameters" });
      }
      
      // Note: Principal Investigator role is now managed through team membership

      const success = await storage.removeProjectMember(researchActivityId, scientistId);
      
      if (!success) {
        return res.status(404).json({ message: "Research activity member not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      logError("Error removing research activity member", "routes", error);
      res.status(500).json({ message: "Failed to remove research activity member" });
    }
  });

  // Data Management Plans
}
