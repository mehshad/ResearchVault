// Grants Excel/CSV import + export helpers.
//
// The export and the import template share one column list (GRANT_COLUMNS) so
// an exported file can be edited and re-imported. Grants are matched by
// Project Number (unique in the DB): existing project numbers are updated,
// new ones are created. The LPI is resolved by email (preferred) or exact
// "First Last" name against the scientists table.
import ExcelJS from "exceljs";
import type { Grant, InsertGrant, Scientist } from "@shared/schema";
import {
  GrantLifecycleError,
  reconcileGrantLifecycle,
} from "@shared/grantLifecycle";

export const GRANT_COLUMNS: Array<{ header: string; key: string }> = [
  { header: "Project Number", key: "projectNumber" },
  { header: "Cycle", key: "cycle" },
  { header: "Title", key: "title" },
  { header: "LPI Email", key: "lpiEmail" },
  { header: "LPI Name", key: "lpiName" },
  { header: "Investigator Type", key: "investigatorType" },
  { header: "Grant Type", key: "grantType" },
  { header: "Grant Source", key: "sourceCategory" },
  { header: "Source Record Key", key: "sourceRecordKey" },
  { header: "Submitting Institution", key: "submittingInstitution" },
  { header: "Co-Investigators", key: "coInvestigators" },
  { header: "Status", key: "status" },
  { header: "Funding Agency", key: "fundingAgency" },
  { header: "Requested Amount", key: "requestedAmount" },
  { header: "Awarded Amount", key: "awardedAmount" },
  { header: "Awarded (Yes/No)", key: "awarded" },
  { header: "Submitted Year", key: "submittedYear" },
  { header: "Awarded Year", key: "awardedYear" },
  { header: "Running Time (Years)", key: "runningTimeYears" },
  { header: "Duration (Months)", key: "durationMonths" },
  { header: "Current Grant Year", key: "currentGrantYear" },
  { header: "Subaward Completed Year", key: "subawardCompletedYear" },
  { header: "Contribution Type", key: "contributionType" },
  { header: "Contribution Details", key: "contributionDetails" },
  { header: "Currency", key: "currency" },
  { header: "Start Date", key: "startDate" },
  { header: "End Date", key: "endDate" },
  { header: "Reporting Interval (Months)", key: "reportingIntervalMonths" },
  { header: "Collaborators", key: "collaborators" },
  { header: "Description", key: "description" },
];

const HEADER_TO_KEY: Record<string, string> = GRANT_COLUMNS.reduce((acc, col) => {
  acc[col.header.toLowerCase().trim()] = col.key;
  return acc;
}, {} as Record<string, string>);

export function scientistDisplayName(s: Scientist): string {
  return [s.honorificTitle, s.firstName, s.lastName].filter(Boolean).join(" ");
}

export function grantsToRows(
  grants: Grant[],
  scientistById: Map<number, Scientist>,
): Record<string, any>[] {
  return grants.map((g) => {
    const lpi = g.lpiId ? scientistById.get(g.lpiId) : undefined;
    const values: Record<string, any> = {
      projectNumber: g.projectNumber,
      cycle: g.cycle ?? "",
      title: g.title,
      lpiEmail: lpi?.email ?? "",
      lpiName: lpi ? scientistDisplayName(lpi) : "",
      investigatorType: g.investigatorType ?? "",
      grantType: g.grantType ?? "",
      sourceCategory: g.sourceCategory ?? "",
      sourceRecordKey: g.sourceRecordKey ?? "",
      submittingInstitution: g.submittingInstitution ?? "",
      coInvestigators: g.coInvestigators ? g.coInvestigators.join("; ") : "",
      status: g.status ?? "",
      fundingAgency: g.fundingAgency ?? "",
      requestedAmount: g.requestedAmount ?? "",
      awardedAmount: g.awardedAmount ?? "",
      awarded: g.awarded ? "Yes" : "No",
      submittedYear: g.submittedYear ?? "",
      awardedYear: g.awardedYear ?? "",
      runningTimeYears: g.runningTimeYears ?? "",
      durationMonths: g.durationMonths ?? "",
      currentGrantYear: g.currentGrantYear ?? "",
      subawardCompletedYear: g.subawardCompletedYear ?? "",
      contributionType: g.contributionType ?? "",
      contributionDetails: g.contributionDetails ?? "",
      currency: g.currency ?? "",
      startDate: g.startDate ?? "",
      endDate: g.endDate ?? "",
      reportingIntervalMonths: g.reportingIntervalMonths ?? "",
      collaborators: g.collaborators ? g.collaborators.join("; ") : "",
      description: g.description ?? "",
    };
    const row: Record<string, any> = {};
    for (const col of GRANT_COLUMNS) row[col.header] = values[col.key] ?? "";
    return row;
  });
}

export async function buildGrantsWorkbookBuffer(
  rows: Record<string, any>[],
  sheetName = "Grants",
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(sheetName);
  ws.columns = GRANT_COLUMNS.map((c) => ({
    header: c.header,
    key: c.header,
    width: Math.max(c.header.length + 2, 16),
  }));
  ws.getRow(1).font = { bold: true };
  for (const row of rows) ws.addRow(row);
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * Template workbook: first sheet has headers only (safe to fill in and import
 * as-is); a second "Example" sheet shows a filled-in sample row. Only the
 * first sheet is read on import, so the example can never be imported.
 */
export async function buildGrantsTemplateBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const makeSheet = (name: string) => {
    const ws = workbook.addWorksheet(name);
    ws.columns = GRANT_COLUMNS.map((c) => ({
      header: c.header,
      key: c.header,
      width: Math.max(c.header.length + 2, 16),
    }));
    ws.getRow(1).font = { bold: true };
    return ws;
  };
  makeSheet("Grants Import");
  const example = makeSheet("Example (not imported)");
  for (const row of buildGrantsTemplateRows()) example.addRow(row);
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function buildGrantsTemplateRows(): Record<string, any>[] {
  return [
    {
      "Project Number": "PRJ-2026-001",
      "Cycle": "2026-1",
      "Title": "Example grant title (delete this row before importing)",
      "LPI Email": "lead.pi@sidra.org",
      "LPI Name": "",
      "Investigator Type": "Researcher",
      "Grant Type": "Local",
      "Grant Source": "QNRF Grant",
      "Source Record Key": "QNRF:PRJ-2026-001",
      "Submitting Institution": "Sidra Medicine",
      "Co-Investigators": "Dr. Example One; Dr. Example Two",
      "Status": "submitted",
      "Funding Agency": "QNRF",
      "Requested Amount": "250000.00",
      "Awarded Amount": "",
      "Awarded (Yes/No)": "No",
      "Submitted Year": "2026",
      "Awarded Year": "",
      "Running Time (Years)": "3",
      "Duration (Months)": "36",
      "Current Grant Year": "1/3",
      "Subaward Completed Year": "",
      "Contribution Type": "",
      "Contribution Details": "",
      "Currency": "QAR",
      "Start Date": "2026-09-01",
      "End Date": "2029-08-31",
      "Reporting Interval (Months)": "12",
      "Collaborators": "Hamad Medical Corporation; Qatar University",
      "Description": "Optional description or abstract",
    },
  ];
}

// ---------- import parsing ----------

export interface GrantRowPreview {
  rowNumber: number; // 1-based data row number (excluding header)
  action: "create" | "update" | "skip";
  projectNumber: string;
  title: string;
  reason?: string; // for skips, or informational notes
  changes?: string[]; // for updates: which fields differ
  data?: Partial<InsertGrant>; // parsed values ready to persist
}

function cellString(v: any): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    // ExcelJS rich text / hyperlink / formula cells
    if ("text" in v && v.text != null) return String((v as any).text).trim();
    if ("result" in v && (v as any).result != null) return String((v as any).result).trim();
    if ("richText" in v) return (v as any).richText.map((r: any) => r.text).join("").trim();
    return String(v).trim();
  }
  return String(v).trim();
}

function parseIntOrNull(raw: string, label: string, errors: string[]): number | null {
  if (raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    errors.push(`${label} must be a whole number (got "${raw}")`);
    return null;
  }
  return n;
}

function parseAmountOrNull(raw: string, label: string, errors: string[]): string | null {
  if (raw === "") return null;
  const cleaned = raw.replace(/[,$\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    errors.push(`${label} must be a number (got "${raw}")`);
    return null;
  }
  return cleaned;
}

function parseDateOrNull(raw: string, label: string, errors: string[]): string | null {
  if (raw === "") return null;
  // Accept YYYY-MM-DD or anything Date can parse unambiguously.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : (() => {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  })();
  if (!iso) {
    errors.push(`${label} must be a date like 2026-09-01 (got "${raw}")`);
    return null;
  }
  return iso;
}

/**
 * Turn raw parsed rows (header-keyed objects from parseUploadedFile) into a
 * preview of create/update/skip decisions. Pure function: all lookups are
 * passed in.
 */
export function previewGrantRows(
  rawRows: Record<string, any>[],
  existingByProjectNumber: Map<string, Grant>,
  scientistByEmail: Map<string, Scientist>,
  scientistByName: Map<string, Scientist>,
): GrantRowPreview[] {
  const previews: GrantRowPreview[] = [];
  const seenProjectNumbers = new Set<string>();

  rawRows.forEach((raw, idx) => {
    const rowNumber = idx + 1;

    // Normalize headers case-insensitively so hand-edited files still work.
    const row: Record<string, string> = {};
    for (const [header, value] of Object.entries(raw)) {
      const key = HEADER_TO_KEY[header.toLowerCase().trim()];
      if (key) row[key] = cellString(value);
    }

    const projectNumber = row.projectNumber ?? "";
    const title = row.title ?? "";

    // Fully empty rows (common at the bottom of spreadsheets) are ignored.
    if (Object.values(row).every((v) => v === "")) return;

    const skip = (reason: string) =>
      previews.push({ rowNumber, action: "skip", projectNumber, title, reason });

    if (!projectNumber) return skip("Project Number is required");
    if (seenProjectNumbers.has(projectNumber.toLowerCase()))
      return skip(`Duplicate Project Number "${projectNumber}" earlier in this file`);
    seenProjectNumbers.add(projectNumber.toLowerCase());

    const existing = existingByProjectNumber.get(projectNumber.toLowerCase());
    if (!existing && !title) return skip("Title is required for new grants");

    const errors: string[] = [];

    // Blank-cell policy: for EXISTING grants a blank cell leaves the current
    // value unchanged (imports are never silently destructive). The literal
    // value CLEAR erases a field. For NEW grants blanks simply mean "not set".
    const CLEAR = "clear";
    const isClear = (v: string) => v.trim().toLowerCase() === CLEAR;
    // Should this column be written? (present + non-blank, or explicit CLEAR,
    // or a new grant where the column exists)
    const writes = (key: string): boolean => {
      if (!(key in row)) return false;
      if (!existing) return true;
      return row[key] !== "";
    };
    // Value to persist for a text-ish field ("" → null on create; CLEAR → null)
    const textVal = (key: string): string | null => {
      const v = row[key] ?? "";
      if (v === "" || isClear(v)) return null;
      return v;
    };

    // Resolve LPI by email first, then exact name.
    let lpiId: number | null | undefined = undefined; // undefined = leave unchanged
    const lpiEmail = row.lpiEmail ?? "";
    const lpiName = row.lpiName ?? "";
    if (isClear(lpiEmail) || isClear(lpiName)) {
      lpiId = null;
    } else if (lpiEmail) {
      const s = scientistByEmail.get(lpiEmail.toLowerCase());
      if (!s) errors.push(`No staff member found with email "${lpiEmail}"`);
      else lpiId = s.id;
    } else if (lpiName) {
      const s = scientistByName.get(lpiName.toLowerCase().replace(/\s+/g, " "));
      if (!s) errors.push(`No staff member found named "${lpiName}" (use LPI Email for reliable matching)`);
      else lpiId = s.id;
    }

    const awardedRaw = (row.awarded ?? "").toLowerCase();
    let awarded: boolean | undefined = undefined;
    if (awardedRaw !== "") {
      if (["yes", "y", "true", "1"].includes(awardedRaw)) awarded = true;
      else if (["no", "n", "false", "0"].includes(awardedRaw)) awarded = false;
      else errors.push(`Awarded must be Yes or No (got "${row.awarded}")`);
    }

    const numVal = (key: string, label: string, parser: (raw: string, l: string, e: string[]) => any) => {
      const v = row[key] ?? "";
      if (v === "" || isClear(v)) return null;
      return parser(v, label, errors);
    };

    const data: Partial<InsertGrant> = {};
    data.projectNumber = projectNumber;
    if (title) data.title = title;
    if (writes("cycle")) data.cycle = textVal("cycle");
    if (writes("investigatorType")) data.investigatorType = textVal("investigatorType");
    if (writes("grantType")) data.grantType = textVal("grantType");
    if (writes("sourceCategory")) data.sourceCategory = textVal("sourceCategory");
    if (writes("sourceRecordKey")) data.sourceRecordKey = textVal("sourceRecordKey");
    if (writes("submittingInstitution")) data.submittingInstitution = textVal("submittingInstitution");
    if (writes("contributionType")) data.contributionType = textVal("contributionType");
    if (writes("contributionDetails")) data.contributionDetails = textVal("contributionDetails");
    if (writes("currency")) data.currency = textVal("currency");
    if (writes("status") && row.status && !isClear(row.status)) {
      Object.assign(data, { status: row.status });
    }
    if (writes("fundingAgency")) data.fundingAgency = textVal("fundingAgency");
    if (writes("requestedAmount")) data.requestedAmount = numVal("requestedAmount", "Requested Amount", parseAmountOrNull);
    if (writes("awardedAmount")) data.awardedAmount = numVal("awardedAmount", "Awarded Amount", parseAmountOrNull);
    if (awarded !== undefined) data.awarded = awarded;
    if (writes("submittedYear")) data.submittedYear = numVal("submittedYear", "Submitted Year", parseIntOrNull);
    if (writes("awardedYear")) data.awardedYear = numVal("awardedYear", "Awarded Year", parseIntOrNull);
    if (writes("runningTimeYears")) data.runningTimeYears = numVal("runningTimeYears", "Running Time (Years)", parseIntOrNull);
    if (writes("durationMonths")) data.durationMonths = numVal("durationMonths", "Duration (Months)", parseIntOrNull);
    if (writes("currentGrantYear")) data.currentGrantYear = textVal("currentGrantYear");
    if (writes("subawardCompletedYear")) data.subawardCompletedYear = numVal("subawardCompletedYear", "Subaward Completed Year", parseIntOrNull);
    if (writes("startDate")) data.startDate = numVal("startDate", "Start Date", parseDateOrNull);
    if (writes("endDate")) data.endDate = numVal("endDate", "End Date", parseDateOrNull);
    if (writes("reportingIntervalMonths")) data.reportingIntervalMonths = numVal("reportingIntervalMonths", "Reporting Interval (Months)", parseIntOrNull);
    const appendUniqueList = (
      key: "collaborators" | "coInvestigators",
      current: string[] | null | undefined,
    ) => {
      if (!writes(key)) return;
      const v = row[key] ?? "";
      if (v === "" || isClear(v)) {
        data[key] = null;
        return;
      }
      const merged = [...(current ?? [])];
      const seen = new Set(merged.map((value) => value.trim().toLowerCase()));
      for (const value of v.split(/;|\n/).map((item) => item.trim()).filter(Boolean)) {
        const normalized = value.toLowerCase();
        if (!seen.has(normalized)) {
          seen.add(normalized);
          merged.push(value);
        }
      }
      data[key] = merged;
    };
    appendUniqueList("coInvestigators", existing?.coInvestigators);
    appendUniqueList("collaborators", existing?.collaborators);
    if (writes("description")) data.description = textVal("description");
    if (lpiId !== undefined) data.lpiId = lpiId;

    try {
      const lifecycle = reconcileGrantLifecycle(data, existing);
      data.status = lifecycle.status;
      data.awarded = lifecycle.awarded;
    } catch (error) {
      errors.push(
        error instanceof GrantLifecycleError
          ? error.message
          : "Invalid grant lifecycle data",
      );
    }

    if (errors.length > 0) return skip(errors.join("; "));

    if (!existing) {
      previews.push({ rowNumber, action: "create", projectNumber, title, data });
      return;
    }

    // Update: figure out which fields actually change.
    const changes: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (key === "projectNumber") continue;
      const current = (existing as any)[key];
      const norm = (v: any) => Array.isArray(v) ? v.join("; ") : v == null ? "" : String(v);
      if (norm(current) !== norm(value)) changes.push(key);
    }
    if (changes.length === 0) {
      previews.push({ rowNumber, action: "skip", projectNumber, title: title || existing.title, reason: "No changes" });
    } else {
      previews.push({ rowNumber, action: "update", projectNumber, title: title || existing.title, changes, data });
    }
  });

  return previews;
}
