/**
 * IBC applications, board members, submissions and documents.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { scientistDisplayName } from "@shared/scientistName";
import { storage } from "../databaseStorage";
import { getInvestigatorAssignmentError } from "../investigatorAssignment";
import { log, logError } from "../logger";
import { insertIbcApplicationPpeSchema, insertIbcApplicationRoomSchema, insertIbcApplicationSchema, insertIbcBackboneSourceRoomSchema, insertIbcBoardMemberSchema, insertIbcDocumentSchema, insertIbcSubmissionSchema } from "@shared/schema";
import { and } from "drizzle-orm";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

export function registerIbcRoutes(app: Express): void {
  // IBC Applications
  app.get('/api/ibc-applications', async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
      
      // IBC applications are not directly linked to projects, so ignore projectId filter
      const applications = await storage.getIbcApplications();
      
      // Enhance applications with PI details (IBC applications are not directly
      // linked to projects) -- one lookup for the list.
      const piById = await storage.getScientistsByIds(applications.map((app) => app.principalInvestigatorId));
      const enhancedApplications = await Promise.all(applications.map(async (app) => {
        const pi = app.principalInvestigatorId != null ? piById.get(app.principalInvestigatorId) : undefined;

        return {
          ...app,
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
      
      res.json(enhancedApplications);
    } catch (error) {
      logError('Error fetching IBC applications', "routes", error);
      res.status(500).json({ message: "Failed to fetch IBC applications" });
    }
  });

  app.get('/api/ibc-applications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      const application = await storage.getIbcApplication(id);
      if (!application) {
        return res.status(404).json({ message: "IBC application not found" });
      }

      // Get related research activities (SDRs)
      const researchActivities = await storage.getResearchActivitiesForIbcApplication(id);
      const pi = await storage.getScientist(application.principalInvestigatorId);
      
      const enhancedApplication = {
        ...application,
        researchActivities: researchActivities.map(activity => ({
          id: activity.id,
          sdrNumber: activity.sdrNumber,
          title: activity.title,
          status: activity.status
        })),
        principalInvestigator: pi ? {
          id: pi.id,
          name: scientistDisplayName(pi),
          email: pi.email,
          profileImageInitials: pi.profileImageInitials,
          honorificTitle: pi.honorificTitle,
          firstName: pi.firstName,
          lastName: pi.lastName,
          jobTitle: pi.jobTitle
        } : null
      };

      res.json(enhancedApplication);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IBC application" });
    }
  });

  app.post('/api/ibc-applications', async (req: Request, res: Response) => {
    try {
      log("=== IBC Application Creation Debug ===", "routes");
      log("Full request body", "routes", { detail: JSON.stringify(req.body, null, 2) });
      
      const { researchActivityIds, isDraft, ...applicationData } = req.body;
      log("Extracted researchActivityIds", "routes", { detail: researchActivityIds });
      log("Is draft", "routes", { detail: isDraft });
      log("Application data after extraction", "routes", { detail: JSON.stringify(applicationData, null, 2) });
      
      log("Adding auto-generated fields...", "routes");
      // Add auto-generated fields before validation
      const dataWithAutoFields = {
        ...applicationData,
        ibcNumber: applicationData.ibcNumber || await storage.generateNextIbcNumber(),
        status: isDraft ? "Draft" : (applicationData.status || "Submitted"),
        workflowStatus: isDraft ? "draft" : (applicationData.workflowStatus || "submitted"),
        riskLevel: applicationData.riskLevel || "moderate"
      };
      log("Data with auto-generated fields", "routes", { detail: JSON.stringify(dataWithAutoFields, null, 2) });
      
      log("Validating with schema...", "routes");
      const validateData = insertIbcApplicationSchema.parse(dataWithAutoFields);
      log("Schema validation successful", "routes", { detail: JSON.stringify(validateData, null, 2) });
      
      log("Checking principal investigator eligibility with ID", "routes", { detail: validateData.principalInvestigatorId });
      const piEligibilityError = await getInvestigatorAssignmentError(
        validateData.principalInvestigatorId,
        "IBC Principal Investigator"
      );
      if (piEligibilityError) {
        return res
          .status(piEligibilityError.status)
          .json({ message: piEligibilityError.message });
      }
      
      // Validate research activities if provided
      if (researchActivityIds && Array.isArray(researchActivityIds)) {
        log("Validating research activities", "routes", { detail: researchActivityIds });
        for (const activityId of researchActivityIds) {
          const activity = await storage.getResearchActivity(activityId);
          if (!activity) {
            log(`Research activity with ID ${activityId} not found`, "routes");
            return res.status(404).json({ message: `Research activity with ID ${activityId} not found` });
          }
          log(`Research activity ${activityId} found`, "routes", { detail: activity.title });
        }
      }
      
      log("Creating IBC application...", "routes");
      const application = await storage.createIbcApplication(validateData, researchActivityIds || []);
      log("IBC application created successfully", "routes", { detail: application.id });
      await req.audit.logInsert("ibc_applications", application.id, application as Record<string, unknown>);
      res.status(201).json(application);
    } catch (error) {
      logError("Error creating IBC application", "routes", error);
      if (error instanceof ZodError) {
        log("Zod validation error", "routes", { detail: fromZodError(error).message });
        return res.status(400).json({ message: fromZodError(error).message });
      }
      log("Generic error", "routes", { detail: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ message: "Failed to create IBC application", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch('/api/ibc-applications/:id', async (req: Request, res: Response) => {
    try {
      log('PATCH /api/ibc-applications/:id called', "routes");
      log('Request params', "routes", { detail: req.params });
      log('Request body', "routes", { detail: req.body });
      
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      // Extract isDraft flag and remove it from validation data
      const { isDraft, ...bodyData } = req.body;
      log('isDraft', "routes", { detail: isDraft });
      log('bodyData', "routes", { detail: bodyData });
      
      const validateData = insertIbcApplicationSchema.partial().parse(bodyData);
      log('Validated data after schema parsing', "routes", { detail: validateData });
      
      // Handle status based on isDraft flag
      if (isDraft !== undefined) {
        if (isDraft) {
          validateData.status = 'draft';
        } else {
          validateData.status = 'submitted';
          // Set submission date when submitting
          if (!validateData.submissionDate) {
            validateData.submissionDate = new Date();
          }
        }
        log('Status set to', "routes", { detail: validateData.status });
        log('Submission date set to', "routes", { detail: validateData.submissionDate });
      }
      
      // Handle status changes for timeline tracking
      if (validateData.status) {
        const currentTime = new Date();
        
        // Set vetted date when moving to vetted status
        if (validateData.status === 'vetted' && !validateData.vettedDate) {
          validateData.vettedDate = currentTime;
        }
        
        // Set under review date when moving to under_review status
        if (validateData.status === 'under_review' && !validateData.underReviewDate) {
          validateData.underReviewDate = currentTime;
        }
        
        // Set approval date when moving to active status
        if (validateData.status === 'active' && !validateData.approvalDate) {
          validateData.approvalDate = currentTime;
        }
      }
      
      // (IBC applications are not linked to projects; a projectId in the body is
      // dropped by the schema, so there is nothing to check here.)

      // Validate investigator eligibility if provided.
      if (validateData.principalInvestigatorId) {
        const piEligibilityError = await getInvestigatorAssignmentError(
          validateData.principalInvestigatorId,
          "IBC Principal Investigator"
        );
        if (piEligibilityError) {
          return res
            .status(piEligibilityError.status)
            .json({ message: piEligibilityError.message });
        }
      }
      
      // Get the current application for status change tracking
      const currentApplication = await storage.getIbcApplication(id);
      if (!currentApplication) {
        return res.status(404).json({ message: "IBC application not found" });
      }

      log("Updating IBC application", "routes", { id, fields: validateData });
      const application = await storage.updateIbcApplication(id, validateData);
      log('storage.updateIbcApplication result', "routes", { detail: application });
      
      if (!application) {
        return res.status(404).json({ message: "IBC application not found" });
      }

      // Create office comment if reviewComments are provided
      if (req.body.reviewComments) {
        await storage.createIbcApplicationComment({
          applicationId: id,
          commentType: 'office_comment',
          authorType: 'office',
          authorName: 'IBC Office',
          comment: req.body.reviewComments,
          isInternal: false
        });
      }

      // Create status change comment if status changed
      if (validateData.status && validateData.status !== currentApplication.status) {
        const statusLabels: Record<string, string> = {
          'draft': 'Draft',
          'submitted': 'Submitted',
          'vetted': 'Vetted',
          'under_review': 'Under Review',
          'active': 'Active',
          'expired': 'Expired'
        };

        await storage.createIbcApplicationComment({
          applicationId: id,
          commentType: 'status_change',
          authorType: 'system',
          authorName: 'System',
          comment: `Status changed from ${statusLabels[currentApplication.status] || currentApplication.status} to ${statusLabels[validateData.status] || validateData.status}`,
          statusFrom: currentApplication.status,
          statusTo: validateData.status,
          isInternal: false
        });

        await req.audit.logStatusChange(
          "ibc_applications", id,
          currentApplication.status ?? null,
          validateData.status,
          undefined,
          req.body?.reason,
        );
      } else {
        await req.audit.logUpdate(
          "ibc_applications", id,
          currentApplication as Record<string, unknown>,
          application as Record<string, unknown>,
          req.body?.reason,
        );
      }

      res.json(application);
    } catch (error) {
      logError('Error in PATCH /api/ibc-applications/:id', "routes", error);
      if (error instanceof ZodError) {
        logError('Zod validation error details', "routes", fromZodError(error).message);
        return res.status(400).json({ message: fromZodError(error).message });
      }
      logError('Non-Zod error', "routes", error);
      res.status(500).json({ message: "Failed to update IBC application", error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete('/api/ibc-applications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      const existing = await storage.getIbcApplication(id);
      const success = await storage.deleteIbcApplication(id);
      
      if (!success) {
        return res.status(404).json({ message: "IBC application not found" });
      }
      
      if (existing) await req.audit.logDelete("ibc_applications", id, existing as Record<string, unknown>);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete IBC application" });
    }
  });

  // Get research activities for an IBC application
  app.get('/api/ibc-applications/:id/research-activities', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      const researchActivities = await storage.getResearchActivitiesForIbcApplication(id);
      res.json(researchActivities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch research activities for IBC application" });
    }
  });

  // Get personnel data for an IBC application
  app.get('/api/ibc-applications/:id/personnel', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      const application = await storage.getIbcApplication(id);
      if (!application) {
        return res.status(404).json({ message: "IBC application not found" });
      }

      // Get personnel from the application's protocolTeamMembers field if it exists
      if (application.protocolTeamMembers && Array.isArray(application.protocolTeamMembers)) {
        // Enhance personnel data with scientist details
        const personnelById = await storage.getScientistsByIds(
          application.protocolTeamMembers.map((person: any) => person.scientistId),
        );
        const enhancedPersonnel = await Promise.all(
          application.protocolTeamMembers.map(async (person: any) => {
            if (person.scientistId) {
              const scientist = personnelById.get(person.scientistId);
              return {
                ...person,
                scientist: scientist ? {
                  id: scientist.id,
                  honorificTitle: scientist.honorificTitle,
                  firstName: scientist.firstName,
                  lastName: scientist.lastName,
                  name: [scientist.honorificTitle, scientist.firstName, scientist.lastName].filter(Boolean).join(" "),
                  email: scientist.email,
                  department: scientist.department,
                  jobTitle: scientist.jobTitle,
                  profileImageInitials: scientist.profileImageInitials
                } : null
              };
            }
            return person;
          })
        );
        
        res.json(enhancedPersonnel);
      } else {
        res.json([]);
      }
    } catch (error) {
      logError("Error fetching IBC application personnel", "routes", error);
      res.status(500).json({ message: "Failed to fetch personnel for IBC application" });
    }
  });

  // Add research activity to IBC application
  app.post('/api/ibc-applications/:id/research-activities', async (req: Request, res: Response) => {
    try {
      const ibcApplicationId = parseInt(req.params.id);
      const { researchActivityId } = req.body;

      if (isNaN(ibcApplicationId)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      if (!researchActivityId || isNaN(researchActivityId)) {
        return res.status(400).json({ message: "Valid research activity ID is required" });
      }

      // Check if IBC application exists
      const ibcApplication = await storage.getIbcApplication(ibcApplicationId);
      if (!ibcApplication) {
        return res.status(404).json({ message: "IBC application not found" });
      }

      // Check if research activity exists
      const researchActivity = await storage.getResearchActivity(researchActivityId);
      if (!researchActivity) {
        return res.status(404).json({ message: "Research activity not found" });
      }

      const linkage = await storage.addResearchActivityToIbcApplication(ibcApplicationId, researchActivityId);
      res.status(201).json(linkage);
    } catch (error) {
      res.status(500).json({ message: "Failed to add research activity to IBC application" });
    }
  });

  // Remove research activity from IBC application
  app.delete('/api/ibc-applications/:id/research-activities/:activityId', async (req: Request, res: Response) => {
    try {
      const ibcApplicationId = parseInt(req.params.id);
      const researchActivityId = parseInt(req.params.activityId);

      if (isNaN(ibcApplicationId)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      if (isNaN(researchActivityId)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const success = await storage.removeResearchActivityFromIbcApplication(ibcApplicationId, researchActivityId);
      
      if (!success) {
        return res.status(404).json({ message: "Research activity not linked to this IBC application" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to remove research activity from IBC application" });
    }
  });

  // Submit reviewer feedback for IBC application
  app.post('/api/ibc-applications/:id/reviewer-feedback', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      const { comments, recommendation } = req.body;
      
      if (!comments || !recommendation) {
        return res.status(400).json({ message: "Comments and recommendation are required" });
      }

      // Get the current application
      const application = await storage.getIbcApplication(id);
      if (!application) {
        return res.status(404).json({ message: "IBC application not found" });
      }

      // Create the reviewer feedback comment in the comments table
      await storage.createIbcApplicationComment({
        applicationId: id,
        commentType: 'reviewer_feedback',
        authorType: 'reviewer',
        authorName: 'IBC Reviewer',
        comment: comments,
        recommendation: recommendation,
        isInternal: false
      });

      // Update status based on recommendation
      let newStatus = application.status;
      let statusChangeComment = '';
      
      if (recommendation === 'approve') {
        newStatus = 'active';
        statusChangeComment = 'Application approved by reviewer';
      } else if (recommendation === 'reject') {
        newStatus = 'expired';
        statusChangeComment = 'Application rejected by reviewer';
      } else if (recommendation === 'minor_revisions' || recommendation === 'major_revisions') {
        newStatus = 'vetted'; // Return to office for revision handling
        statusChangeComment = `Application returned to office for ${recommendation.replace('_', ' ')}`;
      } else {
        newStatus = 'under_review'; // Stay under review for other cases
        statusChangeComment = 'Application remains under review';
      }

      // Create status change comment if status changed
      if (newStatus !== application.status) {
        await storage.createIbcApplicationComment({
          applicationId: id,
          commentType: 'status_change',
          authorType: 'system',
          authorName: 'System',
          comment: statusChangeComment,
          statusFrom: application.status,
          statusTo: newStatus,
          isInternal: false
        });
      }

      const updatedApplication = await storage.updateIbcApplication(id, {
        status: newStatus,
        workflowStatus: newStatus, // Keep workflow status in sync with status
        underReviewDate: newStatus === 'under_review' ? new Date() : application.underReviewDate,
        approvalDate: newStatus === 'active' ? new Date() : application.approvalDate,
        vettedDate: newStatus === 'vetted' ? new Date() : application.vettedDate,
      });

      res.json({ 
        message: "Review submitted successfully",
        application: updatedApplication 
      });
    } catch (error) {
      logError("Error submitting reviewer feedback", "routes", error);
      res.status(500).json({ message: "Failed to submit reviewer feedback" });
    }
  });

  // Get comments for IBC application
  app.get('/api/ibc-applications/:id/comments', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      const comments = await storage.getIbcApplicationComments(id);
      res.json(comments);
    } catch (error) {
      logError("Error fetching IBC application comments", "routes", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  // Submit PI comment for IBC application
  app.post('/api/ibc-applications/:id/pi-comment', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      const { comment } = req.body;
      
      if (!comment || !comment.trim()) {
        return res.status(400).json({ message: "Comment is required" });
      }

      // Get the current application to get PI info
      const application = await storage.getIbcApplication(id);
      if (!application) {
        return res.status(404).json({ message: "IBC application not found" });
      }

      // Get PI details for the comment
      const pi = await storage.getScientist(application.principalInvestigatorId);
      const piFullName = pi
        ? [pi.honorificTitle, pi.firstName, pi.lastName].filter(Boolean).join(' ').trim()
        : '';
      const piName = piFullName || 'Principal Investigator';

      // Create the PI comment in the comments table
      await storage.createIbcApplicationComment({
        applicationId: id,
        commentType: 'pi_response',
        authorType: 'pi',
        authorName: piName,
        authorId: application.principalInvestigatorId,
        comment: comment.trim(),
        isInternal: false
      });

      res.json({ 
        message: "Comment submitted successfully"
      });
    } catch (error) {
      logError("Error submitting PI comment", "routes", error);
      res.status(500).json({ message: "Failed to submit comment" });
    }
  });

  // IBC Application Facilities Routes
  
  // Get rooms for IBC application
  app.get('/api/ibc-applications/:id/rooms', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const rooms = await storage.getIbcApplicationRooms(id);
      res.json(rooms);
    } catch (error) {
      logError('Error getting IBC application rooms', "routes", error);
      res.status(500).json({ message: "Failed to fetch IBC application rooms" });
    }
  });

  // Add room to IBC application
  app.post('/api/ibc-applications/:id/rooms', async (req: Request, res: Response) => {
    try {
      const applicationId = parseInt(req.params.id);
      const validatedData = insertIbcApplicationRoomSchema.parse({
        ...req.body,
        applicationId
      });
      const newRoom = await storage.addRoomToIbcApplication(validatedData);
      res.status(201).json(newRoom);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: fromZodError(error).toString() });
      } else {
        logError('Error adding room to IBC application', "routes", error);
        res.status(500).json({ message: "Failed to add room to IBC application" });
      }
    }
  });

  // Remove room from IBC application
  app.delete('/api/ibc-applications/:id/rooms/:roomId', async (req: Request, res: Response) => {
    try {
      const applicationId = parseInt(req.params.id);
      const roomId = parseInt(req.params.roomId);
      const success = await storage.removeRoomFromIbcApplication(applicationId, roomId);
      if (success) {
        res.json({ message: "Room removed from IBC application successfully" });
      } else {
        res.status(404).json({ message: "Room not found in IBC application" });
      }
    } catch (error) {
      logError('Error removing room from IBC application', "routes", error);
      res.status(500).json({ message: "Failed to remove room from IBC application" });
    }
  });

  // Get backbone source room assignments for IBC application
  app.get('/api/ibc-applications/:id/backbone-source-rooms', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const assignments = await storage.getIbcBackboneSourceRooms(id);
      res.json(assignments);
    } catch (error) {
      logError('Error getting IBC backbone source rooms', "routes", error);
      res.status(500).json({ message: "Failed to fetch IBC backbone source rooms" });
    }
  });

  // Add backbone source room assignment
  app.post('/api/ibc-applications/:id/backbone-source-rooms', async (req: Request, res: Response) => {
    try {
      const applicationId = parseInt(req.params.id);
      const validatedData = insertIbcBackboneSourceRoomSchema.parse({
        ...req.body,
        applicationId
      });
      const newAssignment = await storage.addBackboneSourceRoom(validatedData);
      res.status(201).json(newAssignment);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: fromZodError(error).toString() });
      } else {
        logError('Error adding backbone source room', "routes", error);
        res.status(500).json({ message: "Failed to add backbone source room assignment" });
      }
    }
  });

  // Remove backbone source room assignment
  app.delete('/api/ibc-applications/:id/backbone-source-rooms/:backboneSource/:roomId', async (req: Request, res: Response) => {
    try {
      const applicationId = parseInt(req.params.id);
      const backboneSource = req.params.backboneSource;
      const roomId = parseInt(req.params.roomId);
      const success = await storage.removeBackboneSourceRoom(applicationId, backboneSource, roomId);
      if (success) {
        res.json({ message: "Backbone source room assignment removed successfully" });
      } else {
        res.status(404).json({ message: "Backbone source room assignment not found" });
      }
    } catch (error) {
      logError('Error removing backbone source room assignment', "routes", error);
      res.status(500).json({ message: "Failed to remove backbone source room assignment" });
    }
  });

  // Get PPE for IBC application
  app.get('/api/ibc-applications/:id/ppe', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const roomId = req.query.roomId ? parseInt(req.query.roomId as string) : undefined;
      
      let ppe;
      if (roomId) {
        ppe = await storage.getIbcApplicationPpeForRoom(id, roomId);
      } else {
        ppe = await storage.getIbcApplicationPpe(id);
      }
      res.json(ppe);
    } catch (error) {
      logError('Error getting IBC application PPE', "routes", error);
      res.status(500).json({ message: "Failed to fetch IBC application PPE" });
    }
  });

  // Add PPE to IBC application
  app.post('/api/ibc-applications/:id/ppe', async (req: Request, res: Response) => {
    try {
      const applicationId = parseInt(req.params.id);
      const validatedData = insertIbcApplicationPpeSchema.parse({
        ...req.body,
        applicationId
      });
      const newPpe = await storage.addPpeToIbcApplication(validatedData);
      res.status(201).json(newPpe);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: fromZodError(error).toString() });
      } else {
        logError('Error adding PPE to IBC application', "routes", error);
        res.status(500).json({ message: "Failed to add PPE to IBC application" });
      }
    }
  });

  // Remove PPE from IBC application
  app.delete('/api/ibc-applications/:id/ppe/:roomId/:ppeItem', async (req: Request, res: Response) => {
    try {
      const applicationId = parseInt(req.params.id);
      const roomId = parseInt(req.params.roomId);
      const ppeItem = decodeURIComponent(req.params.ppeItem);
      const success = await storage.removePpeFromIbcApplication(applicationId, roomId, ppeItem);
      if (success) {
        res.json({ message: "PPE removed from IBC application successfully" });
      } else {
        res.status(404).json({ message: "PPE not found in IBC application" });
      }
    } catch (error) {
      logError('Error removing PPE from IBC application', "routes", error);
      res.status(500).json({ message: "Failed to remove PPE from IBC application" });
    }
  });

  // IBC Board Members
  app.get('/api/ibc-board-members', async (req: Request, res: Response) => {
    try {
      const boardMembers = await storage.getIbcBoardMembers();
      res.json(boardMembers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IBC board members" });
    }
  });

  app.get('/api/ibc-board-members/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC board member ID" });
      }

      const boardMember = await storage.getIbcBoardMember(id);
      if (!boardMember) {
        return res.status(404).json({ message: "IBC board member not found" });
      }

      res.json(boardMember);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IBC board member" });
    }
  });

  app.post('/api/ibc-board-members', async (req: Request, res: Response) => {
    try {
      // Create a simplified validation that accepts string dates
      const validateData = {
        scientistId: req.body.scientistId,
        role: req.body.role,
        appointmentDate: req.body.appointmentDate,
        termEndDate: req.body.termEndDate,
        expertise: req.body.expertise || [],
        isActive: req.body.isActive !== undefined ? req.body.isActive : true,
        notes: req.body.notes
      };
      
      // Basic validation
      if (!validateData.scientistId || !validateData.role || !validateData.termEndDate) {
        return res.status(400).json({ message: "Missing required fields: scientistId, role, termEndDate" });
      }
      
      // Check if scientist exists
      const scientist = await storage.getScientist(validateData.scientistId);
      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }
      
      const boardMember = await storage.createIbcBoardMember(validateData);
      res.status(201).json(boardMember);
    } catch (error) {
      logError("Board member creation error", "routes", error);
      res.status(500).json({ message: "Failed to create IBC board member" });
    }
  });

  app.patch('/api/ibc-board-members/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC board member ID" });
      }

      const validateData = insertIbcBoardMemberSchema.partial().parse(req.body);
      
      // Check if scientist exists if scientistId is provided
      if (validateData.scientistId) {
        const scientist = await storage.getScientist(validateData.scientistId);
        if (!scientist) {
          return res.status(404).json({ message: "Scientist not found" });
        }
      }
      
      const boardMember = await storage.updateIbcBoardMember(id, validateData);
      
      if (!boardMember) {
        return res.status(404).json({ message: "IBC board member not found" });
      }
      
      res.json(boardMember);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update IBC board member" });
    }
  });

  app.delete('/api/ibc-board-members/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC board member ID" });
      }

      const success = await storage.deleteIbcBoardMember(id);
      
      if (!success) {
        return res.status(404).json({ message: "IBC board member not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete IBC board member" });
    }
  });

  // IBC Submissions
  app.get('/api/ibc-submissions', async (req: Request, res: Response) => {
    try {
      const applicationId = req.query.applicationId ? parseInt(req.query.applicationId as string) : undefined;
      
      let submissions;
      if (applicationId && !isNaN(applicationId)) {
        submissions = await storage.getIbcSubmissionsForApplication(applicationId);
      } else {
        submissions = await storage.getIbcSubmissions();
      }
      
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IBC submissions" });
    }
  });

  app.get('/api/ibc-submissions/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC submission ID" });
      }

      const submission = await storage.getIbcSubmission(id);
      if (!submission) {
        return res.status(404).json({ message: "IBC submission not found" });
      }

      res.json(submission);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IBC submission" });
    }
  });

  app.post('/api/ibc-submissions', async (req: Request, res: Response) => {
    try {
      const validateData = insertIbcSubmissionSchema.parse(req.body);
      
      // Check if application exists
      const application = await storage.getIbcApplication(validateData.applicationId);
      if (!application) {
        return res.status(404).json({ message: "IBC application not found" });
      }
      
      // Check if submitted by scientist exists
      const scientist = await storage.getScientist(validateData.submittedBy);
      if (!scientist) {
        return res.status(404).json({ message: "Submitting scientist not found" });
      }
      
      const submission = await storage.createIbcSubmission(validateData);
      res.status(201).json(submission);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to create IBC submission" });
    }
  });

  app.patch('/api/ibc-submissions/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC submission ID" });
      }

      const validateData = insertIbcSubmissionSchema.partial().parse(req.body);
      const submission = await storage.updateIbcSubmission(id, validateData);
      
      if (!submission) {
        return res.status(404).json({ message: "IBC submission not found" });
      }
      
      res.json(submission);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update IBC submission" });
    }
  });

  app.delete('/api/ibc-submissions/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC submission ID" });
      }

      const success = await storage.deleteIbcSubmission(id);
      
      if (!success) {
        return res.status(404).json({ message: "IBC submission not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete IBC submission" });
    }
  });

  // IBC Documents
  app.get('/api/ibc-documents', async (req: Request, res: Response) => {
    try {
      const applicationId = req.query.applicationId ? parseInt(req.query.applicationId as string) : undefined;
      
      let documents;
      if (applicationId && !isNaN(applicationId)) {
        documents = await storage.getIbcDocumentsForApplication(applicationId);
      } else {
        documents = await storage.getIbcDocuments();
      }
      
      res.json(documents);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IBC documents" });
    }
  });

  app.get('/api/ibc-documents/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC document ID" });
      }

      const document = await storage.getIbcDocument(id);
      if (!document) {
        return res.status(404).json({ message: "IBC document not found" });
      }

      res.json(document);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IBC document" });
    }
  });

  app.post('/api/ibc-documents', async (req: Request, res: Response) => {
    try {
      const validateData = insertIbcDocumentSchema.parse(req.body);
      
      // Check if application exists (if provided)
      if (validateData.applicationId) {
        const application = await storage.getIbcApplication(validateData.applicationId);
        if (!application) {
          return res.status(404).json({ message: "IBC application not found" });
        }
      }
      
      // Check if uploaded by scientist exists
      const scientist = await storage.getScientist(validateData.uploadedBy);
      if (!scientist) {
        return res.status(404).json({ message: "Uploading scientist not found" });
      }
      
      const document = await storage.createIbcDocument(validateData);
      res.status(201).json(document);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to create IBC document" });
    }
  });

  app.patch('/api/ibc-documents/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC document ID" });
      }

      const validateData = insertIbcDocumentSchema.partial().parse(req.body);
      const document = await storage.updateIbcDocument(id, validateData);
      
      if (!document) {
        return res.status(404).json({ message: "IBC document not found" });
      }
      
      res.json(document);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update IBC document" });
    }
  });

  app.delete('/api/ibc-documents/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC document ID" });
      }

      const success = await storage.deleteIbcDocument(id);
      
      if (!success) {
        return res.status(404).json({ message: "IBC document not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete IBC document" });
    }
  });
}
