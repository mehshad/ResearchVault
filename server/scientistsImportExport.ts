import ExcelJS from "exceljs";
import { parse as csvParse } from "csv-parse/sync";
import { stringify as csvStringify } from "csv-stringify/sync";
import { z } from "zod";
import { sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Scientist, InsertScientist, Branch, Department, Section } from "@shared/schema";

type StaffFileKey = keyof Scientist | "supervisorEmail";

export const EXPORT_COLUMNS: Array<{ header: string; key: StaffFileKey; description: string }> = [
  { header: "Staff ID", key: "staffId", description: "Unique staff identifier" },
  { header: "Honorific Title", key: "honorificTitle", description: "Required, e.g. Dr, Prof, Mr, Ms" },
  { header: "First Name", key: "firstName", description: "Required" },
  { header: "Last Name", key: "lastName", description: "Required" },
  { header: "Email", key: "email", description: "Required unique email" },
  { header: "Job Title", key: "jobTitle", description: "Profile job title" },
  { header: "Staff Type", key: "staffType", description: "scientific or administrative" },
  { header: "Investigator", key: "isInvestigator", description: "Yes or No" },
  { header: "Department ID", key: "departmentId", description: "Numeric ID from Settings > Organization" },
  { header: "Section ID", key: "sectionId", description: "Numeric ID; must belong to Department ID" },
  { header: "Legacy Department", key: "department", description: "Older free-text department value" },
  { header: "Initials", key: "profileImageInitials", description: "Up to two characters" },
  { header: "Line Manager Email", key: "supervisorEmail", description: "Email of another staff row in this file" },
  { header: "ORCID ID", key: "orcidId", description: "ORCID identifier" },
  { header: "LinkedIn URL", key: "linkedInUrl", description: "LinkedIn profile URL" },
  { header: "Google Scholar URL", key: "googleScholarUrl", description: "Google Scholar profile URL" },
  { header: "Web of Science ID", key: "webOfScienceId", description: "Web of Science researcher ID" },
  { header: "Bio", key: "bio", description: "Profile biography" },
];

const HEADER_TO_KEY: Record<string, string> = EXPORT_COLUMNS.reduce((acc, col) => {
  acc[col.header.toLowerCase().trim()] = col.key as string;
  return acc;
}, {} as Record<string, string>);
// Backward compatibility for exports created before the structured
// organization fields were added.
HEADER_TO_KEY["department"] = "department";

export interface StaffOrgData {
  branches: Branch[];
  departments: Department[];
  sections: Section[];
}

function compareScientists(a: Scientist, b: Scientist): number {
  return a.lastName.localeCompare(b.lastName, undefined, { sensitivity: "base" })
    || a.firstName.localeCompare(b.firstName, undefined, { sensitivity: "base" })
    || a.id - b.id;
}

export function orderScientistsForExport(scientists: Scientist[], org: StaffOrgData): Scientist[] {
  const departmentById = new Map(org.departments.map(d => [d.id, d]));
  const branchById = new Map(org.branches.map(b => [b.id, b]));
  const sectionById = new Map(org.sections.map(s => [s.id, s]));
  const groupKey = (s: Scientist) => `${s.departmentId ?? "z"}:${s.sectionId ?? "z"}`;
  const groups = new Map<string, Scientist[]>();
  for (const scientist of scientists) {
    const key = groupKey(scientist);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(scientist);
  }
  const groupSort = ([, a]: [string, Scientist[]], [, b]: [string, Scientist[]]) => {
    const orgName = (s: Scientist) => {
      const department = s.departmentId ? departmentById.get(s.departmentId) : undefined;
      const branch = department ? branchById.get(department.branchId) : undefined;
      const section = s.sectionId ? sectionById.get(s.sectionId) : undefined;
      return `${branch?.name ?? "\uffff"}\0${department?.name ?? "\uffff"}\0${section?.name ?? "\uffff"}`;
    };
    return orgName(a[0]).localeCompare(orgName(b[0]), undefined, { sensitivity: "base" });
  };
  // Organization order is the baseline. Reporting edges are then applied
  // globally so a department-level or cross-section manager always precedes
  // their reports, even when that necessarily interrupts a contiguous group.
  const baseline = [...groups.entries()]
    .sort(groupSort)
    .flatMap(([, members]) => members.slice().sort(compareScientists));
  const allIds = new Set(scientists.map(s => s.id));
  const baselineIndex = new Map(baseline.map((s, index) => [s.id, index]));
  const children = new Map<number, Scientist[]>();
  for (const scientist of scientists) {
    if (scientist.supervisorId && allIds.has(scientist.supervisorId)) {
      if (!children.has(scientist.supervisorId)) children.set(scientist.supervisorId, []);
      children.get(scientist.supervisorId)!.push(scientist);
    }
  }
  children.forEach(list => list.sort((a, b) =>
    (baselineIndex.get(a.id) ?? 0) - (baselineIndex.get(b.id) ?? 0) || compareScientists(a, b)
  ));
  const ordered: Scientist[] = [];
  const visited = new Set<number>();
  const visit = (scientist: Scientist) => {
    if (visited.has(scientist.id)) return;
    visited.add(scientist.id);
    ordered.push(scientist);
    for (const child of children.get(scientist.id) ?? []) visit(child);
  };
  baseline
    .filter(s => !s.supervisorId || !allIds.has(s.supervisorId))
    .forEach(visit);
  baseline.forEach(visit); // cycles and malformed hierarchies remain deterministic
  return ordered;
}

export function scientistsToRows(scientists: Scientist[]): Record<string, any>[] {
  const idToEmail = new Map<number, string>();
  scientists.forEach(s => idToEmail.set(s.id, s.email));

  return scientists.map(s => {
    const row: Record<string, any> = {};
    for (const col of EXPORT_COLUMNS) {
      if (col.key === "supervisorEmail") {
        row[col.header] = s.supervisorId ? idToEmail.get(s.supervisorId) ?? "" : "";
      } else {
        const v = (s as any)[col.key];
        row[col.header] = col.key === "isInvestigator" ? (v ? "Yes" : "No") : v == null ? "" : v;
      }
    }
    return row;
  });
}

export async function buildExportBuffer(
  scientists: Scientist[],
  format: "xlsx" | "csv",
  org?: StaffOrgData
): Promise<{ buffer: Buffer; mime: string; filename: string }> {
  const rows = scientistsToRows(org ? orderScientistsForExport(scientists, org) : scientists);
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const headers = EXPORT_COLUMNS.map(c => c.header);
    const csv = csvStringify(rows, { header: true, columns: headers });
    return {
      buffer: Buffer.from(csv, "utf-8"),
      mime: "text/csv; charset=utf-8",
      filename: `staff-export-${stamp}.csv`,
    };
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Staff");
  worksheet.columns = EXPORT_COLUMNS.map(c => ({
    header: c.header,
    key: c.header,
    width: Math.max(c.header.length + 2, 18),
  }));
  for (const row of rows) {
    worksheet.addRow(row);
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: `staff-export-${stamp}.xlsx`,
  };
}

export async function buildTemplateBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Staff");
  worksheet.columns = EXPORT_COLUMNS.map(c => ({
    header: c.header,
    key: c.header,
    width: Math.max(c.header.length + 2, 18),
  }));
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.getRow(1).font = { bold: true };
  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [
    { header: "Column", key: "column", width: 26 },
    { header: "Guidance", key: "guidance", width: 70 },
  ];
  EXPORT_COLUMNS.forEach(c => instructions.addRow({ column: c.header, guidance: c.description }));
  instructions.getRow(1).font = { bold: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function parseUploadedFile(base64: string, fileName: string): Promise<Record<string, any>[]> {
  const buf = Buffer.from(base64, "base64");
  const lowerName = (fileName || "").toLowerCase();

  if (lowerName.endsWith(".csv")) {
    const text = buf.toString("utf-8");
    const records: Record<string, any>[] = csvParse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: false,
      cast: false,
    });
    return records;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buf);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("File contains no sheets");

  const headers: string[] = [];
  const rows: Record<string, any>[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber] = cell.value == null ? "" : String(cell.value);
      });
    } else {
      const rowObj: Record<string, any> = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber];
        if (header) {
          rowObj[header] = cell.value == null ? "" : String(cell.value);
        }
      });
      rows.push(rowObj);
    }
  });

  return rows;
}


const optionalInteger = z.preprocess(v => v === "" || v == null ? undefined : Number(v), z.number().int().positive().optional());
const optionalBoolean = z.preprocess(v => {
  if (v === "" || v == null) return undefined;
  if (typeof v === "boolean") return v;
  const value = String(v).trim().toLowerCase();
  if (["yes", "true", "1"].includes(value)) return true;
  if (["no", "false", "0"].includes(value)) return false;
  return v;
}, z.boolean({ invalid_type_error: "Use Yes or No" }).optional());

const fileRowSchema = z.object({
  staffId: z.string().trim().optional(),
  honorificTitle: z.string().trim().min(1, "Honorific Title is required"),
  firstName: z.string().trim().min(1, "First Name is required"),
  lastName: z.string().trim().min(1, "Last Name is required"),
  email: z.string().trim().toLowerCase().email("Invalid email"),
  jobTitle: z.string().trim().optional(),
  staffType: z.enum(["scientific", "administrative"]).default("scientific"),
  isInvestigator: optionalBoolean,
  departmentId: optionalInteger,
  sectionId: optionalInteger,
  department: z.string().trim().optional(),
  profileImageInitials: z.string().trim().max(2).optional(),
  supervisorEmail: z.string().trim().toLowerCase().optional(),
  orcidId: z.string().trim().optional(),
  linkedInUrl: z.string().trim().optional(),
  googleScholarUrl: z.string().trim().optional(),
  webOfScienceId: z.string().trim().optional(),
  bio: z.string().optional(),
});

export type FileRow = z.infer<typeof fileRowSchema>;

export interface ImportRowError {
  rowNumber: number;
  identifier: string;
  errors: string[];
}

export interface ReferencingRecord {
  table: string;
  column: string;
  count: number;
  sampleIds: number[];
}

export interface ImportPreview {
  toInsert: FileRow[];
  toUpdate: Array<{ existingId: number; row: FileRow }>;
  errors: ImportRowError[];
  unchanged: number;
}

function normaliseRow(raw: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [header, value] of Object.entries(raw)) {
    const key = HEADER_TO_KEY[String(header).toLowerCase().trim()];
    if (!key) continue;
    out[key] = typeof value === "string" ? value : value == null ? "" : String(value);
  }
  return out;
}

export function buildImportPreview(
  fileRows: Record<string, any>[],
  existing: Scientist[],
  org?: StaffOrgData
): ImportPreview {
  const errors: ImportRowError[] = [];
  const toInsert: FileRow[] = [];
  const toUpdate: Array<{ existingId: number; row: FileRow }> = [];
  let unchanged = 0;

  const existingByEmail = new Map<string, Scientist>();
  const existingByStaffId = new Map<string, Scientist>();
  existing.forEach(s => {
    existingByEmail.set(s.email.toLowerCase(), s);
    if (s.staffId) existingByStaffId.set(s.staffId, s);
  });

  const seenEmails = new Set<string>();
  const seenStaffIds = new Set<string>();
  // Each entry: { row, rowNumber, matchedId }
  const matched: Array<{ row: FileRow; rowNumber: number; matchedId: number | null }> = [];

  const presentKeys = new Set(Object.keys(fileRows[0] ?? {}).map(h => HEADER_TO_KEY[h.toLowerCase().trim()]).filter(Boolean));
  const departmentsById = new Map((org?.departments ?? []).map(d => [d.id, d]));
  const sectionsById = new Map((org?.sections ?? []).map(s => [s.id, s]));
  fileRows.forEach((raw, idx) => {
    const rowNumber = idx + 2; // header is row 1
    const normalised = normaliseRow(raw);
    for (const k of Object.keys(normalised)) {
      if (normalised[k] === "") normalised[k] = undefined;
    }

    const parsed = fileRowSchema.safeParse(normalised);
    const identifier =
      normalised.email ||
      `${normalised.firstName ?? ""} ${normalised.lastName ?? ""}`.trim() ||
      `row ${rowNumber}`;

    if (!parsed.success) {
      errors.push({
        rowNumber,
        identifier,
        errors: parsed.error.errors.map(e => `${e.path.join(".") || "row"}: ${e.message}`),
      });
      return;
    }

    const row = parsed.data;
    const rowErrors: string[] = [];

    if (seenEmails.has(row.email)) {
      rowErrors.push(`Duplicate email in file: ${row.email}`);
    }
    seenEmails.add(row.email);

    if (row.staffId) {
      if (seenStaffIds.has(row.staffId)) {
        rowErrors.push(`Duplicate Staff ID in file: ${row.staffId}`);
      }
      seenStaffIds.add(row.staffId);
    }

    if (row.supervisorEmail && row.supervisorEmail === row.email) {
      rowErrors.push("A staff member cannot be their own line manager");
    }

    // Match: staffId first, then email, with conflict detection
    const staffIdMatch = row.staffId ? existingByStaffId.get(row.staffId) : undefined;
    const emailMatch = existingByEmail.get(row.email);

    if (staffIdMatch && emailMatch && staffIdMatch.id !== emailMatch.id) {
      rowErrors.push(
        `Conflict: Staff ID '${row.staffId}' belongs to ${staffIdMatch.firstName} ${staffIdMatch.lastName} (${staffIdMatch.email}) but Email '${row.email}' belongs to ${emailMatch.firstName} ${emailMatch.lastName}. They point to different existing staff.`
      );
    }

    if (rowErrors.length) {
      errors.push({ rowNumber, identifier, errors: rowErrors });
      return;
    }

    const matchedRecord = staffIdMatch ?? emailMatch ?? null;
    if (!presentKeys.has("isInvestigator")) row.isInvestigator = matchedRecord?.isInvestigator ?? false;
    if (!presentKeys.has("departmentId")) row.departmentId = matchedRecord?.departmentId ?? undefined;
    if (!presentKeys.has("sectionId")) row.sectionId = matchedRecord?.sectionId ?? undefined;
    if (org) {
      const department = row.departmentId ? departmentsById.get(row.departmentId) : undefined;
      const section = row.sectionId ? sectionsById.get(row.sectionId) : undefined;
      if (row.departmentId && !department) rowErrors.push(`Department ID '${row.departmentId}' does not exist`);
      if (row.sectionId && !section) rowErrors.push(`Section ID '${row.sectionId}' does not exist`);
      if (section && row.departmentId && section.departmentId !== row.departmentId) {
        rowErrors.push(`Section ID '${row.sectionId}' does not belong to Department ID '${row.departmentId}'`);
      }
      if (section && !row.departmentId) row.departmentId = section.departmentId;
    }
    if (rowErrors.length) {
      errors.push({ rowNumber, identifier, errors: rowErrors });
      return;
    }
    matched.push({ row, rowNumber, matchedId: matchedRecord ? matchedRecord.id : null });
  });

  // Supervisor emails must resolve against the FINAL intended set — i.e.
  // every row that will exist in the DB after the import (matched updates,
  // unchanged matches, and new inserts). This deliberately excludes the
  // emails of existing scientists that aren't in the file, since those rows
  // will be deleted and pointing at them would resolve to nothing at apply
  // time.
  const allKnownEmails = new Set<string>(matched.map(m => m.row.email));
  const finalExistingIdByEmail = new Map<string, number>(
    matched
      .filter((m): m is typeof m & { matchedId: number } => m.matchedId != null)
      .map(m => [m.row.email, m.matchedId])
  );

  matched.forEach(({ row, rowNumber, matchedId }) => {
    if (row.supervisorEmail && !allKnownEmails.has(row.supervisorEmail)) {
      errors.push({
        rowNumber,
        identifier: row.email,
        errors: [`Line manager email '${row.supervisorEmail}' is not in the file or current staff list`],
      });
      return;
    }

    if (matchedId == null) {
      toInsert.push(row);
      return;
    }

    const existingRecord = existing.find(s => s.id === matchedId)!;
    const desiredExistingSupervisorId = row.supervisorEmail
      ? finalExistingIdByEmail.get(row.supervisorEmail) ?? null
      : null;
    // A manager newly inserted by this file has no id yet. Treat that as a
    // change so apply will patch the relationship after inserts complete.
    const supervisorMatches = row.supervisorEmail
      ? desiredExistingSupervisorId != null && existingRecord.supervisorId === desiredExistingSupervisorId
      : existingRecord.supervisorId == null;

    const matches =
      (existingRecord.staffId ?? "") === (row.staffId ?? "") &&
      existingRecord.honorificTitle === row.honorificTitle &&
      existingRecord.firstName === row.firstName &&
      existingRecord.lastName === row.lastName &&
      existingRecord.email.toLowerCase() === row.email &&
      (existingRecord.jobTitle ?? "") === (row.jobTitle ?? "") &&
      existingRecord.staffType === row.staffType &&
      existingRecord.isInvestigator === (row.isInvestigator ?? false) &&
      (existingRecord.departmentId ?? null) === (row.departmentId ?? null) &&
      (existingRecord.sectionId ?? null) === (row.sectionId ?? null) &&
      (existingRecord.department ?? "") === (row.department ?? "") &&
      (existingRecord.profileImageInitials ?? "") === (row.profileImageInitials ?? "") &&
      supervisorMatches &&
      (existingRecord.orcidId ?? "") === (row.orcidId ?? "") &&
      (existingRecord.linkedInUrl ?? "") === (row.linkedInUrl ?? "") &&
      (existingRecord.googleScholarUrl ?? "") === (row.googleScholarUrl ?? "") &&
      (existingRecord.webOfScienceId ?? "") === (row.webOfScienceId ?? "") &&
      (existingRecord.bio ?? "") === (row.bio ?? "");

    if (matches) unchanged++;
    else toUpdate.push({ existingId: matchedId, row });
  });

  // Staff absent from the file are left alone. An import adds and updates; it
  // is not a statement that the file is the complete roster. Treating omission
  // as an instruction to delete meant importing a partial list -- one
  // department, one new intake -- proposed removing everybody else.
  return { toInsert, toUpdate, errors, unchanged };
}

/**
 * Explicit list of every (table, column) pair that points at a scientist row,
 * even when the column is a plain integer with no DB-level FK constraint
 * (which is the case for most references in this codebase). Includes
 * scientists.supervisor_id (self-reference).
 *
 * Keep this in sync with `// references scientists.id` comments in
 * shared/schema.ts. Unknown columns are silently filtered at runtime against
 * information_schema, so an entry that doesn't exist won't crash — it just
 * won't be checked.
 */
const SCIENTIST_REF_COLUMNS: Array<{ table: string; column: string }> = [
  { table: "scientists", column: "supervisor_id" },
  { table: "programs", column: "program_director_id" },
  { table: "programs", column: "research_co_lead_id" },
  { table: "programs", column: "clinical_co_lead_1_id" },
  { table: "programs", column: "clinical_co_lead_2_id" },
  { table: "projects", column: "principal_investigator_id" },
  { table: "research_activities", column: "budget_holder_id" },
  { table: "research_activities", column: "line_manager_id" },
  { table: "research_activities", column: "staff_scientist_id" },
  { table: "project_members", column: "scientist_id" },
  { table: "publication_authors", column: "scientist_id" },
  { table: "manuscript_history", column: "changed_by" },
  { table: "irb_applications", column: "principal_investigator_id" },
  { table: "irb_submissions", column: "submitted_by" },
  { table: "irb_documents", column: "uploaded_by" },
  { table: "ibc_applications", column: "principal_investigator_id" },
  { table: "ibc_application_comments", column: "author_id" },
  { table: "ibc_submissions", column: "submitted_by" },
  { table: "ibc_submissions", column: "reviewed_by" },
  { table: "ibc_documents", column: "uploaded_by" },
  { table: "irb_board_members", column: "scientist_id" },
  { table: "ibc_board_members", column: "scientist_id" },
  { table: "research_contracts", column: "lead_pi_id" },
  { table: "research_contract_documents", column: "uploaded_by" },
  { table: "rooms", column: "roomSupervisorId" },
  { table: "rooms", column: "roomManagerId" },
  { table: "grants", column: "lpi_id" },
  { table: "grant_progress_reports", column: "uploaded_by" },
  { table: "certifications", column: "scientist_id" },
  { table: "certifications", column: "uploaded_by" },
  { table: "pdf_import_history", column: "uploaded_by" },
  { table: "ra200_applications", column: "lead_scientist_id" },
  { table: "ra200_applications", column: "budget_holder_id" },
  { table: "ra200_applications", column: "submitted_by" },
  { table: "ra205a_applications", column: "lead_scientist_id" },
  { table: "ra205a_applications", column: "budget_holder_id" },
  { table: "ra205a_applications", column: "current_pi_id" },
  { table: "ra205a_applications", column: "new_pi_id" },
  { table: "ra205a_applications", column: "submitted_by" },
  { table: "branches", column: "head_id" },
  { table: "departments", column: "head_id" },
  { table: "sections", column: "head_id" },
];

let cachedRefColumns: Array<{ table: string; column: string }> | null = null;

async function getValidRefColumns(
  database: PgDatabase<any, any, any>
): Promise<Array<{ table: string; column: string }>> {
  if (cachedRefColumns) return cachedRefColumns;

  const rows = await database.execute<{ table_name: string; column_name: string }>(sql`
    SELECT table_name, column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
  `);
  const present = (rows as any).rows ?? (rows as any);
  const presentSet = new Set<string>(
    (present as Array<{ table_name: string; column_name: string }>).map(
      r => `${r.table_name}::${r.column_name}`
    )
  );

  cachedRefColumns = SCIENTIST_REF_COLUMNS.filter(rc =>
    presentSet.has(`${rc.table}::${rc.column}`)
  );
  return cachedRefColumns;
}

/**
 * For each candidate scientist id, find every row across all known
 * scientist-linked columns (FK-constrained or not) that still references it.
 * Returns a map keyed by scientist id. Scientists with zero references are
 * absent from the map.
 */
export async function findReferencingRecords(
  database: PgDatabase<any, any, any>,
  scientistIds: number[]
): Promise<Map<number, ReferencingRecord[]>> {
  const result = new Map<number, ReferencingRecord[]>();
  if (scientistIds.length === 0) return result;

  const refCols = await getValidRefColumns(database);
  const candidateSet = new Set(scientistIds);

  const ident = (s: string) => '"' + s.replace(/"/g, '""') + '"';

  // Skip the scientists self-ref here — the caller computes it in-memory
  // because the answer depends on in-flight updates (a row being updated to
  // a new supervisor shouldn't block its old supervisor's deletion).
  const nonSelfCols = refCols.filter(rc => rc.table !== "scientists");

  for (const fk of nonSelfCols) {
    const tbl = ident(fk.table);
    const col = ident(fk.column);

    const refRows = await database.execute<{ ref_id: number; pk_id: number }>(sql.raw(
      `SELECT ${col} AS ref_id, id AS pk_id
         FROM ${tbl}
        WHERE ${col} = ANY (ARRAY[${scientistIds.join(",")}]::int[])`
    ));

    const rows = (refRows as any).rows ?? (refRows as any);
    const byScientist = new Map<number, number[]>();
    for (const r of rows as Array<{ ref_id: number; pk_id: number }>) {
      if (!byScientist.has(r.ref_id)) byScientist.set(r.ref_id, []);
      byScientist.get(r.ref_id)!.push(r.pk_id);
    }

    byScientist.forEach((ids, scientistId) => {
      if (!result.has(scientistId)) result.set(scientistId, []);
      result.get(scientistId)!.push({
        table: fk.table,
        column: fk.column,
        count: ids.length,
        sampleIds: ids.slice(0, 5),
      });
    });
  }

  return result;
}

export function rowToInsertScientist(
  row: FileRow,
  emailToId: Map<string, number>
): InsertScientist {
  const supervisorId = row.supervisorEmail ? emailToId.get(row.supervisorEmail) ?? null : null;
  return {
    honorificTitle: row.honorificTitle,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    jobTitle: row.jobTitle ?? null,
    staffId: row.staffId ?? null,
    department: row.department ?? null,
    bio: row.bio ?? null,
    profileImageInitials:
      row.profileImageInitials ?? `${row.firstName[0] ?? ""}${row.lastName[0] ?? ""}`,
    supervisorId,
    staffType: row.staffType,
    isInvestigator: row.isInvestigator ?? false,
    departmentId: row.departmentId ?? null,
    sectionId: row.sectionId ?? null,
    orcidId: row.orcidId ?? null,
    linkedInUrl: row.linkedInUrl ?? null,
    googleScholarUrl: row.googleScholarUrl ?? null,
    webOfScienceId: row.webOfScienceId ?? null,
  } as InsertScientist;
}
