/**
 * Journal impact factors: listing, years/fields, CSV import, edits.
 * Moved out of server/routes.ts as one domain; see #42. The summary routes
 * register before /:id here exactly as they did there.
 */
import type { Express, Request, Response } from "express";
import { requirePublicationOfficer } from "../auth";
import { storage } from "../databaseStorage";
import { registerImpactFactorSummaryRoutes } from "../impactFactorSummaryRoutes";
import { logError } from "../logger";
import { normaliseQuartile } from "@shared/journalQuartile";
import { and, desc } from "drizzle-orm";
import { ZodError } from "zod";

export function registerJournalImpactFactorRoutes(app: Express): void {
  // Journal Impact Factors Routes
  app.get('/api/journal-impact-factors', async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const sortField = req.query.sortField as string || 'rank';
      const sortDirection = (req.query.sortDirection as 'asc' | 'desc') || 'asc';
      const searchTerm = req.query.searchTerm as string || '';
      const fieldsParam = req.query.fields as string | undefined;
      const fields = fieldsParam ? fieldsParam.split(',').map(s => s.trim()).filter(Boolean) : [];
      const parseFloatParam = (v: any) => {
        if (v == null || v === '') return undefined;
        const n = parseFloat(String(v));
        return Number.isFinite(n) ? n : undefined;
      };
      const minImpactFactor = parseFloatParam(req.query.minImpactFactor);
      const maxImpactFactor = parseFloatParam(req.query.maxImpactFactor);

      const result = await storage.getJournalImpactFactors({
        limit,
        offset,
        sortField,
        sortDirection,
        searchTerm,
        fields,
        minImpactFactor,
        maxImpactFactor,
      });

      res.json(result);
    } catch (error) {
      logError('Error fetching journal impact factors', "routes", error);
      res.status(500).json({ message: "Failed to fetch journal impact factors" });
    }
  });

  app.get('/api/journal-impact-factors/years', async (_req: Request, res: Response) => {
    try {
      const years = await storage.getJournalImpactFactorYears();
      res.json(years);
    } catch (error) {
      logError('Error fetching journal IF years', "routes", error);
      res.status(500).json({ message: "Failed to fetch journal impact factor years" });
    }
  });

  app.get('/api/journal-impact-factors/export', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const year = parseInt(String(req.query.year ?? ''), 10);
      if (!Number.isFinite(year)) {
        return res.status(400).json({ message: "year query parameter is required" });
      }
      const searchTerm = (req.query.searchTerm as string) || '';
      const fieldsParam = req.query.fields as string | undefined;
      const fields = fieldsParam ? fieldsParam.split(',').map((s) => s.trim()).filter(Boolean) : [];
      const parseFloatParam = (v: any) => {
        if (v == null || v === '') return undefined;
        const n = parseFloat(String(v));
        return Number.isFinite(n) ? n : undefined;
      };
      const minImpactFactor = parseFloatParam(req.query.minImpactFactor);
      const maxImpactFactor = parseFloatParam(req.query.maxImpactFactor);

      const rows = await storage.exportJournalImpactFactorsForYear({
        year, searchTerm, fields, minImpactFactor, maxImpactFactor,
      });

      const headers = [
        'journalName', 'abbreviatedJournal', 'publisher', 'issn', 'eissn', 'field', 'year',
        'impactFactor', 'fiveYearJif', 'jifWithoutSelfCites', 'jci', 'quartile', 'rank',
        'totalCites', 'totalArticles', 'citableItems', 'citedHalfLife', 'citingHalfLife',
      ];
      const escape = (v: any) => {
        if (v == null) return '';
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines: string[] = [headers.join(',')];
      for (const r of rows as any[]) {
        lines.push(headers.map((h) => escape(r[h])).join(','));
      }
      const csv = lines.join('\n') + '\n';

      const filenameParts = [`impact-factors-${year}`];
      if (fields.length > 0) filenameParts.push(`fields-${fields.length}`);
      if (minImpactFactor != null || maxImpactFactor != null) {
        filenameParts.push(`if-${minImpactFactor ?? ''}-${maxImpactFactor ?? ''}`);
      }
      const filename = `${filenameParts.join('_')}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      logError('Error exporting journal impact factors', "routes", error);
      res.status(500).json({ message: "Failed to export journal impact factors" });
    }
  });

  app.get('/api/journal-impact-factors/fields', async (_req: Request, res: Response) => {
    try {
      const fields = await storage.getJournalFields();
      res.json(fields);
    } catch (error) {
      logError('Error fetching journal fields', "routes", error);
      res.status(500).json({ message: "Failed to fetch journal fields" });
    }
  });

  // Before /:id, or "summary" is parsed as a journal id and this never runs.
  registerImpactFactorSummaryRoutes(app);

  app.get('/api/journal-impact-factors/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid journal ID" });
      }

      const factor = await storage.getJournalImpactFactor(id);
      if (!factor) {
        return res.status(404).json({ message: "Journal not found" });
      }

      res.json(factor);
    } catch (error) {
      logError('Error fetching journal', "routes", error);
      res.status(500).json({ message: "Failed to fetch journal" });
    }
  });

  app.get('/api/journal-impact-factors/:id/history', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid journal ID" });
      }
      const history = await storage.getHistoricalImpactFactorsByJournalId(id);
      res.json(history);
    } catch (error) {
      logError('Error fetching journal history', "routes", error);
      res.status(500).json({ message: "Failed to fetch journal history" });
    }
  });

  app.get('/api/journal-impact-factors/:id/field-distribution', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid journal ID" });
      }
      const journal = await storage.getJournalImpactFactor(id);
      if (!journal) return res.status(404).json({ message: "Journal not found" });
      if (!journal.field) {
        return res.json({ field: null, distribution: [] });
      }
      const distribution = await storage.getFieldImpactFactorDistribution(journal.field);
      res.json({ field: journal.field, distribution });
    } catch (error) {
      logError('Error fetching field IF distribution', "routes", error);
      res.status(500).json({ message: "Failed to fetch field impact factor distribution" });
    }
  });

  app.patch('/api/journal-impact-factors/:id/field', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid journal ID" });
      }
      const fieldValue: string | null = req.body?.field == null || req.body.field === '' ? null : String(req.body.field);
      const updated = await storage.updateJournalField(id, fieldValue);
      if (!updated) return res.status(404).json({ message: "Journal not found" });
      res.json(updated);
    } catch (error) {
      logError('Error updating journal field', "routes", error);
      res.status(500).json({ message: "Failed to update journal field" });
    }
  });

  app.get('/api/journal-impact-factors/journal/:journalName/year/:year', async (req: Request, res: Response) => {
    try {
      const { journalName, year } = req.params;
      const yearNum = parseInt(year);
      
      if (isNaN(yearNum)) {
        return res.status(400).json({ message: "Invalid year" });
      }

      const factor = await storage.getImpactFactorByJournalAndYear(journalName, yearNum);
      if (!factor) {
        return res.status(404).json({ message: "Impact factor not found for this journal and year" });
      }

      res.json(factor);
    } catch (error) {
      logError('Error fetching journal impact factor', "routes", error);
      res.status(500).json({ message: "Failed to fetch journal impact factor" });
    }
  });

  app.get('/api/journal-impact-factors/historical/:journalName', async (req: Request, res: Response) => {
    try {
      const { journalName } = req.params;
      const decodedJournalName = decodeURIComponent(journalName);
      
      const historicalData = await storage.getHistoricalImpactFactors(decodedJournalName);
      res.json(historicalData);
    } catch (error) {
      logError('Error fetching historical impact factors', "routes", error);
      res.status(500).json({ message: "Failed to fetch historical impact factors" });
    }
  });

  app.post('/api/journal-impact-factors', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const { insertJournalImpactFactorSchema } = await import("@shared/schema");
      const parsedData = insertJournalImpactFactorSchema.parse(req.body);
      
      const factor = await storage.createJournalImpactFactor(parsedData);
      res.status(201).json(factor);
    } catch (error: any) {
      logError('Error creating journal impact factor', "routes", error);
      
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      
      res.status(500).json({ message: "Failed to create journal impact factor" });
    }
  });

  app.post('/api/journal-impact-factors/import-csv', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const { csvData } = req.body;
      if (!csvData || !Array.isArray(csvData)) {
        return res.status(400).json({ message: "CSV data must be an array" });
      }

      const results = [];
      for (const row of csvData) {
        try {
          const impactFactor = {
            journalName: row.journalName,
            abbreviatedJournal: row.abbreviatedJournal || null,
            year: row.year,
            publisher: row.publisher || null,
            issn: row.issn || null,
            eissn: row.eissn || null,
            field: row.field || row.category || row.subjectArea || row.subject_area || row['Subject Area'] || row['Category'] || null,
            totalCites: row.totalCites || null,
            totalArticles: row.totalArticles || null,
            citableItems: row.citableItems || null,
            citedHalfLife: row.citedHalfLife || null,
            citingHalfLife: row.citingHalfLife || null,
            impactFactor: row.impactFactor,
            fiveYearJif: row.fiveYearJif || null,
            jifWithoutSelfCites: row.jifWithoutSelfCites || null,
            jci: row.jci || null,
            // Normalised, not trusted. This route used to store whatever the
            // file said, which is how a quartile of "N/A" reached production
            // and blocked the Research Output restore -- the bulk importer
            // refuses that value, so the database could not be reloaded from
            // its own export. Anything that is not Q1-Q4 becomes null, which
            // is a valid state and blocks nothing.
            quartile: normaliseQuartile(row.quartile),
            rank: row.rank,
            totalCitations: row.totalCitations || null // Keep for backward compatibility
          };
          
          const created = await storage.createJournalImpactFactor(impactFactor);
          results.push(created);
        } catch (error) {
          logError(`Error importing row ${row}`, "routes", error);
        }
      }

      res.json({ imported: results.length, total: csvData.length });
    } catch (error) {
      logError('Error importing CSV data', "routes", error);
      res.status(500).json({ message: "Failed to import CSV data" });
    }
  });

  app.patch('/api/journal-impact-factors/:id', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid impact factor ID" });
      }

      const { insertJournalImpactFactorSchema } = await import("@shared/schema");
      const parsedData = insertJournalImpactFactorSchema.partial().parse(req.body);
      
      const factor = await storage.updateJournalImpactFactor(id, parsedData);
      if (!factor) {
        return res.status(404).json({ message: "Impact factor not found" });
      }

      res.json(factor);
    } catch (error: any) {
      logError('Error updating journal impact factor', "routes", error);
      
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      
      res.status(500).json({ message: "Failed to update journal impact factor" });
    }
  });

  app.delete('/api/journal-impact-factors/:id', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid impact factor ID" });
      }

      const success = await storage.deleteJournalImpactFactor(id);
      if (!success) {
        return res.status(404).json({ message: "Impact factor not found" });
      }

      res.status(204).send();
    } catch (error) {
      logError('Error deleting journal impact factor', "routes", error);
      res.status(500).json({ message: "Failed to delete journal impact factor" });
    }
  });
}
