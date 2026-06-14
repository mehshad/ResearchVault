import ExcelJS from "exceljs";
import { parse as csvParse } from "csv-parse/sync";
import { stringify as csvStringify } from "csv-stringify/sync";
import { z } from "zod";
import { sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Scientist, InsertScientist } from "@shared/schema";

export const EXPORT_COLUMNS: Array<{ header: string; key: keyof Scientist | "supervisorEmail" }> = [
  { header: "Staff ID", key: "staffId" },
  { header: "Honorific Title", key: "honorificTitle" },
  { header: "First Name", key: "firstName" },
  { header: "Last Name", key: "lastName" },
  { header: "Email", key: "email" },
  { header: "Job Title", key: "jobTitle" },
  { header: "Staff Type", key: "staffType" },
  { header: "Department", key: "department" },
  { header: "Initials", key: "profileImageInitials" },
  { header: "Line Manager Email", key: "supervisorEmail" },
  { header: "ORCID ID", key: "orcidId" },
  { header: "LinkedIn URL", key: "linkedInUrl" },
  { header: "Google Scholar URL", key: "googleScholarUrl" },
  { header: "Web of Science ID", key: "webOfScienceId" },
  { header: "Bio", key: "bio" },
];

const HEADER_TO_KEY: Record<string, string> = EXPORT_COLUMNS.reduce((acc, col) => {
  acc[col.header.toLowerCase().trim()] = col.key as string;
  return acc;
}, {} as Record<string, string>);

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
        row[col.header] = v == null ? "" : v;
      }
    }
    return row;
  });
}

export async function buildExportBuffer(
  scientists: Scientist[],
  format: "xlsx" | "csv"
): Promise<{ buffer: Buffer; mime: string; filename: string }> {
  const rows = scientistsToRows(scientists);
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


const fileRowSchema = z.object({
  staffId: z.string().trim().optional(),
  honorificTitle: z.string().trim().min(1, "Honorific Title is required"),
  firstName: z.string().trim().min(1, "First Name is required"),
  lastName: z.string().trim().min(1, "Last Name is required"),
  email: z.string().trim().toLowerCase().email("Invalid email"),
  jobTitle: z.string().trim().optional(),
  staffType: z.enum(["scientific", "administrative"]).default("scientific"),
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

export interface DeleteCandidate {
  id: number;
  email: string;
  name: string;
  referencedBy?: ReferencingRecord[];
}

export interface ImportPreview {
  toInsert: FileRow[];
  toUpdate: Array<{ existingId: number; row: FileRow }>;
  toDelete: DeleteCandidate[];
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
  existing: Scientist[]
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
    matched.push({ row, rowNumber, matchedId: matchedRecord ? matchedRecord.id : null });
  });

  // Supervisor emails must resolve against the FINAL intended set — i.e.
  // every row that will exist in the DB after the import (matched updates,
  // unchanged matches, and new inserts). This deliberately excludes the
  // emails of existing scientists that aren't in the file, since those rows
  // will be deleted and pointing at them would resolve to nothing at apply
  // time.
  const allKnownEmails = new Set<string>(matched.map(m => m.row.email));

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
    const supervisorIdNow = row.supervisorEmail
      ? existing.find(s => s.email.toLowerCase() === row.supervisorEmail)?.id ?? null
      : null;

    const matches =
      (existingRecord.staffId ?? "") === (row.staffId ?? "") &&
      existingRecord.honorificTitle === row.honorificTitle &&
      existingRecord.firstName === row.firstName &&
      existingRecord.lastName === row.lastName &&
      existingRecord.email.toLowerCase() === row.email &&
      (existingRecord.jobTitle ?? "") === (row.jobTitle ?? "") &&
      existingRecord.staffType === row.staffType &&
      (existingRecord.department ?? "") === (row.department ?? "") &&
      (existingRecord.profileImageInitials ?? "") === (row.profileImageInitials ?? "") &&
      (existingRecord.supervisorId ?? null) === supervisorIdNow &&
      (existingRecord.orcidId ?? "") === (row.orcidId ?? "") &&
      (existingRecord.linkedInUrl ?? "") === (row.linkedInUrl ?? "") &&
      (existingRecord.googleScholarUrl ?? "") === (row.googleScholarUrl ?? "") &&
      (existingRecord.webOfScienceId ?? "") === (row.webOfScienceId ?? "") &&
      (existingRecord.bio ?? "") === (row.bio ?? "");

    if (matches) unchanged++;
    else toUpdate.push({ existingId: matchedId, row });
  });

  // Anything in DB but not matched → delete
  const matchedIds = new Set(matched.filter(m => m.matchedId != null).map(m => m.matchedId!));
  const toDelete: DeleteCandidate[] = existing
    .filter(s => !matchedIds.has(s.id))
    .map(s => ({
      id: s.id,
      email: s.email,
      name: `${s.honorificTitle} ${s.firstName} ${s.lastName}`.trim(),
    }));

  return { toInsert, toUpdate, toDelete, errors, unchanged };
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

/**
 * Compute scientists.supervisor_id self-reference blockers, taking the
 * planned import into account: a row whose supervisor will be reassigned by
 * this import is NOT a blocker for the old supervisor's deletion, and a
 * referencing row that is itself being deleted is also not a blocker.
 */
function computeSelfRefBlockers(
  toDeleteIds: Set<number>,
  existing: Scientist[],
  toUpdateByExistingId: Map<number, FileRow>,
  emailToId: Map<string, number>
): Map<number, ReferencingRecord> {
  const byTarget = new Map<number, number[]>();
  for (const s of existing) {
    if (s.supervisorId == null) continue;
    if (!toDeleteIds.has(s.supervisorId)) continue;
    if (toDeleteIds.has(s.id)) continue; // referencer also being deleted

    // If s is being updated, check its NEW supervisor — only block if it
    // still points at the deletion target.
    const newRow = toUpdateByExistingId.get(s.id);
    if (newRow) {
      const newSupId = newRow.supervisorEmail
        ? emailToId.get(newRow.supervisorEmail) ?? null
        : null;
      if (newSupId !== s.supervisorId) continue; // reassigned away
    }

    if (!byTarget.has(s.supervisorId)) byTarget.set(s.supervisorId, []);
    byTarget.get(s.supervisorId)!.push(s.id);
  }

  const out = new Map<number, ReferencingRecord>();
  byTarget.forEach((ids, targetId) => {
    out.set(targetId, {
      table: "scientists",
      column: "supervisor_id",
      count: ids.length,
      sampleIds: ids.slice(0, 5),
    });
  });
  return out;
}

export async function enrichDeletesWithReferences(
  preview: ImportPreview,
  database: PgDatabase<any, any, any>,
  existing: Scientist[]
): Promise<void> {
  if (preview.toDelete.length === 0) return;

  const toDeleteIds = new Set(preview.toDelete.map(d => d.id));

  // Build the post-import email→id map the apply step will use, so the
  // self-reference check reflects the intended final state.
  const emailToId = new Map<string, number>();
  for (const s of existing) emailToId.set(s.email.toLowerCase(), s.id);
  for (const { existingId, row } of preview.toUpdate) emailToId.set(row.email, existingId);
  for (const d of preview.toDelete) emailToId.delete(d.email.toLowerCase());
  // toInsert rows have no id yet, so unresolved-on-insert is fine here —
  // a row referencing a new scientist's email simply won't appear as a
  // self-ref blocker (the new scientist isn't a delete candidate anyway).

  const toUpdateByExistingId = new Map<number, FileRow>(
    preview.toUpdate.map(u => [u.existingId, u.row])
  );

  const externalRefs = await findReferencingRecords(database, preview.toDelete.map(d => d.id));
  const selfRefs = computeSelfRefBlockers(toDeleteIds, existing, toUpdateByExistingId, emailToId);

  for (const d of preview.toDelete) {
    const combined: ReferencingRecord[] = [...(externalRefs.get(d.id) ?? [])];
    const self = selfRefs.get(d.id);
    if (self) combined.push(self);
    if (combined.length > 0) {
      d.referencedBy = combined;
      const summary = combined
        .map(x => `${x.table}.${x.column} (${x.count} row${x.count === 1 ? "" : "s"}; ids: ${x.sampleIds.join(", ")}${x.count > x.sampleIds.length ? "…" : ""})`)
        .join("; ");
      preview.errors.push({
        rowNumber: 0,
        identifier: `${d.name} <${d.email}>`,
        errors: [`Cannot delete: still referenced by ${summary}. Reassign these rows in the import file before re-importing.`],
      });
    }
  }
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
    orcidId: row.orcidId ?? null,
    linkedInUrl: row.linkedInUrl ?? null,
    googleScholarUrl: row.googleScholarUrl ?? null,
    webOfScienceId: row.webOfScienceId ?? null,
  } as InsertScientist;
}
