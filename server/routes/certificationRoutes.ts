/**
 * Certification modules, certifications and certification configuration.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { storage } from "../databaseStorage";
import { logError } from "../logger";
import { insertCertificationConfigurationSchema, insertCertificationModuleSchema, insertCertificationSchema } from "@shared/schema";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

export function registerCertificationRoutes(app: Express): void {
  // Certification routes
  app.get('/api/certification-modules', async (req: Request, res: Response) => {
    try {
      const modules = await storage.getCertificationModules();
      res.json(modules);
    } catch (error) {
      logError('Error fetching certification modules', "routes", error);
      res.status(500).json({ message: "Failed to fetch certification modules" });
    }
  });

  app.post('/api/certification-modules', async (req: Request, res: Response) => {
    try {
      const validatedData = insertCertificationModuleSchema.parse(req.body);
      const module = await storage.createCertificationModule(validatedData);
      res.status(201).json(module);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        logError('Error creating certification module', "routes", error);
        res.status(500).json({ message: "Failed to create certification module" });
      }
    }
  });

  app.put('/api/certification-modules/:id', async (req: Request, res: Response) => {
    try {
      const moduleId = parseInt(req.params.id);
      if (isNaN(moduleId)) {
        return res.status(400).json({ message: "Invalid module ID" });
      }

      const validatedData = insertCertificationModuleSchema.partial().parse(req.body);
      const module = await storage.updateCertificationModule(moduleId, validatedData);
      res.json(module);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        logError('Error updating certification module', "routes", error);
        res.status(500).json({ message: "Failed to update certification module" });
      }
    }
  });

  app.delete('/api/certification-modules/:id', async (req: Request, res: Response) => {
    try {
      const moduleId = parseInt(req.params.id);
      if (isNaN(moduleId)) {
        return res.status(400).json({ message: "Invalid module ID" });
      }

      const success = await storage.deleteCertificationModule(moduleId);
      if (!success) {
        return res.status(404).json({ message: "Certification module not found" });
      }

      res.status(204).send();
    } catch (error) {
      logError('Error deleting certification module', "routes", error);
      res.status(500).json({ message: "Failed to delete certification module" });
    }
  });

  // Certification routes
  app.get('/api/certifications', async (req: Request, res: Response) => {
    try {
      const certifications = await storage.getCertifications();
      res.json(certifications);
    } catch (error) {
      logError('Error fetching certifications', "routes", error);
      res.status(500).json({ message: "Failed to fetch certifications" });
    }
  });

  app.get('/api/certifications/matrix', async (req: Request, res: Response) => {
    try {
      const matrix = await storage.getCertificationMatrix();
      res.json(matrix);
    } catch (error) {
      logError('Error fetching certification matrix', "routes", error);
      res.status(500).json({ message: "Failed to fetch certification matrix" });
    }
  });

  app.get('/api/certifications/scientist/:scientistId', async (req: Request, res: Response) => {
    try {
      const scientistId = parseInt(req.params.scientistId);
      if (isNaN(scientistId)) {
        return res.status(400).json({ message: "Invalid scientist ID" });
      }

      const certifications = await storage.getCertificationsByScientist(scientistId);
      res.json(certifications);
    } catch (error) {
      logError('Error fetching scientist certifications', "routes", error);
      res.status(500).json({ message: "Failed to fetch scientist certifications" });
    }
  });

  app.post('/api/certifications', async (req: Request, res: Response) => {
    try {
      const validatedData = insertCertificationSchema.parse(req.body);
      const certification = await storage.createCertification(validatedData);
      res.status(201).json(certification);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        logError('Error creating certification', "routes", error);
        res.status(500).json({ message: "Failed to create certification" });
      }
    }
  });

  app.put('/api/certifications/:id', async (req: Request, res: Response) => {
    try {
      const certificationId = parseInt(req.params.id);
      if (isNaN(certificationId)) {
        return res.status(400).json({ message: "Invalid certification ID" });
      }

      const validatedData = insertCertificationSchema.partial().parse(req.body);
      const certification = await storage.updateCertification(certificationId, validatedData);
      res.json(certification);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        logError('Error updating certification', "routes", error);
        res.status(500).json({ message: "Failed to update certification" });
      }
    }
  });

  app.delete('/api/certifications/:id', async (req: Request, res: Response) => {
    try {
      const certificationId = parseInt(req.params.id);
      if (isNaN(certificationId)) {
        return res.status(400).json({ message: "Invalid certification ID" });
      }

      const success = await storage.deleteCertification(certificationId);
      if (!success) {
        return res.status(404).json({ message: "Certification not found" });
      }

      res.status(204).send();
    } catch (error) {
      logError('Error deleting certification', "routes", error);
      res.status(500).json({ message: "Failed to delete certification" });
    }
  });

  // Certification configuration routes
  app.get('/api/certification-config', async (req: Request, res: Response) => {
    try {
      const config = await storage.getCertificationConfiguration();
      res.json(config || {});
    } catch (error) {
      logError('Error fetching certification configuration', "routes", error);
      res.status(500).json({ message: "Failed to fetch certification configuration" });
    }
  });

  app.post('/api/certification-config', async (req: Request, res: Response) => {
    try {
      const validatedData = insertCertificationConfigurationSchema.parse(req.body);
      const config = await storage.createCertificationConfiguration(validatedData);
      res.status(201).json(config);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        logError('Error creating certification configuration', "routes", error);
        res.status(500).json({ message: "Failed to create certification configuration" });
      }
    }
  });

  app.put('/api/certification-config/:id', async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.id);
      if (isNaN(configId)) {
        return res.status(400).json({ message: "Invalid config ID" });
      }

      const validatedData = insertCertificationConfigurationSchema.partial().parse(req.body);
      const config = await storage.updateCertificationConfiguration(configId, validatedData);
      res.json(config);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        logError('Error updating certification configuration', "routes", error);
        res.status(500).json({ message: "Failed to update certification configuration" });
      }
    }
  });
}
