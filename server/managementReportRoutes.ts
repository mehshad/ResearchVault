import type { Express, Request, Response } from "express";
import { ZodError } from "zod";
import { managementReportConfigSchema } from "@shared/managementReports";
import { requireAuth, requireManagement } from "./auth";
import { pool } from "./db";
import {
  assembleManagementReport,
  buildManagementReportPdf,
  ManagementReportTargetNotFoundError,
  ManagementReportTooLargeError,
} from "./managementReports";

export function sendManagementReportError(error: unknown, res: Response): void {
  if (error instanceof ZodError) {
    res.status(400).json({ message: "Invalid report configuration.", issues: error.issues });
  } else if (error instanceof ManagementReportTooLargeError) {
    res.status(413).json({ message: error.message, code: "REPORT_TOO_LARGE" });
  } else if (error instanceof ManagementReportTargetNotFoundError) {
    res.status(404).json({ message: error.message });
  } else {
    console.error("Management report failed:", error);
    res.status(500).json({ message: "Management report could not be generated." });
  }
}

type ReportRouteDependencies = {
  assemble: typeof assembleManagementReport;
  buildPdf: typeof buildManagementReportPdf;
};

export function createManagementReportHandlers(
  dependencies: ReportRouteDependencies = {
    assemble: assembleManagementReport,
    buildPdf: buildManagementReportPdf,
  },
) {
  return {
    preview: async (req: Request, res: Response) => {
      try {
        res.json(await dependencies.assemble(managementReportConfigSchema.parse(req.body)));
      } catch (error) {
        sendManagementReportError(error, res);
      }
    },
    pdf: async (req: Request, res: Response) => {
      try {
        const data = await dependencies.assemble(managementReportConfigSchema.parse(req.body));
        const pdf = await dependencies.buildPdf(data);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="management-report-${Date.now()}.pdf"`);
        res.send(pdf);
      } catch (error) {
        sendManagementReportError(error, res);
      }
    },
  };
}

export function registerManagementReportRoutes(app: Express): void {
  app.get("/api/management/report-options", requireAuth, requireManagement, async (_req: Request, res: Response) => {
    try {
      const [staff, sections, publicationStatuses, contractStatuses, patentStatuses] = await Promise.all([
        pool.query(`SELECT id, honorific_title AS "honorificTitle", first_name AS "firstName",
                           last_name AS "lastName" FROM scientists ORDER BY last_name, first_name`),
        pool.query(`SELECT sec.id, sec.name, sec.department_id AS "departmentId",
                           dep.name AS "departmentName", dep.branch_id AS "branchId",
                           branch.name AS "branchName"
                    FROM sections sec
                    JOIN departments dep ON dep.id = sec.department_id
                    JOIN branches branch ON branch.id = dep.branch_id
                    ORDER BY branch.name, dep.name, sec.name`),
        pool.query(`SELECT DISTINCT status FROM publications WHERE status IS NOT NULL ORDER BY status`),
        pool.query(`SELECT DISTINCT status FROM research_contracts WHERE status IS NOT NULL ORDER BY status`),
        pool.query(`SELECT DISTINCT status FROM patents WHERE status IS NOT NULL ORDER BY status`),
      ]);
      res.json({
        staff: staff.rows,
        sections: sections.rows,
        publicationStatuses: publicationStatuses.rows.map((row: { status: string }) => row.status),
        contractStatuses: contractStatuses.rows.map((row: { status: string }) => row.status),
        patentStatuses: patentStatuses.rows.map((row: { status: string }) => row.status),
      });
    } catch (error) {
      console.error("Management report options failed:", error);
      res.status(500).json({ message: "Report options could not be loaded." });
    }
  });
  const handlers = createManagementReportHandlers();
  app.post("/api/management/reports/preview", requireAuth, requireManagement, handlers.preview);
  app.post("/api/management/reports/pdf", requireAuth, requireManagement, handlers.pdf);
}