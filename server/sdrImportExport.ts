// SDR (research activity) Excel/CSV import.
//
// The template and the import share one column list, so a filled-in template
// imports without editing. SDRs are matched on SDR Number, which is unique in
// the database: an existing number is updated, a new one is created.
//
// The five columns the Research Office called the minimum -- SDR number, SDR
// name, PI, and the project number and name it belongs to -- are all required.
// A project that does not exist yet is created from the number and name given,
// which is why both are asked for.

import ExcelJS from "exceljs";
import type { InsertResearchActivity, Project, ResearchActivity, Scientist } from "@shared/schema";
import { matchStaffByName, type StaffNameIndex } from "@shared/staffNameMatching";
import type { SdrSkipCode } from "@shared/sdrImportReasons";

export const SDR_COLUMNS: Array<{ header: string; key: string; required?: boolean }> = [
  { header: "SDR Number", key: "sdrNumber", required: true },
  { header: "SDR Name", key: "title", required: true },
  { header: "PI Email", key: "piEmail" },
  { header: "PI Name", key: "piName", required: true },
  { header: "Project Number", key: "projectNumber", required: true },
  { header: "Project Name", key: "projectName", required: true },
  { header: "Status", key: "status" },
  { header: "Short Title", key: "shortTitle" },
  { header: "Sidra Branch", key: "sidraBranch" },
  { header: "Start Date", key: "startDate" },
  { header: "End Date", key: "endDate" },
  { header: "Objectives", key: "objectives" },
  { header: "Description", key: "description" },
];

const HEADER_TO_KEY: Record<string, string> = SDR_COLUMNS.reduce((acc, col) => {
  acc[col.header.toLowerCase().trim()] = col.key;
  return acc;
}, {} as Record<string, string>);

/** Statuses the SDR form offers; anything else is refused rather than guessed. */
export const SDR_STATUSES = ["planning", "active", "completed", "on_hold"] as const;

const GUIDANCE: Record<string, string> = {
  sdrNumber: "Required. Unique. An existing number updates that SDR.",
  title: "Required. The SDR name.",
  piEmail: "Preferred way to identify the PI. Matched before the name.",
  piName: "Required if no email. The PI must hold the Investigator access role.",
  projectNumber: "Required. The PRJ number this SDR belongs to.",
  projectName: "Required. Used to create the project if that number is new.",
  status: `One of: ${SDR_STATUSES.join(", ")}. Defaults to planning.`,
  shortTitle: "Optional short name for lists.",
  sidraBranch: "Research, Clinical or External.",
  startDate: "YYYY-MM-DD",
  endDate: "YYYY-MM-DD",
  objectives: "Optional.",
  description: "Optional.",
};

export async function buildSdrTemplateBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const sheet = workbook.addWorksheet("SDR Import");
  sheet.columns = SDR_COLUMNS.map((c) => ({
    header: c.header,
    key: c.header,
    width: Math.max(c.header.length + 2, 18),
  }));
  sheet.getRow(1).font = { bold: true };

  // Required columns are tinted, so the five that matter are obvious without
  // reading the instructions sheet.
  SDR_COLUMNS.forEach((col, index) => {
    if (!col.required) return;
    sheet.getColumn(index + 1).fill = {
      type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3CD" },
    };
  });

  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [
    { header: "Column", key: "column", width: 22 },
    { header: "Required", key: "required", width: 12 },
    { header: "Guidance", key: "guidance", width: 78 },
  ];
  instructions.getRow(1).font = { bold: true };
  for (const col of SDR_COLUMNS) {
    instructions.addRow({
      column: col.header,
      required: col.required ? "Yes" : "",
      guidance: GUIDANCE[col.key] ?? "",
    });
  }
  instructions.getColumn("guidance").alignment = { wrapText: true, vertical: "top" };

  // Second sheet only; the import reads the first, so an example can never be
  // imported by accident.
  const example = workbook.addWorksheet("Example (not imported)");
  example.columns = sheet.columns;
  example.getRow(1).font = { bold: true };
  example.addRow({
    "SDR Number": "SDR-2026-001",
    "SDR Name": "Example study title (delete before importing)",
    "PI Email": "lead.pi@sidra.org",
    "PI Name": "Dr Example Investigator",
    "Project Number": "PRJ-001",
    "Project Name": "Example project",
    "Status": "planning",
    "Sidra Branch": "Research",
    "Start Date": "2026-09-01",
  });

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export interface SdrRowPreview {
  rowNumber: number;
  action: "create" | "update" | "skip";
  sdrNumber: string;
  title: string;
  reason?: string;
  reasonCode?: SdrSkipCode;
  changes?: string[];
  data?: Partial<InsertResearchActivity>;
  /** Set when the row would create the project rather than reuse one. */
  createsProject?: { projectNumber: string; projectName: string };
  unmatchedStaff?: { piName: string; piEmail: string; reason: string };
}

const cellString = (value: any): string => {
  if (value == null) return "";
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if ("text" in value) return String((value as any).text).trim();
    if ("result" in value) return String((value as any).result).trim();
  }
  return String(value).trim();
};

const parseDateOrNull = (raw: string): Date | null => {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export interface SdrPreviewInputs {
  existingBySdrNumber: Map<string, ResearchActivity>;
  projectsByNumber: Map<string, Project>;
  scientistByEmail: Map<string, Scientist>;
  staffNameIndex: StaffNameIndex;
  /** Scientist ids allowed to be an SDR's PI. */
  eligiblePiIds: Set<number>;
}

/**
 * Decide create / update / skip for each parsed row. Pure: every lookup is
 * passed in, so the same function drives the preview and the apply.
 */
export function previewSdrRows(
  rawRows: Record<string, any>[],
  inputs: SdrPreviewInputs,
): SdrRowPreview[] {
  const previews: SdrRowPreview[] = [];
  const seenSdrNumbers = new Set<string>();
  // Projects created earlier in this same file, so two SDRs sharing a new
  // project number produce one project rather than a duplicate-key failure.
  const projectsPlanned = new Set<string>();

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 1;

    const row: Record<string, string> = {};
    for (const [header, value] of Object.entries(raw)) {
      const key = HEADER_TO_KEY[header.toLowerCase().trim()];
      if (key) row[key] = cellString(value);
    }
    if (Object.values(row).every((v) => v === "")) return;

    const sdrNumber = row.sdrNumber ?? "";
    const title = row.title ?? "";
    const skip = (reason: string, reasonCode: SdrSkipCode) =>
      previews.push({ rowNumber, action: "skip", sdrNumber, title, reason, reasonCode });

    if (!sdrNumber) return skip("SDR Number is required", "no_sdr_number");
    if (seenSdrNumbers.has(sdrNumber.toLowerCase())) {
      return skip(`Duplicate SDR Number "${sdrNumber}" earlier in this file`, "duplicate_sdr_number");
    }
    seenSdrNumbers.add(sdrNumber.toLowerCase());

    const existing = inputs.existingBySdrNumber.get(sdrNumber.toLowerCase());
    if (!existing && !title) return skip("SDR Name is required for new SDRs", "no_title");

    // ── The PI ──────────────────────────────────────────────────────────────
    const piEmail = row.piEmail ?? "";
    const piName = row.piName ?? "";
    let budgetHolderId: number | undefined;

    if (piEmail) {
      const match = inputs.scientistByEmail.get(piEmail.toLowerCase());
      if (!match) {
        const reason = `No staff member found with email "${piEmail}"`;
        previews.push({ rowNumber, action: "skip", sdrNumber, title, reason,
          reasonCode: "unmatched_pi", unmatchedStaff: { piName, piEmail, reason } });
        return;
      }
      budgetHolderId = match.id;
    } else if (piName) {
      const match = matchStaffByName(inputs.staffNameIndex, piName);
      if (match.status !== "matched") {
        const reason = match.status === "ambiguous"
          ? `"${piName}" matches ${match.candidates.length} staff members. Use PI Email to say which.`
          : `No staff member found named "${piName}" (use PI Email for reliable matching)`;
        previews.push({ rowNumber, action: "skip", sdrNumber, title, reason,
          reasonCode: match.status === "ambiguous" ? "ambiguous_pi" : "unmatched_pi",
          unmatchedStaff: { piName, piEmail, reason } });
        return;
      }
      budgetHolderId = match.scientist.id;
    } else if (!existing) {
      return skip("A PI is required for new SDRs", "unmatched_pi");
    }

    // The same rule the SDR form and the API enforce. Checked here so the file
    // says so up front rather than failing halfway through an apply.
    if (budgetHolderId != null && !inputs.eligiblePiIds.has(budgetHolderId)) {
      return skip(
        `"${piName || piEmail}" does not hold the Investigator access role, which an SDR's PI must have.`,
        "pi_not_investigator",
      );
    }

    // ── The project ─────────────────────────────────────────────────────────
    const projectNumber = row.projectNumber ?? "";
    const projectName = row.projectName ?? "";
    let projectId: number | undefined;
    let createsProject: SdrRowPreview["createsProject"];

    if (projectNumber) {
      const project = inputs.projectsByNumber.get(projectNumber.toLowerCase());
      if (project) {
        projectId = project.id;
      } else if (projectName) {
        createsProject = { projectNumber, projectName };
        projectsPlanned.add(projectNumber.toLowerCase());
      } else {
        return skip(
          `Project "${projectNumber}" does not exist and no Project Name was given to create it with`,
          "no_project",
        );
      }
    } else if (!existing) {
      return skip("A Project Number is required for new SDRs", "no_project");
    }

    // ── Everything else ─────────────────────────────────────────────────────
    const data: Partial<InsertResearchActivity> = {};
    const errors: string[] = [];

    if (!existing || title) data.title = title;
    data.sdrNumber = sdrNumber;
    if (budgetHolderId != null) data.budgetHolderId = budgetHolderId;
    if (projectId != null) data.projectId = projectId;

    const status = (row.status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (status) {
      if (!(SDR_STATUSES as readonly string[]).includes(status)) {
        errors.push(`Status must be one of ${SDR_STATUSES.join(", ")} (got "${row.status}")`);
      } else {
        data.status = status;
      }
    } else if (!existing) {
      data.status = "planning";
    }

    for (const [key, column] of [["startDate", "Start Date"], ["endDate", "End Date"]] as const) {
      const raw = row[key] ?? "";
      if (!raw) continue;
      const parsed = parseDateOrNull(raw);
      if (!parsed) errors.push(`${column} must be a date like 2026-09-01 (got "${raw}")`);
      else (data as any)[key] = parsed;
    }

    for (const key of ["shortTitle", "sidraBranch", "objectives", "description"] as const) {
      const value = row[key] ?? "";
      if (value) (data as any)[key] = value;
    }

    if (errors.length > 0) {
      previews.push({ rowNumber, action: "skip", sdrNumber, title,
        reason: errors.join("; "), reasonCode: "bad_value" });
      return;
    }

    if (!existing) {
      previews.push({ rowNumber, action: "create", sdrNumber, title, data, createsProject });
      return;
    }

    // What an update would actually change, so an unchanged file is a no-op
    // rather than a table full of pointless writes.
    const changes: string[] = [];
    const same = (a: unknown, b: unknown) =>
      JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    for (const [key, value] of Object.entries(data)) {
      if (key === "sdrNumber") continue;
      const current = (existing as any)[key];
      const next = value instanceof Date ? value.toISOString() : value;
      const now = current instanceof Date ? current.toISOString() : current;
      if (!same(now, next)) changes.push(key);
    }
    if (createsProject) changes.push("projectId");

    if (changes.length === 0) {
      previews.push({ rowNumber, action: "skip", sdrNumber, title: title || existing.title,
        reason: "No changes", reasonCode: "unchanged", data });
    } else {
      previews.push({ rowNumber, action: "update", sdrNumber, title: title || existing.title,
        changes, data, createsProject });
    }
  });

  return previews;
}
