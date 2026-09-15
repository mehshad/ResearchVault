/**
 * Table sheets: the bulk-data workbooks for the tables the hand-written
 * sections never covered (#14).
 *
 * The archive used to restore 26 of the 58 tables. Everything a page reads
 * that was missing -- grant/SDR and publication/SDR links, manuscript
 * history, reference lists, contract scope and extensions, progress reports,
 * data management plans, settings, ownership rules, feature requests, the
 * team page, the audit log -- is declared here as a column table over its
 * database table, and one engine exports, previews and applies all of them.
 * A new table costs a declaration, not a preview function and an apply
 * function of its own.
 *
 * Conventions match the hand-written sheets: a blank cell leaves an existing
 * value alone, CLEAR erases it, references are business keys (a grant's
 * project number, an SDR number, a scientist's email, a user's username),
 * and a reference to a row created earlier in the same workbook resolves at
 * apply time, after that sheet has been written.
 *
 * Deliberately not here: the PMO application forms (RA-200 / RA-205A), the
 * IRB and IBC working records (submissions, documents, comments, rooms, PPE,
 * board members), the PDF import log, and uploaded files themselves. See
 * ARCHIVE_EXCLUSIONS, which the hub shows in the interface.
 */
import { and, eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  auditLog,
  certificationConfigurations,
  contractTypes,
  dataManagementPlans,
  featureRequests,
  grantProgressReports,
  grantResearchActivities,
  grantStatuses,
  grants,
  institutions,
  manuscriptHistory,
  ownershipOverrides,
  publicationResearchActivities,
  publications,
  researchActivities,
  researchContractDocuments,
  researchContractExtensions,
  researchContractScopeItems,
  researchContracts,
  scientists,
  systemConfigurations,
  teamMembers,
  users,
} from "@shared/schema";
import { referenceNameKey } from "@shared/institutions";

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

export type TableSheetSection =
  | "research-management"
  | "pmo-office"
  | "research-services"
  | "research-output"
  | "access-control"
  | "platform";

export type CellType = "text" | "int" | "bool" | "date" | "timestamp" | "json" | "list";

/** What a reference column names; each kind has one business key. */
export type RefKind = "grant" | "sdr" | "contract" | "contractExtension" | "publication" | "scientist" | "user";

export interface TableCol {
  header: string;
  /** Row key in the parsed workbook and the export row. */
  key: string;
  /** Field on the database row (drizzle column name). */
  field: string;
  required?: boolean;
  type?: CellType;
  ref?: RefKind;
  /** Part of the business key that matches an existing row. */
  keyPart?: boolean;
  description?: string;
}

export interface TableSheet {
  name: string;
  description: string;
  businessKey: string;
  section: TableSheetSection;
  /** Before or after the section's hand-written sheets, in apply order. */
  position: "before" | "after";
  table: PgTable;
  tableName: string;
  cols: TableCol[];
  /** Fields computed from the row on every write, never in the workbook. */
  derived?: Record<string, (data: Record<string, unknown>) => unknown>;
  /** One row at most; the workbook row updates it whatever it holds. */
  singleton?: boolean;
  /** Rows of this sheet can be referenced by later sheets under this kind. */
  providesRef?: RefKind;
}

const col = (header: string, key: string, extra: Partial<TableCol> = {}): TableCol =>
  ({ header, key, field: key, ...extra });

const PUBLICATION_REF_DESCRIPTION =
  "The DOI; or PMID:<number>; or, for a manuscript with neither, the title followed by \" @ \" and the SDR number";

export const TABLE_SHEETS: TableSheet[] = [
  // ---- research-services: reference lists first, links and children after ----
  {
    name: "Institutions",
    description: "Collaborating institutions the office curates",
    businessKey: "institution name",
    section: "research-services",
    position: "before",
    table: institutions,
    tableName: "institutions",
    cols: [
      col("Institution Name", "name", { required: true, keyPart: true }),
      col("Country", "country"),
    ],
    derived: { nameKey: (data) => referenceNameKey(String(data.name ?? "")) },
  },
  {
    name: "Grant Statuses",
    description: "The grant status list and the stage each status belongs to",
    businessKey: "status value",
    section: "research-services",
    position: "before",
    table: grantStatuses,
    tableName: "grant_statuses",
    cols: [
      col("Value", "value", { required: true, keyPart: true }),
      col("Label", "label", { required: true }),
      col("Stage", "stage", { required: true }),
      col("Sort Order", "sortOrder", { required: true, type: "int" }),
      col("Built-in", "isBuiltIn", { type: "bool", description: "Yes or No" }),
      col("Retired At", "retiredAt", { type: "timestamp" }),
    ],
  },
  {
    name: "Contract Types",
    description: "The contract type list",
    businessKey: "type name",
    section: "research-services",
    position: "before",
    table: contractTypes,
    tableName: "contract_types",
    cols: [
      col("Type Name", "name", { required: true, keyPart: true }),
      col("Sort Order", "sortOrder", { required: true, type: "int" }),
      col("Built-in", "isBuiltIn", { type: "bool", description: "Yes or No" }),
    ],
    derived: { nameKey: (data) => referenceNameKey(String(data.name ?? "")) },
  },
  {
    name: "Grant SDR Links",
    description: "Which SDRs each grant funds",
    businessKey: "grant project number + SDR number",
    section: "research-services",
    position: "after",
    table: grantResearchActivities,
    tableName: "grant_research_activities",
    cols: [
      col("Grant Project Number", "grantId", { required: true, ref: "grant", keyPart: true, description: "Must match a row in Grants" }),
      col("SDR Number", "researchActivityId", { required: true, ref: "sdr", keyPart: true }),
      col("Linked Date", "linkedDate", { type: "timestamp" }),
    ],
  },
  {
    name: "Grant Progress Reports",
    description: "Progress reports filed against a grant (the report files themselves are not in the archive)",
    businessKey: "grant project number + report title",
    section: "research-services",
    position: "after",
    table: grantProgressReports,
    tableName: "grant_progress_reports",
    cols: [
      col("Grant Project Number", "grantId", { required: true, ref: "grant", keyPart: true }),
      col("Report Title", "reportTitle", { required: true, keyPart: true }),
      col("Report Period", "reportPeriod"),
      col("Submission Date", "submissionDate", { type: "date" }),
      col("Acceptance Date", "acceptanceDate", { type: "date" }),
      col("File Name", "fileName"),
      col("File Path", "filePath"),
      col("File Size", "fileSize", { type: "int" }),
      col("Uploaded By Username", "uploadedBy", { required: true, ref: "user" }),
      col("Notes", "notes"),
    ],
  },
  {
    name: "Contract Scope Items",
    description: "The scope of work of each research contract",
    businessKey: "contract number + position",
    section: "research-services",
    position: "after",
    table: researchContractScopeItems,
    tableName: "research_contract_scope_items",
    cols: [
      col("Contract Number", "contractId", { required: true, ref: "contract", keyPart: true }),
      col("Position", "position", { required: true, type: "int", keyPart: true }),
      col("Description", "description", { required: true }),
      col("Due Date", "dueDate", { type: "date" }),
      col("Acceptance Criteria", "acceptanceCriteria"),
    ],
  },
  {
    name: "Contract Extensions",
    description: "Extensions granted to a research contract",
    businessKey: "contract number + sequence number",
    section: "research-services",
    position: "after",
    table: researchContractExtensions,
    tableName: "research_contract_extensions",
    providesRef: "contractExtension",
    cols: [
      col("Contract Number", "contractId", { required: true, ref: "contract", keyPart: true }),
      col("Sequence Number", "sequenceNumber", { required: true, type: "int", keyPart: true }),
      col("Requested At", "requestedAt", { type: "timestamp" }),
      col("Approved At", "approvedAt", { type: "timestamp" }),
      col("New End Date", "newEndDate", { required: true, type: "date" }),
      col("Signature Date", "signatureDate", { type: "date" }),
      col("Notes", "notes"),
    ],
  },
  {
    name: "Contract Documents",
    description: "Documents attached to contracts and extensions (metadata; the files live in object storage)",
    businessKey: "object key",
    section: "research-services",
    position: "after",
    table: researchContractDocuments,
    tableName: "research_contract_documents",
    cols: [
      col("Object Key", "objectKey", { required: true, keyPart: true }),
      col("Contract Number", "contractId", { ref: "contract" }),
      col("Extension", "extensionId", { ref: "contractExtension", description: "Contract number, #, sequence number -- e.g. RC-2026-004#2" }),
      col("File Name", "fileName", { required: true }),
      col("MIME Type", "mimeType"),
      col("File Size", "fileSize", { type: "int" }),
      col("Uploaded By Username", "uploadedByUserId", { required: true, ref: "user" }),
      col("Uploaded At", "uploadedAt", { type: "timestamp" }),
      col("Notes", "notes"),
    ],
  },

  // ---- pmo-office ----
  {
    name: "Data Management Plans",
    description: "Data management plans attached to SDRs",
    businessKey: "DMP number",
    section: "pmo-office",
    position: "after",
    table: dataManagementPlans,
    tableName: "data_management_plans",
    cols: [
      col("DMP Number", "dmpNumber", { required: true, keyPart: true }),
      col("SDR Number", "researchActivityId", { required: true, ref: "sdr" }),
      col("Title", "title", { required: true }),
      col("Description", "description"),
      col("Data Collection Methods", "dataCollectionMethods"),
      col("Data Storage Plan", "dataStoragePlan"),
      col("Data Sharing Plan", "dataSharingPlan"),
      col("Retention Period", "retentionPeriod"),
    ],
  },

  // ---- research-output ----
  {
    name: "Publication SDR Links",
    description: "Additional SDRs a publication is credited to, beyond its primary one",
    businessKey: "publication + SDR number",
    section: "research-output",
    position: "after",
    table: publicationResearchActivities,
    tableName: "publication_research_activities",
    cols: [
      col("Publication", "publicationId", { required: true, ref: "publication", keyPart: true, description: PUBLICATION_REF_DESCRIPTION }),
      col("SDR Number", "researchActivityId", { required: true, ref: "sdr", keyPart: true }),
    ],
  },
  {
    name: "Manuscript History",
    description: "Every status change and edit recorded against a publication",
    businessKey: "publication + recorded at + to status",
    section: "research-output",
    position: "after",
    table: manuscriptHistory,
    tableName: "manuscript_history",
    cols: [
      col("Publication", "publicationId", { required: true, ref: "publication", keyPart: true, description: PUBLICATION_REF_DESCRIPTION }),
      col("Recorded At", "createdAt", { required: true, type: "timestamp", keyPart: true }),
      col("To Status", "toStatus", { required: true, keyPart: true }),
      col("From Status", "fromStatus"),
      col("Changed Field", "changedField"),
      col("Old Value", "oldValue"),
      col("New Value", "newValue"),
      col("Changed By Username", "changedBy", { ref: "user" }),
      col("Change Reason", "changeReason"),
    ],
  },

  // ---- research-management ----
  {
    name: "Certification Configuration",
    description: "CITI integration and notification settings (the API key and secret are never exported)",
    businessKey: "single row",
    section: "research-management",
    position: "after",
    table: certificationConfigurations,
    tableName: "certification_configurations",
    singleton: true,
    cols: [
      col("Institution Name", "institutionName"),
      col("CITI API Endpoint", "citiApiEndpoint"),
      col("Notification Recipients", "notificationRecipients", { type: "json" }),
      col("Notification Days", "notificationDays", { type: "json" }),
      col("Email Enabled", "emailEnabled", { required: true, type: "bool" }),
      col("Auto Import Enabled", "autoImportEnabled", { required: true, type: "bool" }),
      col("Last Sync Date", "lastSyncDate", { type: "timestamp" }),
    ],
  },

  // ---- access-control ----
  {
    name: "Ownership Overrides",
    description: "Access granted by relationship to a record, per module",
    businessKey: "module + relationship",
    section: "access-control",
    position: "after",
    table: ownershipOverrides,
    tableName: "ownership_overrides",
    cols: [
      col("Module", "module", { required: true, keyPart: true }),
      col("Relationship", "relationship", { required: true, keyPart: true }),
      col("Granted Access", "grantedAccess", { required: true }),
      col("Description", "description"),
    ],
  },

  // ---- platform ----
  {
    name: "System Configurations",
    description: "Application settings by key",
    businessKey: "key",
    section: "platform",
    position: "after",
    table: systemConfigurations,
    tableName: "system_configurations",
    cols: [
      col("Key", "key", { required: true, keyPart: true }),
      col("Value (JSON)", "value", { required: true, type: "json" }),
      col("Category", "category", { required: true }),
      col("Description", "description"),
      col("User Configurable", "isUserConfigurable", { required: true, type: "bool" }),
    ],
  },
  {
    name: "Team Members",
    description: "The people shown on the team page",
    businessKey: "first name + last name",
    section: "platform",
    position: "after",
    table: teamMembers,
    tableName: "team_members",
    cols: [
      col("First Name", "firstName", { required: true, keyPart: true }),
      col("Last Name", "lastName", { required: true, keyPart: true }),
      col("Title", "title"),
      col("Categories", "categories", { required: true, type: "list", description: "Semicolon-separated" }),
      col("Element Type", "elementType"),
      col("Institution", "institution"),
      col("Email", "email"),
      col("Bio", "bio"),
      col("Photo URL", "photoUrl"),
      col("LinkedIn URL", "linkedInUrl"),
      col("Display Order", "displayOrder", { type: "int" }),
      col("Active", "isActive", { type: "bool" }),
    ],
  },
  {
    name: "Feature Requests",
    description: "Feature requests and review findings, with their votes and notes",
    businessKey: "title + requested by + submitted at",
    section: "platform",
    position: "after",
    table: featureRequests,
    tableName: "feature_requests",
    cols: [
      col("Title", "title", { required: true, keyPart: true }),
      col("Requested By", "requestedBy", { required: true, keyPart: true }),
      col("Submitted At", "createdAt", { required: true, type: "timestamp", keyPart: true }),
      col("Status", "status"),
      col("Priority", "priority"),
      col("Category", "category"),
      col("Description", "description", { required: true }),
      col("Original Request", "originalRequest", { required: true }),
      col("Enhanced Prompt", "enhancedPrompt"),
      col("Approved Prompt", "approvedPrompt"),
      col("AI Provider", "aiProvider"),
      col("Implementation Notes", "implementationNotes"),
      col("Estimated Effort", "estimatedEffort"),
      col("Tags", "tags", { type: "list" }),
      col("Upvotes", "upvotes", { type: "int" }),
      col("Upvoted By", "upvotedBy", { type: "list" }),
    ],
  },
  {
    name: "Audit Log",
    description: "Who changed what, when; restored rows keep their original time and actor",
    businessKey: "table + record id + action + changed at + route",
    section: "platform",
    position: "after",
    table: auditLog,
    tableName: "audit_log",
    cols: [
      col("Table", "tableName", { required: true, keyPart: true }),
      col("Record ID", "recordId", { type: "int", keyPart: true }),
      col("Action", "action", { required: true, keyPart: true }),
      col("Changed At", "changedAt", { required: true, type: "timestamp", keyPart: true }),
      col("Route", "route", { keyPart: true }),
      col("Changed By Username", "changedBy", { ref: "user" }),
      col("Changed Fields", "changedFields", { type: "json" }),
      col("Old Values", "oldValues", { type: "json" }),
      col("New Values", "newValues", { type: "json" }),
      col("Reason", "reason"),
      col("IP Address", "ipAddress"),
      col("User Agent", "userAgent"),
    ],
  },
];

/** What the archive still leaves out, for the interface and the README. */
export const ARCHIVE_EXCLUSIONS: Array<{ area: string; detail: string }> = [
  { area: "PMO application forms", detail: "RA-200 and RA-205A applications are not exported or restored." },
  { area: "IRB working records", detail: "Submissions, documents and board members; the application register itself is included." },
  { area: "IBC working records", detail: "Submissions, documents, comments, rooms, PPE, backbone source rooms, SDR links and board members; the application register itself is included." },
  { area: "Uploaded files", detail: "Certificates, contract documents, progress reports and other uploads live in object storage; the archive carries their metadata only." },
  { area: "PDF import log", detail: "The certificate OCR import history refers to uploaded files and is not exported." },
  { area: "Credentials", detail: "Passwords, the CITI API key and secret, and sessions are never exported." },
];

export const TABLE_SHEET_BY_NAME = new Map(TABLE_SHEETS.map((sheet) => [sheet.name, sheet]));

export function tableSheetsFor(section: string, position?: "before" | "after"): TableSheet[] {
  return TABLE_SHEETS.filter((sheet) => sheet.section === section && (!position || sheet.position === position));
}

/** The hub's column shape: only calendar dates need the Excel serial conversion. */
export function hubColumns(sheet: TableSheet): Array<{ header: string; key: string; required?: boolean; description?: string; type?: "date" }> {
  return sheet.cols.map((c) => ({
    header: c.header,
    key: c.key,
    required: c.required,
    description: c.description,
    ...(c.type === "date" ? { type: "date" as const } : {}),
  }));
}

// ---------------------------------------------------------------------------
// References: business key <-> id for every kind a sheet can name
// ---------------------------------------------------------------------------

export interface RefIndex {
  idByKey: Record<RefKind, Map<string, number>>;
  keyById: Record<RefKind, Map<number, string>>;
}

export const normalizeRefKey = (value: unknown): string => String(value ?? "").trim().toLowerCase();

function emptyRefIndex(): RefIndex {
  const kinds: RefKind[] = ["grant", "sdr", "contract", "contractExtension", "publication", "scientist", "user"];
  const idByKey = {} as RefIndex["idByKey"];
  const keyById = {} as RefIndex["keyById"];
  for (const kind of kinds) {
    idByKey[kind] = new Map();
    keyById[kind] = new Map();
  }
  return { idByKey, keyById };
}

/**
 * The export form of a publication reference, and every form the workbook
 * may use for it. Mirrors the keys the Publications sheet accepts.
 */
export function publicationRefKeys(row: {
  doi?: string | null;
  pmid?: string | null;
  title?: string | null;
  sdrNumber?: string | null;
}): { display: string; keys: string[] } {
  const doi = (row.doi ?? "").trim();
  const pmid = (row.pmid ?? "").trim();
  const title = (row.title ?? "").trim();
  const sdr = (row.sdrNumber ?? "").trim();
  const keys: string[] = [];
  if (doi) keys.push(doi.toLowerCase());
  if (pmid) keys.push(`pmid:${pmid.toLowerCase()}`);
  if (title && sdr) keys.push(`${title.toLowerCase()} @ ${sdr.toLowerCase()}`);
  const display = doi || (pmid ? `PMID:${pmid}` : title && sdr ? `${title} @ ${sdr}` : "");
  return { display, keys };
}

/** Every kind the section's table sheets reference (plus what they provide). */
export function refKindsFor(section: string): Set<RefKind> {
  const kinds = new Set<RefKind>();
  for (const sheet of tableSheetsFor(section)) {
    for (const c of sheet.cols) if (c.ref) kinds.add(c.ref);
    if (sheet.providesRef) kinds.add(sheet.providesRef);
  }
  if (kinds.has("publication")) kinds.add("sdr");
  if (kinds.has("contractExtension")) kinds.add("contract");
  return kinds;
}

// db is `any`-friendly here on purpose: the hub passes either db or a tx.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Executor = any;

export async function loadRefIndex(kinds: Set<RefKind>, executor: Executor): Promise<RefIndex> {
  const index = emptyRefIndex();
  const put = (kind: RefKind, id: number, display: string, keys: string[] = [normalizeRefKey(display)]) => {
    index.keyById[kind].set(id, display);
    for (const key of keys) if (key) index.idByKey[kind].set(key, id);
  };
  if (kinds.has("grant")) {
    for (const row of await executor.select({ id: grants.id, key: grants.projectNumber }).from(grants)) put("grant", row.id, row.key);
  }
  if (kinds.has("sdr")) {
    for (const row of await executor.select({ id: researchActivities.id, key: researchActivities.sdrNumber }).from(researchActivities)) put("sdr", row.id, row.key);
  }
  if (kinds.has("contract")) {
    for (const row of await executor.select({ id: researchContracts.id, key: researchContracts.contractNumber }).from(researchContracts)) put("contract", row.id, row.key);
  }
  if (kinds.has("contractExtension")) {
    const rows = await executor
      .select({ id: researchContractExtensions.id, contract: researchContracts.contractNumber, seq: researchContractExtensions.sequenceNumber })
      .from(researchContractExtensions)
      .innerJoin(researchContracts, eq(researchContractExtensions.contractId, researchContracts.id));
    for (const row of rows) put("contractExtension", row.id, `${row.contract}#${row.seq}`);
  }
  if (kinds.has("publication")) {
    const rows = await executor
      .select({ id: publications.id, doi: publications.doi, pmid: publications.pmid, title: publications.title, sdrNumber: researchActivities.sdrNumber })
      .from(publications)
      .leftJoin(researchActivities, eq(publications.researchActivityId, researchActivities.id));
    for (const row of rows) {
      const { display, keys } = publicationRefKeys(row);
      if (display) put("publication", row.id, display, keys);
    }
  }
  if (kinds.has("scientist")) {
    for (const row of await executor.select({ id: scientists.id, key: scientists.email }).from(scientists)) put("scientist", row.id, row.key);
  }
  if (kinds.has("user")) {
    for (const row of await executor.select({ id: users.id, key: users.username }).from(users)) put("user", row.id, row.key);
  }
  return index;
}

/**
 * Keys that a workbook creates in its own hand-written sheets, so a table
 * sheet may reference them before they exist in the database.
 */
export function collectInFileRefs(sheets: Array<{ name: string; rows: Record<string, string>[] }>): Partial<Record<RefKind, Set<string>>> {
  const out: Partial<Record<RefKind, Set<string>>> = {};
  const add = (kind: RefKind, value: string) => {
    const key = normalizeRefKey(value);
    if (!key) return;
    (out[kind] ??= new Set()).add(key);
  };
  for (const sheet of sheets) {
    switch (sheet.name) {
      case "Grants": sheet.rows.forEach((r) => add("grant", r.projectNumber ?? "")); break;
      case "Research Activities": sheet.rows.forEach((r) => add("sdr", r.sdrNumber ?? "")); break;
      case "Research Contracts": sheet.rows.forEach((r) => add("contract", r.contractNumber ?? "")); break;
      case "Scientists": sheet.rows.forEach((r) => add("scientist", r.email ?? "")); break;
      case "User Accounts": sheet.rows.forEach((r) => add("user", r.username ?? "")); break;
      case "Publications":
        sheet.rows.forEach((r) => {
          for (const key of publicationRefKeys({ doi: r.doi, pmid: r.pmid, title: r.title, sdrNumber: r.sdrNumber }).keys) add("publication", key);
        });
        break;
      default: {
        const def = TABLE_SHEET_BY_NAME.get(sheet.name);
        if (def?.providesRef) {
          sheet.rows.forEach((r) => add(def.providesRef!, def.cols.filter((c) => c.keyPart).map((c) => (r[c.key] ?? "").trim()).join("#")));
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cell formatting and parsing
// ---------------------------------------------------------------------------

const CLEAR = "clear";
const isClear = (raw: string) => raw.trim().toLowerCase() === CLEAR;

export function formatCell(value: unknown, type: CellType = "text"): string {
  if (value == null) return "";
  switch (type) {
    case "bool": return value ? "Yes" : "No";
    case "date": return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
    case "timestamp": return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
    case "json": return JSON.stringify(value);
    case "list": return Array.isArray(value) ? value.join("; ") : String(value);
    default: return String(value);
  }
}

/** Parses one non-blank, non-CLEAR cell; pushes to errors and returns undefined when it cannot. */
export function parseCell(raw: string, c: TableCol, errors: string[]): unknown {
  const label = c.header;
  switch (c.type) {
    case "int": {
      const n = Number(raw);
      if (!Number.isInteger(n)) { errors.push(`${label}: expected a whole number (got "${raw}")`); return undefined; }
      return n;
    }
    case "bool": {
      const v = raw.trim().toLowerCase();
      if (["yes", "y", "true", "1"].includes(v)) return true;
      if (["no", "n", "false", "0"].includes(v)) return false;
      errors.push(`${label}: expected Yes or No (got "${raw}")`);
      return undefined;
    }
    case "date": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(new Date(`${raw}T00:00:00Z`).getTime())) {
        errors.push(`${label}: expected YYYY-MM-DD (got "${raw}")`);
        return undefined;
      }
      return raw;
    }
    case "timestamp": {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) { errors.push(`${label}: expected a date or date-time (got "${raw}")`); return undefined; }
      return d;
    }
    case "json": {
      try { return JSON.parse(raw); } catch { errors.push(`${label}: expected JSON (got "${raw.slice(0, 40)}")`); return undefined; }
    }
    case "list": return raw.split(";").map((v) => v.trim()).filter(Boolean);
    default: return raw;
  }
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export interface TableRowEntry {
  sheetName: string;
  rowNumber: number;
  action: "create" | "update" | "skip" | "error";
  key: string;
  reason?: string;
  changes?: string[];
  data?: Record<string, unknown>;
}

const KEY_SEPARATOR = " ";

/** The business key of a database row, in the workbook's terms. */
export function existingRowKey(sheet: TableSheet, row: Record<string, unknown>, refs: RefIndex): string {
  if (sheet.singleton) return "configuration";
  return sheet.cols
    .filter((c) => c.keyPart)
    .map((c) => {
      const value = row[c.field];
      if (c.ref) return normalizeRefKey(value == null ? "" : refs.keyById[c.ref].get(Number(value)) ?? "");
      return normalizeRefKey(formatCell(value, c.type));
    })
    .join(KEY_SEPARATOR);
}

function comparable(value: unknown, type?: CellType): string {
  if (value == null) return "";
  if (type === "timestamp" || value instanceof Date) return new Date(value as string | Date).toISOString();
  if (type === "json" || type === "list" || Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function previewTableSheet(
  sheet: TableSheet,
  rows: Record<string, string>[],
  existingRows: Record<string, unknown>[],
  refs: RefIndex,
  inFile: Partial<Record<RefKind, Set<string>>> = {},
): TableRowEntry[] {
  const existingByKey = new Map<string, Record<string, unknown>>();
  const ambiguous = new Set<string>();
  for (const row of existingRows) {
    const key = existingRowKey(sheet, row, refs);
    if (existingByKey.has(key)) ambiguous.add(key);
    else existingByKey.set(key, row);
  }
  const inFileCounts = new Map<string, number>();
  const keyOf = (row: Record<string, string>) =>
    sheet.singleton
      ? "configuration"
      : sheet.cols.filter((c) => c.keyPart).map((c) => normalizeRefKey(row[c.key] ?? "")).join(KEY_SEPARATOR);
  rows.forEach((row) => { const k = keyOf(row); inFileCounts.set(k, (inFileCounts.get(k) ?? 0) + 1); });

  return rows.map((row, index) => {
    const rowNumber = index + 1;
    const key = keyOf(row);
    const display = sheet.singleton
      ? "configuration"
      : sheet.cols.filter((c) => c.keyPart).map((c) => (row[c.key] ?? "").trim()).filter(Boolean).join(" + ");
    const errors: string[] = [];
    if ((inFileCounts.get(key) ?? 0) > 1) errors.push(`Duplicate ${sheet.businessKey} in workbook`);
    if (ambiguous.has(key)) errors.push(`More than one existing row matches this ${sheet.businessKey}`);
    const existing = sheet.singleton ? existingRows[0] : existingByKey.get(key);
    const data: Record<string, unknown> = {};

    for (const c of sheet.cols) {
      const raw = (row[c.key] ?? "").trim();
      if (raw === "") {
        if (c.required && !existing) errors.push(`${c.header} is required`);
        else if (!existing) data[c.field] = null;
        continue;
      }
      if (isClear(raw)) {
        if (c.required) errors.push(`${c.header} is required and cannot be cleared`);
        else data[c.field] = null;
        continue;
      }
      if (c.ref) {
        const refKey = normalizeRefKey(raw);
        const id = refs.idByKey[c.ref].get(refKey);
        if (id !== undefined) data[c.field] = id;
        else if (inFile[c.ref]?.has(refKey)) data[`_ref_${c.field}`] = { kind: c.ref, key: raw };
        else errors.push(`${c.header} "${raw}" was not found`);
        continue;
      }
      const value = parseCell(raw, c, errors);
      if (value !== undefined) data[c.field] = value;
    }
    for (const [field, derive] of Object.entries(sheet.derived ?? {})) {
      if (!existing || sheet.cols.some((c) => data[c.field] !== undefined)) data[field] = derive({ ...(existing ?? {}), ...data });
    }

    if (errors.length) return { sheetName: sheet.name, rowNumber, action: "error", key: display, reason: errors.join("; ") };
    if (!existing) return { sheetName: sheet.name, rowNumber, action: "create", key: display, data };
    const changes = sheet.cols
      .filter((c) => !c.keyPart && data[c.field] !== undefined)
      .filter((c) => comparable(existing[c.field], c.type) !== comparable(data[c.field], c.type))
      .map((c) => c.field);
    if (!changes.length) return { sheetName: sheet.name, rowNumber, action: "skip", key: display, reason: "No changes" };
    return { sheetName: sheet.name, rowNumber, action: "update", key: display, changes, data: { ...data, _existingId: existing.id } };
  });
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/** A reference to a row the same workbook created earlier, looked up now that it exists. */
async function lookupRefId(tx: Executor, kind: RefKind, rawKey: string): Promise<number | undefined> {
  const key = normalizeRefKey(rawKey);
  const one = async (query: Promise<Array<{ id: number }>>) => (await query)[0]?.id;
  switch (kind) {
    case "grant": return one(tx.select({ id: grants.id }).from(grants).where(sql`lower(${grants.projectNumber}) = ${key}`));
    case "sdr": return one(tx.select({ id: researchActivities.id }).from(researchActivities).where(sql`lower(${researchActivities.sdrNumber}) = ${key}`));
    case "contract": return one(tx.select({ id: researchContracts.id }).from(researchContracts).where(sql`lower(${researchContracts.contractNumber}) = ${key}`));
    case "scientist": return one(tx.select({ id: scientists.id }).from(scientists).where(sql`lower(${scientists.email}) = ${key}`));
    case "user": return one(tx.select({ id: users.id }).from(users).where(sql`lower(${users.username}) = ${key}`));
    case "contractExtension": {
      const [contract, seq] = key.split("#");
      return one(tx.select({ id: researchContractExtensions.id }).from(researchContractExtensions)
        .innerJoin(researchContracts, eq(researchContractExtensions.contractId, researchContracts.id))
        .where(and(sql`lower(${researchContracts.contractNumber}) = ${contract}`, eq(researchContractExtensions.sequenceNumber, Number(seq)))));
    }
    case "publication": {
      if (key.startsWith("pmid:")) {
        return one(tx.select({ id: publications.id }).from(publications).where(sql`lower(${publications.pmid}) = ${key.slice(5)}`));
      }
      const at = key.lastIndexOf(" @ ");
      if (at > 0) {
        const title = key.slice(0, at);
        const sdr = key.slice(at + 3);
        return one(tx.select({ id: publications.id }).from(publications)
          .innerJoin(researchActivities, eq(publications.researchActivityId, researchActivities.id))
          .where(sql`lower(${publications.title}) = ${title} AND lower(${researchActivities.sdrNumber}) = ${sdr}`));
      }
      return one(tx.select({ id: publications.id }).from(publications).where(sql`lower(${publications.doi}) = ${key}`));
    }
  }
}

export async function applyTableSheetRow(tx: Executor, sheet: TableSheet, entry: TableRowEntry): Promise<number | null> {
  const data: Record<string, unknown> = {};
  let existingId: number | undefined;
  for (const [field, value] of Object.entries(entry.data ?? {})) {
    if (field === "_existingId") { existingId = Number(value); continue; }
    if (field.startsWith("_ref_")) {
      const { kind, key } = value as { kind: RefKind; key: string };
      const id = await lookupRefId(tx, kind, key);
      if (id === undefined) throw new Error(`${kind} "${key}" was not found while writing "${entry.key}"`);
      data[field.slice(5)] = id;
      continue;
    }
    data[field] = value;
  }
  const idColumn = (sheet.table as unknown as { id: unknown }).id;
  if (entry.action === "create") {
    const [row] = await tx.insert(sheet.table).values(data).returning({ id: idColumn });
    return row?.id ?? null;
  }
  if (existingId === undefined) throw new Error(`No existing row was matched for "${entry.key}"`);
  const [row] = await tx.update(sheet.table).set(data).where(eq(idColumn as never, existingId)).returning({ id: idColumn });
  if (!row) throw new Error(`"${entry.key}" was changed by someone else during the import`);
  return row.id;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function exportRows(sheet: TableSheet, rows: Record<string, unknown>[], refs: RefIndex): Record<string, unknown>[] {
  const out = rows.map((row) => {
    const cells: Record<string, unknown> = {};
    for (const c of sheet.cols) {
      const value = row[c.field];
      cells[c.key] = c.ref
        ? (value == null ? "" : refs.keyById[c.ref].get(Number(value)) ?? "")
        : formatCell(value, c.type);
    }
    return cells;
  });
  const keyOf = (cells: Record<string, unknown>) => sheet.cols.filter((c) => c.keyPart).map((c) => String(cells[c.key] ?? "").toLowerCase()).join(KEY_SEPARATOR);
  return out.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

export async function loadTableRows(sheet: TableSheet, executor: Executor): Promise<Record<string, unknown>[]> {
  return executor.select().from(sheet.table);
}
