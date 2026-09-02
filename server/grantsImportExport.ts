// Grants Excel/CSV import + export helpers.
//
// The export and the import template share one column list (GRANT_COLUMNS) so
// an exported file can be edited and re-imported. Grants are matched by
// Project Number (unique in the DB): existing project numbers are updated,
// new ones are created. The LPI is resolved by email (preferred) or exact
// "First Last" name against the scientists table.
import ExcelJS from "exceljs";
import { GRANT_CURRENCY_VALUES } from "@shared/schema";
import { matchStaffByName, type StaffNameIndex } from "@shared/staffNameMatching";
import { isHomeInstitution, resolveGrantLpiName } from "@shared/grantSubmission";
import type { GrantSkipCode } from "@shared/grantImportReasons";
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
  { header: "Grant LPI", key: "grantLpiName" },
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
      // Resolved so an export never shows a blank lead on a grant we
      // submitted; re-importing it writes the same name back harmlessly.
      grantLpiName: resolveGrantLpiName(g, lpi ? scientistDisplayName(lpi) : null) ?? "",
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
  // Category for the preview's summary. Set where the skip happens so a
  // reworded message cannot quietly fall into "Other".
  reasonCode?: GrantSkipCode;
  unmatchedStaff?: {
    lpiName: string;
    lpiEmail: string;
    reason: string;
  };
}

export interface MissingGrantStaffRow {
  lpiName: string;
  lpiEmail: string;
  affectedGrantCount: number;
  projectNumbers: string[];
  grantTitles: string[];
  reason: string;
}

export function collectMissingGrantStaff(
  previews: GrantRowPreview[],
): MissingGrantStaffRow[] {
  const rows: MissingGrantStaffRow[] = [];
  const byEmail = new Map<string, MissingGrantStaffRow>();
  const byName = new Map<string, MissingGrantStaffRow>();

  for (const preview of previews) {
    const missing = preview.unmatchedStaff;
    if (!missing) continue;
    const emailKey = missing.lpiEmail.trim().toLowerCase();
    const nameKey = missing.lpiName.trim().toLowerCase().replace(/\s+/g, " ");
    let entry = (emailKey ? byEmail.get(emailKey) : undefined)
      ?? (nameKey ? byName.get(nameKey) : undefined);

    if (!entry) {
      entry = {
        lpiName: missing.lpiName,
        lpiEmail: missing.lpiEmail,
        affectedGrantCount: 0,
        projectNumbers: [],
        grantTitles: [],
        reason: missing.reason,
      };
      rows.push(entry);
    }

    if (!entry.lpiName && missing.lpiName) entry.lpiName = missing.lpiName;
    if (!entry.lpiEmail && missing.lpiEmail) entry.lpiEmail = missing.lpiEmail;
    if (emailKey) byEmail.set(emailKey, entry);
    if (nameKey) byName.set(nameKey, entry);

    entry.affectedGrantCount += 1;
    if (preview.projectNumber && !entry.projectNumbers.includes(preview.projectNumber)) {
      entry.projectNumbers.push(preview.projectNumber);
    }
    if (preview.title && !entry.grantTitles.includes(preview.title)) {
      entry.grantTitles.push(preview.title);
    }
  }

  return rows.sort((a, b) =>
    (a.lpiName || a.lpiEmail).localeCompare(b.lpiName || b.lpiEmail),
  );
}

export async function buildMissingGrantStaffWorkbookBuffer(
  previews: GrantRowPreview[],
): Promise<Buffer> {
  const rows = collectMissingGrantStaff(previews);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Missing Staff");
  sheet.columns = [
    { header: "LPI Name", key: "lpiName", width: 28 },
    { header: "LPI Email", key: "lpiEmail", width: 32 },
    { header: "Affected Grants", key: "affectedGrantCount", width: 16 },
    { header: "Project Numbers", key: "projectNumbers", width: 34 },
    { header: "Grant Titles", key: "grantTitles", width: 60 },
    { header: "Reason", key: "reason", width: 55 },
  ];
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "F1" };
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: "middle" };
  for (const row of rows) {
    sheet.addRow({
      ...row,
      projectNumbers: row.projectNumbers.join("\n"),
      grantTitles: row.grantTitles.join("\n"),
    });
  }
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.alignment = { vertical: "top", wrapText: true };
    }
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
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
 * Split a multi-value cell. The office writes these separated by semicolons,
 * and sometimes by newlines within one cell.
 */
function splitList(value: string): string[] {
  return value
    .split(";")
    .flatMap((part) => part.split("\n"))
    .map((item) => item.trim())
    .filter(Boolean);
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
  scientistByName: StaffNameIndex,
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

    const skip = (reason: string, reasonCode: GrantSkipCode) =>
      previews.push({ rowNumber, action: "skip", projectNumber, title, reason, reasonCode });

    if (!projectNumber) return skip("Project Number is required", "no_project_number");
    if (seenProjectNumbers.has(projectNumber.toLowerCase()))
      return skip(`Duplicate Project Number "${projectNumber}" earlier in this file`, "duplicate_project_number");
    seenProjectNumbers.add(projectNumber.toLowerCase());

    const existing = existingByProjectNumber.get(projectNumber.toLowerCase());
    if (!existing && !title) return skip("Title is required for new grants", "no_title");

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

    // Resolve LPI by email first, then name.
    let lpiId: number | null | undefined = undefined; // undefined = leave unchanged
    const lpiEmail = row.lpiEmail ?? "";
    let lpiName = row.lpiName ?? "";
    let unmatchedStaff: GrantRowPreview["unmatchedStaff"];
    // Categories for whatever lands in `errors`, in the order raised.
    const errorCodes: GrantSkipCode[] = [];
    // Held until `data` exists, further down.
    let pendingGrantLpiName: string | null | undefined = undefined;

    // A grant somebody else submitted. Its Lead PI works at the prime
    // institution and will never be in our directory, so that name goes to the
    // external field and the Sidra Lead PI is taken from the Co-Investigators
    // column instead -- on a subaward, our person is listed there.
    //
    // Only when exactly one co-investigator resolves to staff. Two would be a
    // guess about which of them leads our part, and none means the file never
    // says who here owns it; both are left for a person, because the Sidra
    // Lead PI is the one field on a grant that must not be empty.
    const submitting = row.submittingInstitution ?? "";
    const isSubaward = submitting !== "" && !isClear(submitting) && !isHomeInstitution(submitting);
    if (isSubaward && lpiName && !lpiEmail) {
      const sidraCandidates: number[] = [];
      for (const candidate of splitList(row.coInvestigators ?? "")) {
        const m = matchStaffByName(scientistByName, candidate);
        if (m.status === "matched" && !sidraCandidates.includes(m.scientist.id)) {
          sidraCandidates.push(m.scientist.id);
        }
      }

      if (sidraCandidates.length === 1) {
        pendingGrantLpiName = lpiName;
        lpiId = sidraCandidates[0];
        // Resolved. Fall past the directory lookup below, which would only
        // fail on a name that was never ours.
        lpiName = "";
      } else {
        const reason = sidraCandidates.length > 1
          ? `"${submitting}" submitted this grant and its Co-Investigators name ${sidraCandidates.length} Sidra staff. Set the Sidra Lead PI by hand.`
          : `"${submitting}" submitted this grant and no Co-Investigator matches a staff record, so there is nobody to record as Sidra Lead PI.`;
        errorCodes.push(sidraCandidates.length > 1 ? "subaward_ambiguous_lead" : "subaward_no_sidra_lead");
        errors.push(reason);
        unmatchedStaff = { lpiName, lpiEmail, reason };
        lpiName = "";
      }
    } else if (writes("grantLpiName")) {
      pendingGrantLpiName = textVal("grantLpiName");
    }

    if (isClear(lpiEmail) || isClear(row.lpiName ?? "")) {
      lpiId = null;
    } else if (lpiEmail) {
      const s = scientistByEmail.get(lpiEmail.toLowerCase());
      if (!s) {
        const reason = `No staff member found with email "${lpiEmail}"`;
        errorCodes.push("unmatched_staff");
        errors.push(reason);
        unmatchedStaff = { lpiName, lpiEmail, reason };
      }
      else lpiId = s.id;
    } else if (lpiName) {
      // Tolerates the title and the middle name the office's files carry, and
      // refuses to guess when a name fits two people.
      const match = matchStaffByName(scientistByName, lpiName);
      if (match.status === "matched") {
        lpiId = match.scientist.id;
      } else {
        const reason = match.status === "ambiguous"
          ? `"${lpiName}" matches ${match.candidates.length} staff members. Use LPI Email to say which.`
          : `No staff member found named "${lpiName}" (use LPI Email for reliable matching)`;
        errorCodes.push(match.status === "ambiguous" ? "ambiguous_staff" : "unmatched_staff");
        errors.push(reason);
        unmatchedStaff = { lpiName, lpiEmail, reason };
      }
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
    if (writes("currency")) {
      const currency = textVal("currency")?.toUpperCase() ?? null;
      if (
        currency !== null
        && !GRANT_CURRENCY_VALUES.includes(currency as typeof GRANT_CURRENCY_VALUES[number])
      ) {
        errors.push(`Currency must be EUR, USD, or QAR (got "${row.currency}")`);
      } else {
        data.currency = currency as typeof GRANT_CURRENCY_VALUES[number] | null;
      }
    }
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
    if (pendingGrantLpiName !== undefined) data.grantLpiName = pendingGrantLpiName;

    try {
      const lifecycle = reconcileGrantLifecycle(data, existing);
      data.status = lifecycle.status;
      data.awarded = lifecycle.awarded;
    } catch (error) {
      errorCodes.push("lifecycle");
      errors.push(
        error instanceof GrantLifecycleError
          ? error.message
          : "Invalid grant lifecycle data",
      );
    }

    if (errors.length > 0) {
      previews.push({
        rowNumber,
        action: "skip",
        projectNumber,
        title,
        reason: errors.join("; "),
        // The first category raised: it is the one the row died on, and the
        // rest usually follow from it.
        reasonCode: errorCodes[0] ?? "bad_value",
        unmatchedStaff,
      });
      return;
    }

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
      // Carries `data` even though nothing will be written from it. The apply
      // step makes a second pass over every parsed row to mirror collaborators
      // and co-investigators into their tables, and an unchanged row is
      // exactly the one most likely to be missing those links -- it was
      // imported before the tables existed.
      previews.push({ rowNumber, action: "skip", projectNumber, title: title || existing.title, reason: "No changes", reasonCode: "unchanged", data });
    } else {
      previews.push({ rowNumber, action: "update", projectNumber, title: title || existing.title, changes, data });
    }
  });

  return previews;
}
