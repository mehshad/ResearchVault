/**
 * The bulk data hub: section export, template, preview and apply, and archives.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { ARCHIVE_MIME, buildBulkDataArchive, bulkArchiveFileName, createBulkDataArchive, downloadBulkDataArchive, getBulkDataArchive, listBulkDataArchives, queueBulkDataArchive } from "../bulkDataArchives";
import { BulkApplyRowError, SECTION_META as BULK_DATA_SECTIONS, applySection as applyBulkDataSection, buildExportWorkbook as buildBulkDataExportWorkbook, buildTemplateWorkbook as buildBulkDataTemplateWorkbook, getSectionMeta as getBulkDataSectionMeta, previewSection as previewBulkDataSection } from "../bulkDataHub";
import type { SectionId as BulkDataSectionId } from "../bulkDataHub";
import { logError } from "../logger";
import { ObjectNotFoundError } from "../objectStorage";
import { sections } from "@shared/schema";
import { and } from "drizzle-orm";

export function registerBulkDataRoutes(app: Express): void {
  // Section-based, administrator-only structured data import/export hub.
  // Uploaded documents, workflow history, credentials, and role assignments
  // are intentionally outside this API.
  app.get('/api/bulk-data/export-all', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const now = new Date();
      const { buffer } = await buildBulkDataArchive(now);
      res.setHeader('Content-Type', ARCHIVE_MIME);
      res.setHeader('Content-Disposition', `attachment; filename="${bulkArchiveFileName(now)}"`);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(buffer);
    } catch (error) {
      logError('Bulk data export-all failed', "routes", error);
      res.status(500).json({ message: 'Failed to export bulk data archive' });
    }
  });

  app.get('/api/bulk-data/archives', requireAdmin, async (_req: Request, res: Response) => {
    try {
      res.json({
        archives: await listBulkDataArchives(),
        schedule: {
          timezone: 'Asia/Riyadh',
          time: '02:00',
          retention: 30,
        },
      });
    } catch (error) {
      logError('Bulk data archive listing failed', "routes", error);
      res.status(500).json({ message: 'Failed to list bulk data archives' });
    }
  });

  app.post('/api/bulk-data/archives', requireAdmin, async (req: Request, res: Response) => {
    try {
      const row = await createBulkDataArchive(
        'manual',
        req.session.user?.id == null ? undefined : String(req.session.user.id),
      );
      if (!row) throw new Error('Failed to create archive record');
      queueBulkDataArchive(row.id);
      const { objectId: _objectId, leaseToken: _leaseToken, ...archive } = row;
      res.status(202).json({ archive });
    } catch (error) {
      logError('Bulk data archive request failed', "routes", error);
      res.status(500).json({ message: 'Failed to request bulk data archive' });
    }
  });

  app.get('/api/bulk-data/archives/:id/download', requireAdmin, async (req: Request, res: Response) => {
    try {
      const row = await getBulkDataArchive(req.params.id);
      if (!row) return res.status(404).json({ message: 'Archive not found' });
      if (row.status !== 'succeeded') {
        return res.status(409).json({ message: 'Archive is not ready', status: row.status });
      }
      const buffer = await downloadBulkDataArchive(row);
      res.setHeader('Content-Type', ARCHIVE_MIME);
      res.setHeader('Content-Disposition', `attachment; filename="${row.fileName || 'bulk-data-export.zip'}"`);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(buffer);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ message: 'Archive object not found' });
      }
      logError('Bulk data archive download failed', "routes", error);
      res.status(500).json({ message: 'Failed to download bulk data archive' });
    }
  });

  app.get('/api/bulk-data/sections', requireAdmin, (_req: Request, res: Response) => {
    res.json({ sections: BULK_DATA_SECTIONS });
  });

  const resolveBulkDataSection = (value: string): BulkDataSectionId => {
    const sectionId = value as BulkDataSectionId;
    getBulkDataSectionMeta(sectionId);
    return sectionId;
  };

  app.get('/api/bulk-data/:sectionId/export', requireAdmin, async (req: Request, res: Response) => {
    try {
      const sectionId = resolveBulkDataSection(req.params.sectionId);
      const section = getBulkDataSectionMeta(sectionId);
      const workbook = await buildBulkDataExportWorkbook(sectionId);
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${sectionId}-export-${stamp}.xlsx"`);
      res.send(workbook);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export section data';
      const status = message.startsWith('Unknown section') ? 400 : 500;
      logError('Bulk data export failed', "routes", error);
      res.status(status).json({ message });
    }
  });

  app.get('/api/bulk-data/:sectionId/template', requireAdmin, async (req: Request, res: Response) => {
    try {
      const sectionId = resolveBulkDataSection(req.params.sectionId);
      const workbook = await buildBulkDataTemplateWorkbook(sectionId);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${sectionId}-import-template.xlsx"`);
      res.send(workbook);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to build import template';
      const status = message.startsWith('Unknown section') ? 400 : 500;
      logError('Bulk data template failed', "routes", error);
      res.status(status).json({ message });
    }
  });

  app.post('/api/bulk-data/:sectionId/preview', requireAdmin, async (req: Request, res: Response) => {
    try {
      const sectionId = resolveBulkDataSection(req.params.sectionId);
      const { fileBase64, fileName } = req.body as { fileBase64?: string; fileName?: string };
      if (!fileBase64 || !fileName) {
        return res.status(400).json({ message: 'fileBase64 and fileName are required' });
      }
      if (!fileName.toLowerCase().endsWith('.xlsx')) {
        return res.status(400).json({ message: 'Only .xlsx workbooks are supported' });
      }
      const preview = await previewBulkDataSection(sectionId, fileBase64, fileName);
      res.json(preview);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to preview section import';
      logError('Bulk data preview failed', "routes", error);
      res.status(400).json({ message });
    }
  });

  app.post('/api/bulk-data/:sectionId/apply', requireAdmin, async (req: Request, res: Response) => {
    try {
      const sectionId = resolveBulkDataSection(req.params.sectionId);
      const { fileBase64, fileName, fingerprint, skipInvalidRows } = req.body as {
        fileBase64?: string;
        fileName?: string;
        fingerprint?: string;
        skipInvalidRows?: boolean;
      };
      if (!fileBase64 || !fileName || !fingerprint) {
        return res.status(400).json({ message: 'fileBase64, fileName, and fingerprint are required' });
      }
      const sessionUser = req.session.user;
      const result = await applyBulkDataSection(
        sectionId,
        fileBase64,
        fileName,
        fingerprint,
        {
          userId: sessionUser?.id,
          scientistId: sessionUser?.scientistId,
          email: sessionUser?.email,
        },
        // Opt-in only: a caller must ask for a partial restore explicitly.
        { skipInvalidRows: skipInvalidRows === true },
      );
      res.json(result);
    } catch (error) {
      if (error instanceof BulkApplyRowError) {
        // One row failed at write time and the section rolled back. Name the
        // row, in the shape the lenient path uses for a skipped one, and make
        // it a 400: the file is what needs fixing, not the server.
        logError('Bulk data apply refused a row', "routes", error);
        return res.status(400).json({ message: error.message, rejected: [error.toRejectedRow()] });
      }
      const message = error instanceof Error ? error.message : 'Failed to apply section import';
      const status = /fingerprint|preview|row error|unknown section|only \.xlsx|required|auditable applying user|limit|not found|duplicate/i.test(message)
        ? 400
        : 500;
      logError('Bulk data apply failed', "routes", error);
      res.status(status).json({ message });
    }
  });
}
