/**
 * Research contracts and their documents, plus the per-SDR contract list.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { storage } from "../databaseStorage";
import { logError } from "../logger";
import { insertResearchContractDocumentSchema, insertResearchContractExtensionSchema, insertResearchContractSchema, insertResearchContractScopeItemSchema } from "@shared/schema";
import { and } from "drizzle-orm";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";

export function registerResearchContractRoutes(app: Express): void {
  // Research Contracts
  app.get('/api/research-contracts', async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
      
      let contracts;
      
      // Return all contracts, optionally filtered by project
      if (projectId && !isNaN(projectId)) {
        contracts = await storage.getResearchContractsForProject(projectId);
      } else {
        contracts = await storage.getResearchContracts();
      }
      
      // Enhance contracts with project and PI details
      const enhancedContracts = await Promise.all(contracts.map(async (contract) => {
        const researchActivity = contract.researchActivityId ? 
          await storage.getResearchActivity(contract.researchActivityId) : null;
        const project = researchActivity?.projectId ? 
          await storage.getProject(researchActivity.projectId) : null;
        const pi = contract.leadPIId ? 
          await storage.getScientist(contract.leadPIId) : null;
        
        return {
          ...contract,
          researchActivity: researchActivity ? {
            id: researchActivity.id,
            sdrNumber: researchActivity.sdrNumber,
            title: researchActivity.title
          } : null,
          project: project ? {
            id: project.id,
            projectId: project.projectId,
            name: project.name
          } : null,
          leadPI: pi ? {
            id: pi.id,
            name: `${pi.honorificTitle} ${pi.firstName} ${pi.lastName}`,
            profileImageInitials: pi.profileImageInitials
          } : null
        };
      }));
      
      res.json(enhancedContracts);
    } catch (error) {
      logError('Error fetching research contracts', "routes", error);
      res.status(500).json({ message: "Failed to fetch research contracts" });
    }
  });

  app.get('/api/research-contracts/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research contract ID" });
      }

      const contract = await storage.getResearchContract(id);
      if (!contract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      // Get related details
      const researchActivity = contract.researchActivityId ? 
        await storage.getResearchActivity(contract.researchActivityId) : null;
      const project = researchActivity?.projectId ? 
        await storage.getProject(researchActivity.projectId) : null;
      const pi = contract.leadPIId ? 
        await storage.getScientist(contract.leadPIId) : null;
      
      // Get scope items, extensions, and documents
      const scopeItems = await storage.getResearchContractScopeItems(id);
      const extensions = await storage.getResearchContractExtensions(id);
      const documents = await storage.getResearchContractDocuments(id);
      
      const enhancedContract = {
        ...contract,
        researchActivity: researchActivity ? {
          id: researchActivity.id,
          sdrNumber: researchActivity.sdrNumber,
          title: researchActivity.title,
          status: researchActivity.status
        } : null,
        project: project ? {
          id: project.id,
          projectId: project.projectId,
          name: project.name
        } : null,
        leadPI: pi ? {
          id: pi.id,
          name: `${pi.honorificTitle} ${pi.firstName} ${pi.lastName}`,
          email: pi.email,
          profileImageInitials: pi.profileImageInitials
        } : null,
        scopeItems: scopeItems,
        extensions: extensions,
        documents: documents
      };

      res.json(enhancedContract);
    } catch (error) {
      logError('Error fetching research contract', "routes", error);
      res.status(500).json({ message: "Failed to fetch research contract" });
    }
  });

  app.post('/api/research-contracts', async (req: Request, res: Response) => {
    try {
      // Make contractNumber optional for validation since it's auto-generated
      const validateData = insertResearchContractSchema.omit({ contractNumber: true }).parse(req.body);
      
      // Generate unique contract number
      const contractNumber = `CR-${Date.now()}`;
      
      // Check if research activity exists
      if (validateData.researchActivityId) {
        const researchActivity = await storage.getResearchActivity(validateData.researchActivityId);
        if (!researchActivity) {
          return res.status(404).json({ message: "Research activity not found" });
        }
      }
      
      // Check if lead PI exists if provided
      if (validateData.leadPIId) {
        const pi = await storage.getScientist(validateData.leadPIId);
        if (!pi) {
          return res.status(404).json({ message: "Lead PI not found" });
        }
      }
      
      const contract = await storage.createResearchContract({
        ...validateData,
        contractNumber,
      });
      await req.audit.logInsert("research_contracts", contract.id, contract as Record<string, unknown>);
      res.status(201).json(contract);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      logError('Error creating research contract', "routes", error);
      res.status(500).json({ message: "Failed to create research contract" });
    }
  });

  app.patch('/api/research-contracts/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research contract ID" });
      }

      const existingContract = await storage.getResearchContract(id);
      if (!existingContract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      const validateData = insertResearchContractSchema.partial().parse(req.body);
      
      // Check if research activity exists if provided
      if (validateData.researchActivityId) {
        const researchActivity = await storage.getResearchActivity(validateData.researchActivityId);
        if (!researchActivity) {
          return res.status(404).json({ message: "Research activity not found" });
        }
      }
      
      // Check if lead PI exists if provided
      if (validateData.leadPIId) {
        const pi = await storage.getScientist(validateData.leadPIId);
        if (!pi) {
          return res.status(404).json({ message: "Lead PI not found" });
        }
      }
      
      const contract = await storage.updateResearchContract(id, validateData);

      if (!contract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      await req.audit.logUpdate(
        "research_contracts", id,
        existingContract as Record<string, unknown>,
        contract as Record<string, unknown>,
        req.body?.reason,
      );
      res.json(contract);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      logError('Error updating research contract', "routes", error);
      res.status(500).json({ message: "Failed to update research contract" });
    }
  });

  app.delete('/api/research-contracts/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research contract ID" });
      }

      // Check if contract exists
      const existingContract = await storage.getResearchContract(id);
      if (!existingContract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      // Only allow deletion if contract is in draft or submitted status
      if (!['draft', 'submitted'].includes(existingContract.status)) {
        return res.status(400).json({ message: "Cannot delete contracts that are active, completed, or terminated" });
      }

      const success = await storage.deleteResearchContract(id);

      if (!success) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      await req.audit.logDelete("research_contracts", id, existingContract as Record<string, unknown>);
      res.status(204).send();
    } catch (error) {
      logError('Error deleting research contract', "routes", error);
      res.status(500).json({ message: "Failed to delete research contract" });
    }
  });

  // Research Contract Scope Items API
  app.get('/api/research-contracts/:contractId/scope-items', async (req: Request, res: Response) => {
    try {
      const contractId = parseInt(req.params.contractId);
      if (isNaN(contractId)) {
        return res.status(400).json({ message: "Invalid contract ID" });
      }

      const contract = await storage.getResearchContract(contractId);
      if (!contract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      const scopeItems = await storage.getResearchContractScopeItems(contractId);
      res.json(scopeItems);
    } catch (error) {
      logError('Error fetching contract scope items', "routes", error);
      res.status(500).json({ message: "Failed to fetch scope items" });
    }
  });

  app.post('/api/research-contracts/:contractId/scope-items', async (req: Request, res: Response) => {
    try {
      const contractId = parseInt(req.params.contractId);
      if (isNaN(contractId)) {
        return res.status(400).json({ message: "Invalid contract ID" });
      }

      const contract = await storage.getResearchContract(contractId);
      if (!contract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      const validateData = insertResearchContractScopeItemSchema.parse({
        ...req.body,
        contractId: contractId
      });

      const scopeItem = await storage.createResearchContractScopeItem(validateData);
      res.status(201).json(scopeItem);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      logError('Error creating scope item', "routes", error);
      res.status(500).json({ message: "Failed to create scope item" });
    }
  });

  app.patch('/api/research-contracts/scope-items/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scope item ID" });
      }

      const existingScopeItem = await storage.getResearchContractScopeItem(id);
      if (!existingScopeItem) {
        return res.status(404).json({ message: "Scope item not found" });
      }

      const validateData = insertResearchContractScopeItemSchema.partial().parse(req.body);
      const scopeItem = await storage.updateResearchContractScopeItem(id, validateData);
      
      if (!scopeItem) {
        return res.status(404).json({ message: "Scope item not found" });
      }
      
      res.json(scopeItem);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      logError('Error updating scope item', "routes", error);
      res.status(500).json({ message: "Failed to update scope item" });
    }
  });

  app.delete('/api/research-contracts/scope-items/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scope item ID" });
      }

      const existingScopeItem = await storage.getResearchContractScopeItem(id);
      if (!existingScopeItem) {
        return res.status(404).json({ message: "Scope item not found" });
      }

      const success = await storage.deleteResearchContractScopeItem(id);
      
      if (!success) {
        return res.status(404).json({ message: "Scope item not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      logError('Error deleting scope item', "routes", error);
      res.status(500).json({ message: "Failed to delete scope item" });
    }
  });

  // Research Contract Extensions API
  app.get('/api/research-contracts/:contractId/extensions', async (req: Request, res: Response) => {
    try {
      const contractId = parseInt(req.params.contractId);
      if (isNaN(contractId)) {
        return res.status(400).json({ message: "Invalid contract ID" });
      }

      const contract = await storage.getResearchContract(contractId);
      if (!contract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      const extensions = await storage.getResearchContractExtensions(contractId);
      res.json(extensions);
    } catch (error) {
      logError('Error fetching contract extensions', "routes", error);
      res.status(500).json({ message: "Failed to fetch extensions" });
    }
  });

  app.post('/api/research-contracts/:contractId/extensions', async (req: Request, res: Response) => {
    try {
      const contractId = parseInt(req.params.contractId);
      if (isNaN(contractId)) {
        return res.status(400).json({ message: "Invalid contract ID" });
      }

      // Check if contract exists
      const contract = await storage.getResearchContract(contractId);
      if (!contract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      // Only allow extensions for active contracts
      if (contract.status !== 'active') {
        return res.status(400).json({ message: "Extensions can only be created for active contracts" });
      }

      // Get existing extensions to determine sequence number
      const existingExtensions = await storage.getResearchContractExtensions(contractId);
      const nextSequenceNumber = existingExtensions.length + 1;

      const validateData = insertResearchContractExtensionSchema.parse({
        ...req.body,
        contractId: contractId,
        sequenceNumber: nextSequenceNumber
      });

      const extension = await storage.createResearchContractExtension(validateData);
      res.status(201).json(extension);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      logError('Error creating extension', "routes", error);
      res.status(500).json({ message: "Failed to create extension" });
    }
  });

  app.patch('/api/research-contracts/extensions/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid extension ID" });
      }

      // Check if extension exists
      const existingExtension = await storage.getResearchContractExtension(id);
      if (!existingExtension) {
        return res.status(404).json({ message: "Extension not found" });
      }

      const validateData = insertResearchContractExtensionSchema.partial().parse(req.body);
      const extension = await storage.updateResearchContractExtension(id, validateData);
      
      if (!extension) {
        return res.status(404).json({ message: "Extension not found" });
      }
      
      res.json(extension);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      logError('Error updating extension', "routes", error);
      res.status(500).json({ message: "Failed to update extension" });
    }
  });

  app.delete('/api/research-contracts/extensions/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid extension ID" });
      }

      // Check if extension exists
      const existingExtension = await storage.getResearchContractExtension(id);
      if (!existingExtension) {
        return res.status(404).json({ message: "Extension not found" });
      }

      // Only allow deletion if extension hasn't been approved yet
      if (existingExtension.approvedAt) {
        return res.status(400).json({ message: "Cannot delete approved extensions" });
      }

      const success = await storage.deleteResearchContractExtension(id);
      
      if (!success) {
        return res.status(404).json({ message: "Extension not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      logError('Error deleting extension', "routes", error);
      res.status(500).json({ message: "Failed to delete extension" });
    }
  });

  // Research Contract Documents API
  app.get('/api/research-contracts/:contractId/documents', async (req: Request, res: Response) => {
    try {
      const contractId = parseInt(req.params.contractId);
      if (isNaN(contractId)) {
        return res.status(400).json({ message: "Invalid contract ID" });
      }

      const contract = await storage.getResearchContract(contractId);
      if (!contract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      const documents = await storage.getResearchContractDocuments(contractId);
      res.json(documents);
    } catch (error) {
      logError('Error fetching contract documents', "routes", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.get('/api/research-contracts/extensions/:extensionId/documents', async (req: Request, res: Response) => {
    try {
      const extensionId = parseInt(req.params.extensionId);
      if (isNaN(extensionId)) {
        return res.status(400).json({ message: "Invalid extension ID" });
      }

      const extension = await storage.getResearchContractExtension(extensionId);
      if (!extension) {
        return res.status(404).json({ message: "Extension not found" });
      }

      const contract = await storage.getResearchContract(extension.contractId);
      if (!contract) {
        return res.status(404).json({ message: "Associated contract not found" });
      }

      const documents = await storage.getResearchContractDocumentsForExtension(extensionId);
      res.json(documents);
    } catch (error) {
      logError('Error fetching extension documents', "routes", error);
      res.status(500).json({ message: "Failed to fetch extension documents" });
    }
  });

  app.post('/api/research-contracts/:contractId/documents', async (req: Request, res: Response) => {
    try {
      const contractId = parseInt(req.params.contractId);
      if (isNaN(contractId)) {
        return res.status(400).json({ message: "Invalid contract ID" });
      }

      const contract = await storage.getResearchContract(contractId);
      if (!contract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      const validateData = insertResearchContractDocumentSchema.parse({
        ...req.body,
        contractId: contractId
      });

      const document = await storage.createResearchContractDocument(validateData);
      res.status(201).json(document);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      logError('Error creating document', "routes", error);
      res.status(500).json({ message: "Failed to create document" });
    }
  });

  app.post('/api/research-contracts/extensions/:extensionId/documents', async (req: Request, res: Response) => {
    try {
      const extensionId = parseInt(req.params.extensionId);
      if (isNaN(extensionId)) {
        return res.status(400).json({ message: "Invalid extension ID" });
      }

      const extension = await storage.getResearchContractExtension(extensionId);
      if (!extension) {
        return res.status(404).json({ message: "Extension not found" });
      }

      const contract = await storage.getResearchContract(extension.contractId);
      if (!contract) {
        return res.status(404).json({ message: "Associated contract not found" });
      }

      const validateData = insertResearchContractDocumentSchema.parse({
        ...req.body,
        extensionId: extensionId
      });

      const document = await storage.createResearchContractDocument(validateData);
      res.status(201).json(document);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      logError('Error creating extension document', "routes", error);
      res.status(500).json({ message: "Failed to create extension document" });
    }
  });

  app.patch('/api/research-contracts/documents/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const existingDocument = await storage.getResearchContractDocument(id);
      if (!existingDocument) {
        return res.status(404).json({ message: "Document not found" });
      }

      const validateData = insertResearchContractDocumentSchema.innerType().partial().parse(req.body);
      const document = await storage.updateResearchContractDocument(id, validateData);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      res.json(document);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      logError('Error updating document', "routes", error);
      res.status(500).json({ message: "Failed to update document" });
    }
  });

  app.delete('/api/research-contracts/documents/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const existingDocument = await storage.getResearchContractDocument(id);
      if (!existingDocument) {
        return res.status(404).json({ message: "Document not found" });
      }

      const success = await storage.deleteResearchContractDocument(id);
      
      if (!success) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      logError('Error deleting document', "routes", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // Additional convenience endpoint for getting contracts by research activity
  app.get('/api/research-activities/:id/contracts', async (req: Request, res: Response) => {
    try {
      const researchActivityId = parseInt(req.params.id);
      if (isNaN(researchActivityId)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const researchActivity = await storage.getResearchActivity(researchActivityId);
      if (!researchActivity) {
        return res.status(404).json({ message: "Research activity not found" });
      }

      const contracts = await storage.getResearchContractsForResearchActivity(researchActivityId);

      // Enhance contracts with related details
      const enhancedContracts = await Promise.all(contracts.map(async (contract) => {
        const pi = contract.leadPIId ? 
          await storage.getScientist(contract.leadPIId) : null;
        
        return {
          ...contract,
          leadPI: pi ? {
            id: pi.id,
            name: `${pi.honorificTitle} ${pi.firstName} ${pi.lastName}`,
            profileImageInitials: pi.profileImageInitials
          } : null
        };
      }));

      res.json(enhancedContracts);
    } catch (error) {
      logError('Error fetching contracts for research activity', "routes", error);
      res.status(500).json({ message: "Failed to fetch contracts" });
    }
  });
}
