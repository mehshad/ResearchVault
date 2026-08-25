/**
 * Bulk Data Hub - Section-based bulk import/export engine.
 *
 * Sections: research-management, pmo-office, research-compliance,
 *           research-services, research-output.
 *
 * Each section maps to one XLSX workbook with multiple canonical worksheets.
 * Export contains current DB records; templates contain headers only.
 * An Instructions sheet is included in all generated workbooks.
 *
 * Stable keys:
 *   Scientists:         staffId (preferred) or email (required for new)
 *   Grants:             projectNumber
 *   Programs:           programId
 *   Projects:           projectId
 *   Research Activities: sdrNumber
 *   IRB:                irbNumber
 *   IBC:                ibcNumber
 *   Contracts:          contractNumber
 *   Patents:            patentNumber
 *   Publications:       id (updates), DOI, PMID, or title + date + journal
 *   Journal IFs:        journal name + year
 *   Buildings:          building name
 *   Rooms:              building name + room number
 *   Certification Modules: module name
 *   Certifications:     scientist email + module name + start date
 *
 * Relationships use business keys only (emails, programId, projectId, sdrNumber).
 * Blank cells leave the DB value unchanged; literal "CLEAR" clears nullable fields.
 */

import crypto from "node:crypto";
import ExcelJS from "exceljs";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "./db.js";
import {
  scientists,
  grants,
  programs,
  projects,
  researchActivities,
  irbApplications,
  ibcApplications,
  researchContracts,
  patents,
  publications,
  manuscriptHistory,
  journals,
  journalImpactFactorMetrics,
  grantResearchActivities,
  buildings,
  rooms,
  certificationModules,
  certifications,
  GRANT_CURRENCY_VALUES,
} from "@shared/schema";
import type {
  Scientist,
  Grant,
  Program,
  Project,
  ResearchActivity,
  IrbApplication,
  IbcApplication,
  ResearchContract,
  Patent,
  Building,
  Room,
  CertificationModule,
  Certification,
  Publication,
  Journal,
  JournalImpactFactorMetric,
} from "@shared/schema";
import {
  reconcileGrantLifecycle,
  GrantLifecycleError,
} from "@shared/grantLifecycle";
import {
  isRoomManagerEligible,
  isRoomSupervisorEligible,
  ROOM_MANAGER_ELIGIBILITY_MESSAGE,
  ROOM_SUPERVISOR_ELIGIBILITY_MESSAGE,
} from "@shared/roomRoleEligibility";

// ---------------------------------------------------------------------------
// Constants / limits
// ---------------------------------------------------------------------------

const MAX_WORKBOOK_BYTES = 20 * 1024 * 1024; // 20 MB base64 cap
const MAX_TOTAL_ROWS = 10_000;
const MAX_ROWS_PER_SHEET = 5_000;
function getHmacSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required for bulk import preview fingerprints");
  }
  return "development-only-bulk-data-hub-secret";
}

const CLEAR_SENTINEL = "clear"; // case-insensitive

// ---------------------------------------------------------------------------
// Section metadata
// ---------------------------------------------------------------------------

export type SectionId =
  | "research-management"
  | "pmo-office"
  | "research-compliance"
  | "research-services"
  | "research-output";

export interface SheetSpec {
  name: string;
  description: string;
  businessKey: string;
}

export interface SectionMeta {
  id: SectionId;
  label: string;
  description: string;
  sheets: SheetSpec[];
}

export const SECTION_META: SectionMeta[] = [
  {
    id: "research-management",
    label: "Research Management",
    description: "Scientists, Facilities, and Certifications",
    sheets: [
      { name: "Scientists", description: "Staff/scientist records", businessKey: "staffId or email" },
      { name: "Buildings", description: "Facility buildings", businessKey: "building name" },
      { name: "Rooms", description: "Rooms within buildings", businessKey: "building name + room number" },
      { name: "Certification Modules", description: "Certification module configuration", businessKey: "module name" },
      { name: "Certifications", description: "Scientist certification records", businessKey: "scientist email + module name + start date" },
    ],
  },
  {
    id: "pmo-office",
    label: "PMO Office",
    description: "Programs, Projects, and Research Activities",
    sheets: [
      { name: "Programs", description: "Research programs", businessKey: "programId" },
      { name: "Projects", description: "Research projects", businessKey: "projectId" },
      { name: "Research Activities", description: "SDR records", businessKey: "sdrNumber" },
    ],
  },
  {
    id: "research-compliance",
    label: "Research Compliance",
    description: "IRB and IBC applications",
    sheets: [
      { name: "IRB Applications", description: "IRB application records", businessKey: "irbNumber" },
      { name: "IBC Applications", description: "IBC application records", businessKey: "ibcNumber" },
    ],
  },
  {
    id: "research-services",
    label: "Research Data Management",
    description: "Research Contracts and Grants",
    sheets: [
      { name: "Research Contracts", description: "Contract records", businessKey: "contractNumber" },
      { name: "Grants", description: "Grant records", businessKey: "projectNumber" },
    ],
  },
  {
    id: "research-output",
    label: "Research Output",
    description: "Patents, Publications, and Journal Impact Factors",
    sheets: [
      { name: "Patents", description: "Patent records", businessKey: "patentNumber" },
      { name: "Publications", description: "Publication records", businessKey: "Publication ID, DOI, PMID, or title + publication date + journal" },
      { name: "Journal Impact Factors", description: "Journal metadata and annual impact metrics", businessKey: "journal name + year" },
    ],
  },
];

export function getSectionMeta(sectionId: SectionId): SectionMeta {
  const meta = SECTION_META.find((s) => s.id === sectionId);
  if (!meta) throw new Error(`Unknown section: ${sectionId}`);
  return meta;
}

// ---------------------------------------------------------------------------
// Column definitions per sheet
// ---------------------------------------------------------------------------

type ColDef = { header: string; key: string; required?: boolean; description?: string };

const SCIENTIST_COLS: ColDef[] = [
  { header: "Staff ID", key: "staffId", description: "5-digit badge ID (optional, used as primary key if present)" },
  { header: "Email", key: "email", required: true, description: "Required; used as key when Staff ID absent" },
  { header: "Honorific Title", key: "honorificTitle", required: true, description: "Dr, Mr, Ms, Prof, etc." },
  { header: "First Name", key: "firstName", required: true },
  { header: "Last Name", key: "lastName", required: true },
  { header: "Job Title", key: "jobTitle" },
  { header: "Staff Type", key: "staffType", description: "scientific or administrative" },
  { header: "Department", key: "department" },
  { header: "ORCID ID", key: "orcidId" },
  { header: "LinkedIn URL", key: "linkedInUrl" },
  { header: "Google Scholar URL", key: "googleScholarUrl" },
  { header: "Web of Science ID", key: "webOfScienceId" },
  { header: "Bio", key: "bio" },
  { header: "Line Manager Email", key: "supervisorEmail", description: "Must resolve to a scientist email" },
];

const GRANT_COLS: ColDef[] = [
  { header: "Project Number", key: "projectNumber", required: true, description: "Unique grant identifier" },
  { header: "Title", key: "title", required: true },
  { header: "Cycle", key: "cycle" },
  { header: "LPI Email", key: "lpiEmail", description: "Lead PI email — must resolve to a scientist" },
  { header: "Investigator Type", key: "investigatorType", description: "Researcher or Clinician" },
  { header: "Grant Type", key: "grantType", description: "Local or International" },
  { header: "Grant Source", key: "sourceCategory", description: "QNRF Grant, Subaward Agreement, IRF Project, etc." },
  { header: "Source Record Key", key: "sourceRecordKey", description: "Stable identifier from the source dataset" },
  { header: "Submitting Institution", key: "submittingInstitution" },
  { header: "Co-Investigators", key: "coInvestigators", description: "Semicolon-separated; repeat imports append unique names" },
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
  { header: "Contribution Type", key: "contributionType", description: "In-kind, in-cash, or mixed" },
  { header: "Contribution Details", key: "contributionDetails" },
  { header: "Currency", key: "currency", description: "QAR, USD, EUR, etc." },
  { header: "Start Date", key: "startDate", description: "YYYY-MM-DD" },
  { header: "End Date", key: "endDate", description: "YYYY-MM-DD" },
  { header: "Reporting Interval (Months)", key: "reportingIntervalMonths" },
  { header: "Collaborators", key: "collaborators", description: "Semicolon-separated" },
  { header: "Description", key: "description" },
];

const PROGRAM_COLS: ColDef[] = [
  { header: "Program ID", key: "programId", required: true, description: "Unique PRM number" },
  { header: "Name", key: "name", required: true },
  { header: "Description", key: "description" },
  { header: "Program Director Email", key: "programDirectorEmail" },
  { header: "Research Co-Lead Email", key: "researchCoLeadEmail" },
  { header: "Clinical Co-Lead 1 Email", key: "clinicalCoLead1Email" },
  { header: "Clinical Co-Lead 2 Email", key: "clinicalCoLead2Email" },
];

const PROJECT_COLS: ColDef[] = [
  { header: "Project ID", key: "projectId", required: true, description: "Unique PRJ number" },
  { header: "Program ID", key: "programId", description: "Parent program (must exist)" },
  { header: "Name", key: "name", required: true },
  { header: "Description", key: "description" },
  { header: "PI Email", key: "piEmail", description: "Principal Investigator email" },
];

const SDR_COLS: ColDef[] = [
  { header: "SDR Number", key: "sdrNumber", required: true, description: "Unique SDR number" },
  { header: "Project ID", key: "projectId", description: "Parent project (must exist)" },
  { header: "Title", key: "title", required: true },
  { header: "Short Title", key: "shortTitle" },
  { header: "Description", key: "description" },
  { header: "Status", key: "status", description: "planning, active, completed, on_hold" },
  { header: "Start Date", key: "startDate", description: "YYYY-MM-DD" },
  { header: "End Date", key: "endDate", description: "YYYY-MM-DD" },
  { header: "Budget Holder Email", key: "budgetHolderEmail", description: "Budget holder / PI email" },
  { header: "Additional Notification Email", key: "additionalNotificationEmail" },
  { header: "Sidra Branch", key: "sidraBranch", description: "Research, Clinical, External" },
  { header: "Budget Source", key: "budgetSource", description: "Semicolon-separated: IRF, PI Budget, QNRF, etc." },
  { header: "Objectives", key: "objectives" },
];

const IRB_COLS: ColDef[] = [
  { header: "IRB Number", key: "irbNumber", required: true, description: "Sidra IRB number" },
  { header: "IRBNet Number", key: "irbNetNumber" },
  { header: "Old Number", key: "oldNumber" },
  { header: "Title", key: "title", required: true },
  { header: "Short Title", key: "shortTitle" },
  { header: "PI Email", key: "piEmail", required: true, description: "Principal Investigator email" },
  { header: "Additional Notification Email", key: "additionalNotificationEmail" },
  { header: "Protocol Type", key: "protocolType", description: "Exempt, Expedited, Full Board, etc." },
  { header: "Is Interventional", key: "isInterventional", description: "Yes/No" },
  { header: "Status", key: "status", required: true },
  { header: "Submission Date", key: "submissionDate", description: "YYYY-MM-DD" },
  { header: "Initial Approval Date", key: "initialApprovalDate", description: "YYYY-MM-DD" },
  { header: "Expiration Date", key: "expirationDate", description: "YYYY-MM-DD" },
  { header: "SDR Number", key: "sdrNumber", description: "Linked SDR (must exist)" },
  { header: "Risk Level", key: "riskLevel", description: "minimal, greater_than_minimal, high" },
  { header: "Funding Source", key: "fundingSource" },
  { header: "Description", key: "description" },
];

const IBC_COLS: ColDef[] = [
  { header: "IBC Number", key: "ibcNumber", required: true, description: "IBC project number" },
  { header: "Title", key: "title", required: true },
  { header: "Short Title", key: "shortTitle" },
  { header: "PI Email", key: "piEmail", required: true, description: "Principal Investigator email" },
  { header: "Additional Notification Email", key: "additionalNotificationEmail" },
  { header: "Biosafety Level", key: "biosafetyLevel", required: true, description: "BSL-1, BSL-2, BSL-3, BSL-4" },
  { header: "Risk Group Classification", key: "riskGroupClassification" },
  { header: "Status", key: "status", required: true },
  { header: "Risk Level", key: "riskLevel", required: true, description: "low, moderate, high" },
  { header: "Submission Date", key: "submissionDate", description: "YYYY-MM-DD" },
  { header: "Approval Date", key: "approvalDate", description: "YYYY-MM-DD" },
  { header: "Expiration Date", key: "expirationDate", description: "YYYY-MM-DD" },
  { header: "Description", key: "description" },
  { header: "Protocol Summary", key: "protocolSummary" },
];

const CONTRACT_COLS: ColDef[] = [
  { header: "Contract Number", key: "contractNumber", required: true, description: "Unique contract number" },
  { header: "Title", key: "title", required: true },
  { header: "SDR Number", key: "sdrNumber", description: "Linked research activity SDR" },
  { header: "Lead PI Email", key: "leadPiEmail", description: "Lead PI email" },
  { header: "Contract Type", key: "contractType" },
  { header: "Status", key: "status" },
  { header: "Start Date", key: "startDate", description: "YYYY-MM-DD" },
  { header: "End Date", key: "endDate", description: "YYYY-MM-DD" },
  { header: "IRB Protocol", key: "irbProtocol" },
  { header: "IBC Protocol", key: "ibcProtocol" },
  { header: "QNRF Number", key: "qnrfNumber" },
  { header: "Funding Source Category", key: "fundingSourceCategory" },
  { header: "Contractor Name", key: "contractorName" },
  { header: "Counterparty Contact", key: "counterpartyContact" },
  { header: "Counterparty Country", key: "counterpartyCountry" },
  { header: "Contract Value", key: "contractValue" },
  { header: "Currency", key: "currency" },
  { header: "Remarks", key: "remarks" },
  { header: "Description", key: "description" },
];

const PATENT_COLS: ColDef[] = [
  { header: "Patent Number", key: "patentNumber", required: true, description: "Unique patent number" },
  { header: "Title", key: "title", required: true },
  { header: "Inventors", key: "inventors", required: true },
  { header: "Status", key: "status", required: true },
  { header: "Filing Date", key: "filingDate", description: "YYYY-MM-DD" },
  { header: "Grant Date", key: "grantDate", description: "YYYY-MM-DD" },
  { header: "SDR Number", key: "sdrNumber", description: "Linked research activity SDR" },
  { header: "Description", key: "description" },
];

const PUBLICATION_COLS: ColDef[] = [
  { header: "Publication ID", key: "publicationId", description: "Existing database ID; updates only" },
  { header: "Title", key: "title", required: true },
  { header: "SDR Number", key: "sdrNumber", description: "Existing linked research activity SDR" },
  { header: "Abstract", key: "abstract" },
  { header: "Authors", key: "authors" },
  { header: "Journal", key: "journal" },
  { header: "Volume", key: "volume" },
  { header: "Issue", key: "issue" },
  { header: "Pages", key: "pages" },
  { header: "DOI", key: "doi" },
  { header: "PMID", key: "pmid" },
  { header: "Publication Date", key: "publicationDate", description: "YYYY-MM-DD" },
  { header: "Publication Type", key: "publicationType" },
  { header: "Prepublication URL", key: "prepublicationUrl" },
  { header: "Prepublication Site", key: "prepublicationSite" },
];

const JOURNAL_IMPACT_FACTOR_COLS: ColDef[] = [
  { header: "Journal Name", key: "journalName", required: true },
  { header: "Abbreviated Journal", key: "abbreviatedJournal" },
  { header: "Publisher", key: "publisher" },
  { header: "ISSN", key: "issn" },
  { header: "EISSN", key: "eissn" },
  { header: "Field", key: "field" },
  { header: "Year", key: "year", required: true },
  { header: "Impact Factor", key: "impactFactor" },
  { header: "Five Year JIF", key: "fiveYearJif" },
  { header: "JIF Without Self Cites", key: "jifWithoutSelfCites" },
  { header: "JCI", key: "jci" },
  { header: "Quartile", key: "quartile", description: "Q1, Q2, Q3, or Q4" },
  { header: "Rank", key: "rank" },
  { header: "Total Cites", key: "totalCites" },
  { header: "Total Articles", key: "totalArticles" },
  { header: "Citable Items", key: "citableItems" },
  { header: "Cited Half Life", key: "citedHalfLife" },
  { header: "Citing Half Life", key: "citingHalfLife" },
  { header: "Total Citations", key: "totalCitations" },
];

const BUILDING_COLS: ColDef[] = [
  { header: "Building Name", key: "name", required: true },
  { header: "Address", key: "address" },
  { header: "Description", key: "description" },
  { header: "Total Floors", key: "totalFloors" },
  { header: "Max Occupancy", key: "maxOccupancy" },
  { header: "Emergency Contact", key: "emergencyContact" },
  { header: "Safety Notes", key: "safetyNotes" },
];

const ROOM_COLS: ColDef[] = [
  { header: "Building Name", key: "buildingName", required: true },
  { header: "Room Number", key: "roomNumber", required: true },
  { header: "Floor", key: "floor" },
  { header: "Room Type", key: "roomType" },
  { header: "Capacity", key: "capacity" },
  { header: "Area", key: "area" },
  { header: "Biosafety Level", key: "biosafetyLevel" },
  { header: "Room Supervisor Email", key: "roomSupervisorEmail" },
  { header: "Room Manager Email", key: "roomManagerEmail" },
  { header: "Certifications", key: "certifications", description: "Semicolon-separated" },
  { header: "Available PPE", key: "availablePpe", description: "Semicolon-separated" },
  { header: "Equipment", key: "equipment" },
  { header: "Special Features", key: "specialFeatures" },
  { header: "Access Restrictions", key: "accessRestrictions" },
  { header: "Maintenance Notes", key: "maintenanceNotes" },
];

const CERTIFICATION_MODULE_COLS: ColDef[] = [
  { header: "Module Name", key: "name", required: true },
  { header: "Description", key: "description" },
  { header: "Is Core", key: "isCore", required: true },
  { header: "Expiration Months", key: "expirationMonths", required: true },
  { header: "Is Active", key: "isActive", required: true },
];

const CERTIFICATION_COLS: ColDef[] = [
  { header: "Scientist Email", key: "scientistEmail", required: true },
  { header: "Module Name", key: "moduleName", required: true },
  { header: "Start Date", key: "startDate", required: true, description: "YYYY-MM-DD" },
  { header: "End Date", key: "endDate", required: true, description: "YYYY-MM-DD" },
  { header: "Notes", key: "notes" },
];

const SHEET_COLS: Record<string, ColDef[]> = {
  "Scientists": SCIENTIST_COLS,
  "Grants": GRANT_COLS,
  "Programs": PROGRAM_COLS,
  "Projects": PROJECT_COLS,
  "Research Activities": SDR_COLS,
  "IRB Applications": IRB_COLS,
  "IBC Applications": IBC_COLS,
  "Research Contracts": CONTRACT_COLS,
  "Patents": PATENT_COLS,
  "Publications": PUBLICATION_COLS,
  "Journal Impact Factors": JOURNAL_IMPACT_FACTOR_COLS,
  "Buildings": BUILDING_COLS,
  "Rooms": ROOM_COLS,
  "Certification Modules": CERTIFICATION_MODULE_COLS,
  "Certifications": CERTIFICATION_COLS,
};

// All valid sheet names across all sections
const ALL_SHEET_NAMES = new Set(Object.keys(SHEET_COLS));

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function cellString(v: unknown): string {
  if (v == null || v === "") return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date detection: typical range 25569 (1970-01-01) to 60000 (~2064)
    if (Number.isInteger(v) && v > 25000 && v < 80000) {
      // Convert Excel serial date to YYYY-MM-DD
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    return String(v);
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if ("text" in obj && obj.text != null) return String(obj.text).trim();
    if ("result" in obj && obj.result != null) return String(obj.result).trim();
    if ("richText" in obj && Array.isArray(obj.richText)) {
      return obj.richText.map((r: unknown) => (r as { text?: string }).text ?? "").join("").trim();
    }
    return String(v).trim();
  }
  return String(v).trim();
}

function isClear(v: string): boolean {
  return v.trim().toLowerCase() === CLEAR_SENTINEL;
}

function textVal(v: string, isNew: boolean): string | null {
  if (v === "") return isNew ? null : undefined as unknown as null;
  if (isClear(v)) return null;
  return v;
}

// Returns undefined if field should not be written (blank + existing record)
function maybeText(v: string, existing: boolean): string | null | undefined {
  if (v === "" && existing) return undefined;
  if (v === "") return null;
  if (isClear(v)) return null;
  return v;
}

function parseDateStr(raw: string, label: string, errors: string[]): string | null {
  if (raw === "" || isClear(raw)) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00.000Z`);
    if (!isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw) return raw;
    errors.push(`${label}: expected a valid YYYY-MM-DD date (got "${raw}")`);
    return null;
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    errors.push(`${label}: expected YYYY-MM-DD (got "${raw}")`);
    return null;
  }
  return d.toISOString().slice(0, 10);
}

function parseDateTimestamp(raw: string, label: string, errors: string[]): Date | null {
  const s = parseDateStr(raw, label, errors);
  if (!s) return null;
  return new Date(s + "T00:00:00.000Z");
}

function parseIntField(raw: string, label: string, errors: string[]): number | null {
  if (raw === "" || isClear(raw)) return null;
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isInteger(n) || isNaN(n)) {
    errors.push(`${label}: must be a whole number (got "${raw}")`);
    return null;
  }
  return n;
}

function parseNumericField(raw: string, label: string, errors: string[]): string | null {
  if (raw === "" || isClear(raw)) return null;
  const cleaned = raw.replace(/[,$\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    errors.push(`${label}: must be numeric (got "${raw}")`);
    return null;
  }
  return cleaned;
}

function parseStrictNonnegativeDecimal(raw: string, label: string, errors: string[]): string | null {
  if (raw === "" || isClear(raw)) return null;
  const trimmed = raw.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(trimmed)) {
    errors.push(`${label}: must be a non-negative decimal number (got "${raw}")`);
    return null;
  }
  return trimmed.replace(/,/g, "");
}

function parseStrictInteger(raw: string, label: string, errors: string[]): number | null {
  if (raw === "" || isClear(raw)) return null;
  const trimmed = raw.trim();
  if (!/^-?(?:0|[1-9]\d*)$/.test(trimmed)) {
    errors.push(`${label}: must be a whole number (got "${raw}")`);
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) {
    errors.push(`${label}: is outside the supported integer range`);
    return null;
  }
  return value;
}

function parseBool(raw: string, label: string, errors: string[]): boolean | null {
  if (raw === "" || isClear(raw)) return null;
  const v = raw.trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(v)) return true;
  if (["no", "n", "false", "0"].includes(v)) return false;
  errors.push(`${label}: must be Yes/No (got "${raw}")`);
  return null;
}

function splitSemicolon(raw: string): string[] {
  if (raw === "" || isClear(raw)) return [];
  return raw.split(/;|\n/).map((s) => s.trim()).filter(Boolean);
}

function rejectRequiredClear(
  row: Record<string, string>,
  cols: ColDef[],
  errors: string[],
): void {
  for (const col of cols) {
    if (col.required && isClear(row[col.key] ?? "")) {
      errors.push(`${col.header} cannot be cleared`);
    }
  }
}

function makeHeaderMap(cols: ColDef[]): Record<string, string> {
  const m: Record<string, string> = {};
  for (const c of cols) m[c.header.toLowerCase().trim()] = c.key;
  return m;
}

// ---------------------------------------------------------------------------
// Build workbook helpers
// ---------------------------------------------------------------------------

function addInstructionsSheet(wb: ExcelJS.Workbook, sectionId: SectionId): void {
  const ws = wb.addWorksheet("Instructions");
  ws.getColumn(1).width = 90;
  const lines = [
    `Bulk Import/Export — ${getSectionMeta(sectionId).label}`,
    "",
    "HOW TO USE THIS FILE",
    "• Export: contains current database records. Edit and re-import.",
    "• Template: contains headers only. Fill in and import.",
    "",
    "RULES",
    "• Blank cells leave the existing DB value unchanged (updates only).",
    "• Enter the literal word CLEAR in a cell to erase a nullable field.",
    "• New records require all columns marked Required.",
    "• Dates: use YYYY-MM-DD format.",
    "• Arrays (e.g. Budget Source): separate values with semicolons (;).",
    "• Booleans: enter Yes or No.",
    "",
    "STABLE KEYS (used to match existing records)",
    "• Scientists: Staff ID (preferred) or Email",
    "• Grants: Project Number",
    "• Programs: Program ID",
    "• Projects: Project ID",
    "• Research Activities: SDR Number",
    "• IRB Applications: IRB Number",
    "• IBC Applications: IBC Number",
    "• Research Contracts: Contract Number",
    "• Patents: Patent Number",
    "• Publications: Publication ID (updates), then DOI, PMID, or Title + Publication Date + Journal",
    "• Journal Impact Factors: Journal Name + Year",
    "• Buildings: Building Name",
    "• Rooms: Building Name + Room Number",
    "• Certification Modules: Module Name",
    "• Certifications: Scientist Email + Module Name + Start Date",
    "",
    "RELATIONSHIPS",
    "• Staff references use email addresses.",
    "• Program/Project/SDR references use their respective IDs.",
    "• The system validates all relationships against current DB records",
    "  and against earlier rows in the same workbook.",
    "",
    "UNKNOWN SHEETS / COLUMNS",
    "• Non-empty sheets with unrecognized names are rejected.",
    "• Unknown non-empty column headers are rejected.",
    "",
    "Generated: " + new Date().toISOString(),
  ];
  lines.forEach((line, i) => {
    const row = ws.getRow(i + 1);
    row.getCell(1).value = line;
    if (i === 0) row.getCell(1).font = { bold: true, size: 13 };
    else if (line.startsWith("HOW TO") || line.startsWith("RULES") || line.startsWith("STABLE") || line.startsWith("RELATIONSHIPS") || line.startsWith("UNKNOWN")) {
      row.getCell(1).font = { bold: true };
    }
  });
}

function addDataSheet(wb: ExcelJS.Workbook, name: string, cols: ColDef[], rows: Record<string, unknown>[]): void {
  const ws = wb.addWorksheet(name);
  ws.columns = cols.map((c) => ({
    header: c.header,
    key: c.header,
    width: Math.max(c.header.length + 4, 18),
  }));
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell, col) => {
    const colDef = cols[col - 1];
    if (colDef?.required) cell.font = { bold: true, color: { argb: "FF8B0000" } };
  });
  for (const row of rows) {
    const r: Record<string, unknown> = {};
    for (const c of cols) r[c.header] = row[c.key] ?? "";
    ws.addRow(r);
  }
}

// ---------------------------------------------------------------------------
// Data → row converters (for export)
// ---------------------------------------------------------------------------

function scientistsToRows(
  allScientists: Scientist[],
): Record<string, unknown>[] {
  const idToEmail = new Map<number, string>();
  allScientists.forEach((s) => idToEmail.set(s.id, s.email));
  return allScientists.map((s) => ({
    staffId: s.staffId ?? "",
    email: s.email,
    honorificTitle: s.honorificTitle,
    firstName: s.firstName,
    lastName: s.lastName,
    jobTitle: s.jobTitle ?? "",
    staffType: s.staffType,
    department: s.department ?? "",
    orcidId: s.orcidId ?? "",
    linkedInUrl: s.linkedInUrl ?? "",
    googleScholarUrl: s.googleScholarUrl ?? "",
    webOfScienceId: s.webOfScienceId ?? "",
    bio: s.bio ?? "",
    supervisorEmail: s.supervisorId ? (idToEmail.get(s.supervisorId) ?? "") : "",
  }));
}

function grantsToRows(
  grantList: Grant[],
  scientistById: Map<number, Scientist>,
): Record<string, unknown>[] {
  return grantList.map((g) => {
    const lpi = g.lpiId ? scientistById.get(g.lpiId) : undefined;
    return {
      projectNumber: g.projectNumber,
      title: g.title,
      cycle: g.cycle ?? "",
      lpiEmail: lpi?.email ?? "",
      investigatorType: g.investigatorType ?? "",
      grantType: g.grantType ?? "",
      sourceCategory: g.sourceCategory ?? "",
      sourceRecordKey: g.sourceRecordKey ?? "",
      submittingInstitution: g.submittingInstitution ?? "",
      coInvestigators: g.coInvestigators ? g.coInvestigators.join("; ") : "",
      status: g.status,
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
  });
}

function programsToRows(
  programList: Program[],
  scientistById: Map<number, Scientist>,
): Record<string, unknown>[] {
  return programList.map((p) => ({
    programId: p.programId,
    name: p.name,
    description: p.description ?? "",
    programDirectorEmail: p.programDirectorId ? (scientistById.get(p.programDirectorId)?.email ?? "") : "",
    researchCoLeadEmail: p.researchCoLeadId ? (scientistById.get(p.researchCoLeadId)?.email ?? "") : "",
    clinicalCoLead1Email: p.clinicalCoLead1Id ? (scientistById.get(p.clinicalCoLead1Id)?.email ?? "") : "",
    clinicalCoLead2Email: p.clinicalCoLead2Id ? (scientistById.get(p.clinicalCoLead2Id)?.email ?? "") : "",
  }));
}

function projectsToRows(
  projectList: Project[],
  programByDbId: Map<number, Program>,
  scientistById: Map<number, Scientist>,
): Record<string, unknown>[] {
  return projectList.map((p) => ({
    projectId: p.projectId,
    programId: p.programId ? (programByDbId.get(p.programId)?.programId ?? "") : "",
    name: p.name,
    description: p.description ?? "",
    piEmail: p.principalInvestigatorId ? (scientistById.get(p.principalInvestigatorId)?.email ?? "") : "",
  }));
}

function sdrsToRows(
  sdrList: ResearchActivity[],
  projectByDbId: Map<number, Project>,
  scientistById: Map<number, Scientist>,
): Record<string, unknown>[] {
  return sdrList.map((a) => ({
    sdrNumber: a.sdrNumber,
    projectId: a.projectId ? (projectByDbId.get(a.projectId)?.projectId ?? "") : "",
    title: a.title,
    shortTitle: a.shortTitle ?? "",
    description: a.description ?? "",
    status: a.status,
    startDate: a.startDate ? new Date(a.startDate).toISOString().slice(0, 10) : "",
    endDate: a.endDate ? new Date(a.endDate).toISOString().slice(0, 10) : "",
    budgetHolderEmail: a.budgetHolderId ? (scientistById.get(a.budgetHolderId)?.email ?? "") : "",
    additionalNotificationEmail: a.additionalNotificationEmail ?? "",
    sidraBranch: a.sidraBranch ?? "",
    budgetSource: a.budgetSource ? a.budgetSource.join("; ") : "",
    objectives: a.objectives ?? "",
  }));
}

function irbToRows(
  irbList: IrbApplication[],
  sdrByDbId: Map<number, ResearchActivity>,
  scientistById: Map<number, Scientist>,
): Record<string, unknown>[] {
  return irbList.map((irb) => ({
    irbNumber: irb.irbNumber,
    irbNetNumber: irb.irbNetNumber ?? "",
    oldNumber: irb.oldNumber ?? "",
    title: irb.title,
    shortTitle: irb.shortTitle ?? "",
    piEmail: irb.principalInvestigatorId ? (scientistById.get(irb.principalInvestigatorId)?.email ?? "") : "",
    additionalNotificationEmail: irb.additionalNotificationEmail ?? "",
    protocolType: irb.protocolType ?? "",
    isInterventional: irb.isInterventional ? "Yes" : "No",
    status: irb.status,
    submissionDate: irb.submissionDate ? new Date(irb.submissionDate).toISOString().slice(0, 10) : "",
    initialApprovalDate: irb.initialApprovalDate ?? "",
    expirationDate: irb.expirationDate ?? "",
    sdrNumber: irb.researchActivityId ? (sdrByDbId.get(irb.researchActivityId)?.sdrNumber ?? "") : "",
    riskLevel: irb.riskLevel ?? "",
    fundingSource: irb.fundingSource ?? "",
    description: irb.description ?? "",
  }));
}

function ibcToRows(
  ibcList: IbcApplication[],
  scientistById: Map<number, Scientist>,
): Record<string, unknown>[] {
  return ibcList.map((ibc) => ({
    ibcNumber: ibc.ibcNumber,
    title: ibc.title,
    shortTitle: ibc.shortTitle ?? "",
    piEmail: ibc.principalInvestigatorId ? (scientistById.get(ibc.principalInvestigatorId)?.email ?? "") : "",
    additionalNotificationEmail: ibc.additionalNotificationEmail ?? "",
    biosafetyLevel: ibc.biosafetyLevel,
    riskGroupClassification: ibc.riskGroupClassification ?? "",
    status: ibc.status,
    riskLevel: ibc.riskLevel,
    submissionDate: ibc.submissionDate ? new Date(ibc.submissionDate).toISOString().slice(0, 10) : "",
    approvalDate: ibc.approvalDate ? new Date(ibc.approvalDate).toISOString().slice(0, 10) : "",
    expirationDate: ibc.expirationDate ?? "",
    description: ibc.description ?? "",
    protocolSummary: ibc.protocolSummary ?? "",
  }));
}

function contractsToRows(
  contractList: ResearchContract[],
  sdrByDbId: Map<number, ResearchActivity>,
  scientistById: Map<number, Scientist>,
): Record<string, unknown>[] {
  return contractList.map((c) => ({
    contractNumber: c.contractNumber,
    title: c.title,
    sdrNumber: c.researchActivityId ? (sdrByDbId.get(c.researchActivityId)?.sdrNumber ?? "") : "",
    leadPiEmail: c.leadPIId ? (scientistById.get(c.leadPIId)?.email ?? "") : "",
    contractType: c.contractType ?? "",
    status: c.status,
    startDate: c.startDate ?? "",
    endDate: c.endDate ?? "",
    irbProtocol: c.irbProtocol ?? "",
    ibcProtocol: c.ibcProtocol ?? "",
    qnrfNumber: c.qnrfNumber ?? "",
    fundingSourceCategory: c.fundingSourceCategory ?? "",
    contractorName: c.contractorName ?? "",
    counterpartyContact: c.counterpartyContact ?? "",
    counterpartyCountry: c.counterpartyCountry ?? "",
    contractValue: c.contractValue ?? "",
    currency: c.currency ?? "",
    remarks: c.remarks ?? "",
    description: c.description ?? "",
  }));
}

function patentsToRows(
  patentList: Patent[],
  sdrByDbId: Map<number, ResearchActivity>,
): Record<string, unknown>[] {
  return patentList.map((p) => ({
    patentNumber: p.patentNumber ?? "",
    title: p.title,
    inventors: p.inventors,
    status: p.status,
    filingDate: p.filingDate ? new Date(p.filingDate).toISOString().slice(0, 10) : "",
    grantDate: p.grantDate ? new Date(p.grantDate).toISOString().slice(0, 10) : "",
    sdrNumber: p.researchActivityId ? (sdrByDbId.get(p.researchActivityId)?.sdrNumber ?? "") : "",
    description: p.description ?? "",
  }));
}

function publicationsToRows(
  list: Publication[],
  sdrByDbId: Map<number, ResearchActivity>,
): Record<string, unknown>[] {
  return list.map((p) => ({
    publicationId: p.id,
    title: p.title,
    sdrNumber: p.researchActivityId ? sdrByDbId.get(p.researchActivityId)?.sdrNumber ?? "" : "",
    abstract: p.abstract ?? "",
    authors: p.authors ?? "",
    journal: p.journal ?? "",
    volume: p.volume ?? "",
    issue: p.issue ?? "",
    pages: p.pages ?? "",
    doi: p.doi ?? "",
    pmid: p.pmid ?? "",
    publicationDate: p.publicationDate ? p.publicationDate.toISOString().slice(0, 10) : "",
    publicationType: p.publicationType ?? "",
    prepublicationUrl: p.prepublicationUrl ?? "",
    prepublicationSite: p.prepublicationSite ?? "",
  }));
}

function journalImpactFactorsToRows(
  journalList: Journal[],
  metrics: JournalImpactFactorMetric[],
): Record<string, unknown>[] {
  const journalById = new Map(journalList.map((journal) => [journal.id, journal]));
  return metrics.map((metric) => {
    const journal = journalById.get(metric.journalId);
    return {
      journalName: journal?.journalName ?? "",
      abbreviatedJournal: journal?.abbreviatedJournal ?? "",
      publisher: journal?.publisher ?? "",
      issn: journal?.issn ?? "",
      eissn: journal?.eissn ?? "",
      field: journal?.field ?? "",
      year: metric.year,
      impactFactor: metric.impactFactor ?? "",
      fiveYearJif: metric.fiveYearJif ?? "",
      jifWithoutSelfCites: metric.jifWithoutSelfCites ?? "",
      jci: metric.jci ?? "",
      quartile: metric.quartile ?? "",
      rank: metric.rank ?? "",
      totalCites: metric.totalCites ?? "",
      totalArticles: metric.totalArticles ?? "",
      citableItems: metric.citableItems ?? "",
      citedHalfLife: metric.citedHalfLife ?? "",
      citingHalfLife: metric.citingHalfLife ?? "",
      totalCitations: metric.totalCitations ?? "",
    };
  });
}

function buildingsToRows(list: Building[]): Record<string, unknown>[] {
  return list.map((b) => ({
    name: b.name,
    address: b.address ?? "",
    description: b.description ?? "",
    totalFloors: b.totalFloors ?? "",
    maxOccupancy: b.maxOccupancy ?? "",
    emergencyContact: b.emergencyContact ?? "",
    safetyNotes: b.safetyNotes ?? "",
  }));
}

function roomsToRows(
  list: Room[],
  buildingById: Map<number, Building>,
  scientistById: Map<number, Scientist>,
): Record<string, unknown>[] {
  return list.map((r) => ({
    buildingName: buildingById.get(r.buildingId)?.name ?? "",
    roomNumber: r.roomNumber,
    floor: r.floor ?? "",
    roomType: r.roomType ?? "",
    capacity: r.capacity ?? "",
    area: r.area ?? "",
    biosafetyLevel: r.biosafetyLevel ?? "",
    roomSupervisorEmail: r.roomSupervisorId ? scientistById.get(r.roomSupervisorId)?.email ?? "" : "",
    roomManagerEmail: r.roomManagerId ? scientistById.get(r.roomManagerId)?.email ?? "" : "",
    certifications: Array.isArray(r.certifications) ? r.certifications.join("; ") : "",
    availablePpe: Array.isArray(r.availablePpe) ? r.availablePpe.join("; ") : "",
    equipment: r.equipment ?? "",
    specialFeatures: r.specialFeatures ?? "",
    accessRestrictions: r.accessRestrictions ?? "",
    maintenanceNotes: r.maintenanceNotes ?? "",
  }));
}

function certificationModulesToRows(list: CertificationModule[]): Record<string, unknown>[] {
  return list.map((m) => ({
    name: m.name,
    description: m.description ?? "",
    isCore: m.isCore ? "Yes" : "No",
    expirationMonths: m.expirationMonths,
    isActive: m.isActive ? "Yes" : "No",
  }));
}

function certificationsToRows(
  list: Certification[],
  scientistById: Map<number, Scientist>,
  moduleById: Map<number, CertificationModule>,
): Record<string, unknown>[] {
  return list.map((c) => ({
    scientistEmail: scientistById.get(c.scientistId)?.email ?? "",
    moduleName: moduleById.get(c.moduleId)?.name ?? "",
    startDate: c.startDate,
    endDate: c.endDate,
    notes: c.notes ?? "",
  }));
}

// ---------------------------------------------------------------------------
// Context loader — fetches all DB data needed for a section
// ---------------------------------------------------------------------------

interface DbContext {
  scientists: Scientist[];
  scientistByEmail: Map<string, Scientist>;
  scientistById: Map<number, Scientist>;
  grants?: Grant[];
  grantByProjectNumber?: Map<string, Grant>;
  grantLinkedSdrIds?: Map<number, number[]>; // grantId → researchActivityId[]
  programs?: Program[];
  programByProgramId?: Map<string, Program>;
  programByDbId?: Map<number, Program>;
  projects?: Project[];
  projectByProjectId?: Map<string, Project>;
  projectByDbId?: Map<number, Project>;
  sdrs?: ResearchActivity[];
  sdrBySdrNumber?: Map<string, ResearchActivity>;
  sdrByDbId?: Map<number, ResearchActivity>;
  irbs?: IrbApplication[];
  irbByIrbNumber?: Map<string, IrbApplication>;
  ibcs?: IbcApplication[];
  ibcByIbcNumber?: Map<string, IbcApplication>;
  contracts?: ResearchContract[];
  contractByContractNumber?: Map<string, ResearchContract>;
  patentList?: Patent[];
  patentByPatentNumber?: Map<string, Patent>;
  publicationList?: Publication[];
  publicationById?: Map<number, Publication>;
  publicationByDoi?: Map<string, Publication[]>;
  publicationByPmid?: Map<string, Publication[]>;
  publicationByComposite?: Map<string, Publication[]>;
  manuscriptHistoryRows?: Array<{ id: number }>;
  journals?: Journal[];
  journalByName?: Map<string, Journal>;
  journalMetrics?: JournalImpactFactorMetric[];
  journalMetricByKey?: Map<string, JournalImpactFactorMetric>;
  buildings?: Building[];
  buildingByName?: Map<string, Building>;
  buildingById?: Map<number, Building>;
  ambiguousBuildingNames?: Set<string>;
  rooms?: Room[];
  roomByKey?: Map<string, Room>;
  ambiguousRoomKeys?: Set<string>;
  certificationModules?: CertificationModule[];
  certificationModuleByName?: Map<string, CertificationModule>;
  certificationModuleById?: Map<number, CertificationModule>;
  ambiguousCertificationModuleNames?: Set<string>;
  certifications?: Certification[];
  certificationByKey?: Map<string, Certification>;
  ambiguousCertificationKeys?: Set<string>;
}

async function loadDbContext(sectionId: SectionId, executor: any = db): Promise<DbContext> {
  const allScientists = await executor.select().from(scientists);
  const scientistByEmail = new Map<string, Scientist>();
  const scientistById = new Map<number, Scientist>();
  for (const s of allScientists) {
    scientistByEmail.set(s.email.toLowerCase(), s);
    scientistById.set(s.id, s);
  }

  const ctx: DbContext = { scientists: allScientists, scientistByEmail, scientistById };

  if (sectionId === "research-services") {
    const grantList = await executor.select().from(grants);
    const grantByProjectNumber = new Map<string, Grant>();
    for (const g of grantList) grantByProjectNumber.set(g.projectNumber.toLowerCase(), g);
    // Load grant-SDR links to protect awarded grants
    const grantLinks = await executor.select().from(grantResearchActivities);
    const grantLinkedSdrIds = new Map<number, number[]>();
    for (const link of grantLinks) {
      if (!grantLinkedSdrIds.has(link.grantId)) grantLinkedSdrIds.set(link.grantId, []);
      grantLinkedSdrIds.get(link.grantId)!.push(link.researchActivityId);
    }
    ctx.grants = grantList;
    ctx.grantByProjectNumber = grantByProjectNumber;
    ctx.grantLinkedSdrIds = grantLinkedSdrIds;
  }

  if (sectionId === "pmo-office" || sectionId === "research-compliance" || sectionId === "research-services" || sectionId === "research-output") {
    const programList = await executor.select().from(programs);
    const programByProgramId = new Map<string, Program>();
    const programByDbId = new Map<number, Program>();
    for (const p of programList) {
      programByProgramId.set(p.programId.toLowerCase(), p);
      programByDbId.set(p.id, p);
    }
    ctx.programs = programList;
    ctx.programByProgramId = programByProgramId;
    ctx.programByDbId = programByDbId;

    const projectList = await executor.select().from(projects);
    const projectByProjectId = new Map<string, Project>();
    const projectByDbId = new Map<number, Project>();
    for (const p of projectList) {
      projectByProjectId.set(p.projectId.toLowerCase(), p);
      projectByDbId.set(p.id, p);
    }
    ctx.projects = projectList;
    ctx.projectByProjectId = projectByProjectId;
    ctx.projectByDbId = projectByDbId;

    const sdrList = await executor.select().from(researchActivities);
    const sdrBySdrNumber = new Map<string, ResearchActivity>();
    const sdrByDbId = new Map<number, ResearchActivity>();
    for (const a of sdrList) {
      sdrBySdrNumber.set(a.sdrNumber.toLowerCase(), a);
      sdrByDbId.set(a.id, a);
    }
    ctx.sdrs = sdrList;
    ctx.sdrBySdrNumber = sdrBySdrNumber;
    ctx.sdrByDbId = sdrByDbId;
  }

  if (sectionId === "research-compliance") {
    const irbList = await executor.select().from(irbApplications);
    const irbByIrbNumber = new Map<string, IrbApplication>();
    for (const irb of irbList) irbByIrbNumber.set(irb.irbNumber.toLowerCase(), irb);
    ctx.irbs = irbList;
    ctx.irbByIrbNumber = irbByIrbNumber;

    const ibcList = await executor.select().from(ibcApplications);
    const ibcByIbcNumber = new Map<string, IbcApplication>();
    for (const ibc of ibcList) ibcByIbcNumber.set(ibc.ibcNumber.toLowerCase(), ibc);
    ctx.ibcs = ibcList;
    ctx.ibcByIbcNumber = ibcByIbcNumber;
  }

  if (sectionId === "research-services") {
    const contractList = await executor.select().from(researchContracts);
    const contractByContractNumber = new Map<string, ResearchContract>();
    for (const c of contractList) contractByContractNumber.set(c.contractNumber.toLowerCase(), c);
    ctx.contracts = contractList;
    ctx.contractByContractNumber = contractByContractNumber;
  }

  if (sectionId === "research-output") {
    const patentList = await executor.select().from(patents);
    const patentByPatentNumber = new Map<string, Patent>();
    for (const p of patentList) {
      if (p.patentNumber) patentByPatentNumber.set(p.patentNumber.toLowerCase(), p);
    }
    ctx.patentList = patentList;
    ctx.patentByPatentNumber = patentByPatentNumber;

    const publicationList: Publication[] = await executor.select().from(publications);
    const manuscriptHistoryRows: Array<{ id: number }> = await executor
      .select({ id: manuscriptHistory.id })
      .from(manuscriptHistory);
    const publicationById = new Map<number, Publication>();
    const publicationByDoi = new Map<string, Publication[]>();
    const publicationByPmid = new Map<string, Publication[]>();
    const publicationByComposite = new Map<string, Publication[]>();
    const add = (map: Map<string, Publication[]>, key: string, publication: Publication) =>
      map.set(key, [...(map.get(key) ?? []), publication]);
    for (const publication of publicationList) {
      publicationById.set(publication.id, publication);
      const doi = normalizeDoi(publication.doi);
      const pmid = normalizeScalarKey(publication.pmid);
      const composite = publicationCompositeKey(
        publication.title,
        publication.publicationDate,
        publication.journal,
      );
      if (doi) add(publicationByDoi, doi, publication);
      if (pmid) add(publicationByPmid, pmid, publication);
      if (composite) add(publicationByComposite, composite, publication);
    }
    const journalList: Journal[] = await executor.select().from(journals);
    const journalByName = new Map(journalList.map((journal) => [
      normalizeScalarKey(journal.journalName),
      journal,
    ]));
    const journalMetrics: JournalImpactFactorMetric[] =
      await executor.select().from(journalImpactFactorMetrics);
    const journalMetricByKey = new Map(journalMetrics.map((metric) => [
      `${metric.journalId}\u0000${metric.year}`,
      metric,
    ]));
    Object.assign(ctx, {
      publicationList, publicationById, publicationByDoi, publicationByPmid,
      publicationByComposite, journals: journalList, journalByName,
      journalMetrics, journalMetricByKey, manuscriptHistoryRows,
    });
  }

  if (sectionId === "research-management") {
    const buildingList: Building[] = await executor.select().from(buildings);
    const buildingByName = new Map<string, Building>();
    const buildingById = new Map<number, Building>();
    const ambiguousBuildingNames = new Set<string>();
    for (const building of buildingList) {
      const key = building.name.toLowerCase();
      if (buildingByName.has(key)) ambiguousBuildingNames.add(key);
      else buildingByName.set(key, building);
      buildingById.set(building.id, building);
    }
    const roomList: Room[] = await executor.select().from(rooms);
    const roomByKey = new Map<string, Room>();
    const ambiguousRoomKeys = new Set<string>();
    for (const room of roomList) {
      const building = buildingById.get(room.buildingId);
      if (!building) continue;
      const key = `${building.name.toLowerCase()}\u0000${room.roomNumber.toLowerCase()}`;
      if (roomByKey.has(key)) ambiguousRoomKeys.add(key);
      else roomByKey.set(key, room);
    }
    Object.assign(ctx, { buildings: buildingList, buildingByName, buildingById, ambiguousBuildingNames, rooms: roomList, roomByKey, ambiguousRoomKeys });
  }

  if (sectionId === "research-management") {
    const moduleList: CertificationModule[] = await executor.select().from(certificationModules);
    const certificationModuleByName = new Map<string, CertificationModule>();
    const certificationModuleById = new Map<number, CertificationModule>();
    const ambiguousCertificationModuleNames = new Set<string>();
    for (const module of moduleList) {
      const key = module.name.toLowerCase();
      if (certificationModuleByName.has(key)) ambiguousCertificationModuleNames.add(key);
      else certificationModuleByName.set(key, module);
      certificationModuleById.set(module.id, module);
    }
    const certificationList: Certification[] = await executor.select().from(certifications);
    const certificationByKey = new Map<string, Certification>();
    const ambiguousCertificationKeys = new Set<string>();
    for (const certification of certificationList) {
      const scientist = scientistById.get(certification.scientistId);
      const module = certificationModuleById.get(certification.moduleId);
      if (!scientist || !module) continue;
      const key = `${scientist.email.toLowerCase()}\u0000${module.name.toLowerCase()}\u0000${certification.startDate}`;
      if (certificationByKey.has(key)) ambiguousCertificationKeys.add(key);
      else certificationByKey.set(key, certification);
    }
    Object.assign(ctx, {
      certificationModules: moduleList, certificationModuleByName, certificationModuleById,
      ambiguousCertificationModuleNames, certifications: certificationList,
      certificationByKey, ambiguousCertificationKeys,
    });
  }

  return ctx;
}

// ---------------------------------------------------------------------------
// Export workbook builder
// ---------------------------------------------------------------------------

export async function buildExportWorkbook(sectionId: SectionId): Promise<Buffer> {
  const ctx = await loadDbContext(sectionId);
  const wb = new ExcelJS.Workbook();
  addInstructionsSheet(wb, sectionId);

  if (sectionId === "research-management") {
    addDataSheet(wb, "Scientists", SCIENTIST_COLS, scientistsToRows(ctx.scientists));
    addDataSheet(wb, "Buildings", BUILDING_COLS, buildingsToRows(ctx.buildings!));
    addDataSheet(wb, "Rooms", ROOM_COLS, roomsToRows(ctx.rooms!, ctx.buildingById!, ctx.scientistById));
    addDataSheet(wb, "Certification Modules", CERTIFICATION_MODULE_COLS, certificationModulesToRows(ctx.certificationModules!));
    addDataSheet(wb, "Certifications", CERTIFICATION_COLS, certificationsToRows(ctx.certifications!, ctx.scientistById, ctx.certificationModuleById!));
  } else if (sectionId === "pmo-office") {
    addDataSheet(wb, "Programs", PROGRAM_COLS, programsToRows(ctx.programs!, ctx.scientistById));
    addDataSheet(wb, "Projects", PROJECT_COLS, projectsToRows(ctx.projects!, ctx.programByDbId!, ctx.scientistById));
    addDataSheet(wb, "Research Activities", SDR_COLS, sdrsToRows(ctx.sdrs!, ctx.projectByDbId!, ctx.scientistById));
  } else if (sectionId === "research-compliance") {
    addDataSheet(wb, "IRB Applications", IRB_COLS, irbToRows(ctx.irbs!, ctx.sdrByDbId!, ctx.scientistById));
    addDataSheet(wb, "IBC Applications", IBC_COLS, ibcToRows(ctx.ibcs!, ctx.scientistById));
  } else if (sectionId === "research-services") {
    addDataSheet(wb, "Research Contracts", CONTRACT_COLS, contractsToRows(ctx.contracts!, ctx.sdrByDbId!, ctx.scientistById));
    addDataSheet(wb, "Grants", GRANT_COLS, grantsToRows(ctx.grants!, ctx.scientistById));
  } else if (sectionId === "research-output") {
    addDataSheet(wb, "Patents", PATENT_COLS, patentsToRows(ctx.patentList!, ctx.sdrByDbId!));
    addDataSheet(wb, "Publications", PUBLICATION_COLS, publicationsToRows(ctx.publicationList!, ctx.sdrByDbId!));
    addDataSheet(wb, "Journal Impact Factors", JOURNAL_IMPACT_FACTOR_COLS, journalImpactFactorsToRows(ctx.journals!, ctx.journalMetrics!));
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ---------------------------------------------------------------------------
// Template workbook builder
// ---------------------------------------------------------------------------

export async function buildTemplateWorkbook(sectionId: SectionId): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  addInstructionsSheet(wb, sectionId);
  const meta = getSectionMeta(sectionId);
  for (const sheet of meta.sheets) {
    const cols = SHEET_COLS[sheet.name];
    if (cols) addDataSheet(wb, sheet.name, cols, []);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ---------------------------------------------------------------------------
// Row-level result types
// ---------------------------------------------------------------------------

export type RowAction = "create" | "update" | "skip" | "error";

export interface RowEntry {
  sheetName: string;
  rowNumber: number; // 1-based data row (header = 0)
  action: RowAction;
  key: string; // business key value
  reason?: string; // for skip/error
  changes?: string[]; // for update: changed field keys
  data?: Record<string, unknown>; // parsed, DB-ready payload
}

export interface SheetSummary {
  sheetName: string;
  total: number;
  create: number;
  update: number;
  skip: number;
  error: number;
}

export interface PreviewResult {
  sectionId: SectionId;
  rows: RowEntry[];
  sheets: SheetSummary[];
  canApply: boolean;
  fingerprint: string;
}

export interface ApplyCounts {
  created: number;
  updated: number;
  skipped: number;
}

export interface ApplyResult {
  sectionId: SectionId;
  counts: Record<string, ApplyCounts>;
}

export interface BulkApplyActor {
  userId?: number | null;
  scientistId?: number | null;
  email?: string | null;
}

// ---------------------------------------------------------------------------
// HMAC fingerprint helpers
// ---------------------------------------------------------------------------

export function computeFingerprint(payload: unknown): string {
  const json = JSON.stringify(payload);
  return crypto.createHmac("sha256", getHmacSecret()).update(json).digest("hex");
}

export function verifyFingerprint(payload: unknown, fingerprint: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(fingerprint)) return false;
  const expected = computeFingerprint(payload);
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(fingerprint, "hex"));
}

// ---------------------------------------------------------------------------
// Sheet parsing helper
// ---------------------------------------------------------------------------

interface ParsedSheet {
  name: string;
  rows: Record<string, string>[];
  unknownHeaders: string[];
}

async function parseWorkbookBase64(fileBase64: string, fileName: string): Promise<ParsedSheet[]> {
  if (!fileName.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Only .xlsx workbooks are supported");
  }
  const buf = Buffer.from(fileBase64, "base64");
  if (buf.byteLength > MAX_WORKBOOK_BYTES) {
    throw new Error(`Workbook exceeds size limit (${MAX_WORKBOOK_BYTES / 1024 / 1024} MB)`);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const parsed: ParsedSheet[] = [];

  for (const ws of wb.worksheets) {
    const name = ws.name.trim();
    if (name === "Instructions") continue; // always skip instructions

    const cols = SHEET_COLS[name];
    if (!cols) {
      // Check if sheet has any data
      let hasData = false;
      ws.eachRow((row, rowNum) => { if (rowNum > 0) hasData = true; });
      if (hasData) {
        throw new Error(`Unknown sheet "${name}". Remove it or rename to a recognized sheet name.`);
      }
      continue;
    }

    const headerMap = makeHeaderMap(cols);
    const validKeys = new Set(Object.values(headerMap));

    const headers: string[] = [];
    const rows: Record<string, string>[] = [];
    const unknownHeaders: string[] = [];

    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) {
        row.eachCell({ includeEmpty: true }, (cell, colIdx) => {
          headers[colIdx] = cellString(cell.value);
        });
        // Check for unknown headers
        for (const h of headers) {
          if (!h) continue;
          const key = headerMap[h.toLowerCase().trim()];
          if (!key) unknownHeaders.push(h);
        }
      } else {
        const rowObj: Record<string, string> = {};
        row.eachCell({ includeEmpty: true }, (cell, colIdx) => {
          const header = headers[colIdx] ?? "";
          const key = headerMap[header.toLowerCase().trim()];
          if (key) rowObj[key] = cellString(cell.value);
        });
        // Only include rows with at least one non-empty cell
        if (Object.values(rowObj).some((v) => v !== "")) {
          rows.push(rowObj);
        }
      }
    });

    if (unknownHeaders.length > 0) {
      throw new Error(`Sheet "${name}" has unknown columns: ${unknownHeaders.map((h) => `"${h}"`).join(", ")}`);
    }

    if (rows.length > MAX_ROWS_PER_SHEET) {
      throw new Error(`Sheet "${name}" exceeds row limit (${MAX_ROWS_PER_SHEET} rows)`);
    }

    parsed.push({ name, rows, unknownHeaders });
  }

  // Check total rows
  const totalRows = parsed.reduce((sum, s) => sum + s.rows.length, 0);
  if (totalRows > MAX_TOTAL_ROWS) {
    throw new Error(`Total rows across all sheets exceeds limit (${MAX_TOTAL_ROWS})`);
  }

  return parsed;
}

async function parseSectionWorkbook(
  sectionId: SectionId,
  fileBase64: string,
  fileName: string,
): Promise<ParsedSheet[]> {
  const parsed = await parseWorkbookBase64(fileBase64, fileName);
  const allowedSheets = new Set(getSectionMeta(sectionId).sheets.map((sheet) => sheet.name));
  const wrongSectionSheets = parsed
    .map((sheet) => sheet.name)
    .filter((sheetName) => !allowedSheets.has(sheetName));
  if (wrongSectionSheets.length > 0) {
    throw new Error(
      `Workbook contains sheet(s) outside ${getSectionMeta(sectionId).label}: ${wrongSectionSheets.join(", ")}`,
    );
  }
  return parsed;
}

export async function inspectWorkbookStructure(
  sectionId: SectionId,
  fileBase64: string,
  fileName: string,
): Promise<Array<{ name: string; rowCount: number }>> {
  const sheets = await parseSectionWorkbook(sectionId, fileBase64, fileName);
  return sheets.map((sheet) => ({ name: sheet.name, rowCount: sheet.rows.length }));
}

// ---------------------------------------------------------------------------
// Per-sheet row previewing
// ---------------------------------------------------------------------------

function previewScientistRows(
  rows: Record<string, string>[],
  ctx: DbContext,
  inFileByEmail: Map<string, number>, // email → row index (for within-file dup detection)
  inFileByStaffId: Map<string, number>,
): RowEntry[] {
  const entries: RowEntry[] = [];
  const seenEmails = new Set<string>();
  const seenStaffIds = new Set<string>();

  rows.forEach((row, idx) => {
    const rowNumber = idx + 1;
    const errors: string[] = [];
    rejectRequiredClear(row, SCIENTIST_COLS, errors);
    const email = (row.email ?? "").trim().toLowerCase();
    const staffId = (row.staffId ?? "").trim();
    const staffIdKey = staffId.toLowerCase();

    if (!email) {
      entries.push({ sheetName: "Scientists", rowNumber, action: "error", key: staffId || `row ${rowNumber}`, reason: "Email is required" });
      return;
    }

    if (seenEmails.has(email)) {
      entries.push({ sheetName: "Scientists", rowNumber, action: "error", key: email, reason: `Duplicate email "${email}" in this file` });
      return;
    }
    seenEmails.add(email);

    if (staffId) {
      if (seenStaffIds.has(staffIdKey)) {
        errors.push(`Duplicate Staff ID "${staffId}" in this file`);
      }
      seenStaffIds.add(staffIdKey);
    }

    // Match existing
    const existingByStaffId = staffId
      ? ctx.scientists.find((s) => s.staffId?.toLowerCase() === staffIdKey)
      : undefined;
    const existingByEmail = ctx.scientistByEmail.get(email);
    if (existingByStaffId && existingByEmail && existingByStaffId.id !== existingByEmail.id) {
      errors.push(`Staff ID "${staffId}" belongs to a different record than email "${email}"`);
    }
    const existing = existingByStaffId ?? existingByEmail ?? null;
    const isNew = existing === null;

    // Required fields for new
    if (isNew) {
      if (!row.honorificTitle?.trim()) errors.push("Honorific Title is required for new records");
      if (!row.firstName?.trim()) errors.push("First Name is required for new records");
      if (!row.lastName?.trim()) errors.push("Last Name is required for new records");
    }

    // Validate staff type
    if (row.staffType && !["scientific", "administrative"].includes(row.staffType.trim().toLowerCase())) {
      errors.push(`Staff Type must be "scientific" or "administrative" (got "${row.staffType}")`);
    }

    // Validate supervisor
    const supervisorEmail = (row.supervisorEmail ?? "").trim().toLowerCase();
    if (supervisorEmail && !isClear(supervisorEmail)) {
      if (supervisorEmail === email) {
        errors.push("A staff member cannot be their own line manager");
      } else if (!ctx.scientistByEmail.has(supervisorEmail) && !inFileByEmail.has(supervisorEmail)) {
        errors.push(`Supervisor email "${supervisorEmail}" not found in DB or this file`);
      }
    }

    if (errors.length > 0) {
      entries.push({ sheetName: "Scientists", rowNumber, action: "error", key: email, reason: errors.join("; ") });
      return;
    }

    const data: Record<string, unknown> = { email };
    if (staffId) data.staffId = staffId;
    if (row.honorificTitle?.trim()) data.honorificTitle = row.honorificTitle.trim();
    if (row.firstName?.trim()) data.firstName = row.firstName.trim();
    if (row.lastName?.trim()) data.lastName = row.lastName.trim();
    const jt = maybeText(row.jobTitle ?? "", !isNew);
    if (jt !== undefined) data.jobTitle = jt;
    if (row.staffType?.trim()) data.staffType = row.staffType.trim().toLowerCase();
    const dept = maybeText(row.department ?? "", !isNew);
    if (dept !== undefined) data.department = dept;
    const orcid = maybeText(row.orcidId ?? "", !isNew);
    if (orcid !== undefined) data.orcidId = orcid;
    const li = maybeText(row.linkedInUrl ?? "", !isNew);
    if (li !== undefined) data.linkedInUrl = li;
    const gs = maybeText(row.googleScholarUrl ?? "", !isNew);
    if (gs !== undefined) data.googleScholarUrl = gs;
    const wos = maybeText(row.webOfScienceId ?? "", !isNew);
    if (wos !== undefined) data.webOfScienceId = wos;
    const bio = maybeText(row.bio ?? "", !isNew);
    if (bio !== undefined) data.bio = bio;
    if (supervisorEmail) {
      data.supervisorEmail = isClear(supervisorEmail) ? null : supervisorEmail;
    }

    if (isNew) {
      entries.push({ sheetName: "Scientists", rowNumber, action: "create", key: email, data });
    } else {
      // Determine changes
      const changes: string[] = [];
      for (const k of Object.keys(data)) {
        if (k === "email" || k === "supervisorEmail") continue;
        const cur = (existing as Record<string, unknown>)[k];
        const nv = data[k];
        if (nv !== undefined && String(cur ?? "") !== String(nv ?? "")) changes.push(k);
      }
      // Check supervisor change
      if (supervisorEmail) {
        const resolvedSupId = isClear(supervisorEmail)
          ? null
          : ctx.scientistByEmail.get(supervisorEmail)?.id ?? null;
        if (resolvedSupId !== existing.supervisorId) changes.push("supervisorId");
      }

      if (changes.length === 0) {
        entries.push({ sheetName: "Scientists", rowNumber, action: "skip", key: email, reason: "No changes" });
      } else {
        entries.push({ sheetName: "Scientists", rowNumber, action: "update", key: email, changes, data });
      }
    }
  });

  return entries;
}

function previewGrantRows2(
  rows: Record<string, string>[],
  ctx: DbContext,
  inFileScientistEmails: Set<string>,
): RowEntry[] {
  const entries: RowEntry[] = [];
  const seenKeys = new Set<string>();

  rows.forEach((row, idx) => {
    const rowNumber = idx + 1;
    const projectNumber = (row.projectNumber ?? "").trim();
    if (!projectNumber) {
      entries.push({ sheetName: "Grants", rowNumber, action: "error", key: `row ${rowNumber}`, reason: "Project Number is required" });
      return;
    }
    const key = projectNumber.toLowerCase();
    if (seenKeys.has(key)) {
      entries.push({ sheetName: "Grants", rowNumber, action: "error", key: projectNumber, reason: `Duplicate Project Number "${projectNumber}" in this file` });
      return;
    }
    seenKeys.add(key);

    const existing = ctx.grantByProjectNumber!.get(key) ?? null;
    const isNew = existing === null;
    const errors: string[] = [];
    rejectRequiredClear(row, GRANT_COLS, errors);

    if (isNew && !(row.title ?? "").trim()) {
      errors.push("Title is required for new grants");
    }

    const data: Record<string, unknown> = { projectNumber };

    // LPI
    let lpiId: number | null | undefined = undefined;
    const lpiEmail = (row.lpiEmail ?? "").trim().toLowerCase();
    if (lpiEmail) {
      if (isClear(lpiEmail)) {
        lpiId = null;
      } else {
        const s = ctx.scientistByEmail.get(lpiEmail);
        if (s) {
          lpiId = s.id;
        } else if (inFileScientistEmails.has(lpiEmail)) {
          data._lpiEmailKey = lpiEmail;
        } else {
          errors.push(`LPI email "${lpiEmail}" not found`);
        }
      }
    }

    // Awarded
    let awarded: boolean | undefined = undefined;
    if (row.awarded !== undefined && row.awarded !== "") {
      if (isClear(row.awarded)) {
        errors.push("Awarded cannot be cleared; enter Yes or No");
      } else {
        const b = parseBool(row.awarded, "Awarded", errors);
        if (b !== null) awarded = b;
      }
    }

    // Numeric / date fields
    if ((row.title ?? "").trim()) data.title = row.title.trim();

    const cycle = maybeText(row.cycle ?? "", !isNew);
    if (cycle !== undefined) data.cycle = cycle;
    const invType = maybeText(row.investigatorType ?? "", !isNew);
    if (invType !== undefined) data.investigatorType = invType;
    const grantType = maybeText(row.grantType ?? "", !isNew);
    if (grantType !== undefined) data.grantType = grantType;
    const sourceCategory = maybeText(row.sourceCategory ?? "", !isNew);
    if (sourceCategory !== undefined) data.sourceCategory = sourceCategory;
    const sourceRecordKey = maybeText(row.sourceRecordKey ?? "", !isNew);
    if (sourceRecordKey !== undefined) data.sourceRecordKey = sourceRecordKey;
    const submittingInstitution = maybeText(row.submittingInstitution ?? "", !isNew);
    if (submittingInstitution !== undefined) data.submittingInstitution = submittingInstitution;
    const contributionType = maybeText(row.contributionType ?? "", !isNew);
    if (contributionType !== undefined) data.contributionType = contributionType;
    const contributionDetails = maybeText(row.contributionDetails ?? "", !isNew);
    if (contributionDetails !== undefined) data.contributionDetails = contributionDetails;
    const currency = maybeText(row.currency ?? "", !isNew);
    if (currency !== undefined) {
      const normalizedCurrency = currency?.toUpperCase() ?? null;
      if (
        normalizedCurrency !== null
        && !GRANT_CURRENCY_VALUES.includes(
          normalizedCurrency as typeof GRANT_CURRENCY_VALUES[number],
        )
      ) {
        errors.push(`Currency must be EUR, USD, or QAR (got "${row.currency}")`);
      } else {
        data.currency = normalizedCurrency;
      }
    }
    const fa = maybeText(row.fundingAgency ?? "", !isNew);
    if (fa !== undefined) data.fundingAgency = fa;

    if (row.status) {
      if (isClear(row.status)) errors.push("Status cannot be cleared");
      else data.status = row.status.trim();
    }

    if (row.requestedAmount !== undefined && row.requestedAmount !== "") {
      data.requestedAmount = parseNumericField(row.requestedAmount, "Requested Amount", errors);
    }
    if (row.awardedAmount !== undefined && row.awardedAmount !== "") {
      data.awardedAmount = parseNumericField(row.awardedAmount, "Awarded Amount", errors);
    }
    if (awarded !== undefined) data.awarded = awarded;
    if (row.submittedYear && row.submittedYear !== "") {
      data.submittedYear = parseIntField(row.submittedYear, "Submitted Year", errors);
    }
    if (row.awardedYear && row.awardedYear !== "") {
      data.awardedYear = parseIntField(row.awardedYear, "Awarded Year", errors);
    }
    if (row.runningTimeYears && row.runningTimeYears !== "") {
      data.runningTimeYears = parseIntField(row.runningTimeYears, "Running Time (Years)", errors);
    }
    if (row.durationMonths && row.durationMonths !== "") {
      data.durationMonths = parseIntField(row.durationMonths, "Duration (Months)", errors);
    }
    const cgYear = maybeText(row.currentGrantYear ?? "", !isNew);
    if (cgYear !== undefined) data.currentGrantYear = cgYear;
    if (row.startDate && row.startDate !== "") {
      data.startDate = parseDateStr(row.startDate, "Start Date", errors);
    }
    if (row.endDate && row.endDate !== "") {
      data.endDate = parseDateStr(row.endDate, "End Date", errors);
    }
    if (row.reportingIntervalMonths && row.reportingIntervalMonths !== "") {
      data.reportingIntervalMonths = parseIntField(row.reportingIntervalMonths, "Reporting Interval (Months)", errors);
    }
    if (row.subawardCompletedYear && row.subawardCompletedYear !== "") {
      data.subawardCompletedYear = parseIntField(row.subawardCompletedYear, "Subaward Completed Year", errors);
    }
    if (row.coInvestigators !== undefined && (row.coInvestigators !== "" || !isNew)) {
      if (row.coInvestigators !== "") {
        if (isClear(row.coInvestigators)) {
          data.coInvestigators = null;
        } else {
          const incoming = splitSemicolon(row.coInvestigators);
          const merged = [...(existing?.coInvestigators ?? [])];
          const seen = new Set(merged.map((value) => value.trim().toLowerCase()));
          for (const value of incoming) {
            const key = value.trim().toLowerCase();
            if (key && !seen.has(key)) {
              seen.add(key);
              merged.push(value);
            }
          }
          data.coInvestigators = merged;
        }
      }
    }
    if (row.collaborators !== undefined && (row.collaborators !== "" || !isNew)) {
      if (row.collaborators !== "") {
        if (isClear(row.collaborators)) {
          data.collaborators = null;
        } else {
          const incoming = splitSemicolon(row.collaborators);
          const merged = [...(existing?.collaborators ?? [])];
          const seen = new Set(merged.map((value) => value.trim().toLowerCase()));
          for (const value of incoming) {
            const key = value.trim().toLowerCase();
            if (key && !seen.has(key)) {
              seen.add(key);
              merged.push(value);
            }
          }
          data.collaborators = merged;
        }
      }
    }
    const desc = maybeText(row.description ?? "", !isNew);
    if (desc !== undefined) data.description = desc;
    if (lpiId !== undefined) data.lpiId = lpiId;

    // Grant lifecycle
    if (errors.length === 0) {
      try {
        const lifecycle = reconcileGrantLifecycle(
          {
            status: data.status as string | undefined,
            awarded: data.awarded as boolean | undefined,
            startDate: data.startDate as string | undefined,
            endDate: data.endDate as string | undefined,
          },
          existing
            ? {
                status: existing.status,
                awarded: existing.awarded,
                startDate: existing.startDate ?? undefined,
                endDate: existing.endDate ?? undefined,
              }
            : undefined,
        );
        data.status = lifecycle.status;
        data.awarded = lifecycle.awarded;
      } catch (err) {
        errors.push(err instanceof GrantLifecycleError ? err.message : "Grant lifecycle error");
      }
    }

    // Protect granted with linked SDRs from clearing awarded
    if (errors.length === 0 && existing && !data.awarded && existing.awarded) {
      const linkedSdrs = ctx.grantLinkedSdrIds!.get(existing.id) ?? [];
      if (linkedSdrs.length > 0) {
        errors.push(`Cannot clear award status: grant has ${linkedSdrs.length} linked SDR(s)`);
      }
    }

    if (errors.length > 0) {
      entries.push({ sheetName: "Grants", rowNumber, action: "error", key: projectNumber, reason: errors.join("; ") });
      return;
    }

    if (isNew) {
      entries.push({ sheetName: "Grants", rowNumber, action: "create", key: projectNumber, data });
    } else {
      const changes: string[] = [];
      for (const [k, v] of Object.entries(data)) {
        if (k === "projectNumber") continue;
        const cur = (existing as Record<string, unknown>)[k];
        const norm = (x: unknown) => Array.isArray(x) ? x.join("; ") : x == null ? "" : String(x);
        if (norm(cur) !== norm(v)) changes.push(k);
      }
      if (changes.length === 0) {
        entries.push({ sheetName: "Grants", rowNumber, action: "skip", key: projectNumber, reason: "No changes" });
      } else {
        entries.push({ sheetName: "Grants", rowNumber, action: "update", key: projectNumber, changes, data });
      }
    }
  });

  return entries;
}

function previewProgramRows(
  rows: Record<string, string>[],
  ctx: DbContext,
): RowEntry[] {
  const entries: RowEntry[] = [];
  const seenKeys = new Set<string>();

  rows.forEach((row, idx) => {
    const rowNumber = idx + 1;
    const programId = (row.programId ?? "").trim();
    if (!programId) {
      entries.push({ sheetName: "Programs", rowNumber, action: "error", key: `row ${rowNumber}`, reason: "Program ID is required" });
      return;
    }
    const key = programId.toLowerCase();
    if (seenKeys.has(key)) {
      entries.push({ sheetName: "Programs", rowNumber, action: "error", key: programId, reason: `Duplicate Program ID "${programId}" in this file` });
      return;
    }
    seenKeys.add(key);

    const existing = ctx.programByProgramId!.get(key) ?? null;
    const isNew = existing === null;
    const errors: string[] = [];
    rejectRequiredClear(row, PROGRAM_COLS, errors);

    if (isNew && !(row.name ?? "").trim()) errors.push("Name is required for new programs");

    const resolveLeader = (emailRaw: string, label: string): number | null | undefined => {
      const e = emailRaw.trim().toLowerCase();
      if (!e) return undefined;
      if (isClear(e)) return null;
      const s = ctx.scientistByEmail.get(e);
      if (!s) { errors.push(`${label} email "${e}" not found`); return undefined; }
      return s.id;
    };

    const data: Record<string, unknown> = { programId };
    if ((row.name ?? "").trim()) data.name = row.name.trim();
    const desc = maybeText(row.description ?? "", !isNew);
    if (desc !== undefined) data.description = desc;

    const dir = resolveLeader(row.programDirectorEmail ?? "", "Program Director");
    if (dir !== undefined) data.programDirectorId = dir;
    const rcl = resolveLeader(row.researchCoLeadEmail ?? "", "Research Co-Lead");
    if (rcl !== undefined) data.researchCoLeadId = rcl;
    const ccl1 = resolveLeader(row.clinicalCoLead1Email ?? "", "Clinical Co-Lead 1");
    if (ccl1 !== undefined) data.clinicalCoLead1Id = ccl1;
    const ccl2 = resolveLeader(row.clinicalCoLead2Email ?? "", "Clinical Co-Lead 2");
    if (ccl2 !== undefined) data.clinicalCoLead2Id = ccl2;

    if (errors.length > 0) {
      entries.push({ sheetName: "Programs", rowNumber, action: "error", key: programId, reason: errors.join("; ") });
      return;
    }

    if (isNew) {
      entries.push({ sheetName: "Programs", rowNumber, action: "create", key: programId, data });
    } else {
      const changes: string[] = [];
      for (const [k, v] of Object.entries(data)) {
        if (k === "programId") continue;
        const cur = (existing as Record<string, unknown>)[k];
        if (String(cur ?? "") !== String(v ?? "")) changes.push(k);
      }
      if (changes.length === 0) {
        entries.push({ sheetName: "Programs", rowNumber, action: "skip", key: programId, reason: "No changes" });
      } else {
        entries.push({ sheetName: "Programs", rowNumber, action: "update", key: programId, changes, data });
      }
    }
  });
  return entries;
}

function previewProjectRows(
  rows: Record<string, string>[],
  ctx: DbContext,
  inFileProgramIds: Set<string>, // program IDs being created in this same file
): RowEntry[] {
  const entries: RowEntry[] = [];
  const seenKeys = new Set<string>();

  rows.forEach((row, idx) => {
    const rowNumber = idx + 1;
    const projectId = (row.projectId ?? "").trim();
    if (!projectId) {
      entries.push({ sheetName: "Projects", rowNumber, action: "error", key: `row ${rowNumber}`, reason: "Project ID is required" });
      return;
    }
    const key = projectId.toLowerCase();
    if (seenKeys.has(key)) {
      entries.push({ sheetName: "Projects", rowNumber, action: "error", key: projectId, reason: `Duplicate Project ID "${projectId}" in this file` });
      return;
    }
    seenKeys.add(key);

    const existing = ctx.projectByProjectId!.get(key) ?? null;
    const isNew = existing === null;
    const errors: string[] = [];
    rejectRequiredClear(row, PROJECT_COLS, errors);

    if (isNew && !(row.name ?? "").trim()) errors.push("Name is required for new projects");

    const data: Record<string, unknown> = { projectId };
    if ((row.name ?? "").trim()) data.name = row.name.trim();
    const desc = maybeText(row.description ?? "", !isNew);
    if (desc !== undefined) data.description = desc;

    // Resolve program
    const programIdRaw = (row.programId ?? "").trim();
    if (programIdRaw) {
      if (isClear(programIdRaw)) {
        data.programId = null;
      } else {
        const prog = ctx.programByProgramId!.get(programIdRaw.toLowerCase());
        if (prog) {
          data.programId = prog.id;
        } else if (inFileProgramIds.has(programIdRaw.toLowerCase())) {
          // Will be resolved at apply time
          data._programIdKey = programIdRaw;
        } else {
          errors.push(`Program ID "${programIdRaw}" not found`);
        }
      }
    }

    // Resolve PI
    const piEmail = (row.piEmail ?? "").trim().toLowerCase();
    if (piEmail) {
      if (isClear(piEmail)) {
        data.principalInvestigatorId = null;
      } else {
        const s = ctx.scientistByEmail.get(piEmail);
        if (!s) errors.push(`PI email "${piEmail}" not found`);
        else data.principalInvestigatorId = s.id;
      }
    }

    if (errors.length > 0) {
      entries.push({ sheetName: "Projects", rowNumber, action: "error", key: projectId, reason: errors.join("; ") });
      return;
    }

    if (isNew) {
      entries.push({ sheetName: "Projects", rowNumber, action: "create", key: projectId, data });
    } else {
      const changes: string[] = [];
      for (const [k, v] of Object.entries(data)) {
        if (k === "projectId" || k.startsWith("_")) continue;
        const cur = (existing as Record<string, unknown>)[k];
        if (String(cur ?? "") !== String(v ?? "")) changes.push(k);
      }
      if (changes.length === 0) {
        entries.push({ sheetName: "Projects", rowNumber, action: "skip", key: projectId, reason: "No changes" });
      } else {
        entries.push({ sheetName: "Projects", rowNumber, action: "update", key: projectId, changes, data });
      }
    }
  });
  return entries;
}

function previewSdrRows(
  rows: Record<string, string>[],
  ctx: DbContext,
  inFileProjectIds: Set<string>,
): RowEntry[] {
  const entries: RowEntry[] = [];
  const seenKeys = new Set<string>();

  rows.forEach((row, idx) => {
    const rowNumber = idx + 1;
    const sdrNumber = (row.sdrNumber ?? "").trim();
    if (!sdrNumber) {
      entries.push({ sheetName: "Research Activities", rowNumber, action: "error", key: `row ${rowNumber}`, reason: "SDR Number is required" });
      return;
    }
    const key = sdrNumber.toLowerCase();
    if (seenKeys.has(key)) {
      entries.push({ sheetName: "Research Activities", rowNumber, action: "error", key: sdrNumber, reason: `Duplicate SDR Number "${sdrNumber}" in this file` });
      return;
    }
    seenKeys.add(key);

    const existing = ctx.sdrBySdrNumber!.get(key) ?? null;
    const isNew = existing === null;
    const errors: string[] = [];
    rejectRequiredClear(row, SDR_COLS, errors);

    if (isNew && !(row.title ?? "").trim()) errors.push("Title is required for new research activities");

    const data: Record<string, unknown> = { sdrNumber };
    if ((row.title ?? "").trim()) data.title = row.title.trim();
    const st = maybeText(row.shortTitle ?? "", !isNew);
    if (st !== undefined) data.shortTitle = st;
    const desc = maybeText(row.description ?? "", !isNew);
    if (desc !== undefined) data.description = desc;
    if (row.status?.trim()) {
      if (isClear(row.status)) errors.push("Status cannot be cleared");
      else data.status = row.status.trim();
    }
    const obj = maybeText(row.objectives ?? "", !isNew);
    if (obj !== undefined) data.objectives = obj;
    const sb = maybeText(row.sidraBranch ?? "", !isNew);
    if (sb !== undefined) data.sidraBranch = sb;
    const ane = maybeText(row.additionalNotificationEmail ?? "", !isNew);
    if (ane !== undefined) data.additionalNotificationEmail = ane;

    if (row.startDate && row.startDate !== "") {
      data.startDate = parseDateTimestamp(row.startDate, "Start Date", errors);
    }
    if (row.endDate && row.endDate !== "") {
      data.endDate = parseDateTimestamp(row.endDate, "End Date", errors);
    }

    if (row.budgetSource !== undefined && row.budgetSource !== "") {
      data.budgetSource = isClear(row.budgetSource) ? null : splitSemicolon(row.budgetSource);
    }

    // Resolve project
    const projectIdRaw = (row.projectId ?? "").trim();
    if (projectIdRaw) {
      if (isClear(projectIdRaw)) {
        data.projectId = null;
      } else {
        const proj = ctx.projectByProjectId!.get(projectIdRaw.toLowerCase());
        if (proj) {
          data.projectId = proj.id;
        } else if (inFileProjectIds.has(projectIdRaw.toLowerCase())) {
          data._projectIdKey = projectIdRaw;
        } else {
          errors.push(`Project ID "${projectIdRaw}" not found`);
        }
      }
    }

    // Resolve budget holder
    const bhEmail = (row.budgetHolderEmail ?? "").trim().toLowerCase();
    if (bhEmail) {
      if (isClear(bhEmail)) {
        data.budgetHolderId = null;
      } else {
        const s = ctx.scientistByEmail.get(bhEmail);
        if (!s) errors.push(`Budget Holder email "${bhEmail}" not found`);
        else data.budgetHolderId = s.id;
      }
    }

    if (errors.length > 0) {
      entries.push({ sheetName: "Research Activities", rowNumber, action: "error", key: sdrNumber, reason: errors.join("; ") });
      return;
    }

    if (isNew) {
      entries.push({ sheetName: "Research Activities", rowNumber, action: "create", key: sdrNumber, data });
    } else {
      const changes: string[] = [];
      for (const [k, v] of Object.entries(data)) {
        if (k === "sdrNumber" || k.startsWith("_")) continue;
        const cur = (existing as Record<string, unknown>)[k];
        const norm = (x: unknown) => {
          if (x instanceof Date) return x.toISOString().slice(0, 10);
          if (Array.isArray(x)) return x.join("; ");
          return x == null ? "" : String(x);
        };
        if (norm(cur) !== norm(v)) changes.push(k);
      }
      if (changes.length === 0) {
        entries.push({ sheetName: "Research Activities", rowNumber, action: "skip", key: sdrNumber, reason: "No changes" });
      } else {
        entries.push({ sheetName: "Research Activities", rowNumber, action: "update", key: sdrNumber, changes, data });
      }
    }
  });
  return entries;
}

function previewIrbRows(
  rows: Record<string, string>[],
  ctx: DbContext,
  inFileSdrNumbers: Set<string>,
): RowEntry[] {
  const entries: RowEntry[] = [];
  const seenKeys = new Set<string>();

  rows.forEach((row, idx) => {
    const rowNumber = idx + 1;
    const irbNumber = (row.irbNumber ?? "").trim();
    if (!irbNumber) {
      entries.push({ sheetName: "IRB Applications", rowNumber, action: "error", key: `row ${rowNumber}`, reason: "IRB Number is required" });
      return;
    }
    const key = irbNumber.toLowerCase();
    if (seenKeys.has(key)) {
      entries.push({ sheetName: "IRB Applications", rowNumber, action: "error", key: irbNumber, reason: `Duplicate IRB Number "${irbNumber}" in this file` });
      return;
    }
    seenKeys.add(key);

    const existing = ctx.irbByIrbNumber!.get(key) ?? null;
    const isNew = existing === null;
    const errors: string[] = [];
    rejectRequiredClear(row, IRB_COLS, errors);

    if (isNew) {
      if (!(row.title ?? "").trim()) errors.push("Title is required for new IRB applications");
      if (!(row.piEmail ?? "").trim()) errors.push("PI Email is required for new IRB applications");
      if (!(row.status ?? "").trim()) errors.push("Status is required for new IRB applications");
    }

    const data: Record<string, unknown> = { irbNumber };
    if ((row.title ?? "").trim()) data.title = row.title.trim();
    const st = maybeText(row.shortTitle ?? "", !isNew);
    if (st !== undefined) data.shortTitle = st;
    const irbNet = maybeText(row.irbNetNumber ?? "", !isNew);
    if (irbNet !== undefined) data.irbNetNumber = irbNet;
    const oldNum = maybeText(row.oldNumber ?? "", !isNew);
    if (oldNum !== undefined) data.oldNumber = oldNum;
    const ane = maybeText(row.additionalNotificationEmail ?? "", !isNew);
    if (ane !== undefined) data.additionalNotificationEmail = ane;
    const pt = maybeText(row.protocolType ?? "", !isNew);
    if (pt !== undefined) data.protocolType = pt;
    if (row.status?.trim()) data.status = row.status.trim();
    const rl = maybeText(row.riskLevel ?? "", !isNew);
    if (rl !== undefined) data.riskLevel = rl;
    const fs = maybeText(row.fundingSource ?? "", !isNew);
    if (fs !== undefined) data.fundingSource = fs;
    const desc = maybeText(row.description ?? "", !isNew);
    if (desc !== undefined) data.description = desc;

    if (row.isInterventional !== undefined && row.isInterventional !== "") {
      data.isInterventional = parseBool(row.isInterventional, "Is Interventional", errors);
    }

    if (row.submissionDate && row.submissionDate !== "") {
      data.submissionDate = parseDateTimestamp(row.submissionDate, "Submission Date", errors);
    }
    if (row.initialApprovalDate && row.initialApprovalDate !== "") {
      data.initialApprovalDate = parseDateStr(row.initialApprovalDate, "Initial Approval Date", errors);
    }
    if (row.expirationDate && row.expirationDate !== "") {
      data.expirationDate = parseDateStr(row.expirationDate, "Expiration Date", errors);
    }

    // Resolve PI
    const piEmail = (row.piEmail ?? "").trim().toLowerCase();
    if (piEmail) {
      if (isClear(piEmail)) {
        errors.push("PI Email cannot be cleared");
      } else {
        const s = ctx.scientistByEmail.get(piEmail);
        if (!s) errors.push(`PI email "${piEmail}" not found`);
        else data.principalInvestigatorId = s.id;
      }
    }

    // Resolve SDR
    const sdrNumberRaw = (row.sdrNumber ?? "").trim();
    if (sdrNumberRaw) {
      if (isClear(sdrNumberRaw)) {
        data.researchActivityId = null;
      } else {
        const sdr = ctx.sdrBySdrNumber!.get(sdrNumberRaw.toLowerCase());
        if (sdr) {
          data.researchActivityId = sdr.id;
        } else if (inFileSdrNumbers.has(sdrNumberRaw.toLowerCase())) {
          data._sdrNumberKey = sdrNumberRaw;
        } else {
          errors.push(`SDR Number "${sdrNumberRaw}" not found`);
        }
      }
    }

    if (errors.length > 0) {
      entries.push({ sheetName: "IRB Applications", rowNumber, action: "error", key: irbNumber, reason: errors.join("; ") });
      return;
    }

    if (isNew) {
      entries.push({ sheetName: "IRB Applications", rowNumber, action: "create", key: irbNumber, data });
    } else {
      const changes: string[] = [];
      for (const [k, v] of Object.entries(data)) {
        if (k === "irbNumber" || k.startsWith("_")) continue;
        const cur = (existing as Record<string, unknown>)[k];
        if (String(cur ?? "") !== String(v ?? "")) changes.push(k);
      }
      if (changes.length === 0) {
        entries.push({ sheetName: "IRB Applications", rowNumber, action: "skip", key: irbNumber, reason: "No changes" });
      } else {
        entries.push({ sheetName: "IRB Applications", rowNumber, action: "update", key: irbNumber, changes, data });
      }
    }
  });
  return entries;
}

function previewIbcRows(
  rows: Record<string, string>[],
  ctx: DbContext,
): RowEntry[] {
  const entries: RowEntry[] = [];
  const seenKeys = new Set<string>();

  rows.forEach((row, idx) => {
    const rowNumber = idx + 1;
    const ibcNumber = (row.ibcNumber ?? "").trim();
    if (!ibcNumber) {
      entries.push({ sheetName: "IBC Applications", rowNumber, action: "error", key: `row ${rowNumber}`, reason: "IBC Number is required" });
      return;
    }
    const key = ibcNumber.toLowerCase();
    if (seenKeys.has(key)) {
      entries.push({ sheetName: "IBC Applications", rowNumber, action: "error", key: ibcNumber, reason: `Duplicate IBC Number "${ibcNumber}" in this file` });
      return;
    }
    seenKeys.add(key);

    const existing = ctx.ibcByIbcNumber!.get(key) ?? null;
    const isNew = existing === null;
    const errors: string[] = [];
    rejectRequiredClear(row, IBC_COLS, errors);

    if (isNew) {
      if (!(row.title ?? "").trim()) errors.push("Title is required");
      if (!(row.piEmail ?? "").trim()) errors.push("PI Email is required");
      if (!(row.biosafetyLevel ?? "").trim()) errors.push("Biosafety Level is required");
      if (!(row.status ?? "").trim()) errors.push("Status is required");
      if (!(row.riskLevel ?? "").trim()) errors.push("Risk Level is required");
    }

    const data: Record<string, unknown> = { ibcNumber };
    if ((row.title ?? "").trim()) data.title = row.title.trim();
    const sh = maybeText(row.shortTitle ?? "", !isNew);
    if (sh !== undefined) data.shortTitle = sh;
    const ane = maybeText(row.additionalNotificationEmail ?? "", !isNew);
    if (ane !== undefined) data.additionalNotificationEmail = ane;
    if (row.biosafetyLevel?.trim()) data.biosafetyLevel = row.biosafetyLevel.trim();
    const rgc = maybeText(row.riskGroupClassification ?? "", !isNew);
    if (rgc !== undefined) data.riskGroupClassification = rgc;
    if (row.status?.trim()) data.status = row.status.trim();
    if (row.riskLevel?.trim()) data.riskLevel = row.riskLevel.trim();
    const desc = maybeText(row.description ?? "", !isNew);
    if (desc !== undefined) data.description = desc;
    const ps = maybeText(row.protocolSummary ?? "", !isNew);
    if (ps !== undefined) data.protocolSummary = ps;

    if (row.submissionDate && row.submissionDate !== "") {
      data.submissionDate = parseDateTimestamp(row.submissionDate, "Submission Date", errors);
    }
    if (row.approvalDate && row.approvalDate !== "") {
      data.approvalDate = parseDateTimestamp(row.approvalDate, "Approval Date", errors);
    }
    if (row.expirationDate && row.expirationDate !== "") {
      data.expirationDate = parseDateStr(row.expirationDate, "Expiration Date", errors);
    }

    // Resolve PI
    const piEmail = (row.piEmail ?? "").trim().toLowerCase();
    if (piEmail) {
      if (isClear(piEmail)) {
        errors.push("PI Email cannot be cleared");
      } else {
        const s = ctx.scientistByEmail.get(piEmail);
        if (!s) errors.push(`PI email "${piEmail}" not found`);
        else data.principalInvestigatorId = s.id;
      }
    }

    if (errors.length > 0) {
      entries.push({ sheetName: "IBC Applications", rowNumber, action: "error", key: ibcNumber, reason: errors.join("; ") });
      return;
    }

    if (isNew) {
      entries.push({ sheetName: "IBC Applications", rowNumber, action: "create", key: ibcNumber, data });
    } else {
      const changes: string[] = [];
      for (const [k, v] of Object.entries(data)) {
        if (k === "ibcNumber" || k.startsWith("_")) continue;
        const cur = (existing as Record<string, unknown>)[k];
        if (String(cur ?? "") !== String(v ?? "")) changes.push(k);
      }
      if (changes.length === 0) {
        entries.push({ sheetName: "IBC Applications", rowNumber, action: "skip", key: ibcNumber, reason: "No changes" });
      } else {
        entries.push({ sheetName: "IBC Applications", rowNumber, action: "update", key: ibcNumber, changes, data });
      }
    }
  });
  return entries;
}

function previewContractRows(
  rows: Record<string, string>[],
  ctx: DbContext,
  inFileSdrNumbers: Set<string>,
): RowEntry[] {
  const entries: RowEntry[] = [];
  const seenKeys = new Set<string>();

  rows.forEach((row, idx) => {
    const rowNumber = idx + 1;
    const contractNumber = (row.contractNumber ?? "").trim();
    if (!contractNumber) {
      entries.push({ sheetName: "Research Contracts", rowNumber, action: "error", key: `row ${rowNumber}`, reason: "Contract Number is required" });
      return;
    }
    const key = contractNumber.toLowerCase();
    if (seenKeys.has(key)) {
      entries.push({ sheetName: "Research Contracts", rowNumber, action: "error", key: contractNumber, reason: `Duplicate Contract Number "${contractNumber}" in this file` });
      return;
    }
    seenKeys.add(key);

    const existing = ctx.contractByContractNumber!.get(key) ?? null;
    const isNew = existing === null;
    const errors: string[] = [];
    rejectRequiredClear(row, CONTRACT_COLS, errors);

    if (isNew && !(row.title ?? "").trim()) errors.push("Title is required for new contracts");

    const data: Record<string, unknown> = { contractNumber };
    if ((row.title ?? "").trim()) data.title = row.title.trim();
    const ct = maybeText(row.contractType ?? "", !isNew);
    if (ct !== undefined) data.contractType = ct;
    if (row.status?.trim()) {
      if (isClear(row.status)) errors.push("Status cannot be cleared");
      else data.status = row.status.trim();
    }
    if (row.startDate && row.startDate !== "") {
      data.startDate = parseDateStr(row.startDate, "Start Date", errors);
    }
    if (row.endDate && row.endDate !== "") {
      data.endDate = parseDateStr(row.endDate, "End Date", errors);
    }
    const irb = maybeText(row.irbProtocol ?? "", !isNew);
    if (irb !== undefined) data.irbProtocol = irb;
    const ibc = maybeText(row.ibcProtocol ?? "", !isNew);
    if (ibc !== undefined) data.ibcProtocol = ibc;
    const qnrf = maybeText(row.qnrfNumber ?? "", !isNew);
    if (qnrf !== undefined) data.qnrfNumber = qnrf;
    const fsc = maybeText(row.fundingSourceCategory ?? "", !isNew);
    if (fsc !== undefined) data.fundingSourceCategory = fsc;
    const cn = maybeText(row.contractorName ?? "", !isNew);
    if (cn !== undefined) data.contractorName = cn;
    const cc = maybeText(row.counterpartyContact ?? "", !isNew);
    if (cc !== undefined) data.counterpartyContact = cc;
    const cco = maybeText(row.counterpartyCountry ?? "", !isNew);
    if (cco !== undefined) data.counterpartyCountry = cco;
    if (row.contractValue && row.contractValue !== "") {
      data.contractValue = parseNumericField(row.contractValue, "Contract Value", errors);
    }
    const cur = maybeText(row.currency ?? "", !isNew);
    if (cur !== undefined) data.currency = cur;
    const rem = maybeText(row.remarks ?? "", !isNew);
    if (rem !== undefined) data.remarks = rem;
    const desc = maybeText(row.description ?? "", !isNew);
    if (desc !== undefined) data.description = desc;

    // Resolve SDR
    const sdrRaw = (row.sdrNumber ?? "").trim();
    if (sdrRaw) {
      if (isClear(sdrRaw)) {
        data.researchActivityId = null;
      } else {
        const sdr = ctx.sdrBySdrNumber!.get(sdrRaw.toLowerCase());
        if (sdr) {
          data.researchActivityId = sdr.id;
        } else if (inFileSdrNumbers.has(sdrRaw.toLowerCase())) {
          data._sdrNumberKey = sdrRaw;
        } else {
          errors.push(`SDR Number "${sdrRaw}" not found`);
        }
      }
    }

    // Resolve lead PI
    const leadPiEmail = (row.leadPiEmail ?? "").trim().toLowerCase();
    if (leadPiEmail) {
      if (isClear(leadPiEmail)) {
        data.leadPIId = null;
      } else {
        const s = ctx.scientistByEmail.get(leadPiEmail);
        if (!s) errors.push(`Lead PI email "${leadPiEmail}" not found`);
        else data.leadPIId = s.id;
      }
    }

    if (errors.length > 0) {
      entries.push({ sheetName: "Research Contracts", rowNumber, action: "error", key: contractNumber, reason: errors.join("; ") });
      return;
    }

    if (isNew) {
      entries.push({ sheetName: "Research Contracts", rowNumber, action: "create", key: contractNumber, data });
    } else {
      const changes: string[] = [];
      for (const [k, v] of Object.entries(data)) {
        if (k === "contractNumber" || k.startsWith("_")) continue;
        const cur2 = (existing as Record<string, unknown>)[k];
        if (String(cur2 ?? "") !== String(v ?? "")) changes.push(k);
      }
      if (changes.length === 0) {
        entries.push({ sheetName: "Research Contracts", rowNumber, action: "skip", key: contractNumber, reason: "No changes" });
      } else {
        entries.push({ sheetName: "Research Contracts", rowNumber, action: "update", key: contractNumber, changes, data });
      }
    }
  });
  return entries;
}

function previewPatentRows(
  rows: Record<string, string>[],
  ctx: DbContext,
  inFileSdrNumbers: Set<string>,
): RowEntry[] {
  const entries: RowEntry[] = [];
  const seenKeys = new Set<string>();

  rows.forEach((row, idx) => {
    const rowNumber = idx + 1;
    const patentNumber = (row.patentNumber ?? "").trim();
    if (!patentNumber) {
      entries.push({ sheetName: "Patents", rowNumber, action: "skip", key: `row ${rowNumber}`, reason: "Patent Number is required; row skipped" });
      return;
    }
    const key = patentNumber.toLowerCase();
    if (seenKeys.has(key)) {
      entries.push({ sheetName: "Patents", rowNumber, action: "error", key: patentNumber, reason: `Duplicate Patent Number "${patentNumber}" in this file` });
      return;
    }
    seenKeys.add(key);

    const existing = ctx.patentByPatentNumber!.get(key) ?? null;
    const isNew = existing === null;
    const errors: string[] = [];
    rejectRequiredClear(row, PATENT_COLS, errors);

    if (isNew) {
      if (!(row.title ?? "").trim()) errors.push("Title is required");
      if (!(row.inventors ?? "").trim()) errors.push("Inventors is required");
      if (!(row.status ?? "").trim()) errors.push("Status is required");
    }

    const data: Record<string, unknown> = { patentNumber };
    if ((row.title ?? "").trim()) data.title = row.title.trim();
    const inv = maybeText(row.inventors ?? "", !isNew);
    if (inv !== undefined) data.inventors = inv;
    if (row.status?.trim()) data.status = row.status.trim();
    const desc = maybeText(row.description ?? "", !isNew);
    if (desc !== undefined) data.description = desc;

    if (row.filingDate && row.filingDate !== "") {
      data.filingDate = parseDateTimestamp(row.filingDate, "Filing Date", errors);
    }
    if (row.grantDate && row.grantDate !== "") {
      data.grantDate = parseDateTimestamp(row.grantDate, "Grant Date", errors);
    }

    // Resolve SDR
    const sdrRaw = (row.sdrNumber ?? "").trim();
    if (sdrRaw) {
      if (isClear(sdrRaw)) {
        data.researchActivityId = null;
      } else {
        const sdr = ctx.sdrBySdrNumber!.get(sdrRaw.toLowerCase());
        if (sdr) {
          data.researchActivityId = sdr.id;
        } else if (inFileSdrNumbers.has(sdrRaw.toLowerCase())) {
          data._sdrNumberKey = sdrRaw;
        } else {
          errors.push(`SDR Number "${sdrRaw}" not found`);
        }
      }
    }

    if (errors.length > 0) {
      entries.push({ sheetName: "Patents", rowNumber, action: "error", key: patentNumber, reason: errors.join("; ") });
      return;
    }

    if (isNew) {
      entries.push({ sheetName: "Patents", rowNumber, action: "create", key: patentNumber, data });
    } else {
      const changes: string[] = [];
      for (const [k, v] of Object.entries(data)) {
        if (k === "patentNumber" || k.startsWith("_")) continue;
        const cur = (existing as Record<string, unknown>)[k];
        const norm = (x: unknown) => {
          if (x instanceof Date) return x.toISOString().slice(0, 10);
          return x == null ? "" : String(x);
        };
        if (norm(cur) !== norm(v)) changes.push(k);
      }
      if (changes.length === 0) {
        entries.push({ sheetName: "Patents", rowNumber, action: "skip", key: patentNumber, reason: "No changes" });
      } else {
        entries.push({ sheetName: "Patents", rowNumber, action: "update", key: patentNumber, changes, data });
      }
    }
  });
  return entries;
}

function normalizeScalarKey(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeDoi(value: unknown): string {
  return normalizeScalarKey(value)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "");
}

function publicationCompositeKey(
  title: unknown,
  date: Date | string | null | undefined,
  journal: unknown,
): string {
  const normalizedTitle = normalizeScalarKey(title);
  const normalizedJournal = normalizeScalarKey(journal);
  const normalizedDate = date instanceof Date
    ? date.toISOString().slice(0, 10)
    : String(date ?? "").slice(0, 10);
  return normalizedTitle && normalizedDate && normalizedJournal
    ? `${normalizedTitle}\u0000${normalizedDate}\u0000${normalizedJournal}`
    : "";
}

function previewPublicationRows(
  rows: Record<string, string>[],
  ctx: DbContext,
): RowEntry[] {
  const seenIds = new Set<number>();
  const seenDois = new Set<string>();
  const seenPmids = new Set<string>();
  const seenComposites = new Set<string>();
  return rows.map((row, index) => {
    const rowNumber = index + 1;
    const errors: string[] = [];
    rejectRequiredClear(row, PUBLICATION_COLS, errors);
    const idRaw = (row.publicationId ?? "").trim();
    let suppliedId: number | undefined;
    let existing: Publication | undefined;
    if (idRaw) {
      suppliedId = parseStrictInteger(idRaw, "Publication ID", errors) ?? undefined;
      if (suppliedId != null && suppliedId <= 0) errors.push("Publication ID must be a positive integer");
      if (suppliedId != null) {
        if (seenIds.has(suppliedId)) errors.push(`Duplicate Publication ID "${suppliedId}" in this file`);
        seenIds.add(suppliedId);
        existing = ctx.publicationById!.get(suppliedId);
        if (!existing) errors.push(`Publication ID "${suppliedId}" was not found`);
      }
    }

    const doiRaw = (row.doi ?? "").trim();
    const doi = doiRaw && !isClear(doiRaw) ? normalizeDoi(doiRaw) : "";
    const pmid = normalizeScalarKey(row.pmid);
    let publicationDate: Date | null | undefined;
    if ((row.publicationDate ?? "") !== "") {
      publicationDate = parseDateTimestamp(row.publicationDate, "Publication Date", errors);
    }
    const composite = publicationCompositeKey(row.title, publicationDate, row.journal);
    for (const [key, seen, label] of [
      [doi, seenDois, "DOI"],
      [pmid, seenPmids, "PMID"],
      [composite, seenComposites, "Title + Publication Date + Journal"],
    ] as const) {
      if (!key) continue;
      if (seen.has(key)) errors.push(`Duplicate normalized ${label} key in this file`);
      seen.add(key);
    }

    const candidateById = new Map<number, Publication>();
    for (const [label, key, candidates] of [
      ["DOI", doi, doi ? ctx.publicationByDoi!.get(doi) : undefined],
      ["PMID", pmid, pmid ? ctx.publicationByPmid!.get(pmid) : undefined],
      ["Title + Publication Date + Journal", composite, composite ? ctx.publicationByComposite!.get(composite) : undefined],
    ] as const) {
      if (!key) continue;
      if ((candidates?.length ?? 0) > 1) {
        errors.push(`${label} matches multiple publications; supply a unique Publication ID and keys`);
      }
      for (const candidate of candidates ?? []) candidateById.set(candidate.id, candidate);
    }
    if (candidateById.size > 1) {
      errors.push("Supplied publication keys resolve to different existing publications");
    }
    if (idRaw && existing) {
      const conflictingIds = [...candidateById.keys()].filter((candidateId) => candidateId !== existing!.id);
      if (conflictingIds.length) {
        errors.push(`Supplied publication keys conflict with Publication ID "${existing.id}"`);
      }
    } else if (!idRaw && candidateById.size === 1) {
      existing = candidateById.values().next().value;
    }
    const isNew = !existing && !idRaw;
    const title = (row.title ?? "").trim();
    if (isNew && !title) errors.push("Title is required");
    if (isNew && !doi && !pmid && !composite) {
      errors.push("New publications require DOI, PMID, or Publication Date plus Journal");
    }

    const data: Record<string, unknown> = {};
    if (existing) data.id = existing.id;
    if (title) data.title = title;
    const textFields = [
      "abstract", "authors", "journal", "volume", "issue", "pages", "pmid",
      "publicationType", "prepublicationUrl", "prepublicationSite",
    ];
    for (const field of textFields) {
      const value = maybeText(row[field] ?? "", !!existing);
      if (value !== undefined) data[field] = value;
    }
    if (doiRaw) data.doi = isClear(doiRaw) ? null : doi;
    if ((row.publicationDate ?? "") !== "") data.publicationDate = publicationDate ?? null;
    const sdrRaw = (row.sdrNumber ?? "").trim();
    if (sdrRaw) {
      if (isClear(sdrRaw)) data.researchActivityId = null;
      else {
        const sdr = ctx.sdrBySdrNumber!.get(sdrRaw.toLowerCase());
        if (!sdr) errors.push(`SDR Number "${sdrRaw}" not found`);
        else data.researchActivityId = sdr.id;
      }
    }
    const key = existing ? String(existing.id) : doi || pmid || composite || `row ${rowNumber}`;
    if (existing?.status === "Published *") {
      return {
        sheetName: "Publications", rowNumber, action: "skip", key,
        reason: "Publication is sealed (Published *) and cannot be changed",
      };
    }
    if (errors.length) return { sheetName: "Publications", rowNumber, action: "error", key, reason: errors.join("; ") };
    return finishStructuredEntry(
      "Publications", rowNumber, key,
      existing as unknown as Record<string, unknown> | undefined,
      data, errors, new Set(["id"]),
    );
  });
}

function previewJournalImpactFactorRows(
  rows: Record<string, string>[],
  ctx: DbContext,
): RowEntry[] {
  const seen = new Set<string>();
  return rows.map((row, index) => {
    const rowNumber = index + 1;
    const errors: string[] = [];
    rejectRequiredClear(row, JOURNAL_IMPACT_FACTOR_COLS, errors);
    const journalName = (row.journalName ?? "").trim();
    if (!journalName) errors.push("Journal Name is required");
    const year = parseStrictInteger(row.year ?? "", "Year", errors);
    if (year == null) errors.push("Year is required");
    else if (year <= 0) errors.push("Year must be a positive integer");
    const normalizedName = normalizeScalarKey(journalName);
    const key = `${normalizedName}\u0000${year ?? ""}`;
    if (normalizedName && year != null) {
      if (seen.has(key)) errors.push(`Duplicate Journal Name + Year "${journalName} + ${year}" in this file`);
      seen.add(key);
    }
    const journal = ctx.journalByName!.get(normalizedName);
    const existing = journal && year != null
      ? ctx.journalMetricByKey!.get(`${journal.id}\u0000${year}`)
      : undefined;
    const data: Record<string, unknown> = { journalName, year };
    for (const field of ["abbreviatedJournal", "publisher", "issn", "eissn", "field"]) {
      const value = maybeText(row[field] ?? "", !!journal);
      if (value !== undefined) data[field] = value;
    }
    const decimalFields = [
      "impactFactor", "fiveYearJif", "jifWithoutSelfCites", "jci",
      "citedHalfLife", "citingHalfLife",
    ];
    for (const field of decimalFields) {
      if ((row[field] ?? "") !== "") data[field] = parseStrictNonnegativeDecimal(row[field], JOURNAL_IMPACT_FACTOR_COLS.find((c) => c.key === field)!.header, errors);
    }
    for (const field of ["rank", "totalCites", "totalArticles", "citableItems", "totalCitations"]) {
      if ((row[field] ?? "") !== "") {
        const value = parseStrictInteger(row[field], JOURNAL_IMPACT_FACTOR_COLS.find((c) => c.key === field)!.header, errors);
        if (value != null && value < 0) errors.push(`${JOURNAL_IMPACT_FACTOR_COLS.find((c) => c.key === field)!.header}: cannot be negative`);
        data[field] = value;
      }
    }
    if ((row.quartile ?? "") !== "") {
      if (isClear(row.quartile)) data.quartile = null;
      else {
        const quartile = row.quartile.trim().toUpperCase();
        if (!/^Q[1-4]$/.test(quartile)) errors.push(`Quartile: must be Q1, Q2, Q3, or Q4 (got "${row.quartile}")`);
        else data.quartile = quartile;
      }
    }
    const comparable = existing
      ? { ...(journal as unknown as Record<string, unknown>), ...(existing as unknown as Record<string, unknown>) }
      : undefined;
    return finishStructuredEntry(
      "Journal Impact Factors", rowNumber, `${journalName} + ${year ?? ""}`,
      comparable, data, errors, new Set(["journalName", "year"]),
    );
  });
}

function normalizedValue(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

function finishStructuredEntry(
  sheetName: string,
  rowNumber: number,
  key: string,
  existing: Record<string, unknown> | undefined,
  data: Record<string, unknown>,
  errors: string[],
  keyFields: Set<string>,
): RowEntry {
  if (errors.length) return { sheetName, rowNumber, action: "error", key, reason: errors.join("; ") };
  if (!existing) return { sheetName, rowNumber, action: "create", key, data };
  const changes = Object.entries(data)
    .filter(([field]) => !field.startsWith("_") && !keyFields.has(field))
    .filter(([field, value]) => normalizedValue(existing[field]) !== normalizedValue(value))
    .map(([field]) => field);
  return changes.length
    ? { sheetName, rowNumber, action: "update", key, changes, data }
    : { sheetName, rowNumber, action: "skip", key, reason: "No changes" };
}

function previewBuildingRows(rows: Record<string, string>[], ctx: DbContext): RowEntry[] {
  const counts = new Map<string, number>();
  rows.forEach((r) => { if (r.name) counts.set(r.name.toLowerCase(), (counts.get(r.name.toLowerCase()) ?? 0) + 1); });
  return rows.map((row, index) => {
    const rowNumber = index + 1;
    const name = row.name?.trim() ?? "";
    const key = name;
    const lower = name.toLowerCase();
    const errors: string[] = [];
    rejectRequiredClear(row, BUILDING_COLS, errors);
    if (!name || isClear(name)) errors.push("Building Name is required");
    if ((counts.get(lower) ?? 0) > 1) errors.push("Duplicate building name in workbook");
    if (ctx.ambiguousBuildingNames!.has(lower)) errors.push("Building name is ambiguous in the database");
    const existing = ctx.buildingByName!.get(lower);
    const data: Record<string, unknown> = { name };
    const textFields = ["address", "description", "emergencyContact", "safetyNotes"];
    for (const field of textFields) {
      const value = maybeText(row[field] ?? "", !!existing);
      if (value !== undefined) data[field] = value;
    }
    for (const field of ["totalFloors", "maxOccupancy"]) {
      const raw = row[field] ?? "";
      if (raw !== "" || !existing) data[field] = parseIntField(raw, field, errors);
    }
    return finishStructuredEntry("Buildings", rowNumber, key, existing as unknown as Record<string, unknown>, data, errors, new Set(["name"]));
  });
}

function previewRoomRows(
  rows: Record<string, string>[],
  ctx: DbContext,
  inFileBuildingCounts: Map<string, number>,
  effectiveScientistByEmail: Map<string, Record<string, unknown>>,
): RowEntry[] {
  const counts = new Map<string, number>();
  rows.forEach((r) => {
    if (r.buildingName && r.roomNumber) {
      const key = `${r.buildingName.toLowerCase()}\u0000${r.roomNumber.toLowerCase()}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  });
  return rows.map((row, index) => {
    const buildingName = row.buildingName?.trim() ?? "";
    const roomNumber = row.roomNumber?.trim() ?? "";
    const composite = `${buildingName.toLowerCase()}\u0000${roomNumber.toLowerCase()}`;
    const displayKey = `${buildingName} / ${roomNumber}`;
    const errors: string[] = [];
    rejectRequiredClear(row, ROOM_COLS, errors);
    if (!buildingName || isClear(buildingName)) errors.push("Building Name is required");
    if (!roomNumber || isClear(roomNumber)) errors.push("Room Number is required");
    if ((counts.get(composite) ?? 0) > 1) errors.push("Duplicate room key in workbook");
    if (ctx.ambiguousRoomKeys!.has(composite)) errors.push("Room key is ambiguous in the database");
    const inFileBuildingCount = inFileBuildingCounts.get(buildingName.toLowerCase()) ?? 0;
    if (inFileBuildingCount > 1) errors.push(`Building "${buildingName}" is ambiguous in the workbook`);
    const dbBuilding = ctx.buildingByName!.get(buildingName.toLowerCase());
    if (ctx.ambiguousBuildingNames!.has(buildingName.toLowerCase())) errors.push(`Building "${buildingName}" is ambiguous in the database`);
    if (!dbBuilding && inFileBuildingCount === 0) errors.push(`Building "${buildingName}" was not found`);
    const existing = ctx.roomByKey!.get(composite);
    const data: Record<string, unknown> = {
      roomNumber,
      ...(dbBuilding ? { buildingId: dbBuilding.id } : { _buildingNameKey: buildingName }),
    };
    for (const field of ["floor", "capacity"]) {
      const raw = row[field] ?? "";
      if (raw !== "" || !existing) data[field] = parseIntField(raw, field, errors);
    }
    const areaRaw = row.area ?? "";
    if (areaRaw !== "" || !existing) data.area = parseNumericField(areaRaw, "Area", errors);
    for (const field of ["roomType", "biosafetyLevel", "equipment", "specialFeatures", "accessRestrictions", "maintenanceNotes"]) {
      const value = maybeText(row[field] ?? "", !!existing);
      if (value !== undefined) data[field] = value;
    }
    for (const [emailField, idField] of [["roomSupervisorEmail", "roomSupervisorId"], ["roomManagerEmail", "roomManagerId"]] as const) {
      const raw = row[emailField] ?? "";
      if (raw === "" && existing) continue;
      if (raw === "" || isClear(raw)) data[idField] = null;
      else {
        const scientist = effectiveScientistByEmail.get(raw.toLowerCase());
        if (!scientist) errors.push(`${emailField}: scientist "${raw}" was not found`);
        else {
          if (idField === "roomSupervisorId" && !isRoomSupervisorEligible(scientist)) {
            errors.push(`${emailField}: ${ROOM_SUPERVISOR_ELIGIBILITY_MESSAGE}`);
          }
          if (idField === "roomManagerId" && !isRoomManagerEligible(scientist)) {
            errors.push(`${emailField}: ${ROOM_MANAGER_ELIGIBILITY_MESSAGE}`);
          }
          if (typeof scientist.id === "number") data[idField] = scientist.id;
          else data[`_${emailField}Key`] = raw;
        }
      }
    }
    for (const field of ["certifications", "availablePpe"]) {
      const raw = row[field] ?? "";
      if (raw === "" && existing) continue;
      data[field] = raw === "" || isClear(raw) ? null : splitSemicolon(raw);
    }
    return finishStructuredEntry("Rooms", index + 1, displayKey, existing as unknown as Record<string, unknown>, data, errors, new Set(["buildingId", "roomNumber"]));
  });
}

function previewCertificationModuleRows(rows: Record<string, string>[], ctx: DbContext): RowEntry[] {
  const counts = new Map<string, number>();
  rows.forEach((r) => { if (r.name) counts.set(r.name.toLowerCase(), (counts.get(r.name.toLowerCase()) ?? 0) + 1); });
  return rows.map((row, index) => {
    const name = row.name?.trim() ?? "";
    const lower = name.toLowerCase();
    const errors: string[] = [];
    rejectRequiredClear(row, CERTIFICATION_MODULE_COLS, errors);
    if (!name || isClear(name)) errors.push("Module Name is required");
    if ((counts.get(lower) ?? 0) > 1) errors.push("Duplicate module name in workbook");
    if (ctx.ambiguousCertificationModuleNames!.has(lower)) errors.push("Module name is ambiguous in the database");
    const existing = ctx.certificationModuleByName!.get(lower);
    const data: Record<string, unknown> = { name };
    const description = maybeText(row.description ?? "", !!existing);
    if (description !== undefined) data.description = description;
    for (const field of ["isCore", "isActive"]) {
      const raw = row[field] ?? "";
      if (raw !== "" || !existing) {
        const value = parseBool(raw, field, errors);
        if (value == null) errors.push(`${field} is required`);
        else data[field] = value;
      }
    }
    const expirationRaw = row.expirationMonths ?? "";
    if (expirationRaw !== "" || !existing) {
      const value = parseIntField(expirationRaw, "Expiration Months", errors);
      if (value == null) errors.push("Expiration Months is required");
      else if (value <= 0) errors.push("Expiration Months must be greater than zero");
      else data.expirationMonths = value;
    }
    return finishStructuredEntry("Certification Modules", index + 1, name, existing as unknown as Record<string, unknown>, data, errors, new Set(["name"]));
  });
}

function previewCertificationRows(
  rows: Record<string, string>[],
  ctx: DbContext,
  inFileModuleCounts: Map<string, number>,
  effectiveScientistByEmail: Map<string, Record<string, unknown>>,
): RowEntry[] {
  const counts = new Map<string, number>();
  rows.forEach((r) => {
    const key = `${r.scientistEmail?.toLowerCase() ?? ""}\u0000${r.moduleName?.toLowerCase() ?? ""}\u0000${r.startDate ?? ""}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return rows.map((row, index) => {
    const email = row.scientistEmail?.trim() ?? "";
    const moduleName = row.moduleName?.trim() ?? "";
    const errors: string[] = [];
    rejectRequiredClear(row, CERTIFICATION_COLS, errors);
    const startDate = parseDateStr(row.startDate ?? "", "Start Date", errors);
    const key = `${email.toLowerCase()}\u0000${moduleName.toLowerCase()}\u0000${startDate ?? row.startDate ?? ""}`;
    const displayKey = `${email} / ${moduleName} / ${startDate ?? row.startDate ?? ""}`;
    if (!email || isClear(email)) errors.push("Scientist Email is required");
    if (!moduleName || isClear(moduleName)) errors.push("Module Name is required");
    if (!startDate) errors.push("Start Date is required");
    if ((counts.get(`${email.toLowerCase()}\u0000${moduleName.toLowerCase()}\u0000${row.startDate ?? ""}`) ?? 0) > 1) errors.push("Duplicate certification key in workbook");
    if (ctx.ambiguousCertificationKeys!.has(key)) errors.push("Certification key is ambiguous in the database");
    const scientist = effectiveScientistByEmail.get(email.toLowerCase());
    if (!scientist) errors.push(`Scientist "${email}" was not found`);
    const module = ctx.certificationModuleByName!.get(moduleName.toLowerCase());
    const inFileModuleCount = inFileModuleCounts.get(moduleName.toLowerCase()) ?? 0;
    if (inFileModuleCount > 1) errors.push(`Module "${moduleName}" is ambiguous in the workbook`);
    if (ctx.ambiguousCertificationModuleNames!.has(moduleName.toLowerCase())) errors.push(`Module "${moduleName}" is ambiguous in the database`);
    if (!module && inFileModuleCount === 0) errors.push(`Module "${moduleName}" was not found`);
    const existing = ctx.certificationByKey!.get(key);
    const data: Record<string, unknown> = {
      ...(typeof scientist?.id === "number"
        ? { scientistId: scientist.id }
        : { _scientistEmailKey: email }),
      ...(module ? { moduleId: module.id } : { _moduleNameKey: moduleName }),
      startDate,
    };
    const endRaw = row.endDate ?? "";
    if (endRaw !== "" || !existing) {
      const endDate = parseDateStr(endRaw, "End Date", errors);
      if (!endDate) errors.push("End Date is required");
      else data.endDate = endDate;
    }
    const notes = maybeText(row.notes ?? "", !!existing);
    if (notes !== undefined) data.notes = notes;
    return finishStructuredEntry("Certifications", index + 1, displayKey, existing as unknown as Record<string, unknown>, data, errors, new Set(["scientistId", "moduleId", "startDate"]));
  });
}

// ---------------------------------------------------------------------------
// Preview orchestration
// ---------------------------------------------------------------------------

export async function previewSection(
  sectionId: SectionId,
  fileBase64: string,
  fileName: string,
): Promise<PreviewResult> {
  const sheets = await parseSectionWorkbook(sectionId, fileBase64, fileName);
  const ctx = await loadDbContext(sectionId);
  return buildPreviewResult(sectionId, sheets, ctx);
}

function buildPreviewResult(
  sectionId: SectionId,
  sheets: ParsedSheet[],
  ctx: DbContext,
): PreviewResult {
  // Get sheet names being processed in this file (for cross-sheet resolution)
  const inFileProgramIds = new Set<string>();
  const inFileProjectIds = new Set<string>();
  const inFileSdrNumbers = new Set<string>();
  const inFileBuildingCounts = new Map<string, number>();
  const inFileModuleCounts = new Map<string, number>();

  for (const s of sheets) {
    if (s.name === "Programs") s.rows.forEach((r) => { if (r.programId) inFileProgramIds.add(r.programId.toLowerCase()); });
    if (s.name === "Projects") s.rows.forEach((r) => { if (r.projectId) inFileProjectIds.add(r.projectId.toLowerCase()); });
    if (s.name === "Research Activities") s.rows.forEach((r) => { if (r.sdrNumber) inFileSdrNumbers.add(r.sdrNumber.toLowerCase()); });
    if (s.name === "Buildings") s.rows.forEach((r) => {
      if (r.name) inFileBuildingCounts.set(r.name.toLowerCase(), (inFileBuildingCounts.get(r.name.toLowerCase()) ?? 0) + 1);
    });
    if (s.name === "Certification Modules") s.rows.forEach((r) => {
      if (r.name) inFileModuleCounts.set(r.name.toLowerCase(), (inFileModuleCounts.get(r.name.toLowerCase()) ?? 0) + 1);
    });
  }

  // Build within-file email and staffId maps for Scientists
  const inFileByEmail = new Map<string, number>();
  const inFileByStaffId = new Map<string, number>();
  const sciSheet = sheets.find((s) => s.name === "Scientists");
  if (sciSheet) {
    sciSheet.rows.forEach((r, idx) => {
      if (r.email) inFileByEmail.set(r.email.toLowerCase(), idx);
      if (r.staffId) inFileByStaffId.set(r.staffId.toLowerCase(), idx);
    });
  }

  const scientistEntries = sciSheet
    ? previewScientistRows(sciSheet.rows, ctx, inFileByEmail, inFileByStaffId)
    : [];
  const effectiveScientistByEmail = new Map<string, Record<string, unknown>>(
    [...ctx.scientistByEmail.entries()].map(([email, scientist]) => [
      email,
      scientist as unknown as Record<string, unknown>,
    ]),
  );
  if (sciSheet) {
    sciSheet.rows.forEach((row, index) => {
      const entry = scientistEntries[index];
      if (!entry || entry.action === "error") return;
      const email = (row.email ?? "").trim().toLowerCase();
      const existing = ctx.scientistByEmail.get(email)
        ?? (row.staffId
          ? ctx.scientists.find((scientist) => scientist.staffId?.toLowerCase() === row.staffId.toLowerCase())
          : undefined);
      effectiveScientistByEmail.set(email, {
        ...(existing as unknown as Record<string, unknown> | undefined),
        ...(entry.data ?? {}),
      });
    });
  }

  const allRows: RowEntry[] = [];

  for (const sheet of sheets) {
    let sheetEntries: RowEntry[] = [];
    switch (sheet.name) {
      case "Scientists":
        sheetEntries = scientistEntries;
        break;
      case "Grants":
        sheetEntries = previewGrantRows2(sheet.rows, ctx, new Set(inFileByEmail.keys()));
        break;
      case "Programs":
        sheetEntries = previewProgramRows(sheet.rows, ctx);
        break;
      case "Projects":
        sheetEntries = previewProjectRows(sheet.rows, ctx, inFileProgramIds);
        break;
      case "Research Activities":
        sheetEntries = previewSdrRows(sheet.rows, ctx, inFileProjectIds);
        break;
      case "IRB Applications":
        sheetEntries = previewIrbRows(sheet.rows, ctx, inFileSdrNumbers);
        break;
      case "IBC Applications":
        sheetEntries = previewIbcRows(sheet.rows, ctx);
        break;
      case "Research Contracts":
        sheetEntries = previewContractRows(sheet.rows, ctx, inFileSdrNumbers);
        break;
      case "Patents":
        sheetEntries = previewPatentRows(sheet.rows, ctx, inFileSdrNumbers);
        break;
      case "Publications":
        sheetEntries = previewPublicationRows(sheet.rows, ctx);
        break;
      case "Journal Impact Factors":
        sheetEntries = previewJournalImpactFactorRows(sheet.rows, ctx);
        break;
      case "Buildings":
        sheetEntries = previewBuildingRows(sheet.rows, ctx);
        break;
      case "Rooms":
        sheetEntries = previewRoomRows(sheet.rows, ctx, inFileBuildingCounts, effectiveScientistByEmail);
        break;
      case "Certification Modules":
        sheetEntries = previewCertificationModuleRows(sheet.rows, ctx);
        break;
      case "Certifications":
        sheetEntries = previewCertificationRows(sheet.rows, ctx, inFileModuleCounts, effectiveScientistByEmail);
        break;
    }
    allRows.push(...sheetEntries);
  }

  // Build sheet summaries
  const sheetNames = [...new Set(allRows.map((r) => r.sheetName))];
  const sheetSummaries: SheetSummary[] = sheetNames.map((name) => {
    const sheetRows = allRows.filter((r) => r.sheetName === name);
    return {
      sheetName: name,
      total: sheetRows.length,
      create: sheetRows.filter((r) => r.action === "create").length,
      update: sheetRows.filter((r) => r.action === "update").length,
      skip: sheetRows.filter((r) => r.action === "skip").length,
      error: sheetRows.filter((r) => r.action === "error").length,
    };
  });

  const canApply = allRows.every((r) => r.action !== "error");

  // Fingerprint over rows + a snapshot of ctx to detect staleness
  const fingerprintPayload = {
    sectionId,
    rows: allRows.map((r) => ({ sheetName: r.sheetName, rowNumber: r.rowNumber, action: r.action, key: r.key, data: r.data })),
    dbSnapshot: buildDbSnapshot(ctx),
  };
  const fingerprint = computeFingerprint(fingerprintPayload);

  return { sectionId, rows: allRows, sheets: sheetSummaries, canApply, fingerprint };
}

function buildDbSnapshot(ctx: DbContext): Record<string, unknown> {
  const version = (row: { id: number; updatedAt?: Date | null }) => [
    row.id,
    row.updatedAt?.toISOString() ?? null,
  ];
  const versions = (rows: Array<{ id: number; updatedAt?: Date | null }> | undefined) =>
    (rows ?? []).map(version).sort((a, b) => Number(a[0]) - Number(b[0]));
  return {
    scientists: versions(ctx.scientists),
    grants: versions(ctx.grants),
    programs: versions(ctx.programs),
    projects: versions(ctx.projects),
    sdrs: versions(ctx.sdrs),
    irbs: versions(ctx.irbs),
    ibcs: versions(ctx.ibcs),
    contracts: versions(ctx.contracts),
    patents: versions(ctx.patentList),
    publications: versions(ctx.publicationList),
    manuscriptHistory: versions(ctx.manuscriptHistoryRows),
    journals: versions(ctx.journals),
    journalImpactFactorMetrics: versions(ctx.journalMetrics),
    buildings: versions(ctx.buildings),
    rooms: versions(ctx.rooms),
    certificationModules: versions(ctx.certificationModules),
    certifications: versions(ctx.certifications),
  };
}

// ---------------------------------------------------------------------------
// Apply orchestration
// ---------------------------------------------------------------------------

async function lockBulkDataSection(tx: any, sectionId: SectionId): Promise<void> {
  const tablesBySection: Record<SectionId, string[]> = {
    "research-management": [
      "scientists",
      "buildings",
      "rooms",
      "certification_modules",
      "certifications",
    ],
    "pmo-office": ["scientists", "programs", "projects", "research_activities"],
    "research-compliance": [
      "scientists",
      "programs",
      "projects",
      "research_activities",
      "irb_applications",
      "ibc_applications",
    ],
    "research-services": [
      "scientists",
      "programs",
      "projects",
      "research_activities",
      "research_contracts",
      "grants",
      "grant_research_activities",
    ],
    "research-output": [
      "scientists",
      "programs",
      "projects",
      "research_activities",
      "patents",
      "publications",
      "manuscript_history",
      "journals",
      "journal_impact_factor_metrics",
    ],
  };
  await tx.execute(
    sql.raw(`LOCK TABLE ${tablesBySection[sectionId].join(", ")} IN SHARE ROW EXCLUSIVE MODE`),
  );
}

export async function applySection(
  sectionId: SectionId,
  fileBase64: string,
  fileName: string,
  fingerprint: string,
  actor?: BulkApplyActor,
): Promise<ApplyResult> {
  const parsedSheets = await parseSectionWorkbook(sectionId, fileBase64, fileName);
  const counts = await db.transaction(async (tx: any) => {
    // Hold all tables read by this section so the confirmed plan cannot change
    // between verification and the final write.
    await lockBulkDataSection(tx, sectionId);
    const preview = buildPreviewResult(
      sectionId,
      parsedSheets,
      await loadDbContext(sectionId, tx),
    );
    if (preview.fingerprint !== fingerprint) {
      throw new Error("Fingerprint mismatch: the data may have changed since preview. Please re-preview and try again.");
    }
    if (!preview.canApply) {
      const errCount = preview.rows.filter((r) => r.action === "error").length;
      throw new Error(`Cannot apply: ${errCount} row error(s) must be resolved first.`);
    }

    let applyingScientistId: number | undefined;
    const applyingUserId = actor?.userId ?? undefined;
    const createsAuditedRecord = preview.rows.some(
      (row) => (row.sheetName === "Certifications" || row.sheetName === "Publications")
        && row.action === "create",
    );
    if (createsAuditedRecord) {
      if (actor?.scientistId != null) {
        const [linked] = await tx
          .select({ id: scientists.id })
          .from(scientists)
          .where(eq(scientists.id, actor.scientistId));
        applyingScientistId = linked?.id;
      }
      if (!applyingScientistId && actor?.email) {
        const matches = await tx
          .select({ id: scientists.id })
          .from(scientists)
          .where(caseInsensitiveKey(scientists.email, actor.email));
        if (matches.length > 1) {
          throw new Error(`Certification apply actor email "${actor.email}" is ambiguous`);
        }
        applyingScientistId = matches[0]?.id;
      }
      if (!applyingScientistId) {
        throw new Error(
          "Certification and Publication imports that create records require an auditable applying user linked to a scientist",
        );
      }
    }
    const createsPublication = preview.rows.some(
      (row) => row.sheetName === "Publications" && row.action === "create",
    );
    if (createsPublication && !applyingUserId) {
      throw new Error(
        "Publication imports that create records require an auditable applying user account",
      );
    }

    const transactionCounts: Record<string, ApplyCounts> = {};
    // We need to resolve deferred references (in-file cross-references)
    // Build local resolution maps as we insert
    const newProgramByKey = new Map<string, number>(); // programId key → db id
    const newProjectByKey = new Map<string, number>(); // projectId key → db id
    const newSdrByKey = new Map<string, number>(); // sdrNumber key → db id
    const newBuildingByKey = new Map<string, number>();
    const newModuleByKey = new Map<string, number>();

    const sectionSheetOrder: string[] = getSectionSheetOrder(sectionId);

    for (const sheetName of sectionSheetOrder) {
      const sheetRows = preview.rows.filter((r) => r.sheetName === sheetName && (r.action === "create" || r.action === "update"));
      const sheetCounts: ApplyCounts = { created: 0, updated: 0, skipped: 0 };
      transactionCounts[sheetName] = sheetCounts;

      // Count skips
      sheetCounts.skipped = preview.rows.filter((r) => r.sheetName === sheetName && r.action === "skip").length;

      for (const entry of sheetRows) {
        const rowData = resolveDeferred(entry.data ?? {}, newProgramByKey, newProjectByKey, newSdrByKey);

        if (sheetName === "Scientists") {
          await applyScientistRow(tx, entry, rowData);
          if (entry.action === "create") sheetCounts.created++;
          else sheetCounts.updated++;
        } else if (sheetName === "Grants") {
          await applyGrantRow(tx, entry, rowData);
          if (entry.action === "create") sheetCounts.created++;
          else sheetCounts.updated++;
        } else if (sheetName === "Programs") {
          const newId = await applyProgramRow(tx, entry, rowData);
          if (newId) newProgramByKey.set(entry.key.toLowerCase(), newId);
          if (entry.action === "create") sheetCounts.created++;
          else sheetCounts.updated++;
        } else if (sheetName === "Projects") {
          const newId = await applyProjectRow(tx, entry, rowData);
          if (newId) newProjectByKey.set(entry.key.toLowerCase(), newId);
          if (entry.action === "create") sheetCounts.created++;
          else sheetCounts.updated++;
        } else if (sheetName === "Research Activities") {
          const newId = await applySdrRow(tx, entry, rowData);
          if (newId) newSdrByKey.set(entry.key.toLowerCase(), newId);
          if (entry.action === "create") sheetCounts.created++;
          else sheetCounts.updated++;
        } else if (sheetName === "IRB Applications") {
          await applyIrbRow(tx, entry, rowData, newSdrByKey);
          if (entry.action === "create") sheetCounts.created++;
          else sheetCounts.updated++;
        } else if (sheetName === "IBC Applications") {
          await applyIbcRow(tx, entry, rowData);
          if (entry.action === "create") sheetCounts.created++;
          else sheetCounts.updated++;
        } else if (sheetName === "Research Contracts") {
          await applyContractRow(tx, entry, rowData, newSdrByKey);
          if (entry.action === "create") sheetCounts.created++;
          else sheetCounts.updated++;
        } else if (sheetName === "Patents") {
          await applyPatentRow(tx, entry, rowData, newSdrByKey);
          if (entry.action === "create") sheetCounts.created++;
          else sheetCounts.updated++;
        } else if (sheetName === "Publications") {
          const applied = await applyPublicationRow(
            tx,
            entry,
            rowData,
            applyingScientistId,
            applyingUserId,
          );
          if (!applied) sheetCounts.skipped++;
          else if (entry.action === "create") sheetCounts.created++;
          else sheetCounts.updated++;
        } else if (sheetName === "Journal Impact Factors") {
          await applyJournalImpactFactorRow(tx, entry, rowData);
          if (entry.action === "create") sheetCounts.created++;
          else sheetCounts.updated++;
        } else if (sheetName === "Buildings") {
          const newId = await applyBuildingRow(tx, entry, rowData);
          if (newId) newBuildingByKey.set(entry.key.toLowerCase(), newId);
          if (entry.action === "create") sheetCounts.created++;
          else sheetCounts.updated++;
        } else if (sheetName === "Rooms") {
          await applyRoomRow(tx, entry, rowData, newBuildingByKey);
          if (entry.action === "create") sheetCounts.created++;
          else sheetCounts.updated++;
        } else if (sheetName === "Certification Modules") {
          const newId = await applyCertificationModuleRow(tx, entry, rowData);
          if (newId) newModuleByKey.set(entry.key.toLowerCase(), newId);
          if (entry.action === "create") sheetCounts.created++;
          else sheetCounts.updated++;
        } else if (sheetName === "Certifications") {
          await applyCertificationRow(tx, entry, rowData, newModuleByKey, applyingScientistId);
          if (entry.action === "create") sheetCounts.created++;
          else sheetCounts.updated++;
        }
      }

      if (sheetName === "Scientists") {
        for (const entry of sheetRows) {
          await applyScientistSupervisor(tx, entry, entry.data ?? {});
        }
      }

      // Fill in counts for sheets not in preview
      if (!transactionCounts[sheetName]) {
        transactionCounts[sheetName] = { created: 0, updated: 0, skipped: 0 };
      }
    }
    return transactionCounts;
  });

  return { sectionId, counts };
}

function getSectionSheetOrder(sectionId: SectionId): string[] {
  switch (sectionId) {
    case "research-management": return ["Scientists", "Buildings", "Rooms", "Certification Modules", "Certifications"];
    case "pmo-office": return ["Programs", "Projects", "Research Activities"];
    case "research-compliance": return ["IRB Applications", "IBC Applications"];
    case "research-services": return ["Research Contracts", "Grants"];
    case "research-output": return ["Patents", "Publications", "Journal Impact Factors"];
  }
}

function resolveDeferred(
  data: Record<string, unknown>,
  newProgramByKey: Map<string, number>,
  newProjectByKey: Map<string, number>,
  newSdrByKey: Map<string, number>,
): Record<string, unknown> {
  const out = { ...data };
  if (out._programIdKey) {
    const id = newProgramByKey.get(String(out._programIdKey).toLowerCase());
    if (id) out.programId = id;
    delete out._programIdKey;
  }
  if (out._projectIdKey) {
    const id = newProjectByKey.get(String(out._projectIdKey).toLowerCase());
    if (id) out.projectId = id;
    delete out._projectIdKey;
  }
  if (out._sdrNumberKey) {
    const id = newSdrByKey.get(String(out._sdrNumberKey).toLowerCase());
    if (id) out.researchActivityId = id;
    delete out._sdrNumberKey;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-entity apply helpers (operating within a transaction)
// ---------------------------------------------------------------------------

// db is typed as `any` in db.ts (dynamic import), so tx is also `any`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxDb = any;

function caseInsensitiveKey(column: unknown, value: unknown) {
  return sql`lower(${column}) = ${String(value).toLowerCase()}`;
}

function requireUpdatedRow<T>(
  row: T | null | undefined,
  entity: string,
  key: unknown,
): asserts row is T {
  if (!row) {
    throw new Error(`${entity} "${String(key)}" was not found while applying an update`);
  }
}

async function applyScientistRow(tx: TxDb, entry: RowEntry, data: Record<string, unknown>): Promise<void> {
  const payload = { ...data };
  const email = payload.email as string;
  delete payload.supervisorEmail;

  if (entry.action === "create") {
    if (!payload.honorificTitle) payload.honorificTitle = "Dr";
    if (!payload.staffType) payload.staffType = "scientific";
    await tx.insert(scientists).values(payload);
  } else {
    const staffId = payload.staffId as string | undefined;
    delete payload.staffId;

    let existingId: number | undefined;
    if (staffId) {
      const rows = await tx
        .select({ id: scientists.id })
        .from(scientists)
        .where(caseInsensitiveKey(scientists.staffId, staffId));
      existingId = rows[0]?.id;
    }
    if (!existingId) {
      const rows = await tx
        .select({ id: scientists.id })
        .from(scientists)
        .where(caseInsensitiveKey(scientists.email, email));
      existingId = rows[0]?.id;
    }
    requireUpdatedRow(existingId, "Scientist", entry.key);
    await tx.update(scientists).set({ ...payload, updatedAt: new Date() }).where(eq(scientists.id, existingId));
  }
}

async function applyScientistSupervisor(
  tx: TxDb,
  entry: RowEntry,
  data: Record<string, unknown>,
): Promise<void> {
  if (!Object.prototype.hasOwnProperty.call(data, "supervisorEmail")) return;

  const staffId = data.staffId as string | undefined;
  const email = String(data.email ?? entry.key).toLowerCase();
  let scientistId: number | undefined;
  if (staffId) {
    const rows = await tx
      .select({ id: scientists.id })
      .from(scientists)
      .where(caseInsensitiveKey(scientists.staffId, staffId));
    scientistId = rows[0]?.id;
  }
  if (!scientistId) {
    const rows = await tx
      .select({ id: scientists.id })
      .from(scientists)
      .where(sql`lower(${scientists.email}) = ${email}`);
    scientistId = rows[0]?.id;
  }
  if (!scientistId) throw new Error(`Scientist "${entry.key}" was not found while resolving supervisor`);

  const supervisorEmail = data.supervisorEmail;
  let supervisorId: number | null = null;
  if (typeof supervisorEmail === "string" && supervisorEmail) {
    const rows = await tx
      .select({ id: scientists.id })
      .from(scientists)
      .where(sql`lower(${scientists.email}) = ${supervisorEmail.toLowerCase()}`);
    supervisorId = rows[0]?.id ?? null;
    if (!supervisorId) {
      throw new Error(`Supervisor "${supervisorEmail}" was not found while applying scientist "${entry.key}"`);
    }
  }
  await tx
    .update(scientists)
    .set({ supervisorId, updatedAt: new Date() })
    .where(eq(scientists.id, scientistId));
}

async function applyGrantRow(tx: TxDb, entry: RowEntry, data: Record<string, unknown>): Promise<void> {
  const { projectNumber, _lpiEmailKey, ...rest } = data;
  if (_lpiEmailKey) {
    const rows = await tx
      .select({ id: scientists.id })
      .from(scientists)
      .where(sql`lower(${scientists.email}) = ${String(_lpiEmailKey).toLowerCase()}`);
    const lpiId = rows[0]?.id;
    if (!lpiId) {
      throw new Error(`LPI "${String(_lpiEmailKey)}" was not found while applying grant "${String(projectNumber)}"`);
    }
    rest.lpiId = lpiId;
  }

  if (entry.action === "create") {
    await tx.insert(grants).values({ projectNumber: String(projectNumber), title: String(rest.title ?? ""), ...rest });
  } else {
    const [row] = await tx
      .update(grants)
      .set({ ...rest, updatedAt: new Date() })
      .where(caseInsensitiveKey(grants.projectNumber, projectNumber))
      .returning({ id: grants.id });
    requireUpdatedRow(row, "Grant", projectNumber);
  }
}

async function applyProgramRow(tx: TxDb, entry: RowEntry, data: Record<string, unknown>): Promise<number | null> {
  const { programId, ...rest } = data;

  if (entry.action === "create") {
    const [row] = await tx.insert(programs).values({ programId: String(programId), name: String(rest.name ?? ""), ...rest }).returning({ id: programs.id });
    return (row as { id: number } | undefined)?.id ?? null;
  } else {
    const [row] = await tx
      .update(programs)
      .set({ ...rest, updatedAt: new Date() })
      .where(caseInsensitiveKey(programs.programId, programId))
      .returning({ id: programs.id });
    requireUpdatedRow(row, "Program", programId);
    return (row as { id: number } | undefined)?.id ?? null;
  }
}

async function applyProjectRow(tx: TxDb, entry: RowEntry, data: Record<string, unknown>): Promise<number | null> {
  const { projectId, ...rest } = data;

  if (entry.action === "create") {
    const [row] = await tx.insert(projects).values({ projectId: String(projectId), name: String(rest.name ?? ""), ...rest }).returning({ id: projects.id });
    return (row as { id: number } | undefined)?.id ?? null;
  } else {
    const [row] = await tx
      .update(projects)
      .set({ ...rest, updatedAt: new Date() })
      .where(caseInsensitiveKey(projects.projectId, projectId))
      .returning({ id: projects.id });
    requireUpdatedRow(row, "Project", projectId);
    return (row as { id: number } | undefined)?.id ?? null;
  }
}

async function applySdrRow(tx: TxDb, entry: RowEntry, data: Record<string, unknown>): Promise<number | null> {
  const { sdrNumber, ...rest } = data;

  if (entry.action === "create") {
    const [row] = await tx.insert(researchActivities).values({ sdrNumber: String(sdrNumber), title: String(rest.title ?? ""), status: "planning", ...rest }).returning({ id: researchActivities.id });
    return (row as { id: number } | undefined)?.id ?? null;
  } else {
    const [row] = await tx
      .update(researchActivities)
      .set({ ...rest, updatedAt: new Date() })
      .where(caseInsensitiveKey(researchActivities.sdrNumber, sdrNumber))
      .returning({ id: researchActivities.id });
    requireUpdatedRow(row, "Research activity", sdrNumber);
    return (row as { id: number } | undefined)?.id ?? null;
  }
}

async function applyIrbRow(tx: TxDb, entry: RowEntry, data: Record<string, unknown>, newSdrByKey: Map<string, number>): Promise<void> {
  const { irbNumber, _sdrNumberKey, ...rest } = data;

  if (_sdrNumberKey) {
    const id = newSdrByKey.get(String(_sdrNumberKey).toLowerCase());
    if (id) rest.researchActivityId = id;
  }

  if (entry.action === "create") {
    if (typeof rest.principalInvestigatorId !== "number") {
      throw new Error(`IRB ${String(irbNumber)} is missing a resolved principal investigator`);
    }
    await tx.insert(irbApplications).values({
      irbNumber: String(irbNumber),
      title: String(rest.title ?? ""),
      principalInvestigatorId: rest.principalInvestigatorId,
      status: String(rest.status ?? "Active"),
      workflowStatus: "draft",
      ...rest,
    });
  } else {
    const [row] = await tx
      .update(irbApplications)
      .set({ ...rest, updatedAt: new Date() })
      .where(caseInsensitiveKey(irbApplications.irbNumber, irbNumber))
      .returning({ id: irbApplications.id });
    requireUpdatedRow(row, "IRB application", irbNumber);
  }
}

async function applyIbcRow(tx: TxDb, entry: RowEntry, data: Record<string, unknown>): Promise<void> {
  const { ibcNumber, ...rest } = data;

  if (entry.action === "create") {
    if (typeof rest.principalInvestigatorId !== "number") {
      throw new Error(`IBC ${String(ibcNumber)} is missing a resolved principal investigator`);
    }
    await tx.insert(ibcApplications).values({
      ibcNumber: String(ibcNumber),
      title: String(rest.title ?? ""),
      principalInvestigatorId: rest.principalInvestigatorId,
      biosafetyLevel: String(rest.biosafetyLevel ?? "BSL-1"),
      status: String(rest.status ?? "Active"),
      riskLevel: String(rest.riskLevel ?? "low"),
      workflowStatus: "draft",
      submissionType: "initial",
      version: 1,
      ...rest,
    });
  } else {
    const [row] = await tx
      .update(ibcApplications)
      .set({ ...rest, updatedAt: new Date() })
      .where(caseInsensitiveKey(ibcApplications.ibcNumber, ibcNumber))
      .returning({ id: ibcApplications.id });
    requireUpdatedRow(row, "IBC application", ibcNumber);
  }
}

async function applyContractRow(tx: TxDb, entry: RowEntry, data: Record<string, unknown>, newSdrByKey: Map<string, number>): Promise<void> {
  const { contractNumber, _sdrNumberKey, ...rest } = data;

  if (_sdrNumberKey) {
    const id = newSdrByKey.get(String(_sdrNumberKey).toLowerCase());
    if (id) rest.researchActivityId = id;
  }

  if (entry.action === "create") {
    await tx.insert(researchContracts).values({
      contractNumber: String(contractNumber),
      title: String(rest.title ?? ""),
      status: "submitted",
      ...rest,
    });
  } else {
    const [row] = await tx
      .update(researchContracts)
      .set({ ...rest, updatedAt: new Date() })
      .where(caseInsensitiveKey(researchContracts.contractNumber, contractNumber))
      .returning({ id: researchContracts.id });
    requireUpdatedRow(row, "Research contract", contractNumber);
  }
}

async function applyPatentRow(tx: TxDb, entry: RowEntry, data: Record<string, unknown>, newSdrByKey: Map<string, number>): Promise<void> {
  const { patentNumber, _sdrNumberKey, ...rest } = data;

  if (_sdrNumberKey) {
    const id = newSdrByKey.get(String(_sdrNumberKey).toLowerCase());
    if (id) rest.researchActivityId = id;
  }

  if (entry.action === "create") {
    await tx.insert(patents).values({
      patentNumber: String(patentNumber),
      title: String(rest.title ?? ""),
      inventors: String(rest.inventors ?? ""),
      status: String(rest.status ?? "Filed"),
      ...rest,
    });
  } else {
    const [row] = await tx
      .update(patents)
      .set({ ...rest, updatedAt: new Date() })
      .where(caseInsensitiveKey(patents.patentNumber, patentNumber))
      .returning({ id: patents.id });
    requireUpdatedRow(row, "Patent", patentNumber);
  }
}

async function applyPublicationRow(
  tx: TxDb,
  entry: RowEntry,
  data: Record<string, unknown>,
  applyingScientistId?: number,
  applyingUserId?: number,
): Promise<boolean> {
  const { id, ...payload } = data;
  if (entry.action === "create") {
    if (!applyingScientistId) {
      throw new Error("Publication create is missing an auditable applying scientist");
    }
    if (!applyingUserId) {
      throw new Error("Publication create is missing an auditable applying user account");
    }
    const [created] = await tx.insert(publications).values({
      ...payload,
      title: String(payload.title ?? ""),
      status: "Concept",
      vettedForSubmissionByIpOffice: false,
      createdByUserId: applyingUserId,
    }).returning({ id: publications.id });
    requireUpdatedRow(created, "Publication", entry.key);
    await tx.insert(manuscriptHistory).values({
      publicationId: created.id,
      fromStatus: "",
      toStatus: "Concept",
      changedBy: applyingUserId,
      changeReason: "Publication created",
    });
    return true;
  }
  const publicationId = Number(id);
  const [current] = await tx
    .select({ id: publications.id, status: publications.status })
    .from(publications)
    .where(eq(publications.id, publicationId));
  requireUpdatedRow(current, "Publication", publicationId);
  // Defensive final-state check in the same transaction. A sealed row is
  // intentionally skipped rather than aborting unrelated valid rows.
  if (current.status === "Published *") return false;
  const [updated] = await tx
    .update(publications)
    .set({ ...payload, updatedAt: new Date() })
    .where(eq(publications.id, publicationId))
    .returning({ id: publications.id });
  requireUpdatedRow(updated, "Publication", publicationId);
  return true;
}

async function applyJournalImpactFactorRow(
  tx: TxDb,
  entry: RowEntry,
  data: Record<string, unknown>,
): Promise<void> {
  const {
    journalName, year, abbreviatedJournal, publisher, issn, eissn, field,
    ...metricPayload
  } = data;
  const journalMetadata = { abbreviatedJournal, publisher, issn, eissn, field };
  for (const key of Object.keys(journalMetadata) as Array<keyof typeof journalMetadata>) {
    if (journalMetadata[key] === undefined) delete journalMetadata[key];
  }
  const matches = await tx
    .select()
    .from(journals)
    .where(caseInsensitiveKey(journals.journalName, journalName));
  if (matches.length > 1) {
    throw new Error(`Journal "${String(journalName)}" is ambiguous`);
  }
  let journalId = matches[0]?.id;
  if (!journalId) {
    const [created] = await tx
      .insert(journals)
      .values({ journalName: String(journalName), ...journalMetadata })
      .returning({ id: journals.id });
    journalId = created?.id;
  } else if (Object.keys(journalMetadata).length) {
    await tx
      .update(journals)
      .set({ ...journalMetadata, updatedAt: new Date() })
      .where(eq(journals.id, journalId));
  }
  requireUpdatedRow(journalId, "Journal", journalName);
  const metricYear = Number(year);
  if (entry.action === "create") {
    await tx.insert(journalImpactFactorMetrics).values({
      journalId,
      year: metricYear,
      ...metricPayload,
    });
  } else {
    const [updated] = await tx
      .update(journalImpactFactorMetrics)
      .set({ ...metricPayload, updatedAt: new Date() })
      .where(sql`${journalImpactFactorMetrics.journalId} = ${journalId} and ${journalImpactFactorMetrics.year} = ${metricYear}`)
      .returning({ id: journalImpactFactorMetrics.id });
    requireUpdatedRow(updated, "Journal impact factor", entry.key);
  }
}

async function applyBuildingRow(tx: TxDb, entry: RowEntry, data: Record<string, unknown>): Promise<number | null> {
  const { name, ...rest } = data;
  if (entry.action === "create") {
    const [row] = await tx.insert(buildings).values({ name: String(name), ...rest }).returning({ id: buildings.id });
    return row?.id ?? null;
  }
  const [row] = await tx
    .update(buildings)
    .set(rest)
    .where(caseInsensitiveKey(buildings.name, name))
    .returning({ id: buildings.id });
  requireUpdatedRow(row, "Building", name);
  return row.id;
}

async function applyRoomRow(
  tx: TxDb,
  entry: RowEntry,
  data: Record<string, unknown>,
  newBuildingByKey: Map<string, number>,
): Promise<void> {
  const {
    _buildingNameKey,
    _roomSupervisorEmailKey,
    _roomManagerEmailKey,
    ...payload
  } = data;
  if (_buildingNameKey) {
    const buildingId = newBuildingByKey.get(String(_buildingNameKey).toLowerCase());
    if (!buildingId) throw new Error(`Building "${String(_buildingNameKey)}" was not found while applying room "${entry.key}"`);
    payload.buildingId = buildingId;
  }
  for (const [emailKey, idField] of [
    [_roomSupervisorEmailKey, "roomSupervisorId"],
    [_roomManagerEmailKey, "roomManagerId"],
  ] as const) {
    if (!emailKey) continue;
    const matches = await tx
      .select({ id: scientists.id })
      .from(scientists)
      .where(caseInsensitiveKey(scientists.email, emailKey));
    if (matches.length !== 1) {
      throw new Error(`Scientist "${String(emailKey)}" could not be uniquely resolved while applying room "${entry.key}"`);
    }
    payload[idField] = matches[0].id;
  }
  const buildingId = Number(payload.buildingId);
  const roomNumber = String(payload.roomNumber);
  if (typeof payload.roomSupervisorId === "number") {
    const [supervisor] = await tx.select().from(scientists).where(eq(scientists.id, payload.roomSupervisorId));
    if (!isRoomSupervisorEligible(supervisor)) {
      throw new Error(`${ROOM_SUPERVISOR_ELIGIBILITY_MESSAGE} while applying room "${entry.key}"`);
    }
  }
  if (typeof payload.roomManagerId === "number") {
    const [manager] = await tx.select().from(scientists).where(eq(scientists.id, payload.roomManagerId));
    if (!isRoomManagerEligible(manager)) {
      throw new Error(`${ROOM_MANAGER_ELIGIBILITY_MESSAGE} while applying room "${entry.key}"`);
    }
  }
  if (entry.action === "create") {
    await tx.insert(rooms).values(payload);
  } else {
    const { buildingId: _buildingId, roomNumber: _roomNumber, ...rest } = payload;
    const [row] = await tx
      .update(rooms)
      .set(rest)
      .where(sql`${rooms.buildingId} = ${buildingId} and lower(${rooms.roomNumber}) = ${roomNumber.toLowerCase()}`)
      .returning({ id: rooms.id });
    requireUpdatedRow(row, "Room", entry.key);
  }
}

async function applyCertificationModuleRow(
  tx: TxDb,
  entry: RowEntry,
  data: Record<string, unknown>,
): Promise<number | null> {
  const { name, ...rest } = data;
  if (entry.action === "create") {
    const [row] = await tx.insert(certificationModules).values({ name: String(name), ...rest }).returning({ id: certificationModules.id });
    return row?.id ?? null;
  }
  const [row] = await tx
    .update(certificationModules)
    .set({ ...rest, updatedAt: new Date() })
    .where(caseInsensitiveKey(certificationModules.name, name))
    .returning({ id: certificationModules.id });
  requireUpdatedRow(row, "Certification module", name);
  return row.id;
}

async function applyCertificationRow(
  tx: TxDb,
  entry: RowEntry,
  data: Record<string, unknown>,
  newModuleByKey: Map<string, number>,
  applyingScientistId?: number,
): Promise<void> {
  const { _moduleNameKey, _scientistEmailKey, ...payload } = data;
  if (_moduleNameKey) {
    const moduleId = newModuleByKey.get(String(_moduleNameKey).toLowerCase());
    if (!moduleId) throw new Error(`Module "${String(_moduleNameKey)}" was not found while applying certification "${entry.key}"`);
    payload.moduleId = moduleId;
  }
  if (_scientistEmailKey) {
    const matches = await tx
      .select({ id: scientists.id })
      .from(scientists)
      .where(caseInsensitiveKey(scientists.email, _scientistEmailKey));
    if (matches.length !== 1) {
      throw new Error(`Scientist "${String(_scientistEmailKey)}" could not be uniquely resolved while applying certification "${entry.key}"`);
    }
    payload.scientistId = matches[0].id;
  }
  const scientistId = Number(payload.scientistId);
  const moduleId = Number(payload.moduleId);
  const startDate = String(payload.startDate);
  if (entry.action === "create") {
    if (!applyingScientistId) {
      throw new Error("Certification create is missing an auditable applying scientist");
    }
    await tx.insert(certifications).values({ ...payload, uploadedBy: applyingScientistId });
  } else {
    const { scientistId: _scientistId, moduleId: _moduleId, startDate: _startDate, ...rest } = payload;
    const [row] = await tx
      .update(certifications)
      .set({ ...rest, updatedAt: new Date() })
      .where(sql`${certifications.scientistId} = ${scientistId} and ${certifications.moduleId} = ${moduleId} and ${certifications.startDate} = ${startDate}`)
      .returning({ id: certifications.id });
    requireUpdatedRow(row, "Certification", entry.key);
  }
}
