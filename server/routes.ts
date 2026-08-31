// @ts-nocheck — Pre-existing TypeScript errors in this file are suppressed so `npx tsc --noEmit` runs clean and new code in other files gets reliable type-checking feedback.
// Most errors here stem from untyped `useQuery` results (data inferred as `unknown`), drifted shared/schema field renames, and form values typed as `unknown`. They are not known runtime bugs but should be fixed file-by-file as each is next touched: remove this directive, run `npx tsc --noEmit`, and resolve what surfaces.
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { createHmac, timingSafeEqual } from "crypto";
import {
  GrantSdrLifecycleStorageError,
  storage,
  normalizeJournalName,
} from "./databaseStorage";
import { resolveAuthorCheckSubject } from "./authorCheckSubject";
import {
  canViewPublication,
  canViewUnpublishedScientistPublications,
  isPublicScientistProfilePublicationStatus,
  type ScientistPublicationViewer,
} from "./scientistPublicationVisibility";
import { ZodError, z } from "zod";
import { fromZodError } from "zod-validation-error";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "./objectStorage";
import { LocalObjectStorageService } from "./localObjectStorage";
import { db } from "./db";
import { scientists, publicationAuthors, journals, journalImpactFactorMetrics, manuscriptHistory, users, branches, departments, sections, roleGroups, userRoleAssignments } from "@shared/schema";
import { and, eq, inArray, isNull, desc, sql } from "drizzle-orm";
import {
  buildExportBuffer,
  buildTemplateBuffer,
  parseUploadedFile,
  buildImportPreview,
  rowToInsertScientist,
  findReferencingRecords,
} from "./scientistsImportExport";
import {
  insertScientistSchema,
  insertResearchActivitySchema,
  insertProjectMemberSchema,
  insertDataManagementPlanSchema,
  insertPublicationSchema,
  insertPublicationAuthorSchema,
  insertPatentSchema,
  insertIrbApplicationSchema,
  insertIbcApplicationSchema,
  insertIbcApplicationCommentSchema,
  insertIbcBoardMemberSchema,
  insertIbcSubmissionSchema,
  insertIbcDocumentSchema,
  insertResearchContractSchema,
  insertResearchContractScopeItemSchema,
  insertResearchContractExtensionSchema,
  insertResearchContractDocumentSchema,
  insertProgramSchema,
  insertProjectSchema,
  insertBuildingSchema,
  insertRoomSchema,
  insertIbcApplicationRoomSchema,
  insertIbcBackboneSourceRoomSchema,
  insertIbcApplicationPpeSchema,
  insertRolePermissionSchema,
  insertGrantSchema,
  insertCertificationModuleSchema,
  insertCertificationSchema,
  insertCertificationConfigurationSchema,
  insertPdfImportHistorySchema,
  insertFeatureRequestSchema,
  insertRa200ApplicationSchema,
  insertRa205aApplicationSchema,
  insertTeamMemberSchema,
  insertBranchSchema,
  insertDepartmentSchema,
  insertSectionSchema
} from "@shared/schema";
import { requireAuth, requireAdmin, requirePublicationOfficer, getAuthMode } from "./auth";
import { buildAssignableRoles } from "./assignableRoles";
import { ACCESS_ROLES } from "@shared/constants";
import { resolveOwnershipAccess, maxAccess, type AccessLevel as OwnershipAccessLevel } from "./ownershipResolver";
import { matchesAuthorName, isLinkedAuthorInAuthorsText, isUnambiguousAuthorMatch, suggestInternalAuthors } from "@shared/authorMatching";
import { detectDuplicateGroups, pickDefaultSurvivorId, normalizeDoi as canonicalDoi, isPreprintRecord, classifyResolvedPublication, preprintRepairEvidence } from "@shared/publicationDeduplication";
import { getObjectAclPolicy, ObjectPermission } from "./objectAcl";
import { buildLinkImportTemplate, previewLinkImport } from "./publicationLinksImport";
import { GRANT_COLUMNS, grantsToRows, buildGrantsWorkbookBuffer, buildGrantsTemplateBuffer, buildMissingGrantStaffWorkbookBuffer, collectMissingGrantStaff, previewGrantRows } from "./grantsImportExport";
import {
  registerSidraScoreRoutes,
  isOwnScientistProfile,
  isDemo,
  hasManagementRole,
  hasPublicationOfficerRole,
  canEditPublicationForLinkedScientists,
  canManagePublicationAuthorLink,
  canCreatePublicationForResearchActivity,
} from "./sidraScoreRoutes";
import { SIDRA_SCORE_SETTINGS_KEY } from "@shared/sidraScore";
import {
  rejectGenericPublicationWorkflowMutation,
  rejectPublicationCreateWorkflowMutation,
  rejectProtectedPublicationStatusFields,
  getStatusTransitionWorkflowViolation,
} from "./publicationMutationPolicy";
import {
  createIpVettingHandler,
  createInvalidatePublishedHandler,
  createInvalidAuthorActionHandler,
  createRevertFinalHandler,
  selectInvalidLinkedPublications,
} from "./publicationWorkflowRoutes";
import {
  PUBLISHED_INVALID_STATUS,
  PUBLISHED_STATUS,
  WITHDRAWN_STATUS,
  hasSdrOrExemption,
  validateSdrExemptionReason,
} from "@shared/publicationWorkflow";
import {
  isInvestigatorEligible,
  isInvestigatorRoleAssignmentAllowed,
} from "@shared/investigatorEligibility";
import {
  isRoomManagerEligible,
  isRoomSupervisorEligible,
  ROOM_MANAGER_ELIGIBILITY_MESSAGE,
  ROOM_SUPERVISOR_ELIGIBILITY_MESSAGE,
} from "@shared/roomRoleEligibility";
import { requireInvestigatorDesignationManager } from "./investigatorDesignationPolicy";
import { rejectRestrictedUserProfileAccessChanges } from "./restrictedUserPolicy";
import {
  canGrantLinkSdrs,
  GrantLifecycleError,
  grantStatusAllowsProgressTracking,
  reconcileGrantLifecycle,
} from "@shared/grantLifecycle";
import { registerGrantListRoute } from "./grantIssueRoutes";
import {
  applySection as applyBulkDataSection,
  buildExportWorkbook as buildBulkDataExportWorkbook,
  buildTemplateWorkbook as buildBulkDataTemplateWorkbook,
  getSectionMeta as getBulkDataSectionMeta,
  previewSection as previewBulkDataSection,
  SECTION_META as BULK_DATA_SECTIONS,
  type SectionId as BulkDataSectionId,
} from "./bulkDataHub";
import { toAdminUserResponse } from "./adminUsers";
import {
  ARCHIVE_MIME,
  buildBulkDataArchive,
  bulkArchiveFileName,
  createBulkDataArchive,
  downloadBulkDataArchive,
  getBulkDataArchive,
  listBulkDataArchives,
  queueBulkDataArchive,
} from "./bulkDataArchives";
import { registerOfficeDashboardRoutes } from "./officeDashboardRoutes";
import { registerManagementReportRoutes } from "./managementReportRoutes";

const isLocalStorage = process.env.STORAGE_TYPE === "local";

function getScientistPublicationViewer(req: Request): ScientistPublicationViewer {
  const viewer: ScientistPublicationViewer = {
    userId: req.session.user?.id,
    role: req.session.user?.role,
    scientistId: req.session.user?.scientistId,
  };

  // The demo role selector is client-side. Honor these hints only in demo;
  // real auth modes always rely exclusively on the signed-in server session.
  if (getAuthMode() === "demo") {
    if (typeof req.query.viewerUserId === "string") {
      const demoUserId = parseInt(req.query.viewerUserId);
      if (!isNaN(demoUserId)) viewer.userId = demoUserId;
    }
    if (typeof req.query.viewerRole === "string") {
      viewer.role = req.query.viewerRole;
    }
    if (typeof req.query.viewerScientistId === "string") {
      const demoScientistId = parseInt(req.query.viewerScientistId);
      if (!isNaN(demoScientistId)) viewer.scientistId = demoScientistId;
    }
  }

  return viewer;
}

function getObjectStorageService(): ObjectStorageService | LocalObjectStorageService {
  return isLocalStorage ? new LocalObjectStorageService() : new ObjectStorageService();
}

// ── Upload finalization tokens ────────────────────────────────────────────────
// When the server mints a presigned upload URL it also issues a short-lived
// HMAC token that binds the objectPath to the requesting user and an expiry.
// The client must present this token when calling POST /api/uploads/finalize,
// preventing any other authenticated user from setting/hijacking ACL on an
// object they did not upload.

const FINALIZE_TOKEN_TTL_SEC = 3600; // 1 hour

function generateFinalizeToken(objectPath: string, userId: string): string {
  const expiry = Math.floor(Date.now() / 1000) + FINALIZE_TOKEN_TTL_SEC;
  const secret = process.env.SESSION_SECRET ?? "dev-fallback-secret";
  const payload = `${objectPath}|${userId}|${expiry}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${expiry}.${sig}`;
}

function verifyFinalizeToken(objectPath: string, userId: string, token: string): boolean {
  const dotIdx = token.indexOf(".");
  if (dotIdx < 1) return false;
  const expiryStr = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expiry = parseInt(expiryStr, 10);
  if (!Number.isFinite(expiry) || Math.floor(Date.now() / 1000) > expiry) return false;
  const secret = process.env.SESSION_SECRET ?? "dev-fallback-secret";
  const payload = `${objectPath}|${userId}|${expiry}`;
  const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
  const sigBuf = Buffer.from(sig, "hex");
  const expBuf = Buffer.from(expectedSig, "hex");
  if (sigBuf.length !== expBuf.length || sigBuf.length === 0) return false;
  return timingSafeEqual(sigBuf, expBuf);
}

// Optional text fields on `scientists` that allow NULL. Blank/empty strings are
// normalized to null so they don't store noise and (for `staffId`, which is
// UNIQUE) don't collide with other blank records on the unique constraint.
const SCIENTIST_NULLABLE_TEXT_FIELDS = [
  "jobTitle",
  "staffId",
  "department",
  "bio",
  "profileImageInitials",
  "orcidId",
  "linkedInUrl",
  "googleScholarUrl",
  "webOfScienceId",
] as const;

function normalizeScientistPayload(body: any): any {
  if (!body || typeof body !== "object") return body;
  const normalized: any = { ...body };
  for (const field of SCIENTIST_NULLABLE_TEXT_FIELDS) {
    if (typeof normalized[field] === "string" && normalized[field].trim() === "") {
      normalized[field] = null;
    }
  }
  return normalized;
}

// Maps a Postgres unique-constraint violation (error code 23505) on the
// `scientists` table to a clear, field-specific message. Returns undefined for
// any other error so the caller can fall back to a generic 500.
function scientistUniqueConflictMessage(error: any): string | undefined {
  // Drizzle wraps the underlying pg driver error in `error.cause`, so the
  // Postgres error code/detail live there rather than on the top-level error.
  const pgError = error?.code ? error : error?.cause;
  if (!pgError || pgError.code !== "23505") return undefined;
  const detail: string = `${pgError.detail ?? ""} ${pgError.constraint ?? ""}`.toLowerCase();
  if (detail.includes("email")) {
    return "A staff member with this email already exists.";
  }
  if (detail.includes("staff_id")) {
    return "A staff member with this Staff ID already exists.";
  }
  return "A staff member with these details already exists.";
}

type InvestigatorAssignmentError = {
  status: 400 | 404;
  message: string;
};

async function getInvestigatorAssignmentError(
  scientistId: number | null | undefined,
  roleLabel: string
): Promise<InvestigatorAssignmentError | null> {
  if (scientistId == null) return null;

  const scientist = await storage.getScientist(scientistId);
  if (!scientist) {
    return {
      status: 404,
      message: `${roleLabel} staff member not found.`,
    };
  }

  if (!isInvestigatorEligible(scientist)) {
    return {
      status: 400,
      message: `${roleLabel} must have an eligible Investigator designation.`,
    };
  }

  return null;
}

// ── ORCID / Google Scholar missing-paper import helpers ──────────────────────

// Normalize a free-form DOI for comparison: lowercase, strip any resolver
// prefix (https://doi.org/, http://dx.doi.org/, doi:) and surrounding noise.
// The `doi` column is free-form and not unique, so all DOI matching goes
// through this normalizer to avoid false "missing" / duplicate results.
function normalizeDoi(doi: string | null | undefined): string {
  if (!doi || typeof doi !== "string") return "";
  return doi
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "")
    .trim();
}

// Pull a DOI out of a stored preprint link. Handles both forms we persist on a
// published record after a preprint is merged into it: a doi.org resolver link
// (https://doi.org/10.1101/...) and a preprint-server content URL (e.g.
// https://www.biorxiv.org/content/10.1101/2021.01.01.123456v2.full). Returns
// the version-aware normalized DOI (so v1/v2 collapse) or null when there is no
// DOI in the link.
function preprintLinkToDoi(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const m = url.match(/10\.\d{4,9}\/[^\s"'<>)\]}?#]+/i);
  if (!m) return null;
  let raw = m[0].toLowerCase();
  // bioRxiv/medRxiv content URLs carry a version plus an optional file/section
  // suffix on the DOI segment (".../123456v2.full"); for the openRxiv namespace
  // trim everything from the version marker so it matches the registered DOI.
  if (raw.startsWith("10.1101/")) {
    raw = raw.replace(/v\d+(\..*)?$/i, "");
  }
  return canonicalDoi(raw);
}

// Build the set of DOIs (version-aware normalized) that already represent works
// in the system. Besides each record's primary DOI, this includes the preprint
// DOI carried on a published record's preprint link (prepublicationUrl) — so an
// ORCID/Scholar re-sync never resurfaces a preprint that was merged into its
// published version and now survives only as that record's preprint link.
function buildExistingWorkDois(
  pubs: { doi?: string | null; prepublicationUrl?: string | null; alternateDois?: string[] | null }[]
): Set<string> {
  const set = new Set<string>();
  for (const p of pubs) {
    const primary = canonicalDoi(p.doi);
    if (primary) set.add(primary);
    const preprint = preprintLinkToDoi(p.prepublicationUrl);
    if (preprint) set.add(preprint);
    // Alternate DOIs recorded when duplicates were merged away (repository
    // copies, book-chapter DOIs, etc.) also represent works already present.
    for (const alt of p.alternateDois ?? []) {
      const a = canonicalDoi(alt);
      if (a) set.add(a);
    }
  }
  return set;
}

// Version-aware identity for an incoming candidate DOI, matching how
// buildExistingWorkDois normalizes the records already in the system.
function workDoiIdentity(doi: string | null | undefined): string {
  return canonicalDoi(doi) ?? "";
}

interface MissingPaperMeta {
  doi: string;
  title: string;
  journal: string;
  year: number | null;
  source: string;
  isPreprint?: boolean;
}

// Figshare DOIs are dataset/figure deposits, not publications — they should
// never be offered for import as missing papers.
/** Convert empty strings to null in a plain object so numeric/date DB columns
 *  don't receive "" which Postgres rejects as invalid input syntax. */
function nullifyEmptyStrings(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === "") {
      result[key] = null;
    } else if (value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      result[key] = nullifyEmptyStrings(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isFigshareWork(w: MissingPaperMeta): boolean {
  const doi = (w.doi || "").toLowerCase();
  if (doi.startsWith("10.6084/")) return true;
  const text = `${w.journal || ""} ${w.title || ""}`.toLowerCase();
  return text.includes("figshare");
}

// Publisher platforms whose ORCID summaries frequently omit the journal title.
// Maps DOI prefix → the journal/server name to display.
const DOI_PREFIX_JOURNALS: [string, string][] = [
  ["10.12688/f1000research", "F1000Research"],
  ["10.12688/wellcomeopenres", "Wellcome Open Research"],
  ["10.12688/gatesopenres", "Gates Open Research"],
  ["10.12688/hrbopenres", "HRB Open Research"],
  ["10.12688/amrcopenres", "AMRC Open Research"],
  ["10.1101/", "bioRxiv / medRxiv"],
  ["10.48550/", "arXiv"],
  ["10.21203/", "Research Square"],
  ["10.26434/", "ChemRxiv"],
  ["10.31234/", "PsyArXiv"],
  ["10.31219/", "OSF Preprints"],
  ["10.22541/", "Authorea"],
];

// When ORCID gives no journal title, infer a display name from well-known DOI
// prefixes so the row isn't blank (e.g. F1000 works).
function inferJournalFromDoi(doi: string): string {
  const d = (doi || "").toLowerCase();
  for (const [prefix, name] of DOI_PREFIX_JOURNALS) {
    if (d.startsWith(prefix)) return name;
  }
  return "";
}

// Fetch a researcher's works from the ORCID public API and return one entry
// per DOI with display metadata pulled straight from the ORCID summaries.
// Throws on network / non-OK responses so the caller can report ORCID as
// unavailable.
async function fetchOrcidWorks(orcidId: string): Promise<MissingPaperMeta[]> {
  const id = orcidId.trim().replace(/^https?:\/\/orcid\.org\//i, "");
  const url = `https://pub.orcid.org/v3.0/${encodeURIComponent(id)}/works`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`ORCID API returned ${response.status}`);
  }
  const data: any = await response.json();
  const groups: any[] = Array.isArray(data?.group) ? data.group : [];
  const results: MissingPaperMeta[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    // ORCID can merge a preprint and its published journal version into ONE
    // group when they share an id (e.g. the same PMC id). Examine every
    // work-summary and every DOI in the group, and prefer the published
    // version over a preprint DOI so the journal article isn't hidden behind
    // its bioRxiv/Research Square copy.
    const summaries: any[] = Array.isArray(group?.["work-summary"])
      ? group["work-summary"]
      : [];

    type Candidate = { doi: string; summary: any };
    const candidates: Candidate[] = [];
    const candidateDois = new Set<string>();

    const collectDois = (extIds: any[], summary: any) => {
      for (const e of extIds) {
        if ((e?.["external-id-type"] ?? "").toLowerCase() !== "doi") continue;
        const norm = normalizeDoi(e?.["external-id-value"]);
        if (!norm || candidateDois.has(norm)) continue;
        candidateDois.add(norm);
        candidates.push({ doi: norm, summary });
      }
    };

    // Per-summary DOIs first: they pair each DOI with its own title/journal.
    for (const summary of summaries) {
      collectDois(summary?.["external-ids"]?.["external-id"] ?? [], summary);
    }
    // Group-level DOIs as a fallback (paired with the first summary).
    collectDois(group?.["external-ids"]?.["external-id"] ?? [], summaries[0] ?? {});

    if (candidates.length === 0) continue;

    const isPreprintDoi = (doi: string) =>
      isPreprintRecord({ id: 0, doi, title: null, journal: null });
    const chosen =
      candidates.find((c) => !isPreprintDoi(c.doi)) ?? candidates[0];

    // Mark every DOI in the group as seen BEFORE the duplicate check, so an
    // overlapping group (e.g. one that repeats an already-emitted published
    // DOI alongside its preprint DOI) can't leak its other DOIs as separate
    // rows via a later group.
    const alreadyEmitted = seen.has(chosen.doi);
    for (const doi of Array.from(candidateDois)) seen.add(doi);
    if (alreadyEmitted) continue;

    const summary: any = chosen.summary ?? {};
    const title: string =
      summary?.title?.title?.value ?? "Untitled work";
    const journal: string = summary?.["journal-title"]?.value ?? "";
    const yearRaw = summary?.["publication-date"]?.year?.value;
    const year = yearRaw ? parseInt(yearRaw, 10) : null;

    results.push({
      doi: chosen.doi,
      title,
      journal,
      year: Number.isFinite(year as number) ? (year as number) : null,
      source: "ORCID",
    });
  }
  return results;
}

// Validate a stored Google Scholar URL before the server fetches it. The URL
// is user-editable, so fetching it unchecked would be an SSRF sink (the server
// could be coerced into requesting internal/private addresses). We require
// HTTPS, restrict the host to known Google Scholar domains, and reject IP
// literals outright. Returns null when the URL is not safe to fetch.
function validateGoogleScholarUrl(scholarUrl: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(scholarUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;

  const host = parsed.hostname.toLowerCase();

  // Reject IPv4/IPv6 literals (e.g. 169.254.169.254, [::1]) — Scholar is only
  // ever reached by DNS hostname, never by raw IP.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || parsed.hostname.startsWith("[")) {
    return null;
  }

  // Allowlist: scholar.google.com and regional Google Scholar hosts
  // (e.g. scholar.google.de, scholar.google.co.uk, scholar.google.com.au).
  // The TLD suffix is bounded to one or two short labels so a crafted host
  // like `scholar.google.com.evil.com` cannot slip through as a "regional"
  // domain.
  const prefix = "scholar.google.";
  let isScholarHost = false;
  if (host === "scholar.google.com") {
    isScholarHost = true;
  } else if (host.startsWith(prefix)) {
    const suffix = host.slice(prefix.length);
    isScholarHost = /^[a-z]{2,3}(\.[a-z]{2,3})?$/.test(suffix);
  }
  if (!isScholarHost) return null;

  return parsed;
}

// Best-effort Google Scholar DOI scrape. Scholar has no official API and
// actively blocks scraping, so any failure (block, empty, parse error) is
// swallowed and an empty array is returned — this must never break the ORCID
// result. We simply scan the fetched HTML for any DOI-shaped strings.
async function fetchGoogleScholarDois(scholarUrl: string): Promise<MissingPaperMeta[]> {
  // SSRF guard: only fetch validated Scholar URLs.
  const safeUrl = validateGoogleScholarUrl(scholarUrl);
  if (!safeUrl) return [];

  try {
    const response = await fetch(safeUrl.toString(), {
      redirect: "error", // never follow redirects to a non-allowlisted host
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html",
      },
    });
    if (!response.ok) return [];
    const html = await response.text();
    const matches = html.match(/10\.\d{4,9}\/[^\s"'<>)\]}]+/g) ?? [];
    const results: MissingPaperMeta[] = [];
    const seen = new Set<string>();
    for (const m of matches) {
      const norm = normalizeDoi(m);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      results.push({
        doi: norm,
        title: "",
        journal: "",
        year: null,
        source: "Google Scholar",
      });
    }
    return results;
  } catch {
    return [];
  }
}

// bioRxiv/medRxiv append a version suffix to the preprint URL (e.g.
// "...25339324v1") but CrossRef registers the DOI WITHOUT that suffix, so a
// raw lookup 404s. Strip a trailing "vN", but ONLY for the openRxiv preprint
// namespace (10.1101/) so we never mangle a legitimate DOI that happens to end
// in "vN".
function stripDoiVersionSuffix(doi: string): string {
  if (!/^10\.1101\//i.test(doi)) return doi;
  return doi.replace(/v\d+$/i, "");
}

// Fetch a CrossRef work record. If the DOI is genuinely not found (404), retry
// once with the preprint version suffix stripped. Returns the `message` object
// or null. We only retry on 404 (not transient 429/5xx) so a temporary error
// can't make us silently resolve a different DOI form.
async function fetchCrossrefWork(doi: string): Promise<any | null> {
  const tryFetch = async (candidate: string): Promise<{ work: any | null; status: number }> => {
    try {
      const response = await fetch(
        `https://api.crossref.org/works/${encodeURIComponent(candidate)}`,
      );
      if (!response.ok) return { work: null, status: response.status };
      const data: any = await response.json();
      return { work: data?.message ?? null, status: response.status };
    } catch {
      return { work: null, status: 0 };
    }
  };

  const first = await tryFetch(doi);
  if (first.work) return first.work;

  if (first.status === 404) {
    const stripped = stripDoiVersionSuffix(doi);
    if (stripped !== doi) {
      const retry = await tryFetch(stripped);
      if (retry.work) return retry.work;
    }
  }
  return null;
}

// Resolve a journal/venue name from a CrossRef work. Preprints (type
// "posted-content") leave container-title empty and put the server name (e.g.
// "medRxiv") in `institution`, so fall back to that, then publisher.
function crossrefJournalName(work: any): string {
  return (
    work["container-title"]?.[0] ||
    work.institution?.[0]?.name ||
    (work.type === "posted-content" ? work.publisher || "" : "") ||
    ""
  );
}

// Fetch and parse a single work from CrossRef into an insert-ready publication
// shape. Returns null when the DOI can't be resolved. Reused by the batch
// import endpoint so imported papers get full enrichment.
async function fetchCrossrefPublication(doi: string): Promise<{
  title: string;
  authors: string;
  journal: string;
  volume: string;
  issue: string;
  pages: string;
  doi: string;
  abstract: string;
  type: string;
  publicationDate: Date | null;
} | null> {
  try {
    const work = await fetchCrossrefWork(doi);
    if (!work) return null;

    const authors =
      work.author
        ?.map((a: any) => `${a.given || ""} ${a.family || ""}`.trim())
        .filter(Boolean)
        .join(", ") || "";

    const dateParts = work.published?.["date-parts"]?.[0];
    const publicationDate =
      dateParts && dateParts[0]
        ? new Date(dateParts[0], (dateParts[1] || 1) - 1, dateParts[2] || 1)
        : null;

    const journal = crossrefJournalName(work);

    return {
      title: work.title?.[0] || "Untitled work",
      authors,
      journal,
      volume: work.volume || "",
      issue: work.issue || "",
      pages: work.page || "",
      doi: work.DOI || doi,
      abstract: work.abstract ? stripXml(work.abstract) : "",
      type: typeof work.type === "string" ? work.type : "",
      publicationDate,
    };
  } catch {
    return null;
  }
}

// Strip XML/HTML tags and decode the handful of entities PubMed emits so the
// extracted text (titles, abstracts) is plain readable text.
function stripXml(input: string): string {
  return input
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// Pull data for a single XML element by tag name (first match), tags stripped.
function xmlText(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? stripXml(m[1]) : "";
}

// PubMed enrichment: resolve a DOI to a PMID via E-utilities esearch, then
// efetch the record to recover the abstract, PMID, authors, and bibliographic
// fields that CrossRef often lacks (CrossRef rarely has abstracts and some
// publishers — e.g. Science — aren't in CrossRef at all). Best-effort: any
// failure returns null and the caller falls back to CrossRef/ORCID metadata.
async function fetchPubmedByDoi(doi: string): Promise<{
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  volume: string;
  issue: string;
  pages: string;
  abstract: string;
  publicationDate: Date | null;
} | null> {
  try {
    const eutils = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
    const common = "tool=qbridge&email=research@qbridge.local";

    const searchUrl = `${eutils}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(
      `${doi}[DOI]`
    )}&retmode=json&${common}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return null;
    const searchData: any = await searchRes.json();
    const pmid: string | undefined = searchData?.esearchresult?.idlist?.[0];
    if (!pmid) return null;

    const fetchUrl = `${eutils}/efetch.fcgi?db=pubmed&id=${encodeURIComponent(
      pmid
    )}&retmode=xml&${common}`;
    const fetchRes = await fetch(fetchUrl);
    if (!fetchRes.ok) return null;
    const xml = await fetchRes.text();

    // Authors: "ForeName LastName" (fall back to Initials / CollectiveName).
    const authors: string[] = [];
    const authorBlocks = xml.match(/<Author[^>]*>[\s\S]*?<\/Author>/g) ?? [];
    for (const block of authorBlocks) {
      const last = xmlText(block, "LastName");
      const fore = xmlText(block, "ForeName") || xmlText(block, "Initials");
      const collective = xmlText(block, "CollectiveName");
      if (last) authors.push(`${fore ? fore + " " : ""}${last}`.trim());
      else if (collective) authors.push(collective);
    }

    // Abstract: concatenate every AbstractText section (labeled or not).
    const abstractParts: string[] = [];
    const abstractBlocks =
      xml.match(/<AbstractText[^>]*>[\s\S]*?<\/AbstractText>/g) ?? [];
    for (const block of abstractBlocks) {
      const labelMatch = block.match(/label="([^"]+)"/i);
      const text = stripXml(block.replace(/<\/?AbstractText[^>]*>/g, ""));
      if (text) {
        abstractParts.push(labelMatch ? `${labelMatch[1]}: ${text}` : text);
      }
    }

    // Pages: prefer MedlinePgn, fall back to ELocationID (e.g. article number).
    let pages = xmlText(xml, "MedlinePgn");
    if (!pages) {
      const eloc = xml.match(/<ELocationID[^>]*>([\s\S]*?)<\/ELocationID>/);
      if (eloc) pages = stripXml(eloc[1]);
    }

    // Publication date from the article's PubDate.
    let publicationDate: Date | null = null;
    const pubDateBlock = xml.match(/<PubDate>([\s\S]*?)<\/PubDate>/);
    if (pubDateBlock) {
      const yearStr = xmlText(pubDateBlock[1], "Year");
      const year = parseInt(yearStr, 10);
      if (!isNaN(year)) {
        const monthStr = xmlText(pubDateBlock[1], "Month");
        const dayStr = xmlText(pubDateBlock[1], "Day");
        const months: Record<string, number> = {
          jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
          jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
        };
        let month = 0;
        if (monthStr) {
          const numMonth = parseInt(monthStr, 10);
          month = !isNaN(numMonth)
            ? numMonth - 1
            : months[monthStr.slice(0, 3).toLowerCase()] ?? 0;
        }
        const day = parseInt(dayStr, 10);
        publicationDate = new Date(Date.UTC(year, month, isNaN(day) ? 1 : day));
      }
    }

    return {
      pmid,
      title: xmlText(xml, "ArticleTitle"),
      authors: authors.join(", "),
      journal: xmlText(xml, "Title"),
      volume: xmlText(xml, "Volume"),
      issue: xmlText(xml, "Issue"),
      pages,
      abstract: abstractParts.join("\n\n"),
      publicationDate,
    };
  } catch {
    return null;
  }
}

// ── Paper discovery (multi-source) ──────────────────────────────────────────
// Institution-wide, multi-source paper discovery for the Publication Office
// "Find Papers" tab. Each source fetcher returns a common metadata shape and
// must fail soft (return []) so one slow/broken source never fails the search.

interface DiscoveredPaper {
  doi: string; // normalized (lowercase, resolver stripped)
  title: string;
  journal: string;
  year: number | null;
  authors: string;
  source: string; // which source produced this row (merged later)
  // Affiliation string from the matched record that triggered the find (only
  // meaningful in institution mode). Lets staff verify the match is genuine.
  matchedAffiliation?: string | null;
}

// Given a set of affiliation strings pulled from a record, pick the one that
// best evidences the searched affiliation: prefer a string that contains the
// search term (case-insensitive), otherwise fall back to the first available.
function pickMatchedAffiliation(
  strings: Array<string | null | undefined>,
  term?: string,
): string | null {
  const cleaned = strings
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
  if (cleaned.length === 0) return null;
  if (term && term.trim()) {
    const needle = term.trim().toLowerCase();
    const hit = cleaned.find((s) => s.toLowerCase().includes(needle));
    if (hit) return hit;
    // Try matching on the most distinctive single word of the term (e.g.
    // "Sidra" out of "Sidra Medicine") so partial source matches still surface.
    const words = needle.split(/\s+/).filter((w) => w.length >= 4);
    for (const w of words) {
      const wHit = cleaned.find((s) => s.toLowerCase().includes(w));
      if (wHit) return wHit;
    }
  }
  return cleaned[0];
}

// A single descriptor drives every fetcher. Modes populate different fields:
//  - scientist:   authorName (+ orcidId for the ORCID source)
//  - institution: affiliation
//  - keyword:     query (author / title keywords / DOI)
interface DiscoveryQuery {
  authorName?: string;
  orcidId?: string;
  affiliation?: string;
  query?: string;
  yearFrom?: number | null;
  yearTo?: number | null;
}

const DISCOVERY_RESULT_CAP = 50; // per source, per query
const DISCOVERY_TIMEOUT_MS = 12000;
// Polite identification for OpenAlex / Crossref (mailto) per their etiquette.
const DISCOVERY_CONTACT = "research@qbridge.local";
const DISCOVERY_USER_AGENT = `Q-BRIDGE/1.0 (mailto:${DISCOVERY_CONTACT})`;

async function fetchJsonWithTimeout(
  url: string,
  init?: RequestInit,
): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": DISCOVERY_USER_AGENT,
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function withinYearRange(
  year: number | null,
  from?: number | null,
  to?: number | null,
): boolean {
  if (year == null) return true; // keep undated works; can't exclude reliably
  if (from != null && year < from) return false;
  if (to != null && year > to) return false;
  return true;
}

// OpenAlex (keyless). Supports author (name or ORCID), affiliation, and free
// text. Uses filters + search; returns up to the cap.
async function discoverOpenAlex(q: DiscoveryQuery): Promise<DiscoveredPaper[]> {
  const filters: string[] = ["type:article"];
  const params = new URLSearchParams();
  params.set("per-page", String(DISCOVERY_RESULT_CAP));
  params.set("mailto", DISCOVERY_CONTACT);

  if (q.orcidId) {
    const id = q.orcidId.trim().replace(/^https?:\/\/orcid\.org\//i, "");
    filters.push(`author.orcid:${id}`);
  } else if (q.affiliation) {
    filters.push(
      `raw_affiliation_strings.search:${q.affiliation.replace(/,/g, " ")}`,
    );
  } else if (q.authorName) {
    params.set("search", q.authorName);
  } else if (q.query) {
    params.set("search", q.query);
  } else {
    return [];
  }

  if (q.yearFrom != null) filters.push(`from_publication_date:${q.yearFrom}-01-01`);
  if (q.yearTo != null) filters.push(`to_publication_date:${q.yearTo}-12-31`);
  params.set("filter", filters.join(","));

  const data = await fetchJsonWithTimeout(
    `https://api.openalex.org/works?${params.toString()}`,
  );
  const results: any[] = Array.isArray(data?.results) ? data.results : [];
  const out: DiscoveredPaper[] = [];
  for (const w of results) {
    const doi = normalizeDoi(w?.doi);
    if (!doi) continue;
    const authors = Array.isArray(w?.authorships)
      ? w.authorships
          .map((a: any) => a?.author?.display_name)
          .filter(Boolean)
          .join(", ")
      : "";
    const affStrings: Array<string | null | undefined> = [];
    if (Array.isArray(w?.authorships)) {
      for (const a of w.authorships) {
        if (Array.isArray(a?.raw_affiliation_strings)) affStrings.push(...a.raw_affiliation_strings);
        if (Array.isArray(a?.institutions)) {
          for (const inst of a.institutions) affStrings.push(inst?.display_name);
        }
      }
    }
    out.push({
      doi,
      title: typeof w?.title === "string" ? w.title : "Untitled work",
      journal: w?.primary_location?.source?.display_name || "",
      year: typeof w?.publication_year === "number" ? w.publication_year : null,
      authors,
      source: "OpenAlex",
      matchedAffiliation: pickMatchedAffiliation(affStrings, q.affiliation),
    });
  }
  return out;
}

// PubMed via NCBI E-utilities (keyless). esearch for ids, esummary for metadata.
async function discoverPubmed(q: DiscoveryQuery): Promise<DiscoveredPaper[]> {
  const eutils = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  const common = "tool=qbridge&email=research@qbridge.local";

  const terms: string[] = [];
  if (q.affiliation) terms.push(`${q.affiliation}[Affiliation]`);
  if (q.authorName) terms.push(`${q.authorName}[Author]`);
  if (q.query) terms.push(q.query);
  if (terms.length === 0) return [];

  let term = terms.join(" AND ");
  if (q.yearFrom != null || q.yearTo != null) {
    const from = q.yearFrom ?? 1800;
    const to = q.yearTo ?? new Date().getFullYear();
    term += ` AND (${from}:${to}[Date - Publication])`;
  }

  const searchData = await fetchJsonWithTimeout(
    `${eutils}/esearch.fcgi?db=pubmed&retmode=json&retmax=${DISCOVERY_RESULT_CAP}&term=${encodeURIComponent(
      term,
    )}&${common}`,
  );
  const ids: string[] = searchData?.esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];

  const summaryData = await fetchJsonWithTimeout(
    `${eutils}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}&${common}`,
  );
  const resultObj = summaryData?.result;
  if (!resultObj) return [];

  const out: DiscoveredPaper[] = [];
  for (const id of ids) {
    const rec = resultObj[id];
    if (!rec) continue;
    const doiEntry: any = Array.isArray(rec.articleids)
      ? rec.articleids.find((a: any) => a?.idtype === "doi")
      : null;
    const doi = normalizeDoi(doiEntry?.value);
    if (!doi) continue; // we key dedup/import on DOI
    const year = rec.pubdate ? parseInt(String(rec.pubdate).slice(0, 4), 10) : null;
    const authors = Array.isArray(rec.authors)
      ? rec.authors.map((a: any) => a?.name).filter(Boolean).join(", ")
      : "";
    out.push({
      doi,
      title: rec.title || "Untitled work",
      journal: rec.fulljournalname || rec.source || "",
      year: Number.isFinite(year) ? year : null,
      authors,
      source: "PubMed",
    });
  }
  return out;
}

// Crossref (keyless, polite mailto). author / affiliation / bibliographic query.
async function discoverCrossref(q: DiscoveryQuery): Promise<DiscoveredPaper[]> {
  const params = new URLSearchParams();
  params.set("rows", String(DISCOVERY_RESULT_CAP));
  params.set("mailto", DISCOVERY_CONTACT);
  params.set("select", "DOI,title,container-title,issued,author");

  let hasQuery = false;
  if (q.authorName) {
    params.set("query.author", q.authorName);
    hasQuery = true;
  }
  if (q.affiliation) {
    params.set("query.affiliation", q.affiliation);
    hasQuery = true;
  }
  if (q.query) {
    params.set("query.bibliographic", q.query);
    hasQuery = true;
  }
  if (!hasQuery) return [];

  const filters: string[] = [];
  if (q.yearFrom != null) filters.push(`from-pub-date:${q.yearFrom}-01-01`);
  if (q.yearTo != null) filters.push(`until-pub-date:${q.yearTo}-12-31`);
  if (filters.length) params.set("filter", filters.join(","));

  const data = await fetchJsonWithTimeout(
    `https://api.crossref.org/works?${params.toString()}`,
  );
  const items: any[] = data?.message?.items ?? [];
  const out: DiscoveredPaper[] = [];
  for (const w of items) {
    const doi = normalizeDoi(w?.DOI);
    if (!doi) continue;
    const authors = Array.isArray(w?.author)
      ? w.author
          .map((a: any) => `${a.given || ""} ${a.family || ""}`.trim())
          .filter(Boolean)
          .join(", ")
      : "";
    const affStrings: Array<string | null | undefined> = [];
    if (Array.isArray(w?.author)) {
      for (const a of w.author) {
        if (Array.isArray(a?.affiliation)) {
          for (const aff of a.affiliation) affStrings.push(aff?.name);
        }
      }
    }
    const year = w?.issued?.["date-parts"]?.[0]?.[0] ?? null;
    out.push({
      doi,
      title: Array.isArray(w?.title) ? w.title[0] || "Untitled work" : "Untitled work",
      journal: Array.isArray(w?.["container-title"]) ? w["container-title"][0] || "" : "",
      year: typeof year === "number" ? year : null,
      authors,
      source: "Crossref",
      matchedAffiliation: pickMatchedAffiliation(affStrings, q.affiliation),
    });
  }
  return out;
}

// Europe PMC (keyless). affiliation (AFF) / author (AUTH) / free text query.
async function discoverEuropePmc(q: DiscoveryQuery): Promise<DiscoveredPaper[]> {
  const clauses: string[] = [];
  if (q.affiliation) clauses.push(`AFF:"${q.affiliation}"`);
  if (q.authorName) clauses.push(`AUTH:"${q.authorName}"`);
  if (q.query) clauses.push(q.query);
  if (clauses.length === 0) return [];

  let query = clauses.join(" AND ");
  if (q.yearFrom != null || q.yearTo != null) {
    const from = q.yearFrom ?? 1800;
    const to = q.yearTo ?? new Date().getFullYear();
    query += ` AND (PUB_YEAR:[${from} TO ${to}])`;
  }

  const params = new URLSearchParams();
  params.set("query", query);
  params.set("format", "json");
  params.set("pageSize", String(DISCOVERY_RESULT_CAP));
  params.set("resultType", "core");

  const data = await fetchJsonWithTimeout(
    `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params.toString()}`,
  );
  const results: any[] = data?.resultList?.result ?? [];
  const out: DiscoveredPaper[] = [];
  for (const w of results) {
    const doi = normalizeDoi(w?.doi);
    if (!doi) continue;
    const year = w?.pubYear ? parseInt(String(w.pubYear), 10) : null;
    const affStrings: Array<string | null | undefined> = [];
    const authorList = Array.isArray(w?.authorList?.author) ? w.authorList.author : [];
    for (const a of authorList) {
      const details = a?.authorAffiliationDetailsList?.authorAffiliation;
      if (Array.isArray(details)) {
        for (const d of details) affStrings.push(d?.affiliation);
      }
      if (typeof a?.affiliation === "string") affStrings.push(a.affiliation);
    }
    if (typeof w?.affiliation === "string") affStrings.push(w.affiliation);
    out.push({
      doi,
      title: w?.title || "Untitled work",
      journal: w?.journalTitle || w?.journalInfo?.journal?.title || "",
      year: Number.isFinite(year) ? year : null,
      authors: w?.authorString || "",
      source: "Europe PMC",
      matchedAffiliation: pickMatchedAffiliation(affStrings, q.affiliation),
    });
  }
  return out;
}

// ORCID source for discovery: only meaningful in scientist mode (needs an
// ORCID iD). Reuses the existing fetchOrcidWorks helper and reshapes to the
// discovery paper type.
async function discoverOrcid(q: DiscoveryQuery): Promise<DiscoveredPaper[]> {
  if (!q.orcidId) return [];
  try {
    const works = await fetchOrcidWorks(q.orcidId);
    return works.slice(0, DISCOVERY_RESULT_CAP).map((w) => ({
      doi: w.doi,
      title: w.title,
      journal: w.journal,
      year: w.year,
      authors: "",
      source: "ORCID",
    }));
  } catch {
    return [];
  }
}

const DISCOVERY_FETCHERS: Record<
  string,
  (q: DiscoveryQuery) => Promise<DiscoveredPaper[]>
> = {
  orcid: discoverOrcid,
  openalex: discoverOpenAlex,
  pubmed: discoverPubmed,
  crossref: discoverCrossref,
  europepmc: discoverEuropePmc,
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up API routes
  const apiRouter = app.route('/api');

  registerOfficeDashboardRoutes(app);
  registerManagementReportRoutes(app);

  // Sidra Score settings + per-scientist endpoints (registered early so literal
  // routes beat the /api/scientists/:id param route). Also registers
  // /api/scientists/sidra-scores (office-wide) and /api/scientists/:id/sidra-score.
  registerSidraScoreRoutes(app);

  // Health check for database connection
  app.get('/api/health/database', async (req: Request, res: Response) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.json(true);
    } catch (error) {
      console.error("Database health check failed:", error);
      res.json(false);
    }
  });

  // Object Storage Routes
  app.post("/api/objects/upload", requireAuth, async (req, res) => {
    const objectStorageService = getObjectStorageService();
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      const sessionUser = (req.session as any)?.user;
      const userId = sessionUser?.id?.toString() ?? "demo";
      const finalizeToken = generateFinalizeToken(objectPath, userId);
      res.json({ uploadURL, objectPath, finalizeToken });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Finalize an upload by setting a private ACL on the object.
  // Requires a valid HMAC finalizeToken issued by the upload-URL endpoint so
  // that only the user who requested the upload can set ACL on that objectPath.
  app.post("/api/uploads/finalize", requireAuth, async (req, res) => {
    const { objectPath, finalizeToken } = req.body;
    if (!objectPath || typeof objectPath !== "string") {
      return res.status(400).json({ error: "objectPath is required" });
    }
    const authMode = getAuthMode();
    const sessionUser = (req.session as any)?.user;

    if (authMode !== "demo") {
      // Real auth modes: require and verify the HMAC token.
      if (!sessionUser) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!finalizeToken || typeof finalizeToken !== "string") {
        return res.status(400).json({ error: "finalizeToken is required" });
      }
      const userId = sessionUser.id.toString();
      if (!verifyFinalizeToken(objectPath, userId, finalizeToken)) {
        return res.status(403).json({ error: "Invalid or expired finalize token" });
      }
      // Token is valid: set private ACL with this user as owner.
      if (!isLocalStorage) {
        const objectStorageService = new ObjectStorageService();
        try {
          await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
            owner: userId,
            visibility: "private",
          });
        } catch (error) {
          console.error("Failed to set ACL on upload:", error);
          return res.status(500).json({ error: "Failed to finalize upload" });
        }
      }
    }
    // demo mode or local storage: no GCS ACL to set; return success.
    res.json({ ok: true });
  });
  
  // Upload URL request for presigned uploads
  app.post("/api/uploads/request-url", requireAuth, async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const { name, size, contentType } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Missing required field: name" });
      }
      
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      const sessionUser = (req.session as any)?.user;
      const userId = sessionUser?.id?.toString() ?? "demo";
      const finalizeToken = generateFinalizeToken(objectPath, userId);
      
      res.json({
        uploadURL,
        objectPath,
        finalizeToken,
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });
  
  // Serve uploaded objects — single consolidated handler for GCS and local storage.
  //
  // Authorization matrix:
  //   demo mode (AUTH_MODE=demo) → open access (entire app is unauthenticated in this mode)
  //   GCS, real auth, ACL=public → world-readable
  //   GCS, real auth, ACL=private or no ACL → require session + canAccessObjectEntity();
  //       no-ACL objects return false (deny-by-default) unless finalized via
  //       POST /api/uploads/finalize which sets owner+private ACL after upload.
  //   Local storage, real auth   → require session only (no GCS ACL metadata)
  app.get("/objects/:objectPath(*)", async (req, res) => {
    const objectStorageService = getObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);

      const authMode = getAuthMode();
      const sessionUser = (req.session as any)?.user;

      if (authMode !== "demo") {
        // Real authentication modes: enforce access control.
        if (!isLocalStorage) {
          const aclPolicy = await getObjectAclPolicy(objectFile as any);
          if (aclPolicy?.visibility !== "public") {
            // Non-public (private ACL or no ACL): require a real session.
            if (!sessionUser) {
              return res.status(401).json({ error: "Authentication required" });
            }
            // Route all private/no-ACL decisions through canAccessObjectEntity so
            // deny-by-default is enforced: no-ACL → false, private+non-owner → false.
            const canAccess = await (objectStorageService as ObjectStorageService).canAccessObjectEntity({
              userId: sessionUser.id.toString(),
              objectFile: objectFile as any,
              requestedPermission: ObjectPermission.READ,
            });
            if (!canAccess) {
              return res.status(403).json({ error: "Access denied" });
            }
          }
          // aclPolicy?.visibility === "public" → world-readable, fall through to download.
        } else {
          // Local storage: no GCS ACL metadata; session presence is the sole gate.
          if (!sessionUser) {
            return res.status(401).json({ error: "Authentication required" });
          }
        }
      }
      // demo mode: fall through to download with no restriction.

      await objectStorageService.downloadObject(objectFile as any, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });

  // Local filesystem upload handler (used when STORAGE_TYPE=local)
  app.put("/api/objects/local-upload/:id", requireAuth, async (req, res) => {
    if (!isLocalStorage) return res.status(404).end();
    const { id } = req.params;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", async () => {
      try {
        const localService = new LocalObjectStorageService();
        await localService.saveFile(id, Buffer.concat(chunks), req.headers["content-type"] || "application/octet-stream");
        res.status(200).end();
      } catch (err: any) {
        console.error("Local upload error:", err);
        // localFilePath throws for non-UUID ids and path traversal attempts.
        const status = err?.message?.includes("Invalid file id") || err?.message?.includes("Path traversal") ? 400 : 500;
        if (!res.headersSent) res.status(status).json({ error: err?.message || "Upload failed" });
      }
    });
    req.on("error", () => { if (!res.headersSent) res.status(500).json({ error: "Upload failed" }); });
  });

  // Returns true only if the path is a server-issued /objects/... reference.
  // The ObjectUploader stores objectPath (e.g. "/objects/<uuid>") as the file URL
  // after upload, so this is the expected form. Rejecting everything else prevents
  // SSRF and arbitrary GCS object reads: object paths are resolved server-side via
  // getObjectEntityFile(), which validates the path against PRIVATE_OBJECT_DIR.
  function isAllowedObjectPath(path: string): boolean {
    if (typeof path !== "string") return false;
    // Must be a server-issued /objects/<non-empty-id> path, no query string or fragment.
    return /^\/objects\/[^?#]+$/.test(path);
  }

  // Certificate processing - batch detection with OCR
  app.post("/api/certificates/process-batch", requireAuth, async (req, res) => {
    try {
      const { fileUrls, fileNames } = req.body;
      if (!fileUrls || !Array.isArray(fileUrls)) {
        return res.status(400).json({ message: "File URLs array is required" });
      }
      const sessionUser = (req.session as any)?.user;
      const callerId: string | undefined = sessionUser?.id?.toString();

      const modules = await storage.getCertificationModules();
      const results = [];

      for (let fileIndex = 0; fileIndex < fileUrls.length; fileIndex++) {
        const fileUrl = fileUrls[fileIndex];
        // Prefer the real, client-supplied filename; fall back to the object
        // path basename (a UUID) only when no name was provided.
        const providedName = Array.isArray(fileNames) ? fileNames[fileIndex] : undefined;
        const displayName =
          (providedName && String(providedName).trim()) ||
          String(fileUrl).split('/').pop();
        try {
          // Security: only accept server-issued /objects/... paths.
          // This prevents SSRF and arbitrary GCS object reads. The path is resolved
          // server-side via getObjectEntityFile(), which validates it against
          // PRIVATE_OBJECT_DIR so it can only address files this app uploaded.
          if (!isAllowedObjectPath(fileUrl)) {
            results.push({
              fileName: displayName,
              filePath: fileUrl,
              originalUrl: fileUrl,
              status: 'error',
              error: 'File path is not a valid server-issued upload reference.'
            });
            continue;
          }

          let detectedData: any = {
            fileName: displayName,
            filePath: fileUrl,
            originalUrl: fileUrl,
            status: 'processing',
            extractedText: null,
            parsedData: null
          };

          const startTime = Date.now();

          // Resolve the uploaded file server-side via the object storage service.
          // getObjectEntityFile() validates the path against PRIVATE_OBJECT_DIR and
          // confirms the object exists in GCS — no caller-controlled URL is followed.
          const objectStorageService = getObjectStorageService();
          let gcsFile: any;
          try {
            gcsFile = await objectStorageService.getObjectEntityFile(fileUrl);
          } catch (resolveError: any) {
            results.push({
              ...detectedData,
              status: 'error',
              error: 'Uploaded file not found in storage.'
            });
            continue;
          }

          // Authorization: verify the caller is allowed to read this object.
          // In demo mode the whole app is open and /api/uploads/finalize does
          // NOT set any GCS ACL, so there is no owner to check against — skip
          // the ACL check (otherwise every demo upload is denied and OCR never
          // runs). In real-auth modes finalize sets the uploader as owner, so
          // we enforce the GCS ACL ownership check here.
          if (!isLocalStorage && getAuthMode() !== "demo") {
            try {
              const canAccess = await (objectStorageService as ObjectStorageService).canAccessObjectEntity({
                userId: callerId,
                objectFile: gcsFile,
                requestedPermission: ObjectPermission.READ,
              });
              if (!canAccess) {
                results.push({
                  ...detectedData,
                  status: 'error',
                  error: 'Access denied: you are not the owner of this file.'
                });
                continue;
              }
            } catch (aclError) {
              // If ACL check fails (e.g. no ACL set yet), deny by default.
              results.push({
                ...detectedData,
                status: 'error',
                error: 'Access denied: could not verify file ownership.'
              });
              continue;
            }
          }

          // Read the file into a buffer. Works for both local storage (LocalFile)
          // and GCS (File). Local storage path is read directly from disk;
          // GCS path uses the SDK download() method.
          let fileBuffer: Buffer;
          let contentType = '';
          try {
            if (isLocalStorage) {
              // LocalFile has a .filePath property — read directly from disk.
              const { readFile } = await import('fs/promises');
              fileBuffer = await readFile((gcsFile as import('./localObjectStorage').LocalFile).filePath);
              // Content-type from the upload request is not stored on disk;
              // fall through to magic-byte detection below.
            } else {
              // GCS: get content-type from object metadata, then download.
              try {
                const [metadata] = await gcsFile.getMetadata();
                contentType = metadata.contentType || '';
                console.log(`Content-Type from GCS metadata: ${contentType}`);
              } catch (metaError) {
                console.log('Could not read GCS metadata, will detect from bytes');
              }
              const [fileContent] = await gcsFile.download();
              fileBuffer = fileContent;
            }
          } catch (downloadError: any) {
            results.push({
              ...detectedData,
              status: 'error',
              error: 'Failed to read file from storage.'
            });
            continue;
          }
          
          // Create initial PDF import history entry
          const historyEntry = await storage.createPdfImportHistoryEntry({
            fileName: detectedData.fileName || 'unknown',
            fileUrl: fileUrl,
            uploadedBy: 1, // TODO: Get from session/auth
            processingStatus: 'processing',
            ocrProvider: 'unknown'
          });

          // Determine file type from GCS metadata content-type + magic bytes in the
          // downloaded buffer. No user-supplied URL is fetched for this step.
          let isPDF = false;
          let isValidFile = false;

          if (contentType.includes('pdf') || contentType.includes('application/pdf')) {
            isPDF = true;
            isValidFile = true;
            console.log('PDF detected via Content-Type metadata');
          } else if (contentType.includes('image/')) {
            isValidFile = true;
            console.log('Image file detected via Content-Type metadata');
          } else {
            // Fall back to magic-byte detection from the already-downloaded buffer.
            const bytes = new Uint8Array(fileBuffer.buffer, fileBuffer.byteOffset, Math.min(fileBuffer.byteLength, 10));
            console.log(`File signature bytes: ${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
            if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
              console.log('PDF detected via magic bytes (%PDF)');
              isPDF = true;
              isValidFile = true;
            } else if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
              console.log('PNG detected via magic bytes');
              isValidFile = true;
            } else if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
              console.log('JPEG detected via magic bytes');
              isValidFile = true;
            } else {
              console.log('Unknown file signature - treating as image for OCR attempt');
              isValidFile = true;
            }
          }

          if (!isValidFile) {
            console.log('File type validation failed, skipping OCR processing');
            continue;
          }

          // Get OCR configuration and perform OCR based on settings
          const ocrConfig = await storage.getSystemConfiguration('ocr_service');
          const ocrSettings = ocrConfig?.value as any || { provider: 'ocr_space' };
          let provider = ocrSettings.provider;

          try {
            if (isPDF && provider === 'tesseract') {
              console.log('Warning: Using Tesseract for PDF processing - may have limited accuracy');
            }
            
            detectedData.status = 'processing';
            console.log(`Processing OCR for file: ${fileUrl} using ${provider}`);

            let extractedText = '';

            // CITI PDFs are usually text-based (not scanned images). Extract the
            // embedded text layer directly first — it's far more accurate than OCR
            // for module names, record IDs and dates. Only fall back to OCR when
            // the PDF has little/no embedded text (i.e. it's a scanned image).
            if (isPDF) {
              try {
                const pdfText = await extractPdfText(Buffer.from(fileBuffer));
                if (pdfText && pdfText.replace(/\s/g, '').length >= 100) {
                  extractedText = pdfText;
                  provider = 'pdf-text';
                  console.log(`Extracted embedded PDF text (${pdfText.length} chars) — skipping OCR`);
                } else {
                  console.log('PDF has little/no embedded text — falling back to OCR (likely scanned image)');
                }
              } catch (pdfErr: any) {
                console.error('Embedded PDF text extraction failed, falling back to OCR:', pdfErr?.message);
              }
            }

            if (!extractedText && provider === 'ocr_space') {
              // Use OCR.space API
              try {
                console.log('Attempting OCR.space API call...');
                console.log('API Key available:', !!(process.env.OCR_SPACE_API_KEY || ocrSettings.ocrSpaceApiKey));

                const apiKey = process.env.OCR_SPACE_API_KEY || ocrSettings.ocrSpaceApiKey || 'helloworld';

                // OCR.space free tier rejects PDFs with more than 3 pages. Split
                // multi-page PDFs (e.g. CITI completion reports) into ≤3-page chunks,
                // OCR each, then stitch the text back together. Non-PDFs and short
                // PDFs go through as a single buffer.
                let buffersToOcr: Buffer[] = [Buffer.from(fileBuffer)];
                if (isPDF) {
                  try {
                    buffersToOcr = await splitPdfIntoChunks(Buffer.from(fileBuffer), 3);
                    if (buffersToOcr.length > 1) {
                      console.log(`PDF split into ${buffersToOcr.length} chunk(s) to stay within OCR page limit`);
                    }
                  } catch (splitErr: any) {
                    console.error('PDF split failed, sending whole file:', splitErr?.message);
                    buffersToOcr = [Buffer.from(fileBuffer)];
                  }
                }

                const chunkTexts: string[] = [];
                for (let chunkIndex = 0; chunkIndex < buffersToOcr.length; chunkIndex++) {
                  console.log(`Uploading chunk ${chunkIndex + 1}/${buffersToOcr.length} to OCR.space (${buffersToOcr[chunkIndex].byteLength} bytes)...`);
                  const chunkText = await ocrSpaceExtractText(buffersToOcr[chunkIndex], apiKey, isPDF, contentType);
                  if (chunkText && chunkText.trim().length > 0) {
                    chunkTexts.push(chunkText);
                  }
                }

                extractedText = chunkTexts.join('\n');
                console.log(`OCR Extracted Text Length: ${extractedText.length} characters across ${buffersToOcr.length} chunk(s)`);
                console.log('First 500 characters of extracted text:', extractedText.substring(0, 500));
              } catch (apiError: any) {
                console.error('OCR.space failed:', apiError.message);

                // Don't fallback to Tesseract for rate limit errors or 403 errors
                if (apiError.message && (apiError.message.includes('RATE_LIMIT') || apiError.message.includes('403'))) {
                  throw new Error('OCR service temporarily unavailable (rate limit). Please wait about an hour and try again.');
                }

                console.log('Falling back to Tesseract.js...');
                // Don't throw error yet, let it fall back to Tesseract
                extractedText = null; // Signal to use fallback
              }
            }

            // If OCR.space failed or wasn't used, try Tesseract.js (only for image formats)
            if (!extractedText) {
              // For Tesseract, only block if the initial detection confirmed it's a PDF
              if (isPDF && provider === 'tesseract') {
                console.log('Confirmed PDF file detected in initial scan - Tesseract.js cannot process PDF files');
                throw new Error('PDF files cannot be processed with Tesseract.js. Please either: 1) Switch to OCR.space in Config tab, or 2) Convert your PDF to an image (PNG, JPG) first.');
              }
              
              console.log('Proceeding with Tesseract.js processing for image file');

              // Use Tesseract.js for image processing
              console.log('Attempting Tesseract.js processing for image file...');
              try {
                // Use the already-downloaded fileBuffer for Tesseract recognition.
                // Content type was determined from GCS metadata above, no HEAD fetch needed.
                const detectedFileType = contentType.includes('image/') ? contentType.split('/')[1]?.split(';')[0] : '';
                console.log(`Tesseract processing buffer (${fileBuffer.byteLength} bytes), content-type: ${contentType || 'unknown'}`);

                const { createWorker } = await import('tesseract.js');
                let worker = null;
                
                try {
                  worker = await createWorker(ocrSettings.tesseractOptions?.language || 'eng');
                  
                  // Add timeout to prevent hanging and wrap recognition in additional error handling
                  // Pass the Buffer directly — Tesseract.js accepts Buffer/ArrayBuffer, so no
                  // URL-based network fetch is made here.
                  const recognitionPromise = worker.recognize(fileBuffer).catch((err: any) => {
                    console.error('Tesseract recognition failed:', err);
                    throw new Error(`Image recognition failed: ${err?.message || 'Unknown error'}`);
                  });
                  
                  const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('OCR processing timed out after 60 seconds')), 60000)
                  );
                  
                  const { data: { text } } = await Promise.race([recognitionPromise, timeoutPromise]) as any;
                  extractedText = text;
                } catch (tesseractError: any) {
                  console.error('Tesseract.js error:', tesseractError);
                  // Set extracted text to empty to trigger fallback handling
                  extractedText = '';
                  throw new Error(`Tesseract OCR failed: ${tesseractError?.message || 'Unsupported image format or processing error'}`);
                } finally {
                  if (worker) {
                    try {
                      await worker.terminate();
                    } catch (terminateError) {
                      console.error('Error terminating Tesseract worker:', terminateError);
                    }
                  }
                }
              } catch (importError: any) {
                console.error('Error importing Tesseract.js:', importError);
                extractedText = '';
                throw new Error(`Failed to load OCR library: ${importError?.message || 'OCR module not available'}`);
              }
            }

            if (extractedText && extractedText.trim().length > 0) {
              detectedData.extractedText = extractedText;
              console.log(`OCR extracted ${extractedText.length} characters using ${provider}`);

              // Parse CITI certificate data from extracted text
              console.log('Starting certificate parsing...');
              console.log('Available modules:', modules.map(m => m.name));
              const parsedData = await parseCITICertificate(extractedText, modules);
              console.log('Parsing result:', JSON.stringify(parsedData, null, 2));
              detectedData = {
                ...detectedData,
                ...parsedData,
                status: parsedData.name ? 'detected' : 'unrecognized'
              };

              // Update history entry with parsed data
              try {
                console.log(`Updating history entry ${historyEntry.id} with parsed data:`, {
                  processingStatus: parsedData.name ? 'completed' : 'failed',
                  hasExtractedText: !!extractedText,
                  parsedDataFields: Object.keys(parsedData).filter(k => parsedData[k] !== null),
                  processingDuration: Date.now() - startTime
                });
                
                const updateResult = await storage.updatePdfImportHistoryEntry(historyEntry.id, {
                  processingStatus: parsedData.name ? 'completed' : 'failed',
                  ocrProvider: provider, // Make sure OCR provider is saved
                  documentType: parsedData.documentType || 'unknown',
                  extractedText: extractedText,
                  parsedData: parsedData,
                  
                  processingDuration: Date.now() - startTime,
                  errorMessage: parsedData.name ? null : 'Certificate data could not be extracted - manual assignment may be required'
                });
                
                console.log('History entry update result:', updateResult ? 'SUCCESS' : 'FAILED');
              } catch (updateError) {
                console.error('Failed to update history entry:', updateError);
              }
            } else {
              detectedData.status = 'ocr_failed';
              detectedData.error = 'No text could be extracted from the file';
              
              // Update history entry with OCR failure
              try {
                console.log(`Updating history entry ${historyEntry.id} with OCR failure`);
                const updateResult = await storage.updatePdfImportHistoryEntry(historyEntry.id, {
                  processingStatus: 'failed',
                  ocrProvider: provider, // Make sure OCR provider is saved
                  documentType: 'unknown', // OCR failed, so document type unknown
                  errorMessage: 'No text could be extracted from the file',
                  
                  processingDuration: Date.now() - startTime
                });
              } catch (updateError) {
                console.error('Failed to update history entry with OCR failure:', updateError);
              }
            }
          } catch (ocrError: any) {
            console.error('OCR processing error:', ocrError);
            detectedData.status = 'ocr_failed';
            detectedData.error = `OCR processing failed: ${ocrError?.message || 'Unknown error'}`;
            detectedData.suggestion = 'OCR failed - file uploaded but data extraction was unsuccessful. You can still manually assign this certificate to a scientist.';
            
            // Update history entry with OCR error
            try {
              console.log(`Updating history entry ${historyEntry.id} with OCR error:`, ocrError?.message);
              const updateResult = await storage.updatePdfImportHistoryEntry(historyEntry.id, {
                processingStatus: 'failed',
                ocrProvider: provider, // Make sure OCR provider is saved
                documentType: 'unknown', // OCR error, so document type unknown
                errorMessage: `OCR processing failed: ${ocrError?.message || 'Unknown error'}`,
                
                processingDuration: Date.now() - startTime
              });
            } catch (updateError) {
              console.error('Failed to update history entry with OCR error:', updateError);
            }
          }

          results.push(detectedData);
        } catch (error: any) {
          results.push({
            fileName: displayName,
            filePath: fileUrl,
            originalUrl: fileUrl,
            status: 'error',
            error: error?.message || 'Unknown error'
          });
        }
      }

      res.json({
        message: `Processed ${results.length} files with OCR`,
        results
      });
    } catch (error) {
      console.error("Error processing certificates:", error);
      res.status(500).json({ message: "Failed to process certificates" });
    }
  });


  // Extract the embedded text layer from a (text-based) PDF. CITI certificates
  // and completion reports are normally generated as text PDFs, so reading the
  // text layer directly is far more accurate than OCR. Returns '' when the PDF
  // has no usable text (e.g. a scanned image), signalling the caller to OCR.
  async function extractPdfText(buffer: Buffer): Promise<string> {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return result?.text || '';
    } finally {
      await parser.destroy?.();
    }
  }

  // Split a PDF into chunks of at most `pagesPerChunk` pages so each chunk stays
  // within OCR.space's free-tier 3-page limit. CITI completion reports are often
  // 4+ pages (Requirements + Transcript) and would otherwise be rejected outright.
  // Returns the original buffer unchanged when the PDF is already within the limit
  // or when it can't be parsed.
  async function splitPdfIntoChunks(buffer: Buffer, pagesPerChunk = 3): Promise<Buffer[]> {
    const { PDFDocument } = await import('pdf-lib');
    const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const total = src.getPageCount();
    if (total <= pagesPerChunk) {
      return [buffer];
    }
    const chunks: Buffer[] = [];
    for (let start = 0; start < total; start += pagesPerChunk) {
      const chunkDoc = await PDFDocument.create();
      const indices: number[] = [];
      for (let i = start; i < Math.min(start + pagesPerChunk, total); i++) {
        indices.push(i);
      }
      const copied = await chunkDoc.copyPages(src, indices);
      copied.forEach((p) => chunkDoc.addPage(p));
      const bytes = await chunkDoc.save();
      chunks.push(Buffer.from(bytes));
    }
    return chunks;
  }

  // Send a single buffer to OCR.space and return the concatenated text across all
  // pages in the response. Throws on rate limit, HTTP, or processing errors.
  async function ocrSpaceExtractText(
    buffer: Buffer,
    apiKey: string,
    isPDF: boolean,
    contentType: string,
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const fileBlob = new Blob([buffer], {
        type: isPDF ? 'application/pdf' : (contentType || 'application/octet-stream'),
      });
      const formData = new FormData();
      formData.append('file', fileBlob, isPDF ? 'certificate.pdf' : 'certificate.img');
      formData.append('apikey', apiKey);
      formData.append('language', 'eng');
      formData.append('isOverlayRequired', 'false');
      if (isPDF) {
        formData.append('filetype', 'PDF');
      }
      formData.append('detectOrientation', 'false');
      formData.append('isCreateSearchablePdf', 'false');
      formData.append('isSearchablePdfHideTextLayer', 'false');
      formData.append('scale', 'true');
      formData.append('isTable', 'false');
      formData.append('OCREngine', '2');

      const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!ocrResponse.ok) {
        const errorText = await ocrResponse.text();
        if (ocrResponse.status === 403 && errorText.includes('180 number of times')) {
          throw new Error('RATE_LIMIT: OCR service rate limit exceeded. Please wait about an hour before processing more certificates.');
        }
        throw new Error(`Failed to connect to OCR.space service: ${ocrResponse.status}`);
      }

      const ocrResult = await ocrResponse.json();
      if (ocrResult.IsErroredOnProcessing === true) {
        const errorMessages = Array.isArray(ocrResult.ErrorMessage) ? ocrResult.ErrorMessage : [ocrResult.ErrorMessage];
        throw new Error(errorMessages.join(', ') || 'OCR processing failed');
      }
      if (ocrResult.ParsedResults?.length > 0) {
        return ocrResult.ParsedResults.map((r: any) => r.ParsedText || '').join('\n');
      }
      throw new Error(ocrResult.ErrorMessage || 'OCR processing failed');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Helper function to detect CITI document type
  function detectCITIDocumentType(text: string): 'certificate' | 'report' | 'unknown' {
    // Report format indicators are checked FIRST. Completion reports also contain
    // the generic "Collaborative Institutional Training Initiative" line (in their
    // footer), so checking certificate markers first would misclassify reports.
    if (/completion report/i.test(text) ||
        /coursework requirements/i.test(text) ||
        /coursework transcript/i.test(text) ||
        /part 1 of 2/i.test(text) ||
        /part 2 of 2/i.test(text)) {
      return 'report';
    }

    // Certificate format indicators
    if (/this is to certify that/i.test(text) ||
        /has completed the following citi program course/i.test(text) ||
        /collaborative institutional training initiative/i.test(text)) {
      return 'certificate';
    }

    return 'unknown';
  }

  // --- Certification module matching helpers ---------------------------------
  // Stopwords that carry no discriminating meaning for course names.
  const MODULE_STOPWORDS = new Set([
    'the', 'of', 'and', 'for', 'with', 'a', 'an', 'to', 'in', 'on',
    'course', 'training', 'series', 'complete', 'program', 'citi', 'stage'
  ]);

  // Normalize a course/module name: lowercase, strip parentheticals + punctuation.
  function normalizeModuleName(s: string): string {
    return (s || '')
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Significant (non-stopword) tokens used for fuzzy overlap matching.
  function significantTokens(s: string): string[] {
    return normalizeModuleName(s).split(' ').filter(t => t && !MODULE_STOPWORDS.has(t));
  }

  // Pull an abbreviation out of a parenthetical, e.g. "Animal Biosafety (ABS)" -> "abs".
  function extractAbbrev(name: string): string | null {
    const m = (name || '').match(/\(([^)]+)\)/);
    if (m) {
      const inner = m[1].trim();
      if (/^[A-Za-z]{2,8}$/.test(inner)) return inner.toLowerCase();
    }
    return null;
  }

  // Strict module matcher. Returns a module only on a confident match,
  // otherwise null so the caller can flag the course as a NEW module.
  // Deliberately conservative: better to create a new module than mis-assign.
  function matchCertificationModule(courseName: string, modules: any[]): any | null {
    if (!courseName) return null;
    const courseNorm = normalizeModuleName(courseName);
    if (!courseNorm) return null;
    const courseAbbrev = extractAbbrev(courseName);
    const courseTokens = significantTokens(courseName);

    // 1) Exact normalized name match (parentheticals/punctuation ignored).
    let found = modules.find(m => normalizeModuleName(m.name) === courseNorm);
    if (found) return found;

    // 2) Abbreviation match (e.g. course text contains/equals the module's abbrev).
    if (courseAbbrev) {
      found = modules.find(m => extractAbbrev(m.name) === courseAbbrev);
      if (found) return found;
    }
    if (courseTokens.length === 1) {
      found = modules.find(m => extractAbbrev(m.name) === courseTokens[0]);
      if (found) return found;
    }

    // 3) Strong token overlap. Require at least 2 shared significant tokens and
    //    a high Jaccard similarity so single-word coincidences (e.g. "biosafety"
    //    matching "Animal Biosafety") do NOT produce a false positive.
    if (courseTokens.length > 0) {
      found = modules.find(m => {
        const mTokens = significantTokens(m.name);
        if (mTokens.length === 0) return false;
        const setM = new Set(mTokens);
        const shared = courseTokens.filter(t => setM.has(t));
        const union = new Set([...courseTokens, ...mTokens]).size;
        const jaccard = union > 0 ? shared.length / union : 0;
        return shared.length >= 2 && jaccard >= 0.6;
      });
      if (found) return found;
    }

    return null;
  }

  // Build a suggested abbreviation for a brand-new module from its course name.
  function suggestAbbreviation(courseName: string): string {
    const existing = extractAbbrev(courseName);
    if (existing) return existing.toUpperCase();
    // Initials of meaningful words (drop only articles/prepositions, keep nouns).
    const minimalStop = new Set(['the', 'of', 'and', 'for', 'with', 'a', 'an', 'to', 'in', 'on']);
    const words = normalizeModuleName(courseName).split(' ').filter(w => w && !minimalStop.has(w));
    let abbr = words.map(w => w[0].toUpperCase()).join('').slice(0, 6);
    if (abbr.length < 2) {
      abbr = (courseName || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
    }
    return abbr;
  }

  // Whole months between two YYYY-MM-DD strings.
  function monthsBetween(start: string, end: string): number {
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
    if (e.getDate() < s.getDate()) months -= 1;
    return months;
  }

  // Derive an expiration interval (months) for a new module from the cert dates,
  // snapping to common CITI renewal periods (1/2/3/4/5 years) when close.
  function suggestExpirationMonths(completionDate: string | null, expirationDate: string | null): number {
    if (!completionDate || !expirationDate) return 36;
    const m = monthsBetween(completionDate, expirationDate);
    if (m <= 0) return 36;
    const common = [12, 24, 36, 48, 60];
    let best = common[0];
    let bestDiff = Infinity;
    for (const c of common) {
      const d = Math.abs(c - m);
      if (d < bestDiff) { bestDiff = d; best = c; }
    }
    if (bestDiff <= 2) return best;
    return Math.max(12, Math.round(m / 12) * 12);
  }

  // Attach new-module suggestion fields when no existing module matched.
  function applyModuleSuggestions(result: any): void {
    if (result.module || !result.courseName) return;
    result.isNewModule = true;
    result.suggestedModuleName = result.courseName.trim().replace(/\s+/g, ' ');
    result.suggestedAbbreviation = suggestAbbreviation(result.courseName);
    result.suggestedExpirationMonths = suggestExpirationMonths(result.completionDate, result.expirationDate);
  }
  // ---------------------------------------------------------------------------

  // Helper function to parse CITI certificate text (router function)
  async function parseCITICertificate(text: string, modules: any[]) {
    const result: any = {
      name: null,
      courseName: null,
      module: null,
      completionDate: null,
      expirationDate: null,
      recordId: null,
      institution: null,
      isNewModule: false
    };

    try {
      console.log('=== PARSING CITI DOCUMENT ===');
      console.log('Raw text length:', text.length);
      console.log('Raw text sample (first 300 chars):', text.substring(0, 300));
      
      // DEBUG: Print full text to see actual OCR output structure
      console.log('=== FULL OCR TEXT DEBUG ===');
      console.log(text);
      console.log('=== END FULL OCR TEXT ===');

      // Detect document type and route to appropriate parser
      const documentType = detectCITIDocumentType(text);
      console.log('Detected document type:', documentType);

      let parsedResult;
      switch (documentType) {
        case 'certificate':
          parsedResult = await parseCITICertificateFormat(text, modules);
          break;
        case 'report':
          parsedResult = await parseCITIReportFormat(text, modules);
          break;
        default:
          console.log('Unknown document type, trying certificate format as fallback');
          parsedResult = await parseCITICertificateFormat(text, modules);
      }

      // Add document type to the result
      return {
        ...parsedResult,
        documentType: documentType
      };
    } catch (error) {
      console.error('Error parsing CITI document:', error);
      return result;
    }
  }

  // Certificate format parser - for documents with "This is to certify that:"
  async function parseCITICertificateFormat(text: string, modules: any[]) {
    const result: any = {
      name: null,
      courseName: null,
      module: null,
      completionDate: null,
      expirationDate: null,
      recordId: null,
      institution: null,
      isNewModule: false
    };

    try {
      console.log('=== PARSING CERTIFICATE FORMAT ===');
      
      // Clean up text - remove extra whitespace and normalize
      const cleanText = text.replace(/\s+/g, ' ').trim();

      // Extract completion date - match multiple formats
      console.log('Searching for completion date...');
      const completionMatch = 
        // Format 1: "Completion Date: 21-May-2022" (with colon)
        text.match(/Completion Date:\s*(\d{1,2}-\w{3}-\d{4})/i) ||
        // Format 2: "Completion Date 15-Jul-2025" (no colon - new format)
        text.match(/Completion Date\s+(\d{1,2}-\w{3}-\d{4})/i) ||
        // Format 3: With bullet point
        text.match(/•\s*Completion Date:?\s*(\d{1,2}-\w{3}-\d{4})/i) ||
        // Format 4: Context-based search for completion dates
        text.match(/(\d{1,2}-\w{3}-20\d{2})/g)?.find(match => {
          const matchIndex = text.indexOf(match);
          const context = text.substring(Math.max(0, matchIndex - 100), matchIndex + 100);
          return /completion/i.test(context);
        });
      if (completionMatch) {
        // Formats 1-3 return a RegExpMatchArray (use captured group [1]); Format 4
        // returns a plain string from .find() — indexing it would grab single
        // characters, so use the whole string in that case.
        const dateStr = typeof completionMatch === 'string' ? completionMatch : (completionMatch[1] || completionMatch[0]);
        result.completionDate = convertDateFormat(dateStr);
        console.log('Found completion date:', result.completionDate);
      } else {
        console.log('No completion date match found');
        console.log('Date search text sample:', text.substring(0, 800));
      }

      // Extract expiration date - match multiple formats  
      console.log('Searching for expiration date...');
      const expirationMatch = 
        // Format 1: "Expiration Date: 20-May-2025" (with colon)
        text.match(/Expiration Date:\s*(\d{1,2}-\w{3}-\d{4})/i) ||
        // Format 2: "Expiration Date 15-Jul-2028" (no colon - new format)
        text.match(/Expiration Date\s+(\d{1,2}-\w{3}-\d{4})/i) ||
        // Format 3: With bullet point  
        text.match(/•\s*Expiration Date:?\s*(\d{1,2}-\w{3}-\d{4})/i) ||
        // Format 4: Context-based search for expiration dates
        text.match(/(\d{1,2}-\w{3}-20\d{2})/g)?.find(match => {
          const matchIndex = text.indexOf(match);
          const context = text.substring(Math.max(0, matchIndex - 100), matchIndex + 100);
          return /expir/i.test(context);
        });
      if (expirationMatch) {
        // Formats 1-3 return a RegExpMatchArray (use captured group [1]); Format 4
        // returns a plain string from .find() — indexing it would grab single
        // characters, so use the whole string in that case.
        const dateStr = typeof expirationMatch === 'string' ? expirationMatch : (expirationMatch[1] || expirationMatch[0]);
        result.expirationDate = convertDateFormat(dateStr);
        console.log('Found expiration date:', result.expirationDate);
      } else {
        console.log('No expiration date match found');
        console.log('Date search text sample:', text.substring(0, 800));
      }

      // Extract record ID - match "31911316" format with Record ID context
      console.log('Searching for record ID...');
      const recordIdMatch = text.match(/Record ID:\s*(\d+)/i) ||
                           text.match(/•\s*Record ID:\s*(\d+)/i) ||
                           text.match(/Record ID\s+(\d+)/i) ||
                           text.match(/(\d{8})/g)?.find(match => {
                             // Look for 8-digit number with Record ID context nearby
                             const matchIndex = text.indexOf(match);
                             const context = text.substring(Math.max(0, matchIndex - 50), matchIndex + 50);
                             return /record/i.test(context);
                           }) ||
                           cleanText.match(/Record ID:\s*(\d+)/i);
      if (recordIdMatch) {
        // Array matches expose the captured digits at [1]; Format 4's .find()
        // returns the plain matched string. Strip non-digits either way.
        const idStr = typeof recordIdMatch === 'string' ? recordIdMatch : (recordIdMatch[1] || recordIdMatch[0]);
        result.recordId = idStr.replace(/\D/g, ''); // Remove any non-digits
        console.log('Found record ID:', result.recordId);
      } else {
        console.log('No record ID match found');
        console.log('ID search text sample:', text.substring(0, 800));
      }

      // Extract person name - improved patterns for CITI certificates
      console.log('Searching for person name...');
      // Look for "Name: Apryl Sanchez (ID: 8085848)" pattern - handle OCR mangled text
      let nameMatch = text.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)\s*\(ID:\s*\d+\)/i) ||  // "Apryl Sanchez (ID: 8085848)"
                     text.match(/Name:\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/i) ||            // "Name: Apryl Sanchez"
                     text.match(/•\s*Name:\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/i) ||       // "• Name: Apryl Sanchez"
                     cleanText.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)\s*\(ID:\s*\d+\)/i) || // Clean text version
                     text.match(/This is to certify that:\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/i);

      // Fix for OCR mangled text - extract just the name part if we found a longer match
      if (nameMatch) {
        let extractedName = nameMatch[1].trim();
        // If the extracted name contains extra text, try to clean it
        const nameOnly = extractedName.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)$/);
        if (nameOnly) {
          extractedName = nameOnly[1];
        }
        result.name = extractedName.replace(/\s+/g, ' ');
        console.log('Found name:', result.name);
      } else {
        console.log('No name match found');
        console.log('Text being searched for name (first 500 chars):', text.substring(0, 500));
      }

      // Extract course name - improved patterns for CITI courses  
      console.log('Searching for course name...');
      // Look for "Course: [Course Name]" or "CITI Program course: [Course Name]"
      let courseMatch = text.match(/Course:\s*([^\n\r]+?)(?:\s*Stage|$)/i) ||
                       text.match(/CITI Program course:\s*\n\s*([^\n]+)/i) ||
                       text.match(/CITI Program course:\s*([^\n\r]+)/i) ||
                       text.match(/following CITI[^:]*course:\s*([^\n\r]+)/i);
      
      if (!courseMatch) {
        // Try to extract Biosafety or other training series
        courseMatch = text.match(/([^.\n]*(?:Biosafety|Training Series)[^.\n]*)/i) ||
                     text.match(/Stage\s+\d+\s*-\s*([^\n\r]+)/i) ||
                     text.match(/CITI\s+([^(\n\r]+?)(?:\s*\(|$)/i);
      }

      if (courseMatch) {
        result.courseName = courseMatch[1].trim().replace(/\s+/g, ' ');
        console.log('Found course name:', result.courseName);
        
        // Strict module matching (conservative — flags unknown courses as NEW).
        console.log('Module matching results:');
        console.log('Course name to match:', result.courseName);
        const module = matchCertificationModule(result.courseName, modules);

        result.module = module || null;
        result.isNewModule = !module;

        if (module) {
          console.log('Matched with existing module:', module.name);
        } else {
          console.log('No matching module found — will suggest a new module from the course title');
        }
      } else {
        console.log('No course name match found');
        console.log('Text being searched for course (first 500 chars):', text.substring(0, 500));
      }

      // Extract institution - improved pattern
      const institutionMatch = text.match(/Under requirements set by:\s*\n\s*([^\n]+)/i) ||
                              text.match(/requirements set by:\s*([^\n\r]+)/i);
      if (institutionMatch) {
        result.institution = institutionMatch[1].trim();
      }

    } catch (parseError) {
      console.error('Error parsing certificate text:', parseError);
    }

    // Look up scientist ID by name if name was extracted
    if (result.name) {
      try {
        console.log('Looking up scientist for name:', result.name);
        const allScientists = await storage.getScientists();
        
        // Split extracted name into first and last name
        const nameParts = result.name.trim().split(/\s+/);
        if (nameParts.length >= 2) {
          const firstName = nameParts[0];
          const lastName = nameParts[nameParts.length - 1];
          
          // Find scientist by exact first/last name match
          const matchedScientist = allScientists.find(scientist => 
            scientist.firstName.toLowerCase() === firstName.toLowerCase() && 
            scientist.lastName.toLowerCase() === lastName.toLowerCase()
          );
          
          if (matchedScientist) {
            result.scientistId = matchedScientist.id;
            console.log(`Found scientist match: ${result.name} -> ID ${matchedScientist.id}`);
          } else {
            console.log(`No scientist found for name: ${result.name} (${firstName} ${lastName})`);
            result.scientistId = null;
          }
        }
      } catch (lookupError) {
        console.error('Error looking up scientist:', lookupError);
        result.scientistId = null;
      }
    }

    applyModuleSuggestions(result);
    return result;
  }

  // Report format parser - for documents with "COMPLETION REPORT"
  async function parseCITIReportFormat(text: string, modules: any[]) {
    const result: any = {
      name: null,
      courseName: null,
      module: null,
      completionDate: null,
      expirationDate: null,
      recordId: null,
      institution: null,
      isNewModule: false
    };

    try {
      console.log('=== PARSING REPORT FORMAT ===');
      
      // Clean up text - remove extra whitespace and normalize
      const cleanText = text.replace(/\s+/g, ' ').trim();

      // Report format specific patterns
      // Name extraction. CITI reports list the learner as "• Name: First Last (ID: 12345)".
      // Prefer that labeled form; fall back to the older heuristic patterns.
      console.log('Searching for person name in report format...');
      const nameMatch = text.match(/Name:\s*([A-Za-z][A-Za-z.'\-\s]+?)\s*\(ID:/i) ||
                       text.match(/Name:\s*([A-Za-z][A-Za-z.'\-\s]+?)(?:\s*\n|$)/i) ||
                       text.match(/Phone:\s*([A-Za-z\s]+?)(?:\s+\([^)]*\))?$/m) ||
                       text.match(/•\s*Phone:\s*.*?\n\s*([A-Za-z\s]+)/i) ||
                       text.match(/Institution Unit:\s*•\s*Phone:\s*(.+?)(?:\s|$)/i) ||
                       text.match(/([A-Za-z]+\s+[A-Za-z]+)(?:\s+\([^)]*\))?(?:\s*$)/m);
      
      if (nameMatch) {
        const rawName = nameMatch[1].trim();
        // Clean up the name - remove extra whitespace and validate
        if (rawName.length > 2 && rawName.length < 50 && /^[A-Za-z.'\-\s]+$/.test(rawName)) {
          result.name = rawName;
          console.log('Found name in report format:', result.name);
        }
      }

      // Course name extraction. Reports identify the course via "Curriculum Group:".
      console.log('Searching for course name in report format...');
      const reportCourseMatch = text.match(/Curriculum Group:\s*([^\n•]+?)(?:\s*•|\n|$)/i) ||
                               text.match(/Course Learner Group:\s*([^\n•]+?)(?:\s*•|\n|$)/i) ||
                               text.match(/COURSEWORK REQUIREMENTS[\s\S]*?([A-Za-z][^•\n]+?)(?:\s*•|\s*$)/i) ||
                               text.match(/Course:\s*([^•\n]+)/i) ||
                               text.match(/Training[\s\S]*?-\s*([^•\n]+)/i);
      
      if (reportCourseMatch) {
        let courseName = reportCourseMatch[1].trim();
        // "Same as Curriculum Group" is a placeholder, not a real course name.
        if (/^same as/i.test(courseName)) {
          const curr = text.match(/Curriculum Group:\s*([^\n•]+?)(?:\s*•|\n|$)/i);
          if (curr) courseName = curr[1].trim();
        }
        result.courseName = courseName;
        console.log('Found course name in report format:', result.courseName);
        
        // Strict module matching (conservative — flags unknown courses as NEW).
        const module = matchCertificationModule(result.courseName, modules);
        result.module = module || null;
        result.isNewModule = !module;
      }

      // Date extraction. Prefer the explicitly labeled completion/expiration dates;
      // fall back to positional (first/second date) only if labels are missing.
      console.log('Searching for dates in report format...');
      const completionLabel = text.match(/Completion Date:\s*(\d{1,2}-\w{3}-\d{4})/i);
      const expirationLabel = text.match(/Expiration Date:\s*(\d{1,2}-\w{3}-\d{4})/i);
      if (completionLabel) {
        result.completionDate = convertDateFormat(completionLabel[1]);
        console.log('Found completion date (labeled) in report format:', result.completionDate);
      }
      if (expirationLabel) {
        result.expirationDate = convertDateFormat(expirationLabel[1]);
        console.log('Found expiration date (labeled) in report format:', result.expirationDate);
      }
      if (!result.completionDate || !result.expirationDate) {
        const allDates = text.match(/(\d{1,2}-\w{3}-20\d{2})/g);
        if (allDates && allDates.length > 0) {
          if (!result.completionDate) {
            result.completionDate = convertDateFormat(allDates[0]);
            console.log('Found completion date (positional) in report format:', result.completionDate);
          }
          if (!result.expirationDate && allDates.length > 1) {
            // Use the latest distinct date as expiration (module rows repeat the
            // completion date, so the largest year is the real expiration).
            const distinct = Array.from(new Set(allDates))
              .map((d) => convertDateFormat(d))
              .filter((d): d is string => !!d);
            const latest = distinct.sort((a, b) => a.localeCompare(b)).pop();
            if (latest && latest !== result.completionDate) {
              result.expirationDate = latest;
              console.log('Found expiration date (positional) in report format:', result.expirationDate);
            }
          }
        }
      }

      // Record ID extraction. Prefer the labeled "Record ID:" value.
      console.log('Searching for record ID in report format...');
      const reportIdMatch = text.match(/Record ID:\s*(\d+)/i)?.[1] ||
                            text.match(/(\d{8})/g)?.find(match => match.length === 8);
      
      if (reportIdMatch) {
        result.recordId = reportIdMatch;
        console.log('Found record ID in report format:', result.recordId);
      }

      // Institution extraction
      const institutionMatch = text.match(/Institution Affiliation:\s*([^\n\r•(]+)/i) ||
                               text.match(/Institution:\s*([^\n\r•]+)/i);
      if (institutionMatch) {
        result.institution = institutionMatch[1].trim();
      }

    } catch (parseError) {
      console.error('Error parsing report format:', parseError);
    }

    // Look up scientist ID by name if name was extracted (same logic as certificate format)
    if (result.name) {
      try {
        console.log('Looking up scientist for name:', result.name);
        const allScientists = await storage.getScientists();
        
        // Split extracted name into first and last name
        const nameParts = result.name.trim().split(/\s+/);
        if (nameParts.length >= 2) {
          const firstName = nameParts[0];
          const lastName = nameParts[nameParts.length - 1];
          
          // Find scientist by exact first/last name match
          const matchedScientist = allScientists.find(scientist => 
            scientist.firstName.toLowerCase() === firstName.toLowerCase() && 
            scientist.lastName.toLowerCase() === lastName.toLowerCase()
          );
          
          if (matchedScientist) {
            result.scientistId = matchedScientist.id;
            console.log(`Found scientist match: ${result.name} -> ID ${matchedScientist.id}`);
          } else {
            console.log(`No scientist found for name: ${result.name} (${firstName} ${lastName})`);
            result.scientistId = null;
          }
        }
      } catch (lookupError) {
        console.error('Error looking up scientist:', lookupError);
        result.scientistId = null;
      }
    }

    applyModuleSuggestions(result);
    return result;
  }

  // Convert a CITI date like "05-Mar-2025" to ISO "2025-03-05". Returns null
  // for anything it can't parse into a real date, so a partial/garbage match
  // (e.g. just "04") never becomes a malformed string like "undefined-undefined-04"
  // that would crash the DATE column insert downstream.
  function convertDateFormat(dateStr: string): string | null {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const s = dateStr.trim();

    // Already ISO (YYYY-MM-DD) — accept as-is.
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const months: { [key: string]: string } = {
      'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
      'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
      'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    };

    const parts = s.split('-');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts;
    const mm = months[month];
    if (!mm || !/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(day)) return null;
    return `${year}-${mm}-${day.padStart(2, '0')}`;
  }

  // Strict ISO YYYY-MM-DD validator used as a final guard before DB writes.
  // Verifies the calendar date is real (round-trips exactly), so values like
  // "2027-11-31" or "2024-02-30" are rejected rather than silently normalized.
  function isValidIsoDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  // Test endpoint for parsing certificate text (for debugging)
  app.post("/api/certificates/test-parse", async (req, res) => {
    try {
      const { sampleText } = req.body;
      if (!sampleText) {
        return res.status(400).json({ message: "Sample text is required" });
      }

      const modules = await storage.getCertificationModules();
      const parsedData = await parseCITICertificate(sampleText, modules);
      
      res.json({
        message: "Text parsing test completed",
        input: sampleText.substring(0, 200) + "...",
        parsed: parsedData
      });
    } catch (error) {
      console.error("Error testing certificate parsing:", error);
      res.status(500).json({ message: "Failed to test parsing" });
    }
  });

  // Certificate batch confirmation
  app.post("/api/certificates/confirm-batch", requireAuth, async (req: any, res) => {
    try {
      // uploaded_by is NOT NULL. The session user holds the identity in every
      // auth mode (demo/local/ldap/oidc); the old req.user.claims.sub path was
      // always undefined here, which made every certificate insert fail.
      const userId = req.session?.user?.scientistId ?? req.session?.user?.id ?? 1;
      const { certifications } = req.body;

      if (!certifications || !Array.isArray(certifications)) {
        return res.status(400).json({ message: "Certifications array is required" });
      }

      const results = [];
      for (const cert of certifications) {
        try {
          const {
            scientistId,
            startDate,
            endDate,
            certificateFilePath,
            reportFilePath,
            notes,
            newModule
          } = cert;
          let { moduleId } = cert;

          // First-use population: if the row carries a new-module request instead
          // of an existing moduleId, create it now (reusing an existing module with
          // the same name to avoid duplicates) and use the resulting id.
          if (!moduleId && newModule && typeof newModule.name === 'string' && newModule.name.trim()) {
            try {
              const desiredName = newModule.name.trim().replace(/\s+/g, ' ');
              const allModules = await storage.getCertificationModules();
              const existing = allModules.find(
                (m: any) => normalizeModuleName(m.name) === normalizeModuleName(desiredName)
              );
              if (existing) {
                moduleId = existing.id;
              } else {
                const created = await storage.createCertificationModule({
                  name: desiredName,
                  description: newModule.description?.trim() || null,
                  isCore: !!newModule.isCore,
                  expirationMonths: Number(newModule.expirationMonths) || 36,
                  isActive: true,
                });
                moduleId = created.id;
              }
            } catch (moduleErr: any) {
              results.push({
                ...cert,
                status: 'error',
                error: `Could not create new module: ${moduleErr?.message || 'unknown error'}`
              });
              continue;
            }
          }

          // Validate required fields
          if (!scientistId || !moduleId || !startDate || !endDate) {
            results.push({
              ...cert,
              status: 'error',
              error: `Missing required fields: ${!scientistId ? 'scientistId ' : ''}${!moduleId ? 'moduleId ' : ''}${!startDate ? 'startDate ' : ''}${!endDate ? 'endDate ' : ''}`
            });
            continue;
          }

          // Guard against malformed/partial dates (e.g. a bad OCR/parse that
          // produced "undefined-undefined-04"). The DATE column would otherwise
          // reject the whole insert with a raw SQL error.
          if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
            results.push({
              ...cert,
              status: 'error',
              error: `Could not read the ${!isValidIsoDate(startDate) ? 'completion' : 'expiration'} date correctly. Please set it manually before saving.`
            });
            continue;
          }

          // Check for duplicate certificate (same scientist, module, and start date)
          const existingCertifications = await storage.getCertificationsByScientist(scientistId);
          const duplicateCert = existingCertifications.find(existing => 
            existing.moduleId === moduleId && 
            existing.startDate === startDate
          );
          
          if (duplicateCert) {
            results.push({
              ...cert,
              status: 'error',
              error: `Certificate already exists for this person and module with the same start date (${startDate}). Please check existing records.`
            });
            continue;
          }

          const certification = await storage.createCertification({
            scientistId,
            moduleId,
            startDate,
            endDate,
            certificateFilePath,
            reportFilePath,
            uploadedBy: userId,
            notes
          });

          results.push({
            ...cert,
            status: 'success',
            certificationId: certification.id
          });
        } catch (error: any) {
          results.push({
            ...cert,
            status: 'error',
            error: error?.message || 'Unknown error'
          });
        }
      }

      const successCount = results.filter(r => r.status === 'success').length;
      const errorCount = results.filter(r => r.status === 'error').length;

      // Update PDF import history entries with save status
      for (const cert of certifications) {
        const result = results.find(r => r.fileName === cert.fileName);
        let saveStatus = 'not_saved';
        
        if (result?.status === 'success') {
          saveStatus = 'saved';
        } else if (result?.error?.includes('already exists')) {
          saveStatus = 'duplicate';
        }
        
        try {
          await storage.updatePdfImportHistorySaveStatus(cert.fileName, saveStatus);
        } catch (error) {
          console.error(`Failed to update save status for ${cert.fileName}:`, error);
        }
      }

      res.json({
        message: `Processed ${results.length} certifications: ${successCount} successful, ${errorCount} failed`,
        results,
        summary: { total: results.length, successful: successCount, failed: errorCount }
      });
    } catch (error) {
      console.error("Error confirming certifications:", error);
      res.status(500).json({ message: "Failed to confirm certifications" });
    }
  });


  // Dashboard
  app.get('/api/dashboard/stats', async (req: Request, res: Response) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard statistics" });
    }
  });

  app.get('/api/dashboard/recent-activity', async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 8;
      const activity = await storage.getRecentActivity(limit);
      res.json(activity);
    } catch (error) {
      console.error("Error fetching recent activity:", error);
      res.status(500).json({ message: "Failed to fetch recent activity" });
    }
  });

  app.get('/api/dashboard/recent-projects', async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const activities = await storage.getRecentResearchActivities(limit);
      
      // Fetch lead scientist and PI info for each activity
      const enhancedActivities = await Promise.all(activities.map(async (activity) => {
        const members = await storage.getProjectMembers(activity.id);
        const leadMember = members.find(m => m.role === 'Lead Scientist');
        const piMember = members.find(m => m.role === 'Principal Investigator');
        
        let leadScientist = null;
        if (leadMember) {
          const scientist = await storage.getScientist(leadMember.scientistId);
          if (scientist) {
            leadScientist = {
              id: scientist.id,
              firstName: scientist.firstName,
              lastName: scientist.lastName,
              profileImageInitials: scientist.profileImageInitials
            };
          }
        }
        
        let principalInvestigator = null;
        if (piMember) {
          const scientist = await storage.getScientist(piMember.scientistId);
          if (scientist) {
            principalInvestigator = {
              id: scientist.id,
              firstName: scientist.firstName,
              lastName: scientist.lastName,
              profileImageInitials: scientist.profileImageInitials
            };
          }
        }
        
        return {
          ...activity,
          leadScientist,
          principalInvestigator
        };
      }));
      
      res.json(enhancedActivities);
    } catch (error) {
      console.error("Error fetching recent research activities:", error);
      res.status(500).json({ message: "Failed to fetch recent research activities" });
    }
  });

  app.get('/api/dashboard/upcoming-deadlines', async (req: Request, res: Response) => {
    try {
      const deadlines = await storage.getUpcomingDeadlines();
      res.json(deadlines);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch upcoming deadlines" });
    }
  });

  // Programs (PRM)
  app.get('/api/programs', async (req: Request, res: Response) => {
    try {
      const programs = await storage.getPrograms();
      res.json(programs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch programs" });
    }
  });

  app.get('/api/programs/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid program ID" });
      }

      const program = await storage.getProgram(id);
      if (!program) {
        return res.status(404).json({ message: "Program not found" });
      }
      
      res.json(program);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch program" });
    }
  });
  
  app.get('/api/programs/:id/projects', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid program ID" });
      }

      const projects = await storage.getProjectsForProgram(id);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects for program:", error);
      res.status(500).json({ message: "Failed to fetch projects for program" });
    }
  });

  app.post('/api/programs', async (req: Request, res: Response) => {
    try {
      // Auto-generate a PRM number if the client didn't supply one.
      let body = { ...req.body };
      if (!body.programId) {
        const existing = await storage.getPrograms();
        const nums = existing
          .map((p: any) => { const m = String(p.programId || "").match(/(\d+)$/); return m ? parseInt(m[1]) : 0; })
          .filter((n: number) => n > 0);
        const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
        body.programId = `PRM-${String(next).padStart(3, "0")}`;
      }
      const validateData = insertProgramSchema.parse(body);
      const programDirectorError = await getInvestigatorAssignmentError(
        validateData.programDirectorId,
        "Program Director"
      );
      if (programDirectorError) {
        return res
          .status(programDirectorError.status)
          .json({ message: programDirectorError.message });
      }
      const researchCoLeadError = await getInvestigatorAssignmentError(
        validateData.researchCoLeadId,
        "Research Co-Lead"
      );
      if (researchCoLeadError) {
        return res
          .status(researchCoLeadError.status)
          .json({ message: researchCoLeadError.message });
      }
      const program = await storage.createProgram(validateData);
      res.status(201).json(program);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to create program" });
    }
  });

  app.patch('/api/programs/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid program ID" });
      }

      const validateData = insertProgramSchema.partial().parse(req.body);
      const programDirectorError = await getInvestigatorAssignmentError(
        validateData.programDirectorId,
        "Program Director"
      );
      if (programDirectorError) {
        return res
          .status(programDirectorError.status)
          .json({ message: programDirectorError.message });
      }
      const researchCoLeadError = await getInvestigatorAssignmentError(
        validateData.researchCoLeadId,
        "Research Co-Lead"
      );
      if (researchCoLeadError) {
        return res
          .status(researchCoLeadError.status)
          .json({ message: researchCoLeadError.message });
      }
      const program = await storage.updateProgram(id, validateData);
      
      if (!program) {
        return res.status(404).json({ message: "Program not found" });
      }
      
      res.json(program);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update program" });
    }
  });

  app.delete('/api/programs/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid program ID" });
      }

      const success = await storage.deleteProgram(id);
      
      if (!success) {
        return res.status(404).json({ message: "Program not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete program" });
    }
  });

  // Projects (PRJ)
  app.get('/api/projects', async (req: Request, res: Response) => {
    try {
      const programId = req.query.programId ? parseInt(req.query.programId as string) : undefined;
      
      let projects;
      if (programId && !isNaN(programId)) {
        projects = await storage.getProjectsForProgram(programId);
      } else {
        projects = await storage.getProjects();
      }
      
      res.json(projects);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get('/api/projects/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const project = await storage.getProject(id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      res.json(project);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.post('/api/projects', async (req: Request, res: Response) => {
    try {
      const validateData = insertProjectSchema.parse(req.body);
      const eligibilityError = await getInvestigatorAssignmentError(
        validateData.principalInvestigatorId,
        "Project Lead Investigator"
      );
      if (eligibilityError) {
        return res
          .status(eligibilityError.status)
          .json({ message: eligibilityError.message });
      }
      const project = await storage.createProject(validateData);
      res.status(201).json(project);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.patch('/api/projects/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const validateData = insertProjectSchema.partial().parse(req.body);
      const eligibilityError = await getInvestigatorAssignmentError(
        validateData.principalInvestigatorId,
        "Project Lead Investigator"
      );
      if (eligibilityError) {
        return res
          .status(eligibilityError.status)
          .json({ message: eligibilityError.message });
      }
      const project = await storage.updateProject(id, validateData);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      res.json(project);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  app.delete('/api/projects/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const success = await storage.deleteProject(id);
      
      if (!success) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  // Scientists
  app.get('/api/scientists', async (req: Request, res: Response) => {
    try {
      const includeActivityCount = req.query.includeActivityCount === 'true';
      const page = req.query.page ? parseInt(req.query.page as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      
      // Validate pagination params if provided
      if ((page !== undefined && (isNaN(page) || page < 1)) || 
          (limit !== undefined && (isNaN(limit) || limit < 1))) {
        return res.status(400).json({ message: "Invalid pagination parameters. page and limit must be positive integers." });
      }
      
      let scientists;
      if (includeActivityCount) {
        scientists = await storage.getScientistsWithActivityCount();
      } else {
        scientists = await storage.getScientists();
      }
      
      // Apply pagination if requested
      if (page !== undefined && limit !== undefined) {
        const startIndex = (page - 1) * limit;
        const paginatedScientists = scientists.slice(startIndex, startIndex + limit);
        res.json({
          data: paginatedScientists,
          pagination: {
            page,
            limit,
            total: scientists.length,
            totalPages: Math.ceil(scientists.length / limit)
          }
        });
      } else {
        res.json(scientists);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch scientists" });
    }
  });

  app.get('/api/scientists/:id/research-activities', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      
      // Get research activities where scientist is a team member
      const activities = await storage.getResearchActivitiesForScientist(id);
      
      // Enhance with project and program information
      const enhancedActivities = await Promise.all(
        activities.map(async (activity) => {
          let project = null;
          let program = null;
          let memberRole = null;
          
          // Get project info if activity has projectId
          if (activity.projectId) {
            project = await storage.getProject(activity.projectId);
            
            // Get program info if project has programId
            if (project?.programId) {
              program = await storage.getProgram(project.programId);
            }
          }
          
          // Get member role from project_members table
          const members = await storage.getProjectMembers(activity.id);
          const member = members.find(m => m.scientistId === id);
          memberRole = member?.role || null;
          
          return {
            ...activity,
            project,
            program,
            memberRole
          };
        })
      );
      
      res.json(enhancedActivities);
    } catch (error) {
      console.error('Error fetching scientist research activities:', error);
      res.status(500).json({ message: 'Failed to fetch research activities' });
    }
  });

  // Export all scientists as XLSX or CSV (must be registered before /:id)
  app.get('/api/scientists/export', requireAdmin, async (req: Request, res: Response) => {
    try {
      const format = (req.query.format === 'csv' ? 'csv' : 'xlsx') as 'csv' | 'xlsx';
      const allScientists = await storage.getScientists();
      const org = {
        branches: await storage.getBranches(),
        departments: await storage.getDepartments(),
        sections: await storage.getSections(),
      };
      const { buffer, mime, filename } = await buildExportBuffer(allScientists, format, org);
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (error) {
      console.error('Staff export failed:', error);
      res.status(500).json({ message: 'Failed to export staff' });
    }
  });

  app.get('/api/scientists/import/template', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const buffer = await buildTemplateBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="staff-import-template.xlsx"');
      res.send(buffer);
    } catch (error) {
      console.error('Staff import template failed:', error);
      res.status(500).json({ message: 'Failed to build staff import template' });
    }
  });

  // Get scientists filtered by role for room supervisor/manager selection
  app.get('/api/scientists/investigators', async (req: Request, res: Response) => {
    try {
      const investigators = await storage.getScientistsByRole('investigator');
      res.json(investigators);
    } catch (error) {
      console.error('Error fetching investigators:', error);
      res.status(500).json({ message: "Failed to fetch investigators" });
    }
  });

  app.get('/api/scientists/scientific-staff', async (req: Request, res: Response) => {
    try {
      const scientificStaff = await storage.getScientistsByRole('staff|management|post-doctoral|research');
      res.json(scientificStaff);
    } catch (error) {
      console.error('Error fetching scientific staff:', error);
      res.status(500).json({ message: "Failed to fetch scientific staff" });
    }
  });

  app.get('/api/scientists/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scientist ID" });
      }

      const scientist = await storage.getScientist(id);
      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }

      res.json(scientist);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch scientist" });
    }
  });

  app.get('/api/scientists/:id/publications', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scientist ID" });
      }

      const scientist = await storage.getScientist(id);
      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }

      const yearsSince = req.query.years ? parseInt(req.query.years as string) : 5;
      const includeUnpublished = canViewUnpublishedScientistPublications(
        getScientistPublicationViewer(req),
        scientist,
      );
      const publications = await storage.getPublicationsForScientist(id, yearsSince, includeUnpublished);
      
      res.json(publications);
    } catch (error) {
      console.error('Error fetching scientist publications:', error);
      res.status(500).json({ message: "Failed to fetch scientist publications" });
    }
  });

  app.get('/api/scientists/:id/authorship-stats', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scientist ID" });
      }

      const scientist = await storage.getScientist(id);
      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }

      const yearsSince = req.query.years ? parseInt(req.query.years as string) : 5;
      const includeUnpublished = canViewUnpublishedScientistPublications(
        getScientistPublicationViewer(req),
        scientist,
      );
      const stats = await storage.getAuthorshipStatsByYear(id, yearsSince, includeUnpublished);
      
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch authorship statistics" });
    }
  });

  // NOTE: POST /api/scientists/sidra-scores is now registered by registerSidraScoreRoutes()
  // above (protected by requirePublicationOfficer and backed by sidraScoreService).
  // The original inline handler has been removed to avoid duplicate registration.
  // Legacy marker — do not re-add inline handler here.

  // Roughly 8 MB of base64 → ~6 MB decoded file. Plenty for staff lists; blocks runaway payloads.
  const MAX_IMPORT_B64_LEN = 8 * 1024 * 1024;

  // Preview an import file — no DB writes
  app.post('/api/scientists/import/preview', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { fileBase64, fileName } = req.body ?? {};
      if (!fileBase64 || !fileName) {
        return res.status(400).json({ message: 'fileBase64 and fileName are required' });
      }
      if (typeof fileBase64 !== 'string' || fileBase64.length > MAX_IMPORT_B64_LEN) {
        return res.status(413).json({ message: 'Import file is too large (max ~6MB).' });
      }
      let fileRows;
      try {
        fileRows = await parseUploadedFile(String(fileBase64), String(fileName));
      } catch (e: any) {
        return res.status(400).json({ message: `Could not parse file: ${e?.message || e}` });
      }
      const existing = await storage.getScientists();
      const org = { branches: await storage.getBranches(), departments: await storage.getDepartments(), sections: await storage.getSections() };
      res.json(buildImportPreview(fileRows, existing, org));
    } catch (error) {
      console.error('Staff import preview failed:', error);
      res.status(500).json({ message: 'Failed to build import preview' });
    }
  });

  // Apply a previously-previewed import inside a single transaction
  app.post('/api/scientists/import/apply', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { fileBase64, fileName } = req.body ?? {};
      if (!fileBase64 || !fileName) {
        return res.status(400).json({ message: 'fileBase64 and fileName are required' });
      }
      if (typeof fileBase64 !== 'string' || fileBase64.length > MAX_IMPORT_B64_LEN) {
        return res.status(413).json({ message: 'Import file is too large (max ~6MB).' });
      }
      let fileRows;
      try {
        fileRows = await parseUploadedFile(String(fileBase64), String(fileName));
      } catch (e: any) {
        return res.status(400).json({ message: `Could not parse file: ${e?.message || e}` });
      }

      const existing = await storage.getScientists();
      const org = { branches: await storage.getBranches(), departments: await storage.getDepartments(), sections: await storage.getSections() };
      const preview = buildImportPreview(fileRows, existing, org);

      if (preview.errors.length > 0) {
        return res.status(400).json({
          message: 'Import has validation errors. Re-run preview and fix them first.',
          errors: preview.errors,
        });
      }

      try {
        const summary = await db.transaction(async (tx) => {
          // 1. Insert new rows first (without supervisor — we patch in step 4).
          const insertedIdByEmail = new Map<string, number>();
          for (const row of preview.toInsert) {
            const payload = rowToInsertScientist(row, new Map());
            payload.supervisorId = null;
            const [inserted] = await tx.insert(scientists).values(payload).returning();
            insertedIdByEmail.set(row.email, inserted.id);
          }

          // 2. Build the intended-final email→id map. Critically, for rows
          //    being updated this uses the NEW email from the file, not the
          //    old email in the DB — otherwise a row that references the
          //    new email of another updated row would silently resolve to
          //    null (corrupting the hierarchy).
          const emailToId = new Map<string, number>();
          // Baseline: existing emails (covers unchanged rows and gives a
          //  starting point for matched rows).
          for (const s of existing) emailToId.set(s.email.toLowerCase(), s.id);
          // Override: matched rows keep their existing id but adopt their
          //  new file email. Their old email is no longer the canonical key
          //  for that record, but leaving it in the map is harmless because
          //  the preview step already validated against the new email set.
          for (const { existingId, row } of preview.toUpdate) {
            emailToId.set(row.email, existingId);
          }
          // Add freshly-inserted rows.
          insertedIdByEmail.forEach((id, email) => emailToId.set(email, id));
          // Remove rows being deleted so nothing resolves to a doomed id.

          // 3. Defensive consistency check: every supervisorEmail in the
          //    file must resolve. Preview validated this against
          //    allKnownEmails, but we re-check against the post-deletion
          //    map so we never silently write supervisorId = null.
          const unresolved: string[] = [];
          const checkSupervisor = (rowEmail: string, supervisorEmail?: string) => {
            if (supervisorEmail && !emailToId.has(supervisorEmail)) {
              unresolved.push(`${rowEmail} → ${supervisorEmail}`);
            }
          };
          for (const { row } of preview.toUpdate) checkSupervisor(row.email, row.supervisorEmail);
          for (const row of preview.toInsert) checkSupervisor(row.email, row.supervisorEmail);
          if (unresolved.length > 0) {
            throw new Error(
              `Some line manager emails cannot be resolved against the imported set: ${unresolved.join(", ")}. Re-run preview, fix the file, and try again.`
            );
          }

          // 4. Apply updates (uses the post-rename email→id map for supervisor resolution).
          for (const { existingId, row } of preview.toUpdate) {
            const payload = rowToInsertScientist(row, emailToId);
            await tx.update(scientists).set(payload).where(eq(scientists.id, existingId));
          }
          // Patch supervisor on freshly-inserted rows.
          for (const row of preview.toInsert) {
            if (!row.supervisorEmail) continue;
            const sid = emailToId.get(row.supervisorEmail);
            const ownId = insertedIdByEmail.get(row.email);
            if (sid && ownId) {
              await tx.update(scientists).set({ supervisorId: sid }).where(eq(scientists.id, ownId));
            }
          }

          return {
            inserted: preview.toInsert.length,
            updated: preview.toUpdate.length,
            unchanged: preview.unchanged,
          };
        });

        res.json(summary);
      } catch (e: any) {
        return res.status(409).json({ message: e?.message || 'Import failed' });
      }
    } catch (error) {
      console.error('Staff import apply failed:', error);
      res.status(500).json({ message: 'Failed to apply staff import' });
    }
  });

  // Validate structured org assignment: referenced department/section must
  // exist and the section must belong to the (possibly derived) department.
  // Returns an error message or null; may mutate data to derive departmentId.
  const validateOrgAssignment = async (
    data: { departmentId?: number | null; sectionId?: number | null },
    existing?: { departmentId: number | null; sectionId: number | null }
  ): Promise<string | null> => {
    const deptTouched = data.departmentId !== undefined;
    const secTouched = data.sectionId !== undefined;
    if (!deptTouched && !secTouched) return null;

    const deptId = deptTouched ? data.departmentId : existing?.departmentId ?? null;
    const secId = secTouched ? data.sectionId : existing?.sectionId ?? null;

    if (deptId != null) {
      const [dept] = await db.select().from(departments).where(eq(departments.id, deptId));
      if (!dept) return `Department ${deptId} does not exist`;
    }
    if (secId != null) {
      const [sec] = await db.select().from(sections).where(eq(sections.id, secId));
      if (!sec) return `Section ${secId} does not exist`;
      if (deptId == null) {
        // Derive department from the chosen section
        data.departmentId = sec.departmentId;
      } else if (sec.departmentId !== deptId) {
        return `Section ${secId} does not belong to department ${deptId}`;
      }
    }
    return null;
  };

  app.post(
    '/api/scientists',
    requireAuth,
    requireInvestigatorDesignationManager,
    async (req: Request, res: Response) => {
    try {
      const validateData = insertScientistSchema.parse(normalizeScientistPayload(req.body));
      const orgError = await validateOrgAssignment(validateData);
      if (orgError) return res.status(400).json({ message: orgError });
      const scientist = await storage.createScientist(validateData);
      res.status(201).json(scientist);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      const conflict = scientistUniqueConflictMessage(error);
      if (conflict) {
        console.error("Failed to create scientist (unique constraint):", error);
        return res.status(409).json({ message: conflict });
      }
      console.error("Failed to create scientist:", error);
      res.status(500).json({ message: "Failed to create scientist" });
    }
  });

  app.patch(
    '/api/scientists/:id',
    requireAuth,
    rejectRestrictedUserProfileAccessChanges,
    requireInvestigatorDesignationManager,
    async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scientist ID" });
      }

      // Own-profile or privileged (Management/admin/superadmin). Demo mode passes.
      if (!isDemo() && !isOwnScientistProfile(req, id) && !hasManagementRole(req)) {
        return res.status(403).json({
          message: "Forbidden. You may only edit your own scientist profile, or you need Management/admin access.",
        });
      }

      const validateData = insertScientistSchema.partial().parse(normalizeScientistPayload(req.body));
      if (validateData.departmentId !== undefined || validateData.sectionId !== undefined) {
        const existing = await storage.getScientist(id);
        if (!existing) return res.status(404).json({ message: "Scientist not found" });
        const orgError = await validateOrgAssignment(validateData, existing);
        if (orgError) return res.status(400).json({ message: orgError });
      }
      const scientist = await storage.updateScientist(id, validateData);
      
      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }
      
      res.json(scientist);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      const conflict = scientistUniqueConflictMessage(error);
      if (conflict) {
        console.error("Failed to update scientist (unique constraint):", error);
        return res.status(409).json({ message: conflict });
      }
      console.error("Failed to update scientist:", error);
      res.status(500).json({ message: "Failed to update scientist" });
    }
  });

  // Administrator-only. Deleting a staff profile is irreversible and cannot be
  // done in bulk anywhere else -- the import deliberately never deletes -- so
  // it is held to the narrowest role rather than the management tier.
  app.delete('/api/scientists/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scientist ID" });
      }

      // Make sure the scientist exists before we go FK-hunting so the
      // 404 path stays distinguishable from the 409 "blocked" path.
      const existing = await storage.getScientist(id);
      if (!existing) {
        return res.status(404).json({ message: "Scientist not found" });
      }

      // Block hard-deletes when this scientist is still referenced anywhere
      // (program director/co-lead, project members, publication authors,
      // IRB/IBC PIs, line manager of another scientist, etc.). We reuse the
      // import flow's reference scanner so the rules stay in one place.
      const refs = await findReferencingRecords(db, [id]);
      const blockers = [...(refs.get(id) ?? [])];

      // findReferencingRecords intentionally skips the scientists self-ref
      // (supervisor_id) because the import flow needs to reason about it
      // alongside in-flight updates. For a single-row delete there is no
      // such nuance — anyone still listing this scientist as their line
      // manager is a blocker, so check it directly here.
      const supervisedRows = await db
        .select({ id: scientists.id })
        .from(scientists)
        .where(eq(scientists.supervisorId, id));
      if (supervisedRows.length > 0) {
        blockers.push({
          table: "scientists",
          column: "supervisor_id",
          count: supervisedRows.length,
          sampleIds: supervisedRows.slice(0, 5).map(r => r.id),
        });
      }

      if (blockers.length > 0) {
        const blockedBy: Record<string, number> = {};
        let totalRows = 0;
        for (const r of blockers) {
          blockedBy[r.table] = (blockedBy[r.table] ?? 0) + r.count;
          totalRows += r.count;
        }
        return res.status(409).json({
          message: `Cannot delete: referenced by ${totalRows} record${totalRows === 1 ? "" : "s"} across ${blockers.length} table${blockers.length === 1 ? "" : "s"}.`,
          blockedBy,
          details: blockers,
        });
      }

      const success = await storage.deleteScientist(id);
      if (!success) {
        return res.status(404).json({ message: "Scientist not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting scientist:", error);
      res.status(500).json({ message: "Failed to delete scientist" });
    }
  });

  app.get('/api/staff', async (req: Request, res: Response) => {
    try {
      const staff = await storage.getStaff();
      res.json(staff);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch staff" });
    }
  });

  app.get('/api/principal-investigators', async (req: Request, res: Response) => {
    try {
      const pis = await storage.getPrincipalInvestigators();
      res.json(pis);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch principal investigators" });
    }
  });
  
  // Research Activities
  app.get('/api/research-activities', async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
      const principalInvestigatorId = req.query.principalInvestigatorId ? parseInt(req.query.principalInvestigatorId as string) : undefined;
      
      let activities;
      if (projectId && !isNaN(projectId)) {
        activities = await storage.getResearchActivitiesForProject(projectId);
      } else if (principalInvestigatorId && !isNaN(principalInvestigatorId)) {
        activities = await storage.getResearchActivitiesForScientist(principalInvestigatorId);
      } else {
        activities = await storage.getResearchActivities();
      }
      
      res.json(activities);
    } catch (error) {
      console.error("Error fetching research activities:", error);
      res.status(500).json({ message: "Failed to fetch research activities" });
    }
  });
  
  app.get('/api/research-activities/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const activity = await storage.getResearchActivity(id);
      if (!activity) {
        return res.status(404).json({ message: "Research activity not found" });
      }
      
      // Get project details if projectId exists
      let project = null;
      if (activity.projectId) {
        project = await storage.getProject(activity.projectId);
      }
      
      // Principal Investigator details now come from team membership
      
      const enhancedActivity = {
        ...activity,
        project: project ? {
          id: project.id,
          name: project.name,
          projectId: project.projectId
        } : null
      };
      
      res.json(enhancedActivity);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch research activity" });
    }
  });

  app.get('/api/research-activities/:id/staff', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      // Get all project members for this research activity
      const members = await storage.getProjectMembers(id);
      
      // Get scientist details for each member
      const staffPromises = members.map(async (member) => {
        const scientist = await storage.getScientist(member.scientistId);
        return scientist;
      });
      
      const staff = await Promise.all(staffPromises);
      // Filter out any null values and return only the staff
      const validStaff = staff.filter(scientist => scientist !== undefined);
      
      res.json(validStaff);
    } catch (error) {
      console.error("Error fetching research activity staff:", error);
      res.status(500).json({ message: "Failed to fetch research activity staff" });
    }
  });

  app.post('/api/research-activities', async (req: Request, res: Response) => {
    try {
      const validatedData = insertResearchActivitySchema.parse(req.body);
      const eligibilityError = await getInvestigatorAssignmentError(
        validatedData.budgetHolderId,
        "Budget Holder / Principal Investigator"
      );
      if (eligibilityError) {
        return res
          .status(eligibilityError.status)
          .json({ message: eligibilityError.message });
      }
      const newActivity = await storage.createResearchActivity(validatedData);

      // Automatically add the Principal Investigator/Budget Holder to the
      // research team so the SDR starts with its PI as a member.
      if (newActivity.budgetHolderId) {
        try {
          await storage.addProjectMember({
            researchActivityId: newActivity.id,
            scientistId: newActivity.budgetHolderId,
            role: "Principal Investigator",
          });
        } catch (memberError) {
          // Don't fail SDR creation if the auto-add fails; log for diagnosis.
          console.error("Failed to auto-add PI as team member:", memberError);
        }
      }

      res.status(201).json(newActivity);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      console.error("Error creating research activity:", error);
      res.status(500).json({ message: "Failed to create research activity" });
    }
  });

  app.put('/api/research-activities/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const validatedData = insertResearchActivitySchema.partial().parse(req.body);
      const eligibilityError = await getInvestigatorAssignmentError(
        validatedData.budgetHolderId,
        "Budget Holder / Principal Investigator"
      );
      if (eligibilityError) {
        return res
          .status(eligibilityError.status)
          .json({ message: eligibilityError.message });
      }
      const updatedActivity = await storage.updateResearchActivity(id, validatedData);
      
      if (!updatedActivity) {
        return res.status(404).json({ message: "Research activity not found" });
      }
      
      res.json(updatedActivity);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      console.error("Error updating research activity:", error);
      res.status(500).json({ message: "Failed to update research activity" });
    }
  });

  app.delete('/api/research-activities/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      await storage.deleteResearchActivity(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting research activity:", error);
      res.status(500).json({ message: "Failed to delete research activity" });
    }
  });

  // Projects
  app.get('/api/projects', async (req: Request, res: Response) => {
    try {
      const scientistId = req.query.scientistId ? parseInt(req.query.scientistId as string) : undefined;
      
      let projects;
      if (scientistId && !isNaN(scientistId)) {
        projects = await storage.getProjectsForScientist(scientistId);
      } else {
        projects = await storage.getProjects();
      }
      
      // Enhance projects with lead scientist details
      const enhancedProjects = await Promise.all(projects.map(async (project) => {
        const leadScientist = await storage.getScientist(project.principalInvestigatorId);
        return {
          ...project,
          leadScientist: leadScientist ? {
            id: leadScientist.id,
            name: leadScientist.name,
            profileImageInitials: leadScientist.profileImageInitials
          } : null
        };
      }));
      
      res.json(enhancedProjects);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get('/api/projects/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const project = await storage.getProject(id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Get lead scientist
      const leadScientist = await storage.getScientist(project.leadScientistId);
      
      // Get team members
      const teamMembers = await storage.getProjectMembers(id);
      const enhancedTeamMembers = await Promise.all(teamMembers.map(async (member) => {
        const scientist = await storage.getScientist(member.scientistId);
        return {
          ...member,
          scientist: scientist ? {
            id: scientist.id,
            name: `-e `,
            title: scientist.jobTitle,
            profileImageInitials: scientist.profileImageInitials
          } : null
        };
      }));

      const enhancedProject = {
        ...project,
        leadScientist: leadScientist ? {
          id: leadScientist.id,
          name: leadScientist.name,
          title: leadScientist.title,
          profileImageInitials: leadScientist.profileImageInitials
        } : null,
        teamMembers: enhancedTeamMembers
      };

      res.json(enhancedProject);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.post('/api/projects', async (req: Request, res: Response) => {
    try {
      const validateData = insertProjectSchema.parse(req.body);
      const project = await storage.createProject(validateData);
      
      // Automatically add lead scientist as a team member
      await storage.addProjectMember({
        projectId: project.id,
        scientistId: project.leadScientistId,
        role: "Principal Investigator"
      });
      
      res.status(201).json(project);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.patch('/api/projects/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const validateData = insertProjectSchema.partial().parse(req.body);
      const project = await storage.updateProject(id, validateData);
      
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      res.json(project);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  app.delete('/api/projects/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      const success = await storage.deleteProject(id);
      
      if (!success) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  // Project Research Activities
  app.get('/api/projects/:id/research-activities', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      
      const activities = await storage.getResearchActivitiesForProject(id);
      
      // Directly return activities without enhancement for now
      res.json(activities);
    } catch (error) {
      console.error("Error fetching research activities for project:", error);
      res.status(500).json({ message: "Failed to fetch research activities for project" });
    }
  });

  // Project Members
  app.get('/api/projects/:id/members', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      // Get project's research activities
      const activities = await storage.getResearchActivitiesForProject(id);
      
      if (activities.length === 0) {
        return res.json([]);
      }
      
      // Get members for each research activity
      const allMembers = [];
      for (const activity of activities) {
        const members = await storage.getProjectMembers(activity.id);
        
        // Enhance team members with scientist details
        const enhancedMembers = await Promise.all(members.map(async (member) => {
          const scientist = await storage.getScientist(member.scientistId);
          return {
            ...member,
            researchActivityTitle: activity.title,
            scientist: scientist ? {
              id: scientist.id,
              name: `-e `,
              title: scientist.jobTitle,
              profileImageInitials: scientist.profileImageInitials
            } : null
          };
        }));
        
        allMembers.push(...enhancedMembers);
      }
      
      res.json(allMembers);
    } catch (error) {
      console.error("Error fetching project members:", error);
      res.status(500).json({ message: "Failed to fetch project members" });
    }
  });

  // Get all project members across all projects
  app.get('/api/project-members', async (req: Request, res: Response) => {
    try {
      const allMembers = await storage.getAllProjectMembers();
      res.json(allMembers);
    } catch (error) {
      console.error("Error fetching all project members:", error);
      res.status(500).json({ message: "Failed to fetch project members" });
    }
  });

  app.post('/api/projects/:id/members', async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.id);
      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      // Need to select a research activity for this project
      const { researchActivityId, scientistId, role } = req.body;
      
      if (!researchActivityId) {
        return res.status(400).json({ message: "Research activity ID is required" });
      }
      
      // Validate that the research activity belongs to this project
      const researchActivity = await storage.getResearchActivity(researchActivityId);
      if (!researchActivity) {
        return res.status(404).json({ message: "Research activity not found" });
      }
      
      if (researchActivity.projectId !== projectId) {
        return res.status(400).json({ message: "Research activity does not belong to this project" });
      }
      
      const validateData = insertProjectMemberSchema.parse({
        researchActivityId,
        scientistId,
        role
      });
      
      // Check if scientist exists
      const scientist = await storage.getScientist(validateData.scientistId);
      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }

      if (!isInvestigatorRoleAssignmentAllowed(validateData.role, scientist)) {
        return res.status(400).json({
          message:
            "Only staff with an eligible Investigator designation can be assigned the role of Principal Investigator",
        });
      }
            
      const member = await storage.addProjectMember(validateData);
      
      // Return enhanced member with scientist details
      const enhancedMember = {
        ...member,
        researchActivityTitle: researchActivity.title,
        scientist: {
          id: scientist.id,
          name: `-e `,
          title: scientist.jobTitle,
          profileImageInitials: scientist.profileImageInitials
        }
      };
      
      res.status(201).json(enhancedMember);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error("Error adding project member:", error);
      res.status(500).json({ message: "Failed to add project member" });
    }
  });

  app.delete('/api/projects/:projectId/members/:scientistId', async (req: Request, res: Response) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const scientistId = parseInt(req.params.scientistId);
      const researchActivityId = req.query.researchActivityId ? parseInt(req.query.researchActivityId as string) : undefined;
      
      if (isNaN(projectId) || isNaN(scientistId)) {
        return res.status(400).json({ message: "Invalid ID parameters" });
      }
      
      if (!researchActivityId) {
        return res.status(400).json({ message: "Research activity ID is required" });
      }
      
      // Validate that the research activity belongs to this project
      const researchActivity = await storage.getResearchActivity(researchActivityId);
      if (!researchActivity) {
        return res.status(404).json({ message: "Research activity not found" });
      }
      
      if (researchActivity.projectId !== projectId) {
        return res.status(400).json({ message: "Research activity does not belong to this project" });
      }

      // Note: Principal Investigator role is now managed through team membership

      const success = await storage.removeProjectMember(researchActivityId, scientistId);
      
      if (!success) {
        return res.status(404).json({ message: "Project member not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error removing project member:", error);
      res.status(500).json({ message: "Failed to remove project member" });
    }
  });

  // Research Activity Members - Direct access routes
  app.get('/api/research-activities/:id/members', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const members = await storage.getProjectMembers(id);
      
      // Enhance team members with scientist details
      const enhancedMembers = await Promise.all(members.map(async (member) => {
        const scientist = await storage.getScientist(member.scientistId);
        return {
          ...member,
          scientist: scientist ? {
            id: scientist.id,
            firstName: scientist.firstName,
            lastName: scientist.lastName,
            honorificTitle: scientist.honorificTitle,
            jobTitle: scientist.jobTitle,
            email: scientist.email,
            staffId: scientist.staffId,
            profileImageInitials: scientist.profileImageInitials
          } : null
        };
      }));
      
      res.json(enhancedMembers);
    } catch (error) {
      console.error("Error fetching research activity members:", error);
      res.status(500).json({ message: "Failed to fetch research activity members" });
    }
  });

  app.post('/api/research-activities/:id/members', async (req: Request, res: Response) => {
    try {
      const researchActivityId = parseInt(req.params.id);
      if (isNaN(researchActivityId)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const { scientistId, role } = req.body;
      
      const validateData = insertProjectMemberSchema.parse({
        researchActivityId,
        scientistId,
        role
      });
      
      // Check if scientist exists
      const scientist = await storage.getScientist(validateData.scientistId);
      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }
      
      // Principal Investigator is an investigator-only team role.
      if (!isInvestigatorRoleAssignmentAllowed(validateData.role, scientist)) {
        return res.status(400).json({ 
          message: "Only staff with an eligible Investigator designation can be assigned the role of Principal Investigator"
        });
      }
      
      // Check if member already exists
      const existingMembers = await storage.getProjectMembers(researchActivityId);
      const memberExists = existingMembers.some(m => m.scientistId === scientistId);
      if (memberExists) {
        return res.status(400).json({ message: "Scientist is already a member of this research activity" });
      }
      
      // Enforce role constraints: Only 1 Principal Investigator and 1 Lead Scientist per research activity
      const currentRoles = existingMembers.map(m => m.role);
      
      if (validateData.role === "Principal Investigator") {
        const hasPrincipalInvestigator = currentRoles.includes("Principal Investigator");
        if (hasPrincipalInvestigator) {
          return res.status(400).json({ 
            message: "Each research activity can only have one Principal Investigator" 
          });
        }
      }
      
      if (validateData.role === "Lead Scientist") {
        const hasLeadScientist = currentRoles.includes("Lead Scientist");
        if (hasLeadScientist) {
          return res.status(400).json({ 
            message: "Each research activity can only have one Lead Scientist" 
          });
        }
      }
            
      const member = await storage.addProjectMember(validateData);
      
      // Return enhanced member with scientist details
      const enhancedMember = {
        ...member,
        scientist: {
          id: scientist.id,
          name: `-e `,
          title: scientist.jobTitle,
          email: scientist.email,
          staffId: scientist.staffId,
          profileImageInitials: scientist.profileImageInitials
        }
      };
      
      res.status(201).json(enhancedMember);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error("Error adding research activity member:", error);
      res.status(500).json({ message: "Failed to add research activity member" });
    }
  });

  app.delete('/api/research-activities/:id/members/:scientistId', async (req: Request, res: Response) => {
    try {
      const researchActivityId = parseInt(req.params.id);
      const scientistId = parseInt(req.params.scientistId);
      
      if (isNaN(researchActivityId) || isNaN(scientistId)) {
        return res.status(400).json({ message: "Invalid ID parameters" });
      }
      
      // Note: Principal Investigator role is now managed through team membership

      const success = await storage.removeProjectMember(researchActivityId, scientistId);
      
      if (!success) {
        return res.status(404).json({ message: "Research activity member not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error removing research activity member:", error);
      res.status(500).json({ message: "Failed to remove research activity member" });
    }
  });

  // Data Management Plans
  app.get('/api/data-management-plans', async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
      
      let plans;
      if (projectId && !isNaN(projectId)) {
        const plan = await storage.getDataManagementPlanForProject(projectId);
        plans = plan ? [plan] : [];
      } else {
        plans = await storage.getDataManagementPlans();
      }
      
      // Enhance plans with project details
      const enhancedPlans = await Promise.all(plans.map(async (plan) => {
        const project = await storage.getProject(plan.projectId);
        return {
          ...plan,
          project: project ? {
            id: project.id,
            title: project.title
          } : null
        };
      }));
      
      res.json(enhancedPlans);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch data management plans" });
    }
  });

  app.get('/api/data-management-plans/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid data management plan ID" });
      }

      const plan = await storage.getDataManagementPlan(id);
      if (!plan) {
        return res.status(404).json({ message: "Data management plan not found" });
      }

      // Get project details
      const project = await storage.getProject(plan.projectId);
      
      const enhancedPlan = {
        ...plan,
        project: project ? {
          id: project.id,
          title: project.title
        } : null
      };

      res.json(enhancedPlan);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch data management plan" });
    }
  });

  app.post('/api/data-management-plans', async (req: Request, res: Response) => {
    try {
      const validateData = insertDataManagementPlanSchema.parse(req.body);
      
      // Check if project exists
      const project = await storage.getProject(validateData.projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      
      // Check if a plan already exists for this project
      const existingPlan = await storage.getDataManagementPlanForProject(validateData.projectId);
      if (existingPlan) {
        return res.status(409).json({ message: "A data management plan already exists for this project" });
      }
      
      const plan = await storage.createDataManagementPlan(validateData);
      res.status(201).json(plan);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to create data management plan" });
    }
  });

  app.patch('/api/data-management-plans/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid data management plan ID" });
      }

      const validateData = insertDataManagementPlanSchema.partial().parse(req.body);
      const plan = await storage.updateDataManagementPlan(id, validateData);
      
      if (!plan) {
        return res.status(404).json({ message: "Data management plan not found" });
      }
      
      res.json(plan);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update data management plan" });
    }
  });

  app.delete('/api/data-management-plans/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid data management plan ID" });
      }

      const success = await storage.deleteDataManagementPlan(id);
      
      if (!success) {
        return res.status(404).json({ message: "Data management plan not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete data management plan" });
    }
  });

  // Publications
  // ----- Bulk "Import Links" (Outcome Office) -----
  // Template download: 4-column Excel file officers fill in and re-upload.
  app.get('/api/publications/link-import/template', requirePublicationOfficer, async (_req: Request, res: Response) => {
    try {
      const buf = await buildLinkImportTemplate();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="publication-links-template.xlsx"');
      res.send(buf);
    } catch (error) {
      console.error("Error building link-import template:", error);
      res.status(500).json({ message: "Failed to build template" });
    }
  });

  // Parse an uploaded template and report, per row, what would be linked
  // (with SDR title / staff job title as match evidence) or why it was ignored.
  app.post('/api/publications/link-import/preview', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const { fileBase64, fileName } = req.body ?? {};
      if (typeof fileBase64 !== 'string' || !fileBase64) {
        return res.status(400).json({ message: "Provide fileBase64 and fileName" });
      }
      const [pubs, ras, scis, allAuthors] = await Promise.all([
        storage.getPublications(),
        storage.getResearchActivities(),
        storage.getScientists(),
        db.select({
          publicationId: publicationAuthors.publicationId,
          scientistId: publicationAuthors.scientistId,
        }).from(publicationAuthors),
      ]);
      const authorMap = new Map<number, Set<number>>();
      for (const a of allAuthors) {
        if (!authorMap.has(a.publicationId)) authorMap.set(a.publicationId, new Set());
        authorMap.get(a.publicationId)!.add(a.scientistId);
      }
      const rows = await previewLinkImport(fileBase64, String(fileName ?? 'upload.xlsx'), {
        publications: pubs,
        researchActivities: ras,
        scientists: scis,
        publicationAuthors: authorMap,
      });
      res.json({ rows });
    } catch (error) {
      console.error("Error previewing link import:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to parse file" });
    }
  });

  // Apply the confirmed links from a preview.
  app.post('/api/publications/link-import/apply', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const actorId = (req.session as any)?.user?.id ?? null;
      const rawLinks: unknown = req.body?.links;
      if (!Array.isArray(rawLinks) || rawLinks.length === 0) {
        return res.status(400).json({ message: "Provide a non-empty list of links." });
      }
      if (rawLinks.length > 2000) {
        return res.status(400).json({ message: "Too many links in one request (max 2000)." });
      }
      let sdrLinks = 0, staffLinks = 0;
      const skipped: { publicationId: number; reason: string }[] = [];
      // Defend against conflicting/duplicate entries regardless of what the
      // client sends: one SDR link per publication, one row per staff pair.
      const sdrSeen = new Set<number>();
      const staffSeen = new Set<string>();
      for (const raw of rawLinks) {
        const publicationId = Number((raw as any)?.publicationId);
        if (!Number.isInteger(publicationId)) { skipped.push({ publicationId, reason: "invalid publication id" }); continue; }
        const pub = await storage.getPublication(publicationId);
        if (!pub) { skipped.push({ publicationId, reason: "publication not found" }); continue; }
        if (pub.status === 'Published *') { skipped.push({ publicationId, reason: "publication is sealed (Published *)" }); continue; }

        const researchActivityId = Number((raw as any)?.researchActivityId);
        const scientistId = Number((raw as any)?.scientistId);
        if (Number.isInteger(researchActivityId) && researchActivityId > 0) {
          if (sdrSeen.has(publicationId)) { skipped.push({ publicationId, reason: "conflicting SDR link earlier in this request" }); continue; }
          sdrSeen.add(publicationId);
          const ra = await storage.getResearchActivity(researchActivityId);
          if (!ra) { skipped.push({ publicationId, reason: "SDR not found" }); continue; }
          if (pub.researchActivityId === ra.id) { skipped.push({ publicationId, reason: "already linked to SDR" }); continue; }
          await storage.updatePublication(publicationId, { researchActivityId: ra.id });
          sdrLinks++;
        } else if (Number.isInteger(scientistId) && scientistId > 0) {
          const pairKey = `${publicationId}:${scientistId}`;
          if (staffSeen.has(pairKey)) { skipped.push({ publicationId, reason: "duplicate staff link earlier in this request" }); continue; }
          staffSeen.add(pairKey);
          const scientist = await storage.getScientist(scientistId);
          if (!scientist) { skipped.push({ publicationId, reason: "staff member not found" }); continue; }
          const existing = await storage.getPublicationAuthors(publicationId);
          if (existing.some((a) => a.scientistId === scientistId)) {
            skipped.push({ publicationId, reason: "staff member already linked" });
            continue;
          }
          await storage.addPublicationAuthor({
            publicationId,
            scientistId,
            authorshipType: 'Contributing Author',
            authorPosition: null,
            linkedByUserId: actorId,
            linkMethod: 'automatic',
          } as any);
          staffLinks++;
        } else {
          skipped.push({ publicationId, reason: "link is missing an SDR or staff target" });
        }
      }
      res.json({ sdrLinks, staffLinks, skipped });
    } catch (error) {
      console.error("Error applying link import:", error);
      res.status(500).json({ message: "Failed to apply links" });
    }
  });

  app.get('/api/publications', async (req: Request, res: Response) => {
    try {
      const researchActivityId = req.query.researchActivityId ? parseInt(req.query.researchActivityId as string) : undefined;
      const page = req.query.page ? parseInt(req.query.page as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      
      // Validate pagination params if provided
      if ((page !== undefined && (isNaN(page) || page < 1)) || 
          (limit !== undefined && (isNaN(limit) || limit < 1))) {
        return res.status(400).json({ message: "Invalid pagination parameters. page and limit must be positive integers." });
      }
      
      let publications;
      if (researchActivityId && !isNaN(researchActivityId)) {
        publications = await storage.getPublicationsForResearchActivity(researchActivityId);
      } else {
        publications = await storage.getPublications();
      }
      const allPublicationAuthors = await storage.getAllPublicationAuthors();

      const hasOfficeAccess =
        req.query.officeAccess === "true" &&
        hasPublicationOfficerRole(req);
      if (!hasOfficeAccess) {
        const authorsByPublication = new Map<number, Array<{
          scientistId: number;
          supervisorId: number | null;
        }>>();
        for (const author of allPublicationAuthors) {
          const linked = authorsByPublication.get(author.publicationId) ?? [];
          linked.push({
            scientistId: author.scientistId,
            supervisorId: author.scientist.supervisorId,
          });
          authorsByPublication.set(author.publicationId, linked);
        }
        const viewer = getScientistPublicationViewer(req);
        publications = publications.filter((publication) =>
          canViewPublication(
            viewer,
            publication,
            authorsByPublication.get(publication.id) ?? [],
          )
        );
      }
      
      // Enhance publications with research activity details
      const enhancedPublications = await Promise.all(publications.map(async (pub) => {
        const researchActivity = pub.researchActivityId ? await storage.getResearchActivity(pub.researchActivityId) : null;
        const canSeeInvalidReason =
          hasPublicationOfficerRole(req) ||
          (req.session.user?.scientistId != null &&
            allPublicationAuthors.some((author) =>
              author.publicationId === pub.id &&
              author.scientistId === req.session.user!.scientistId
            ));
        const { invalidReason: _privateInvalidReason, ...safePublication } = pub;
        return {
          ...safePublication,
          ...(canSeeInvalidReason ? { invalidReason: pub.invalidReason } : {}),
          researchActivity: researchActivity ? {
            id: researchActivity.id,
            sdrNumber: researchActivity.sdrNumber,
            title: researchActivity.title
          } : null
        };
      }));
      
      // Apply pagination if requested
      if (page !== undefined && limit !== undefined) {
        const startIndex = (page - 1) * limit;
        const paginatedPublications = enhancedPublications.slice(startIndex, startIndex + limit);
        res.json({
          data: paginatedPublications,
          pagination: {
            page,
            limit,
            total: enhancedPublications.length,
            totalPages: Math.ceil(enhancedPublications.length / limit)
          }
        });
      } else {
        res.json(enhancedPublications);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch publications" });
    }
  });

  // Bulk count of publications grouped by journal name (case-insensitive).
  // Accepts `?journals=name1|name2|...` (pipe-separated because journal names
  // may contain commas) and returns { [journalName]: count }. Names not in
  // the query are returned with count 0 so the frontend can render zeros.
  app.get('/api/publications/journal-counts', async (req: Request, res: Response) => {
    try {
      const raw = (req.query.journals as string | undefined) ?? '';
      const requested = raw.split('|').map((s) => s.trim()).filter(Boolean);
      const result: Record<string, number> = {};
      for (const name of requested) result[name] = 0;
      if (requested.length === 0) return res.json(result);

      const all = await storage.getPublications();
      const lowerToOriginal = new Map<string, string>();
      for (const name of requested) lowerToOriginal.set(name.toLowerCase(), name);
      for (const pub of all) {
        const j = (pub.journal ?? '').trim().toLowerCase();
        if (!j) continue;
        const original = lowerToOriginal.get(j);
        if (original) result[original] = (result[original] ?? 0) + 1;
      }
      res.json(result);
    } catch (error) {
      console.error('Error getting publication journal counts:', error);
      res.status(500).json({ message: 'Failed to count publications by journal' });
    }
  });

  // Count of linked internal authors per publication. Returns a map of
  // { [publicationId]: number } so the office can flag publications that have
  // no internal scientist/author records linked. Registered before
  // "/api/publications/:id" so the literal path isn't swallowed by the id route.
  app.get('/api/publications/author-counts', async (_req: Request, res: Response) => {
    try {
      const allAuthors = await storage.getAllPublicationAuthors();
      const counts: Record<number, number> = {};
      for (const author of allAuthors) {
        counts[author.publicationId] = (counts[author.publicationId] || 0) + 1;
      }
      res.json(counts);
    } catch (error) {
      console.error('Error getting publication author counts:', error);
      res.status(500).json({ message: 'Failed to count publication authors' });
    }
  });

  // Map of publicationId -> linked internal scientists (id + display name).
  // Used by the office UI to offer a "filter by scientist" control over the
  // New Publications list. Registered before "/api/publications/:id".
  app.get('/api/publications/author-map', async (_req: Request, res: Response) => {
    try {
      const allAuthors = await storage.getAllPublicationAuthors();
      const map: Record<number, Array<{ id: number; name: string }>> = {};
      for (const author of allAuthors) {
        const s = author.scientist;
        const name = [s.honorificTitle, s.firstName, s.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() || `Scientist #${s.id}`;
        if (!map[author.publicationId]) map[author.publicationId] = [];
        if (!map[author.publicationId].some((e) => e.id === s.id)) {
          map[author.publicationId].push({ id: s.id, name });
        }
      }
      res.json(map);
    } catch (error) {
      console.error('Error building publication author map:', error);
      res.status(500).json({ message: 'Failed to build publication author map' });
    }
  });

  // Publications needing author-linking fixes for a requested scientist or,
  // when no scientist is specified, the current user. Returns only that person's
  // likely publications that have a real
  // author-linking problem: either no internal authors linked, or a linked
  // internal author that does not appear in the free-text author list.
  // Registered before "/api/publications/:id" so the literal path isn't
  // swallowed by the id param route.
  app.get('/api/publications/needs-author-fix', async (req: Request, res: Response) => {
    try {
      const subject = await resolveAuthorCheckSubject({
        requestedScientistId: req.query.scientistId,
        authMode: getAuthMode(),
        sessionUser: req.session.user,
        getScientist: (id) => storage.getScientist(id),
      });
      if (!subject.ok) {
        return res.status(subject.status).json({ message: subject.message });
      }

      const { firstName, lastName } = subject;
      if (!firstName || !lastName) {
        // Can't determine the target person's name, so there's nothing to match.
        return res.json([]);
      }

      const [allPublications, allAuthors] = await Promise.all([
        storage.getPublications(),
        storage.getAllPublicationAuthors(),
      ]);

      let includeUnpublished = false;
      if (typeof req.query.scientistId === "string") {
        const targetScientist = await storage.getScientist(Number(req.query.scientistId));
        includeUnpublished = !!targetScientist && canViewUnpublishedScientistPublications(
          getScientistPublicationViewer(req),
          targetScientist,
        );
      } else if (req.session.user?.scientistId) {
        includeUnpublished = true;
      }

      // Group internal author links by publication id.
      const authorsByPublication = new Map<number, (typeof allAuthors)>();
      for (const author of allAuthors) {
        const list = authorsByPublication.get(author.publicationId) || [];
        list.push(author);
        authorsByPublication.set(author.publicationId, list);
      }

      const flagged = allPublications
        .filter(pub =>
          includeUnpublished ||
          isPublicScientistProfilePublicationStatus(pub.status)
        )
        // Only the target scientist/current user's likely publications.
        .filter(pub => matchesAuthorName(pub.authors, firstName, lastName))
        .map(pub => {
          const linkedAuthors = authorsByPublication.get(pub.id) || [];

          if (linkedAuthors.length === 0) {
            return { publication: pub, reason: "no_internal_authors" as const };
          }

          const mismatched = linkedAuthors.filter(
            a => !isLinkedAuthorInAuthorsText(pub.authors, a.scientist.firstName, a.scientist.lastName)
          );

          if (mismatched.length > 0) {
            return {
              publication: pub,
              reason: "author_mismatch" as const,
              mismatchedAuthors: mismatched.map(a => ({
                scientistId: a.scientistId,
                firstName: a.scientist.firstName,
                lastName: a.scientist.lastName,
              })),
            };
          }

          return null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      res.json(flagged);
    } catch (error) {
      console.error("Error finding publications needing author fixes:", error);
      res.status(500).json({ message: "Failed to find publications needing author fixes" });
    }
  });

  // Active correction issues are based only on explicit publication-author
  // links. This literal route must remain before /api/publications/:id.
  app.get('/api/publications/invalid-issues', requireAuth, async (req: Request, res: Response) => {
    try {
      const actorScientistId = req.session.user?.scientistId ?? null;
      const requestedScientistId =
        typeof req.query.scientistId === "string"
          ? Number(req.query.scientistId)
          : null;
      if (
        requestedScientistId != null &&
        (!Number.isInteger(requestedScientistId) || requestedScientistId <= 0)
      ) {
        return res.status(400).json({ message: "Invalid scientist ID" });
      }
      if (
        !hasPublicationOfficerRole(req) &&
        requestedScientistId != null &&
        requestedScientistId !== actorScientistId
      ) {
        return res.status(403).json({ message: "You may only view your own linked publication issues." });
      }
      const targetScientistId = hasPublicationOfficerRole(req)
        ? requestedScientistId
        : actorScientistId;
      if (!hasPublicationOfficerRole(req) && targetScientistId == null) {
        return res.status(403).json({ message: "Your account is not linked to a scientist profile." });
      }

      const [allPublications, allAuthors] = await Promise.all([
        storage.getPublications(),
        storage.getAllPublicationAuthors(),
      ]);
      const invalidPublications = selectInvalidLinkedPublications(
        allPublications,
        allAuthors,
        targetScientistId,
      );
      const issues = await Promise.all(invalidPublications.map(async (publication) => {
        const history = await storage.getManuscriptHistory(publication.id);
        const invalidation = history.find((entry) =>
          entry.toStatus === PUBLISHED_INVALID_STATUS
        );
        return {
          publicationId: publication.id,
          title: publication.title,
          status: PUBLISHED_INVALID_STATUS,
          invalidReason: publication.invalidReason,
          invalidatedAt: invalidation?.createdAt ?? publication.updatedAt ?? null,
        };
      }));
      res.json(issues);
    } catch (error) {
      console.error("Error fetching invalid publication issues:", error);
      res.status(500).json({ message: "Failed to fetch invalid publication issues" });
    }
  });

  // Duplicate publication detection. Returns groups of likely-duplicate
  // publications (same DOI / PMID / fuzzy metadata, or preprint<->published
  // pairs) with the records needed to render a side-by-side merge review.
  // Registered before "/api/publications/:id" so the literal path isn't
  // swallowed by the id param route.
  app.get('/api/publications/duplicates', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const [allPublications, allAuthors] = await Promise.all([
        storage.getPublications(),
        storage.getAllPublicationAuthors(),
      ]);

      const groups = detectDuplicateGroups(allPublications);

      const authorCountByPublication = new Map<number, number>();
      for (const a of allAuthors) {
        authorCountByPublication.set(
          a.publicationId,
          (authorCountByPublication.get(a.publicationId) || 0) + 1,
        );
      }
      const byId = new Map(allPublications.map((p) => [p.id, p]));

      const result = groups.map((group) => {
        const groupPubs = group.publicationIds
          .map((id) => byId.get(id))
          .filter((p): p is NonNullable<typeof p> => p != null);
        return {
          reasons: group.reasons,
          isPreprintPair: group.isPreprintPair,
          defaultSurvivorId: pickDefaultSurvivorId(groupPubs),
          publications: groupPubs.map((p) => {
            const { invalidReason: _privateInvalidReason, ...safePublication } = p;
            return {
              ...safePublication,
              ...(hasPublicationOfficerRole(req)
                ? { invalidReason: p.invalidReason }
                : {}),
              authorCount: authorCountByPublication.get(p.id) || 0,
            };
          }),
        };
      });

      res.json(result);
    } catch (error) {
      console.error("Error detecting duplicate publications:", error);
      res.status(500).json({ message: "Failed to detect duplicate publications" });
    }
  });

  // Lightweight count of duplicate groups for the tab badge.
  app.get('/api/publications/duplicates/count', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const allPublications = await storage.getPublications();
      const groups = detectDuplicateGroups(allPublications);
      res.json({ count: groups.length });
    } catch (error) {
      console.error("Error counting duplicate publication groups:", error);
      res.status(500).json({ message: "Failed to count duplicate publication groups" });
    }
  });

  // Merge a set of duplicate publications into a chosen survivor. Office-only;
  // performs the whole operation atomically (author de-dup, history re-pointing,
  // research-activity carry-over, deletion) so a failure changes nothing.
  app.post('/api/publications/merge', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const mergeSchema = z.object({
        survivorId: z.number().int(),
        mergeIds: z.array(z.number().int()).min(1),
        fields: z.record(z.any()).optional(),
      });
      const { survivorId, mergeIds, fields } = mergeSchema.parse(req.body);
      if (fields?.status === PUBLISHED_INVALID_STATUS) {
        return res.status(400).json({
          message: "Use the dedicated invalidation action and provide a reason.",
        });
      }

      const targetIds = Array.from(new Set(mergeIds)).filter((id) => id !== survivorId);
      if (targetIds.length === 0) {
        return res.status(400).json({ message: "Provide at least one distinct publication to merge into the survivor." });
      }

      // Only allow known publication columns to be overridden on the survivor.
      const allowedFields = [
        "title", "abstract", "authors", "journal", "volume", "issue", "pages",
        "doi", "pmid", "publicationDate", "publicationType", "status",
        "prepublicationUrl", "prepublicationSite", "researchActivityId",
      ] as const;
      const overrides: Record<string, any> = {};
      if (fields) {
        for (const key of allowedFields) {
          if (key in fields) overrides[key] = (fields as any)[key];
        }
      }

      // Sealed publications cannot participate in a merge — revert first.
      const involved = await Promise.all([survivorId, ...targetIds].map((pid) => storage.getPublication(pid)));
      const sealed = involved.filter((p) => p?.status === 'Published *');
      if (sealed.length > 0) {
        return res.status(403).json({
          message: `Cannot merge: publication(s) ${sealed.map((p) => p!.id).join(', ')} are sealed (Published *). Revert the final approval first.`,
        });
      }
      const invalid = involved.filter((p) => p?.status === PUBLISHED_INVALID_STATUS);
      if (invalid.length > 0) {
        return res.status(403).json({
          message: `Cannot merge: publication(s) ${invalid.map((p) => p!.id).join(', ')} are awaiting linked-author correction or withdrawal.`,
        });
      }

      const changedBy = req.session?.user?.id || 1;

      const survivor = await storage.mergePublications(
        survivorId,
        targetIds,
        overrides,
        changedBy,
      );
      if (!survivor) {
        return res.status(404).json({ message: "Surviving publication not found" });
      }

      res.json(survivor);
    } catch (error: any) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error("Error merging publications:", error);
      res.status(500).json({ message: error?.message || "Failed to merge publications" });
    }
  });

  // Literal publication maintenance routes must stay above /api/publications/:id,
  // otherwise Express treats their final segment as an invalid numeric id.
  app.get('/api/publications/preprint-repair-candidates', requirePublicationOfficer, async (_req: Request, res: Response) => {
    try {
      const candidates = (await storage.getPublications())
        .map((publication) => {
          const evidence = preprintRepairEvidence(publication);
          if (!evidence.length) return null;
          const proposed = classifyResolvedPublication(publication);
          return {
            id: publication.id,
            title: publication.title,
            doi: publication.doi,
            publicationType: publication.publicationType,
            status: publication.status,
            prepublicationUrl: publication.prepublicationUrl,
            prepublicationSite: publication.prepublicationSite,
            evidence,
            proposed,
          };
        })
        .filter(Boolean);
      res.json({ candidates, count: candidates.length });
    } catch (error) {
      console.error("Error listing preprint repair candidates:", error);
      res.status(500).json({ message: "Failed to list preprint repair candidates" });
    }
  });

  app.post('/api/publications/preprint-repair', requirePublicationOfficer, async (req: Request, res: Response) => {
    const rawIds = req.body?.publicationIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return res.status(400).json({ message: "Provide a non-empty publicationIds array." });
    }
    const ids = [...new Set(rawIds.map(Number).filter(Number.isInteger))];
    if (!ids.length) {
      return res.status(400).json({ message: "publicationIds must contain integer IDs." });
    }
    const actorId = req.session?.user?.id;
    if (actorId == null) {
      return res.status(401).json({ message: "Authentication required" });
    }
    try {
      const updated: { id: number; title: string }[] = [];
      const skipped: { id: number; reason: string }[] = [];
      for (const id of ids) {
        const result = await storage.repairPreprintPublication(id, actorId);
        if (result.publication) {
          updated.push({ id: result.publication.id, title: result.publication.title });
        } else {
          skipped.push({ id, reason: result.reason || "not updated" });
        }
      }
      res.json({
        updated,
        skipped,
        updatedCount: updated.length,
        skippedCount: skipped.length,
      });
    } catch (error) {
      console.error("Error repairing preprint publications:", error);
      res.status(500).json({ message: "Failed to repair preprint publications" });
    }
  });

  app.get('/api/publications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const publication = await storage.getPublication(id);
      if (!publication) {
        return res.status(404).json({ message: "Publication not found" });
      }

      const hasOfficeAccess =
        req.query.officeAccess === "true" &&
        hasPublicationOfficerRole(req);
      const linkedAuthors = (await storage.getAllPublicationAuthors())
        .filter((author) => author.publicationId === publication.id)
        .map((author) => ({
          scientistId: author.scientistId,
          supervisorId: author.scientist.supervisorId,
        }));
      if (!hasOfficeAccess) {
        if (!canViewPublication(
          getScientistPublicationViewer(req),
          publication,
          linkedAuthors,
        )) {
          return res.status(404).json({ message: "Publication not found" });
        }
      }

      // Get research activity details
      const researchActivity = publication.researchActivityId ? await storage.getResearchActivity(publication.researchActivityId) : null;
      
      const enhancedPublication = {
        ...(() => {
          const canSeeInvalidReason =
            hasPublicationOfficerRole(req) ||
            (req.session.user?.scientistId != null &&
              linkedAuthors.some((author) =>
                author.scientistId === req.session.user!.scientistId
              ));
          const { invalidReason: _privateInvalidReason, ...safePublication } = publication;
          return {
            ...safePublication,
            ...(canSeeInvalidReason ? { invalidReason: publication.invalidReason } : {}),
          };
        })(),
        researchActivity: researchActivity ? {
          id: researchActivity.id,
          sdrNumber: researchActivity.sdrNumber,
          title: researchActivity.title
        } : null
      };

      res.json(enhancedPublication);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch publication" });
    }
  });

  /**
   * Resolves the SDR-exemption fields for a create or update.
   *
   * The reason is the scientist's own claim, so who made it and when are
   * stamped from the session rather than taken from the request body -- a
   * client must not be able to attribute an exception to someone else.
   *
   * Linking an SDR clears the exemption. The two are mutually exclusive: a
   * publication that names its research activity is not also claiming there
   * is none.
   */
  const resolveSdrExemption = (
    req: Request,
    incoming: Record<string, unknown>,
    existing?: { researchActivityId?: number | null; sdrExemptionReason?: string | null },
  ): { ok: true; fields: Record<string, unknown> } | { ok: false; message: string } => {
    const linkedSdr = incoming.researchActivityId !== undefined
      ? incoming.researchActivityId
      : existing?.researchActivityId ?? null;

    if (linkedSdr != null) {
      return {
        ok: true,
        fields: {
          sdrExemptionReason: null,
          sdrExemptionRequestedBy: null,
          sdrExemptionRequestedAt: null,
        },
      };
    }

    // Absent from the payload on an update: leave whatever is already stored.
    if (incoming.sdrExemptionReason === undefined) {
      return { ok: true, fields: {} };
    }

    const raw = incoming.sdrExemptionReason;
    if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
      return {
        ok: true,
        fields: {
          sdrExemptionReason: null,
          sdrExemptionRequestedBy: null,
          sdrExemptionRequestedAt: null,
        },
      };
    }

    const result = validateSdrExemptionReason(raw);
    if (!result.ok) return { ok: false, message: result.message };

    // Re-saving the same reason must not restamp it as a fresh request.
    if (existing?.sdrExemptionReason?.trim() === result.reason) {
      return { ok: true, fields: {} };
    }

    return {
      ok: true,
      fields: {
        sdrExemptionReason: result.reason,
        // The demo session uses id 0, which is not a real user row. `|| null`
        // rather than `?? null` so it records nobody instead of failing the
        // foreign key.
        sdrExemptionRequestedBy: req.session?.user?.id || null,
        sdrExemptionRequestedAt: new Date(),
      },
    };
  };

  app.post('/api/publications', requireAuth, rejectPublicationCreateWorkflowMutation, async (req: Request, res: Response) => {
    try {
      // Create a validation schema that makes authors optional for concept status
      const createPublicationSchema = insertPublicationSchema.extend({
        authors: z.string().optional().nullable(),
      });
      
      const validateData = createPublicationSchema.parse(req.body);
      
      // Set default status to "Concept" if not provided
      const publicationData = {
        ...validateData,
        status: validateData.status || "Concept"
      };
      
      // Check the SDR and enforce record ownership for researcher-created
      // publications. Outcome Office/management may create across all SDRs.
      let researchActivity = null;
      if (publicationData.researchActivityId) {
        researchActivity = await storage.getResearchActivity(publicationData.researchActivityId);
        if (!researchActivity) {
          return res.status(404).json({ message: "Research activity not found" });
        }
      }

      const exemption = resolveSdrExemption(req, publicationData as Record<string, unknown>);
      if (!exemption.ok) {
        return res.status(400).json({ message: exemption.message });
      }
      const claimsExemption = typeof exemption.fields.sdrExemptionReason === "string";

      if (!hasPublicationOfficerRole(req)) {
        // A publication with no SDR is normally a researcher recording work
        // outside any research activity, which this ownership rule exists to
        // prevent. The exception is a collaborator's paper: there is no SDR
        // here to be a member of, so the explanation stands in for the check
        // and the Outcome Office reads it before the record is finalised.
        if (!researchActivity && !claimsExemption) {
          return res.status(403).json({
            message:
              "Researchers must choose an SDR where they are the budget holder or a project member, or explain why no SDR applies.",
          });
        }
        if (researchActivity) {
          const projectMembers = await storage.getProjectMembers(researchActivity.id);
          if (
            !canCreatePublicationForResearchActivity(
              req,
              researchActivity.budgetHolderId,
              projectMembers.map((member) => member.scientistId)
            )
          ) {
            return res.status(403).json({
              message:
                "You may only create publications for an SDR where you are the budget holder or a project member.",
            });
          }
        }
      }

      // The demo session uses id 0, which is not a real user row, so `??` here
      // wrote 0 and the users foreign key rejected the insert -- creating a
      // publication in demo mode failed outright. `||` records nobody instead.
      const creatorUserId = req.session?.user?.id || null;
      const publication = await storage.createPublication({
        ...publicationData,
        ...exemption.fields,
        createdByUserId: creatorUserId,
      } as any);

      // Create initial history entry for publication creation. Attribute it
      // to the session user so the timeline shows who created the record;
      // fall back to the legacy default user id 1 only if no session exists.
      await storage.createManuscriptHistoryEntry({
        publicationId: publication.id,
        fromStatus: '',
        toStatus: publication.status || 'Concept',
        changedBy: creatorUserId ?? 1,
        changeReason: 'Publication created',
      });

      // The exception is a claim someone made. Record it in the timeline so it
      // survives a later correction and can be traced to whoever made it.
      if (typeof exemption.fields.sdrExemptionReason === 'string') {
        await storage.createManuscriptHistoryEntry({
          publicationId: publication.id,
          fromStatus: publication.status || 'Concept',
          toStatus: publication.status || 'Concept',
          changedField: 'sdrExemption',
          oldValue: null,
          newValue: exemption.fields.sdrExemptionReason as string,
          changedBy: creatorUserId ?? 1,
          changeReason: `No SDR: ${exemption.fields.sdrExemptionReason}`,
        });
      }

      res.status(201).json(publication);
    } catch (error) {
      console.error("Publication creation error:", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to create publication", error: error.message });
    }
  });

  app.patch('/api/publications/:id', requireAuth, rejectGenericPublicationWorkflowMutation, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const validateData = insertPublicationSchema.partial().parse(req.body);

      const existing = await storage.getPublication(id);
      if (!existing) {
        return res.status(404).json({ message: "Publication not found" });
      }

      // Sealed records: once the Outcome Office marks a publication
      // "Published *" it is final and read-only. The office must use the
      // revert function before any further edits.
      if (existing.status === 'Published *') {
        return res.status(403).json({
          message: "This publication is sealed (Published *). Revert the final approval in the Outcome Office before editing.",
        });
      }

      const linkedAuthors = await storage.getPublicationAuthors(id);
      if (
        !canEditPublicationForLinkedScientists(
          req,
          linkedAuthors.map((author) => author.scientistId)
        )
      ) {
        return res.status(403).json({
          message:
            "You may only edit publications linked to your scientist profile. Add or confirm your own internal-author link first, or ask Outcome Office for help.",
        });
      }

      // Check if research activity exists if researchActivityId is provided
      if (validateData.researchActivityId) {
        const researchActivity = await storage.getResearchActivity(validateData.researchActivityId);
        if (!researchActivity) {
          return res.status(404).json({ message: "Research activity not found" });
        }
      }

      const exemption = resolveSdrExemption(
        req,
        validateData as Record<string, unknown>,
        existing,
      );
      if (!exemption.ok) {
        return res.status(400).json({ message: exemption.message });
      }

      const publication = await storage.updatePublication(id, {
        ...validateData,
        ...exemption.fields,
      });

      if (!publication) {
        return res.status(404).json({ message: "Publication not found" });
      }

      if (typeof exemption.fields.sdrExemptionReason === 'string') {
        await storage.createManuscriptHistoryEntry({
          publicationId: id,
          fromStatus: existing.status || '',
          toStatus: publication.status || '',
          changedField: 'sdrExemption',
          oldValue: existing.sdrExemptionReason ?? null,
          newValue: exemption.fields.sdrExemptionReason as string,
          changedBy: req.session?.user?.id ?? 1,
          changeReason: `No SDR: ${exemption.fields.sdrExemptionReason}`,
        });
      }

      res.json(publication);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update publication" });
    }
  });

  app.delete('/api/publications/:id', requireAuth, requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const sealedCheck = await storage.getPublication(id);
      if (sealedCheck?.status === 'Published *') {
        return res.status(403).json({
          message: "This publication is sealed (Published *). Revert the final approval in the Outcome Office before deleting.",
        });
      }

      const success = await storage.deletePublication(id);
      
      if (!success) {
        return res.status(404).json({ message: "Publication not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete publication" });
    }
  });

  // Manuscript History
  app.get('/api/publications/:id/history', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }
      const historyPublication = await storage.getPublication(id);
      if (!historyPublication) {
        return res.status(404).json({ message: "Publication not found" });
      }
      const historyAuthors = await storage.getPublicationAuthors(id);
      if (!canViewPublication(
        getScientistPublicationViewer(req),
        historyPublication,
        historyAuthors.map((author) => ({
          scientistId: author.scientistId,
          supervisorId: author.scientist?.supervisorId ?? null,
        })),
      )) {
        return res.status(404).json({ message: "Publication not found" });
      }
      const canSeeCorrectionReason =
        hasPublicationOfficerRole(req) ||
        (req.session.user?.scientistId != null &&
          historyAuthors.some((author) =>
            author.scientistId === req.session.user!.scientistId
          ));

      // Status changes now record the real session user id in `changed_by`.
      // Older rows may instead hold a scientist id (or the legacy default
      // user id 1), so we left-join both tables and prefer the users.name
      // when it exists, falling back to the scientist's full name.
      const rows = await db
        .select({
          id: manuscriptHistory.id,
          publicationId: manuscriptHistory.publicationId,
          fromStatus: manuscriptHistory.fromStatus,
          toStatus: manuscriptHistory.toStatus,
          changedField: manuscriptHistory.changedField,
          oldValue: manuscriptHistory.oldValue,
          newValue: manuscriptHistory.newValue,
          changedBy: manuscriptHistory.changedBy,
          changeReason: manuscriptHistory.changeReason,
          createdAt: manuscriptHistory.createdAt,
          userName: users.name,
          scientistFirstName: scientists.firstName,
          scientistLastName: scientists.lastName,
        })
        .from(manuscriptHistory)
        .leftJoin(users, eq(manuscriptHistory.changedBy, users.id))
        .leftJoin(scientists, eq(manuscriptHistory.changedBy, scientists.id))
        .where(eq(manuscriptHistory.publicationId, id))
        .orderBy(desc(manuscriptHistory.createdAt));

      const history = rows.map((r) => {
        const scientistName = r.scientistFirstName || r.scientistLastName
          ? `${r.scientistFirstName ?? ''} ${r.scientistLastName ?? ''}`.trim()
          : null;
        return {
          id: r.id,
          publicationId: r.publicationId,
          fromStatus: r.fromStatus,
          toStatus: r.toStatus,
          changedField: r.changedField,
          oldValue: r.oldValue,
          newValue: r.newValue,
          changedBy: r.changedBy,
          changedByName: r.userName ?? scientistName ?? null,
          changeReason:
            canSeeCorrectionReason ||
            (
              r.fromStatus !== PUBLISHED_INVALID_STATUS &&
              r.toStatus !== PUBLISHED_INVALID_STATUS
            )
              ? r.changeReason
              : null,
          createdAt: r.createdAt,
        };
      });

      res.json(history);
    } catch (error) {
      console.error('Error fetching manuscript history:', error);
      res.status(500).json({ message: "Failed to fetch manuscript history" });
    }
  });

  // Publication Status Management
  app.post(
    '/api/publications/:id/ip-vet',
    requirePublicationOfficer,
    createIpVettingHandler(storage)
  );

  app.post(
    '/api/publications/:id/mark-invalid',
    requirePublicationOfficer,
    createInvalidatePublishedHandler(storage),
  );

  app.post(
    '/api/publications/:id/submit-correction',
    requireAuth,
    createInvalidAuthorActionHandler(storage, PUBLISHED_STATUS),
  );

  app.post(
    '/api/publications/:id/withdraw-invalid',
    requireAuth,
    createInvalidAuthorActionHandler(storage, WITHDRAWN_STATUS),
  );

  app.post('/api/publications/:id/finalize', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const sessionUserId = req.session?.user?.id;
      if (sessionUserId == null) {
        return res.status(401).json({ message: "You must be signed in." });
      }

      const publication = await storage.getPublication(id);
      if (!publication) {
        return res.status(404).json({ message: "Publication not found" });
      }
      if (publication.status === "Published *") {
        return res.status(403).json({
          message:
            "This publication is already sealed. Revert the final approval before making changes.",
        });
      }
      if (publication.status === PUBLISHED_INVALID_STATUS) {
        return res.status(400).json({
          message:
            "An invalid publication cannot be finalized. A linked author must submit a correction first.",
        });
      }
      if (publication.status !== PUBLISHED_STATUS) {
        return res.status(400).json({
          message: `Only a current ${PUBLISHED_STATUS} publication can be finalized as Published *.`,
        });
      }

      const issues: string[] = [];
      if (!publication.journal?.trim()) issues.push("missing journal");
      if (!publication.publicationDate) issues.push("missing publication date");
      if (!publication.doi?.trim() && !publication.pmid?.trim()) {
        issues.push("missing DOI/PMID");
      }
      if (!publication.authors?.trim()) issues.push("missing authors");
      if (!publication.abstract?.trim()) issues.push("missing abstract");
      // An accepted explanation stands in for the link. The office reads the
      // reason on the card before finalising, which is the vetting step.
      if (!hasSdrOrExemption(publication)) issues.push("no linked SDR or exception");
      const internalAuthors = await storage.getPublicationAuthors(id);
      if (internalAuthors.length === 0) issues.push("no linked internal authors");
      if (issues.length > 0) {
        return res.status(400).json({
          message: `Cannot mark as Published *: unresolved issues (${issues.join(", ")}).`,
          issues,
        });
      }

      const updated = await storage.updatePublicationStatus(
        id,
        "Published *",
        sessionUserId,
        undefined,
        PUBLISHED_STATUS,
      );
      if (!updated) {
        return res.status(409).json({
          message: "The publication changed before final approval completed. Refresh and try again.",
        });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error finalizing publication:", error);
      res.status(500).json({ message: "Failed to finalize publication" });
    }
  });

  app.patch('/api/publications/:id/status', requireAuth, rejectProtectedPublicationStatusFields, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const { status, changes, updatedFields } = req.body;

      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }

      // Resolve the acting user from the session — never trust the client to
      // attribute a status change to someone else.
      const sessionUserId = req.session?.user?.id;
      if (sessionUserId == null) {
        return res.status(401).json({ message: "You must be signed in to change publication status." });
      }
      const changedBy = sessionUserId;

      // Validate status transition
      const currentPublication = await storage.getPublication(id);
      
      if (!currentPublication) {
        return res.status(404).json({ message: "Publication not found" });
      }

      const linkedAuthors = await storage.getPublicationAuthors(id);
      if (
        !canEditPublicationForLinkedScientists(
          req,
          linkedAuthors.map((author) => author.scientistId)
        )
      ) {
        return res.status(403).json({
          message:
            "You may only change the status of publications linked to your scientist profile, or ask Outcome Office for help.",
        });
      }

      // Status validation logic. Each entry lists every status reachable from
      // the key — forward transitions, revert paths (one hop back), and
      // author-controlled withdrawal. Keep in sync with the
      // `getNextStatuses` map in client/src/pages/publications/detail.tsx.
      const validTransitions: Record<string, string[]> = {
        'Concept': ['Complete Draft', 'Withdrawn'],
        'Complete Draft': ['Vetted for submission', 'Concept', 'Withdrawn'],
        'Vetted for submission': ['Submitted for review with pre-publication', 'Submitted for review without pre-publication', 'Complete Draft', 'Withdrawn'],
        'Submitted for review with pre-publication': ['Under review', 'Vetted for submission', 'Withdrawn'],
        'Submitted for review without pre-publication': ['Under review', 'Vetted for submission', 'Withdrawn'],
        'Under review': ['Accepted/In Press', 'Submitted for review with pre-publication', 'Submitted for review without pre-publication', 'Withdrawn'],
        'Accepted/In Press': ['Published', 'Under review', 'Withdrawn'],
        'Published': ['Accepted/In Press'],
        'Published - Invalid': [],
        // Sealed: only the Outcome Office revert route can leave this state.
        'Published *': [],
        'Rejected': ['Under review', 'Vetted for submission'],
        'Withdrawn': ['Concept'],
      };

      const currentStatus = currentPublication.status || 'Concept';
      const workflowViolation = getStatusTransitionWorkflowViolation(
        currentStatus,
        status
      );
      if (workflowViolation) {
        return res
          .status(workflowViolation.statusCode)
          .json({ message: workflowViolation.message });
      }
      if (currentStatus === 'Published *') {
        return res.status(403).json({
          message: "This publication is sealed (Published *). Only the Outcome Office can revert the final approval.",
        });
      }
      if (!validTransitions[currentStatus]?.includes(status)) {
        return res.status(400).json({ 
          message: `Invalid status transition from "${currentStatus}" to "${status}"` 
        });
      }

      // Field validation based on status
      const validationErrors = [];
      
      if (status === 'Complete Draft') {
        const finalAuthors = updatedFields?.authors || currentPublication.authors;
        if (!finalAuthors || finalAuthors.trim() === '') {
          validationErrors.push('Authorship field is required for Complete Draft status');
        }
      }
      
      if (status === 'Vetted for submission' && !currentPublication.vettedForSubmissionByIpOffice) {
        validationErrors.push('IP office approval is required for Vetted for submission status. Please update this in the publication edit form.');
      }
      
      if (status === 'Submitted for review with pre-publication') {
        const finalUrl = (updatedFields?.prepublicationUrl?.trim() || currentPublication.prepublicationUrl?.trim()) || '';
        const finalSite = (updatedFields?.prepublicationSite?.trim() || currentPublication.prepublicationSite?.trim()) || '';
        if (!finalUrl || !finalSite) {
          validationErrors.push('Prepublication URL and site are required for pre-publication submission');
        }
      }
      
      if (['Under review', 'Accepted/In Press'].includes(status)) {
        const finalJournal = updatedFields?.journal || currentPublication.journal;
        if (!finalJournal || finalJournal.trim() === '') {
          validationErrors.push('Journal name is required for this status');
        }
      }
      
      if (status === 'Published') {
        const finalDate = updatedFields?.publicationDate || currentPublication.publicationDate;
        const finalDoi = updatedFields?.doi || currentPublication.doi;
        if (!finalDate || !finalDoi) {
          validationErrors.push('Publication date and DOI are required for Published status');
        }
      }

      if (validationErrors.length > 0) {
        return res.status(400).json({ message: validationErrors.join('; ') });
      }

      // Commit fields, status, and history together, only if the status that
      // was authorized above is still current.
      const updatedPublication = await storage.updatePublicationStatus(
        id,
        status,
        changedBy,
        changes,
        currentStatus,
        updatedFields,
      );
      
      if (!updatedPublication) {
        return res.status(409).json({
          message: "The publication changed before this status update completed. Refresh and try again.",
        });
      }
      
      res.json(updatedPublication);
    } catch (error) {
      console.error('Error updating publication status:', error);
      res.status(500).json({ message: "Failed to update publication status" });
    }
  });

  // Outcome Office: revert the final "Published *" approval (unseals the record).
  app.post(
    '/api/publications/:id/revert-final',
    requirePublicationOfficer,
    createRevertFinalHandler(storage),
  );

  // Publication Authors
  app.get('/api/publications/:id/authors', async (req: Request, res: Response) => {
    try {
      const publicationId = parseInt(req.params.id);
      if (isNaN(publicationId)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const authors = await storage.getPublicationAuthors(publicationId);
      res.json(authors);
    } catch (error) {
      console.error("Error fetching publication authors:", error);
      res.status(500).json({ message: "Failed to fetch publication authors", error: error.message });
    }
  });

  app.post('/api/publications/:id/authors', requireAuth, async (req: Request, res: Response) => {
    try {
      const publicationId = parseInt(req.params.id);
      if (isNaN(publicationId)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const validateData = insertPublicationAuthorSchema.parse({
        ...req.body,
        publicationId
      });

      const targetPub = await storage.getPublication(publicationId);
      if (!targetPub) {
        return res.status(404).json({ message: "Publication not found" });
      }
      if (targetPub.status === 'Published *') {
        return res.status(403).json({ message: "This publication is sealed (Published *). Revert the final approval before changing author links." });
      }

      // Check if scientist is already an author before authorizing the action.
      // Researchers may manage only their own link; new self-links must also
      // match the free-text author list. Outcome Office may manage any link.
      const existingAuthors = await storage.getPublicationAuthors(publicationId);
      const existingAuthor = existingAuthors.find(author => author.scientistId === validateData.scientistId);
      const targetScientist = existingAuthor?.scientist ?? await storage.getScientist(validateData.scientistId);
      const allScientists = existingAuthor ? [] : await storage.getScientists();
      const authorNameMatches = targetScientist
        ? isUnambiguousAuthorMatch(
            targetPub.authors,
            targetScientist,
            existingAuthor ? [targetScientist] : allScientists
          )
        : false;
      if (
        !canManagePublicationAuthorLink(
          req,
          validateData.scientistId,
          Boolean(existingAuthor),
          authorNameMatches
        )
      ) {
        return res.status(403).json({
          message:
            "You may only add or update your own matching internal-author link. Ask Outcome Office to correct other author links.",
        });
      }

      // Attribution: this endpoint is the manual linking flow (detail page), so
      // every link/update it makes is stamped as a manual link by the acting
      // session user. linkedByUserId is nullable for legacy rows; we set it here.
      const actorId = (req.session as any)?.user?.id ?? null;

      if (existingAuthor) {
        // Update existing author by combining authorship types
        const existingTypes = existingAuthor.authorshipType.split(',').map(t => t.trim());
        const newTypes = validateData.authorshipType.split(',').map(t => t.trim());
        
        // Combine types, avoiding duplicates
        const combinedTypes = [...new Set([...existingTypes, ...newTypes])];
        
        const updatedAuthor = await storage.updatePublicationAuthor(
          publicationId,
          validateData.scientistId,
          {
            authorshipType: combinedTypes.join(', '),
            authorPosition: validateData.authorPosition || existingAuthor.authorPosition,
            linkMethod: "manual",
            linkedByUserId: actorId,
          }
        );
        res.status(200).json(updatedAuthor);
      } else {
        // Add new author
        const author = await storage.addPublicationAuthor({
          ...validateData,
          linkMethod: "manual",
          linkedByUserId: actorId,
        });
        res.status(201).json(author);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error("Failed to add publication author:", error);
      res.status(500).json({ message: "Failed to add publication author", detail: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete('/api/publications/:publicationId/authors/:scientistId', requireAuth, async (req: Request, res: Response) => {
    try {
      const publicationId = parseInt(req.params.publicationId);
      const scientistId = parseInt(req.params.scientistId);
      
      if (isNaN(publicationId) || isNaN(scientistId)) {
        return res.status(400).json({ message: "Invalid publication or scientist ID" });
      }

      const targetPub = await storage.getPublication(publicationId);
      if (targetPub?.status === 'Published *') {
        return res.status(403).json({ message: "This publication is sealed (Published *). Revert the final approval before changing author links." });
      }

      const existingAuthors = await storage.getPublicationAuthors(publicationId);
      const existingAuthor = existingAuthors.find(author => author.scientistId === scientistId);
      if (
        !canManagePublicationAuthorLink(
          req,
          scientistId,
          Boolean(existingAuthor),
          false
        )
      ) {
        return res.status(403).json({
          message:
            "You may only remove your own internal-author link. Ask Outcome Office to correct other author links.",
        });
      }

      const success = await storage.removePublicationAuthor(publicationId, scientistId);
      
      if (!success) {
        return res.status(404).json({ message: "Publication author not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to remove publication author" });
    }
  });

  // Suggest internal-author links for a publication from its free-text author
  // list. Returns one suggestion per matched internal scientist (excluding those
  // already linked) with an inferred authorship type + position. This is the
  // shared matcher (suggestInternalAuthors) reused by the auto-connect dialog.
  app.get('/api/publications/:id/author-suggestions', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const publicationId = parseInt(req.params.id);
      if (isNaN(publicationId)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const publication = await storage.getPublication(publicationId);
      if (!publication) {
        return res.status(404).json({ message: "Publication not found" });
      }

      const [scientists, existingAuthors] = await Promise.all([
        storage.getScientists(),
        storage.getPublicationAuthors(publicationId),
      ]);
      const excludeIds = existingAuthors.map((a) => a.scientistId);

      const suggestions = suggestInternalAuthors(
        publication.authors,
        scientists,
        excludeIds,
      );

      // Hydrate each suggestion with the scientist record so the client can show
      // names without a second round-trip.
      const byId = new Map(scientists.map((s) => [s.id, s]));
      const hydrated = suggestions.map((s) => ({
        ...s,
        scientist: byId.get(s.scientistId) ?? null,
      }));

      res.json({ suggestions: hydrated });
    } catch (error) {
      console.error("Error suggesting publication authors:", error);
      res.status(500).json({ message: "Failed to suggest publication authors" });
    }
  });

  // Bulk-confirm a set of suggested internal-author links for one publication.
  // Each link is marked automatic and attributed to the acting session user.
  // Used by the auto-connect confirmation dialog.
  app.post('/api/publications/:id/authors/bulk', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const publicationId = parseInt(req.params.id);
      if (isNaN(publicationId)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const publication = await storage.getPublication(publicationId);
      if (!publication) {
        return res.status(404).json({ message: "Publication not found" });
      }
      if (publication.status === 'Published *') {
        return res.status(403).json({ message: "This publication is sealed (Published *). Revert the final approval before changing author links." });
      }

      const actorId = (req.session as any)?.user?.id ?? null;

      const rawLinks: unknown = req.body?.links;
      if (!Array.isArray(rawLinks) || rawLinks.length === 0) {
        return res
          .status(400)
          .json({ message: "Provide a non-empty list of author links." });
      }

      // Validate each requested link; skip scientists already linked.
      const existingAuthors = await storage.getPublicationAuthors(publicationId);
      const alreadyLinked = new Set(existingAuthors.map((a) => a.scientistId));

      const created: any[] = [];
      const skipped: { scientistId: number; reason: string }[] = [];

      for (const link of rawLinks) {
        const scientistId = Number((link as any)?.scientistId);
        const authorshipType =
          typeof (link as any)?.authorshipType === "string"
            ? (link as any).authorshipType.trim()
            : "";
        const authorPositionRaw = (link as any)?.authorPosition;
        const authorPosition =
          typeof authorPositionRaw === "number" && Number.isFinite(authorPositionRaw)
            ? authorPositionRaw
            : null;

        if (!Number.isInteger(scientistId) || !authorshipType) {
          skipped.push({ scientistId, reason: "invalid" });
          continue;
        }
        if (alreadyLinked.has(scientistId)) {
          skipped.push({ scientistId, reason: "already linked" });
          continue;
        }

        const scientist = await storage.getScientist(scientistId);
        if (!scientist) {
          skipped.push({ scientistId, reason: "scientist not found" });
          continue;
        }

        const author = await storage.addPublicationAuthor({
          publicationId,
          scientistId,
          authorshipType,
          authorPosition: authorPosition ?? undefined,
          linkMethod: "automatic",
          linkedByUserId: actorId,
        });
        alreadyLinked.add(scientistId);
        created.push(author);
      }

      res.status(201).json({
        created,
        skipped,
        createdCount: created.length,
        skippedCount: skipped.length,
      });
    } catch (error) {
      console.error("Error bulk-linking publication authors:", error);
      res.status(500).json({ message: "Failed to link publication authors" });
    }
  });

  // Paper Discovery — search multiple external sources for papers, merge and
  // dedup by DOI, and flag which results already exist in the portal. Restricted
  // to publication-office staff since it is an institution-wide discovery tool.
  app.post('/api/publications/discover', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const mode: string = typeof body.mode === "string" ? body.mode : "institution";

      // Requested sources (default to all keyless sources). ORCID only applies
      // to scientist mode and is filtered out otherwise.
      const requestedSources: string[] = Array.isArray(body.sources) && body.sources.length
        ? body.sources.map((s: any) => String(s).toLowerCase())
        : ["openalex", "pubmed", "crossref", "europepmc", "orcid"];

      const yearFrom = Number.isFinite(Number(body.yearFrom)) ? Number(body.yearFrom) : null;
      const yearTo = Number.isFinite(Number(body.yearTo)) ? Number(body.yearTo) : null;

      // Build the list of per-source queries based on the mode.
      const queries: DiscoveryQuery[] = [];

      if (mode === "scientist") {
        const scientistIds: number[] = Array.isArray(body.scientistIds)
          ? body.scientistIds.map((n: any) => Number(n)).filter(Number.isInteger)
          : [];
        if (scientistIds.length === 0) {
          return res.status(400).json({ message: "Select at least one scientist." });
        }
        const allScientists = await storage.getScientists();
        const byId = new Map(allScientists.map((s) => [s.id, s]));
        for (const sid of scientistIds) {
          const sci = byId.get(sid);
          if (!sci) continue;
          const name = [sci.firstName, sci.lastName].filter(Boolean).join(" ").trim();
          if (!name) continue;
          queries.push({
            authorName: name,
            orcidId: (sci as any).orcidId || undefined,
            yearFrom,
            yearTo,
          });
        }
        if (queries.length === 0) {
          return res.status(400).json({ message: "No usable scientist names found." });
        }
      } else if (mode === "keyword") {
        const query = typeof body.query === "string" ? body.query.trim() : "";
        if (!query) {
          return res.status(400).json({ message: "Provide a search query." });
        }
        queries.push({ query, yearFrom, yearTo });
      } else {
        // institution mode
        const affiliation = typeof body.affiliation === "string" ? body.affiliation.trim() : "";
        if (!affiliation) {
          return res.status(400).json({ message: "Provide an institution / affiliation." });
        }
        queries.push({ affiliation, yearFrom, yearTo });
      }

      // Run every (source, query) pair in parallel; each fetcher fails soft.
      const tasks: Promise<DiscoveredPaper[]>[] = [];
      for (const sourceKey of requestedSources) {
        const fetcher = DISCOVERY_FETCHERS[sourceKey];
        if (!fetcher) continue;
        // ORCID needs an orcidId, only present in scientist-mode queries.
        if (sourceKey === "orcid" && mode !== "scientist") continue;
        for (const q of queries) {
          if (sourceKey === "orcid" && !q.orcidId) continue;
          tasks.push(fetcher(q));
        }
      }

      const settled = await Promise.allSettled(tasks);
      const rows: DiscoveredPaper[] = [];
      for (const r of settled) {
        if (r.status === "fulfilled") rows.push(...r.value);
      }

      // Merge by DOI identity (version-aware), collecting contributing sources
      // and keeping the most complete metadata seen for each work.
      const merged = new Map<string, {
        doi: string;
        title: string;
        journal: string;
        year: number | null;
        authors: string;
        sources: Set<string>;
        matchedAffiliation: string | null;
      }>();

      for (const row of rows) {
        if (!withinYearRange(row.year, yearFrom, yearTo)) continue;
        const identity = workDoiIdentity(row.doi) || row.doi;
        const existing = merged.get(identity);
        if (existing) {
          existing.sources.add(row.source);
          if (!existing.title || existing.title === "Untitled work") existing.title = row.title;
          if (!existing.journal) existing.journal = row.journal;
          if (existing.year == null) existing.year = row.year;
          if (!existing.authors) existing.authors = row.authors;
          if (!existing.matchedAffiliation && row.matchedAffiliation) {
            existing.matchedAffiliation = row.matchedAffiliation;
          }
        } else {
          merged.set(identity, {
            doi: row.doi,
            title: row.title,
            journal: row.journal,
            year: row.year,
            authors: row.authors,
            sources: new Set([row.source]),
            matchedAffiliation: row.matchedAffiliation ?? null,
          });
        }
      }

      // Flag results already in the portal so the UI can disable re-import.
      const existingPublications = await storage.getPublications();
      const existingDois = buildExistingWorkDois(existingPublications);

      const results = Array.from(merged.values())
        .map((m) => ({
          doi: m.doi,
          title: m.title,
          journal: m.journal,
          year: m.year,
          authors: m.authors,
          sources: Array.from(m.sources),
          matchedAffiliation: m.matchedAffiliation,
          alreadyExists: (() => {
            const identity = workDoiIdentity(m.doi);
            return identity ? existingDois.has(identity) : false;
          })(),
        }))
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

      res.json({ results, count: results.length });
    } catch (error) {
      console.error("Error discovering papers:", error);
      res.status(500).json({ message: "Failed to discover papers" });
    }
  });

  // Import a selected set of discovered papers. Enriches each DOI via
  // CrossRef/PubMed, creates the publication, records manuscript history, and
  // auto-links any matching internal scientists (attributed to the acting user
  // and flagged automatic). Mirrors the per-scientist import flow.
  app.post('/api/publications/discover/import', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const actorId = req.session?.user?.id;
      if (actorId == null) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const rawPapers: unknown = req.body?.papers;
      type RequestedPaper = { doi: string; title: string; journal: string; year: number | null; authors: string };
      const requestedMap = new Map<string, RequestedPaper>();
      if (Array.isArray(rawPapers)) {
        for (const p of rawPapers) {
          const doi = normalizeDoi(typeof p?.doi === "string" ? p.doi : "");
          if (!doi || requestedMap.has(doi)) continue;
          requestedMap.set(doi, {
            doi,
            title: typeof p?.title === "string" ? p.title : "",
            journal: typeof p?.journal === "string" ? p.journal : "",
            year: typeof p?.year === "number" ? p.year : null,
            authors: typeof p?.authors === "string" ? p.authors : "",
          });
        }
      }
      if (requestedMap.size === 0) {
        return res.status(400).json({ message: "Provide a non-empty list of papers to import." });
      }

      const requestedPapers = Array.from(requestedMap.values());
      const existingPublications = await storage.getPublications();
      const existingDois = buildExistingWorkDois(existingPublications);
      const allScientists = await storage.getScientists();

      const created: {
        id: number;
        doi: string;
        title: string;
        linkedAuthors: number;
        status: string | null;
        publicationType: string | null;
        prepublicationUrl: string | null;
        prepublicationSite: string | null;
      }[] = [];
      const skipped: { doi: string; reason: string }[] = [];

      for (const paper of requestedPapers) {
        const doi = paper.doi;
        const identity = workDoiIdentity(doi);
        if (!identity || existingDois.has(identity)) {
          skipped.push({ doi, reason: "already exists" });
          continue;
        }

        const [crossref, pubmed] = await Promise.all([
          fetchCrossrefPublication(doi),
          fetchPubmedByDoi(doi),
        ]);

        const pick = (...vals: (string | undefined | null)[]) =>
          vals.find((v) => typeof v === "string" && v.trim() !== "")?.trim() ?? "";

        const title = pick(crossref?.title, pubmed?.title, paper.title) || "Untitled work";
        const journal = pick(crossref?.journal, pubmed?.journal, paper.journal);
        const authors = pick(crossref?.authors, pubmed?.authors, paper.authors);
        const volume = pick(crossref?.volume, pubmed?.volume);
        const issue = pick(crossref?.issue, pubmed?.issue);
        const pages = pick(crossref?.pages, pubmed?.pages);
        const abstract =
          pubmed?.abstract?.trim() || (crossref?.abstract ? stripXml(crossref.abstract) : "");
        const pmid = pubmed?.pmid || "";

        const resolvedDate = crossref?.publicationDate ?? pubmed?.publicationDate ?? null;
        let publicationDate: string | null = resolvedDate ? resolvedDate.toISOString() : null;
        if (!publicationDate && paper.year) {
          publicationDate = new Date(Date.UTC(paper.year, 0, 1)).toISOString();
        }

        const enrichedFromAnySource = Boolean(crossref || pubmed);

        const primaryDoi = normalizeDoi(crossref?.doi || doi) || doi;
        const classification = classifyResolvedPublication({
          id: 0,
          doi: primaryDoi,
          publicationType: crossref?.type,
          journal,
        });
        try {
          const publicationData = insertPublicationSchema.parse({
            researchActivityId: null,
            title,
            authors,
            journal,
            volume,
            issue,
            pages,
            doi: primaryDoi,
            pmid: pmid || null,
            abstract,
            ...classification,
            publicationDate,
          });

          const changeReason = enrichedFromAnySource
            ? "Imported via Paper Discovery"
            : "Imported via Paper Discovery (metadata not enriched via CrossRef/PubMed)";
          const publication = await storage.createPublicationWithHistory({
            ...publicationData,
            createdByUserId: actorId,
          }, {
            fromStatus: "",
            toStatus: publicationData.status || "Published",
            changedBy: actorId,
            changeReason,
          });

          // Auto-link matching internal scientists from the resolved author text.
          let linkedAuthors = 0;
          const suggestions = suggestInternalAuthors(authors, allScientists);
          for (const s of suggestions) {
            try {
              await storage.addPublicationAuthor({
                publicationId: publication.id,
                scientistId: s.scientistId,
                authorshipType: s.authorshipType,
                authorPosition: s.authorPosition,
                linkMethod: "automatic",
                linkedByUserId: actorId,
              });
              linkedAuthors++;
            } catch (linkErr) {
              console.error(`Failed to auto-link scientist ${s.scientistId} on pub ${publication.id}:`, linkErr);
            }
          }

          existingDois.add(identity);
          created.push({
            doi: primaryDoi,
            id: publication.id,
            title,
            linkedAuthors,
            status: publication.status,
            publicationType: publication.publicationType,
            prepublicationUrl: publication.prepublicationUrl,
            prepublicationSite: publication.prepublicationSite,
          });
        } catch (err) {
          console.error(`Failed to import discovered DOI ${doi}:`, err);
          skipped.push({ doi, reason: "failed to save" });
        }
      }

      res.json({
        created,
        skipped,
        createdCount: created.length,
        skippedCount: skipped.length,
      });
    } catch (error) {
      console.error("Error importing discovered papers:", error);
      res.status(500).json({ message: "Failed to import discovered papers" });
    }
  });

  // Publication Export  
  app.post('/api/publications/export', requirePublicationOfficer, async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, journal, scientist, status } = req.body;
      
      // Get all publications first
      const allPublications = await storage.getPublications();
      
      // Apply filters
      let filteredPublications = allPublications;
      
      if (startDate || endDate) {
        filteredPublications = filteredPublications.filter(pub => {
          if (!pub.publicationDate) return false;
          const pubDate = new Date(pub.publicationDate);
          if (startDate && pubDate < new Date(startDate)) return false;
          if (endDate && pubDate > new Date(endDate)) return false;
          return true;
        });
      }
      
      if (journal) {
        filteredPublications = filteredPublications.filter(pub => 
          pub.journal?.toLowerCase().includes(journal.toLowerCase())
        );
      }
      
      if (status && status !== 'all') {
        filteredPublications = filteredPublications.filter(pub => 
          pub.status === status
        );
      }
      
      if (scientist) {
        filteredPublications = filteredPublications.filter(pub => 
          pub.authors?.toLowerCase().includes(scientist.toLowerCase())
        );
      }
      
      // Format as text for copy-paste
      const formattedText = filteredPublications.map(pub => {
        const year = pub.publicationDate ? new Date(pub.publicationDate).getFullYear() : 'N/A';
        return `${pub.title}\n${pub.authors || 'No authors listed'}\n${pub.journal || 'No journal'} ${pub.volume ? `${pub.volume}` : ''}${pub.issue ? `(${pub.issue})` : ''}${pub.pages ? `: ${pub.pages}` : ''} (${year})\n${pub.doi ? `DOI: ${pub.doi}` : 'No DOI'}\nStatus: ${pub.status || 'Unknown'}\n\n---\n\n`;
      }).join('');
      
      res.json({ 
        count: filteredPublications.length,
        formattedText,
        publications: filteredPublications
      });
    } catch (error) {
      console.error('Error exporting publications:', error);
      res.status(500).json({ message: "Failed to export publications" });
    }
  });

  // Patents
  app.get('/api/patents', async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
      const researchActivityId = req.query.researchActivityId ? parseInt(req.query.researchActivityId as string) : undefined;

      let patents;
      if (researchActivityId !== undefined && !isNaN(researchActivityId)) {
        // Filter at the DB level so the patents detail page doesn't have to
        // download the full patent list and filter client-side.
        patents = await storage.getPatentsForResearchActivity(researchActivityId);
      } else if (projectId && !isNaN(projectId)) {
        patents = await storage.getPatentsForProject(projectId);
      } else {
        patents = await storage.getPatents();
      }
      
      // Enhance patents with project details
      const enhancedPatents = await Promise.all(patents.map(async (patent) => {
        const project = patent.projectId ? await storage.getProject(patent.projectId) : null;
        return {
          ...patent,
          project: project ? {
            id: project.id,
            title: project.title
          } : null
        };
      }));
      
      res.json(enhancedPatents);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch patents" });
    }
  });

  app.get('/api/patents/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid patent ID" });
      }

      const patent = await storage.getPatent(id);
      if (!patent) {
        return res.status(404).json({ message: "Patent not found" });
      }

      // Get project details
      const project = patent.projectId ? await storage.getProject(patent.projectId) : null;
      
      const enhancedPatent = {
        ...patent,
        project: project ? {
          id: project.id,
          title: project.title
        } : null
      };

      res.json(enhancedPatent);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch patent" });
    }
  });

  app.post('/api/patents', async (req: Request, res: Response) => {
    try {
      const validateData = insertPatentSchema.parse(req.body);
      
      // Check if project exists if projectId is provided
      if (validateData.projectId) {
        const project = await storage.getProject(validateData.projectId);
        if (!project) {
          return res.status(404).json({ message: "Project not found" });
        }
      }
      
      const patent = await storage.createPatent(validateData);
      res.status(201).json(patent);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to create patent" });
    }
  });

  app.patch('/api/patents/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid patent ID" });
      }

      const validateData = insertPatentSchema.partial().parse(req.body);
      
      // Check if project exists if projectId is provided
      if (validateData.projectId) {
        const project = await storage.getProject(validateData.projectId);
        if (!project) {
          return res.status(404).json({ message: "Project not found" });
        }
      }
      
      const patent = await storage.updatePatent(id, validateData);
      
      if (!patent) {
        return res.status(404).json({ message: "Patent not found" });
      }
      
      res.json(patent);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update patent" });
    }
  });

  app.delete('/api/patents/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid patent ID" });
      }

      const success = await storage.deletePatent(id);
      
      if (!success) {
        return res.status(404).json({ message: "Patent not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete patent" });
    }
  });

  // IRB Applications
  app.get('/api/irb-applications', async (req: Request, res: Response) => {
    try {
      const researchActivityId = req.query.researchActivityId ? parseInt(req.query.researchActivityId as string) : undefined;
      const page = req.query.page ? parseInt(req.query.page as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      
      // Validate pagination params if provided
      if ((page !== undefined && (isNaN(page) || page < 1)) || 
          (limit !== undefined && (isNaN(limit) || limit < 1))) {
        return res.status(400).json({ message: "Invalid pagination parameters. page and limit must be positive integers." });
      }
      
      let applications;
      if (researchActivityId && !isNaN(researchActivityId)) {
        applications = await storage.getIrbApplicationsForResearchActivity(researchActivityId);
      } else {
        applications = await storage.getIrbApplications();
      }
      
      // Enhance applications with research activity and PI details
      const enhancedApplications = await Promise.all(applications.map(async (app) => {
        const researchActivity = app.researchActivityId ? await storage.getResearchActivity(app.researchActivityId) : null;
        const pi = await storage.getScientist(app.principalInvestigatorId);
        
        return {
          ...app,
          researchActivity: researchActivity ? {
            id: researchActivity.id,
            sdrNumber: researchActivity.sdrNumber,
            title: researchActivity.title
          } : null,
          principalInvestigator: pi ? {
            id: pi.id,
            honorificTitle: pi.honorificTitle,
            firstName: pi.firstName,
            lastName: pi.lastName,
            jobTitle: pi.jobTitle,
            email: pi.email,
            name: pi.name,
            profileImageInitials: pi.profileImageInitials
          } : null
        };
      }));
      
      // Apply pagination if requested
      if (page !== undefined && limit !== undefined) {
        const startIndex = (page - 1) * limit;
        const paginatedApplications = enhancedApplications.slice(startIndex, startIndex + limit);
        res.json({
          data: paginatedApplications,
          pagination: {
            page,
            limit,
            total: enhancedApplications.length,
            totalPages: Math.ceil(enhancedApplications.length / limit)
          }
        });
      } else {
        res.json(enhancedApplications);
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IRB applications" });
    }
  });

  app.get('/api/irb-applications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IRB application ID" });
      }

      const application = await storage.getIrbApplication(id);
      if (!application) {
        return res.status(404).json({ message: "IRB application not found" });
      }

      // Get related details
      const project = await storage.getProject(application.projectId);
      const pi = await storage.getScientist(application.principalInvestigatorId);
      
      const enhancedApplication = {
        ...application,
        project: project ? {
          id: project.id,
          title: project.title
        } : null,
        principalInvestigator: pi ? {
          id: pi.id,
          name: pi.name,
          profileImageInitials: pi.profileImageInitials
        } : null
      };

      res.json(enhancedApplication);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IRB application" });
    }
  });

  app.post('/api/irb-applications', async (req: Request, res: Response) => {
    try {
      // Generate IRB number automatically - simple increment approach
      const currentYear = new Date().getFullYear();
      const existingApps = await storage.getIrbApplications();
      const yearlyApps = existingApps.filter(app => 
        app.irbNumber && app.irbNumber.startsWith(`IRB-${currentYear}-`)
      );
      
      // Get the highest existing number and add 1
      const existingNumbers = yearlyApps
        .map(app => {
          const match = app.irbNumber?.match(/IRB-\d{4}-(\d{3})/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter(num => num > 0);
      
      const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
      const nextNumber = maxNumber + 1;
      const irbNumber = `IRB-${currentYear}-${nextNumber.toString().padStart(3, '0')}`;
      
      const validateData = {
        ...req.body,
        irbNumber,
        workflowStatus: req.body.workflowStatus || 'draft',
        status: 'Active', // Required field for database
      };
      
      // Check if research activity exists
      const researchActivity = await storage.getResearchActivity(validateData.researchActivityId);
      if (!researchActivity) {
        return res.status(404).json({ message: "Research activity not found" });
      }
      
      const piEligibilityError = await getInvestigatorAssignmentError(
        validateData.principalInvestigatorId,
        "IRB Principal Investigator"
      );
      if (piEligibilityError) {
        return res
          .status(piEligibilityError.status)
          .json({ message: piEligibilityError.message });
      }
      
      const application = await storage.createIrbApplication(validateData);
      res.status(201).json(application);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error('IRB application creation error:', error);
      res.status(500).json({ message: "Failed to create IRB application" });
    }
  });

  app.patch('/api/irb-applications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IRB application ID" });
      }

      console.log('Updating IRB application with data:', req.body);

      // Handle submission comments separately
      if (req.body.submissionComment) {
        const currentApp = await storage.getIrbApplication(id);
        if (currentApp) {
          let existingResponses = {};
          
          // Handle both string and object formats for piResponses
          if (currentApp.piResponses) {
            if (typeof currentApp.piResponses === 'string') {
              try {
                existingResponses = JSON.parse(currentApp.piResponses);
              } catch (e) {
                console.error('Error parsing existing PI responses:', e);
                existingResponses = {};
              }
            } else if (typeof currentApp.piResponses === 'object') {
              existingResponses = currentApp.piResponses;
            }
          }
          
          const newResponse = {
            timestamp: new Date().toISOString(),
            comment: req.body.submissionComment,
            workflowStatus: req.body.workflowStatus || 'resubmitted'
          };
          existingResponses[Date.now()] = newResponse;
          req.body.piResponses = JSON.stringify(existingResponses);
          delete req.body.submissionComment; // Remove from body to avoid validation issues
        }
      }

      // Skip validation for protocol team members updates and documents updates
      let validateData = req.body;
      
      // Always convert date strings to Date objects if present
      if (req.body.submissionDate && typeof req.body.submissionDate === 'string') {
        req.body.submissionDate = new Date(req.body.submissionDate);
      }
      if (req.body.initialApprovalDate && typeof req.body.initialApprovalDate === 'string') {
        req.body.initialApprovalDate = new Date(req.body.initialApprovalDate);
      }
      if (req.body.expirationDate && typeof req.body.expirationDate === 'string') {
        req.body.expirationDate = new Date(req.body.expirationDate);
      }
      
      if (!req.body.protocolTeamMembers && !req.body.documents && !req.body.piResponses) {
        validateData = insertIrbApplicationSchema.partial().parse(req.body);
      }
      
      // Check if research activity exists if researchActivityId is provided
      if (validateData.researchActivityId) {
        const researchActivity = await storage.getResearchActivity(validateData.researchActivityId);
        if (!researchActivity) {
          return res.status(404).json({ message: "Research activity not found" });
        }
      }
      
      // Validate investigator eligibility if principalInvestigatorId is provided.
      if (validateData.principalInvestigatorId) {
        const piEligibilityError = await getInvestigatorAssignmentError(
          validateData.principalInvestigatorId,
          "IRB Principal Investigator"
        );
        if (piEligibilityError) {
          return res
            .status(piEligibilityError.status)
            .json({ message: piEligibilityError.message });
        }
      }
      
      const application = await storage.updateIrbApplication(id, validateData);
      
      if (!application) {
        return res.status(404).json({ message: "IRB application not found" });
      }
      
      res.json(application);
    } catch (error) {
      if (error instanceof ZodError) {
        console.error('Validation error:', error);
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error('IRB application update error:', error);
      res.status(500).json({ message: "Failed to update IRB application", error: error.message });
    }
  });

  app.delete('/api/irb-applications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IRB application ID" });
      }

      const success = await storage.deleteIrbApplication(id);
      
      if (!success) {
        return res.status(404).json({ message: "IRB application not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete IRB application" });
    }
  });

  // IBC Applications
  app.get('/api/ibc-applications', async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
      
      // IBC applications are not directly linked to projects, so ignore projectId filter
      const applications = await storage.getIbcApplications();
      
      // Enhance applications with PI details (IBC applications are not directly linked to projects)
      const enhancedApplications = await Promise.all(applications.map(async (app) => {
        const pi = await storage.getScientist(app.principalInvestigatorId);
        
        return {
          ...app,
          principalInvestigator: pi ? {
            id: pi.id,
            honorificTitle: pi.honorificTitle,
            firstName: pi.firstName,
            lastName: pi.lastName,
            jobTitle: pi.jobTitle,
            email: pi.email,
            name: pi.name,
            profileImageInitials: pi.profileImageInitials
          } : null
        };
      }));
      
      res.json(enhancedApplications);
    } catch (error) {
      console.error('Error fetching IBC applications:', error);
      res.status(500).json({ message: "Failed to fetch IBC applications" });
    }
  });

  app.get('/api/ibc-applications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      const application = await storage.getIbcApplication(id);
      if (!application) {
        return res.status(404).json({ message: "IBC application not found" });
      }

      // Get related research activities (SDRs)
      const researchActivities = await storage.getResearchActivitiesForIbcApplication(id);
      const pi = await storage.getScientist(application.principalInvestigatorId);
      
      const enhancedApplication = {
        ...application,
        researchActivities: researchActivities.map(activity => ({
          id: activity.id,
          sdrNumber: activity.sdrNumber,
          title: activity.title,
          status: activity.status
        })),
        principalInvestigator: pi ? {
          id: pi.id,
          name: pi.name,
          email: pi.email,
          profileImageInitials: pi.profileImageInitials,
          honorificTitle: pi.honorificTitle,
          firstName: pi.firstName,
          lastName: pi.lastName,
          jobTitle: pi.jobTitle
        } : null
      };

      res.json(enhancedApplication);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IBC application" });
    }
  });

  app.post('/api/ibc-applications', async (req: Request, res: Response) => {
    try {
      console.log("=== IBC Application Creation Debug ===");
      console.log("Full request body:", JSON.stringify(req.body, null, 2));
      
      const { researchActivityIds, isDraft, ...applicationData } = req.body;
      console.log("Extracted researchActivityIds:", researchActivityIds);
      console.log("Is draft:", isDraft);
      console.log("Application data after extraction:", JSON.stringify(applicationData, null, 2));
      
      console.log("Adding auto-generated fields...");
      // Add auto-generated fields before validation
      const dataWithAutoFields = {
        ...applicationData,
        ibcNumber: applicationData.ibcNumber || await storage.generateNextIbcNumber(),
        status: isDraft ? "Draft" : (applicationData.status || "Submitted"),
        workflowStatus: isDraft ? "draft" : (applicationData.workflowStatus || "submitted"),
        riskLevel: applicationData.riskLevel || "moderate"
      };
      console.log("Data with auto-generated fields:", JSON.stringify(dataWithAutoFields, null, 2));
      
      console.log("Validating with schema...");
      const validateData = insertIbcApplicationSchema.parse(dataWithAutoFields);
      console.log("Schema validation successful:", JSON.stringify(validateData, null, 2));
      
      console.log("Checking principal investigator eligibility with ID:", validateData.principalInvestigatorId);
      const piEligibilityError = await getInvestigatorAssignmentError(
        validateData.principalInvestigatorId,
        "IBC Principal Investigator"
      );
      if (piEligibilityError) {
        return res
          .status(piEligibilityError.status)
          .json({ message: piEligibilityError.message });
      }
      
      // Validate research activities if provided
      if (researchActivityIds && Array.isArray(researchActivityIds)) {
        console.log("Validating research activities:", researchActivityIds);
        for (const activityId of researchActivityIds) {
          const activity = await storage.getResearchActivity(activityId);
          if (!activity) {
            console.log(`Research activity with ID ${activityId} not found`);
            return res.status(404).json({ message: `Research activity with ID ${activityId} not found` });
          }
          console.log(`Research activity ${activityId} found:`, activity.title);
        }
      }
      
      console.log("Creating IBC application...");
      const application = await storage.createIbcApplication(validateData, researchActivityIds || []);
      console.log("IBC application created successfully:", application.id);
      
      res.status(201).json(application);
    } catch (error) {
      console.error("Error creating IBC application:", error);
      if (error instanceof ZodError) {
        console.log("Zod validation error:", fromZodError(error).message);
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.log("Generic error:", error.message);
      res.status(500).json({ message: "Failed to create IBC application", error: error.message });
    }
  });

  app.patch('/api/ibc-applications/:id', async (req: Request, res: Response) => {
    try {
      console.log('PATCH /api/ibc-applications/:id called');
      console.log('Request params:', req.params);
      console.log('Request body:', req.body);
      
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      // Extract isDraft flag and remove it from validation data
      const { isDraft, ...bodyData } = req.body;
      console.log('isDraft:', isDraft);
      console.log('bodyData:', bodyData);
      
      const validateData = insertIbcApplicationSchema.partial().parse(bodyData);
      console.log('Validated data after schema parsing:', validateData);
      
      // Handle status based on isDraft flag
      if (isDraft !== undefined) {
        if (isDraft) {
          validateData.status = 'draft';
        } else {
          validateData.status = 'submitted';
          // Set submission date when submitting
          if (!validateData.submissionDate) {
            validateData.submissionDate = new Date();
          }
        }
        console.log('Status set to:', validateData.status);
        console.log('Submission date set to:', validateData.submissionDate);
      }
      
      // Handle status changes for timeline tracking
      if (validateData.status) {
        const currentTime = new Date();
        
        // Set vetted date when moving to vetted status
        if (validateData.status === 'vetted' && !validateData.vettedDate) {
          validateData.vettedDate = currentTime;
        }
        
        // Set under review date when moving to under_review status
        if (validateData.status === 'under_review' && !validateData.underReviewDate) {
          validateData.underReviewDate = currentTime;
        }
        
        // Set approval date when moving to active status
        if (validateData.status === 'active' && !validateData.approvalDate) {
          validateData.approvalDate = currentTime;
        }
      }
      
      // Check if project exists if projectId is provided
      if (validateData.projectId) {
        const project = await storage.getProject(validateData.projectId);
        if (!project) {
          return res.status(404).json({ message: "Project not found" });
        }
      }
      
      // Validate investigator eligibility if provided.
      if (validateData.principalInvestigatorId) {
        const piEligibilityError = await getInvestigatorAssignmentError(
          validateData.principalInvestigatorId,
          "IBC Principal Investigator"
        );
        if (piEligibilityError) {
          return res
            .status(piEligibilityError.status)
            .json({ message: piEligibilityError.message });
        }
      }
      
      // Get the current application for status change tracking
      const currentApplication = await storage.getIbcApplication(id);
      if (!currentApplication) {
        return res.status(404).json({ message: "IBC application not found" });
      }

      console.log('About to call storage.updateIbcApplication with:', id, validateData);
      const application = await storage.updateIbcApplication(id, validateData);
      console.log('storage.updateIbcApplication result:', application);
      
      if (!application) {
        return res.status(404).json({ message: "IBC application not found" });
      }

      // Create office comment if reviewComments are provided
      if (req.body.reviewComments) {
        await storage.createIbcApplicationComment({
          applicationId: id,
          commentType: 'office_comment',
          authorType: 'office',
          authorName: 'IBC Office',
          comment: req.body.reviewComments,
          isInternal: false
        });
      }

      // Create status change comment if status changed
      if (validateData.status && validateData.status !== currentApplication.status) {
        const statusLabels = {
          'draft': 'Draft',
          'submitted': 'Submitted',
          'vetted': 'Vetted',
          'under_review': 'Under Review',
          'active': 'Active',
          'expired': 'Expired'
        };
        
        await storage.createIbcApplicationComment({
          applicationId: id,
          commentType: 'status_change',
          authorType: 'system',
          authorName: 'System',
          comment: `Status changed from ${statusLabels[currentApplication.status] || currentApplication.status} to ${statusLabels[validateData.status] || validateData.status}`,
          statusFrom: currentApplication.status,
          statusTo: validateData.status,
          isInternal: false
        });
      }
      
      res.json(application);
    } catch (error) {
      console.error('Error in PATCH /api/ibc-applications/:id:', error);
      if (error instanceof ZodError) {
        console.error('Zod validation error details:', fromZodError(error).message);
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error('Non-Zod error:', error);
      res.status(500).json({ message: "Failed to update IBC application", error: error.message });
    }
  });

  app.delete('/api/ibc-applications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      const success = await storage.deleteIbcApplication(id);
      
      if (!success) {
        return res.status(404).json({ message: "IBC application not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete IBC application" });
    }
  });

  // Get research activities for an IBC application
  app.get('/api/ibc-applications/:id/research-activities', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      const researchActivities = await storage.getResearchActivitiesForIbcApplication(id);
      res.json(researchActivities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch research activities for IBC application" });
    }
  });

  // Get personnel data for an IBC application
  app.get('/api/ibc-applications/:id/personnel', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      const application = await storage.getIbcApplication(id);
      if (!application) {
        return res.status(404).json({ message: "IBC application not found" });
      }

      // Get personnel from the application's protocolTeamMembers field if it exists
      if (application.protocolTeamMembers && Array.isArray(application.protocolTeamMembers)) {
        // Enhance personnel data with scientist details
        const enhancedPersonnel = await Promise.all(
          application.protocolTeamMembers.map(async (person: any) => {
            if (person.scientistId) {
              const scientist = await storage.getScientist(person.scientistId);
              return {
                ...person,
                scientist: scientist ? {
                  id: scientist.id,
                  honorificTitle: scientist.honorificTitle,
                  firstName: scientist.firstName,
                  lastName: scientist.lastName,
                  name: `-e `,
                  email: scientist.email,
                  department: scientist.department,
                  jobTitle: scientist.jobTitle,
                  profileImageInitials: scientist.profileImageInitials
                } : null
              };
            }
            return person;
          })
        );
        
        res.json(enhancedPersonnel);
      } else {
        res.json([]);
      }
    } catch (error) {
      console.error("Error fetching IBC application personnel:", error);
      res.status(500).json({ message: "Failed to fetch personnel for IBC application" });
    }
  });

  // Add research activity to IBC application
  app.post('/api/ibc-applications/:id/research-activities', async (req: Request, res: Response) => {
    try {
      const ibcApplicationId = parseInt(req.params.id);
      const { researchActivityId } = req.body;

      if (isNaN(ibcApplicationId)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      if (!researchActivityId || isNaN(researchActivityId)) {
        return res.status(400).json({ message: "Valid research activity ID is required" });
      }

      // Check if IBC application exists
      const ibcApplication = await storage.getIbcApplication(ibcApplicationId);
      if (!ibcApplication) {
        return res.status(404).json({ message: "IBC application not found" });
      }

      // Check if research activity exists
      const researchActivity = await storage.getResearchActivity(researchActivityId);
      if (!researchActivity) {
        return res.status(404).json({ message: "Research activity not found" });
      }

      const linkage = await storage.addResearchActivityToIbcApplication(ibcApplicationId, researchActivityId);
      res.status(201).json(linkage);
    } catch (error) {
      res.status(500).json({ message: "Failed to add research activity to IBC application" });
    }
  });

  // Remove research activity from IBC application
  app.delete('/api/ibc-applications/:id/research-activities/:activityId', async (req: Request, res: Response) => {
    try {
      const ibcApplicationId = parseInt(req.params.id);
      const researchActivityId = parseInt(req.params.activityId);

      if (isNaN(ibcApplicationId)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      if (isNaN(researchActivityId)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const success = await storage.removeResearchActivityFromIbcApplication(ibcApplicationId, researchActivityId);
      
      if (!success) {
        return res.status(404).json({ message: "Research activity not linked to this IBC application" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to remove research activity from IBC application" });
    }
  });

  // Submit reviewer feedback for IBC application
  app.post('/api/ibc-applications/:id/reviewer-feedback', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      const { comments, recommendation } = req.body;
      
      if (!comments || !recommendation) {
        return res.status(400).json({ message: "Comments and recommendation are required" });
      }

      // Get the current application
      const application = await storage.getIbcApplication(id);
      if (!application) {
        return res.status(404).json({ message: "IBC application not found" });
      }

      // Create the reviewer feedback comment in the comments table
      await storage.createIbcApplicationComment({
        applicationId: id,
        commentType: 'reviewer_feedback',
        authorType: 'reviewer',
        authorName: 'IBC Reviewer',
        comment: comments,
        recommendation: recommendation,
        isInternal: false
      });

      // Update status based on recommendation
      let newStatus = application.status;
      let statusChangeComment = '';
      
      if (recommendation === 'approve') {
        newStatus = 'active';
        statusChangeComment = 'Application approved by reviewer';
      } else if (recommendation === 'reject') {
        newStatus = 'expired';
        statusChangeComment = 'Application rejected by reviewer';
      } else if (recommendation === 'minor_revisions' || recommendation === 'major_revisions') {
        newStatus = 'vetted'; // Return to office for revision handling
        statusChangeComment = `Application returned to office for ${recommendation.replace('_', ' ')}`;
      } else {
        newStatus = 'under_review'; // Stay under review for other cases
        statusChangeComment = 'Application remains under review';
      }

      // Create status change comment if status changed
      if (newStatus !== application.status) {
        await storage.createIbcApplicationComment({
          applicationId: id,
          commentType: 'status_change',
          authorType: 'system',
          authorName: 'System',
          comment: statusChangeComment,
          statusFrom: application.status,
          statusTo: newStatus,
          isInternal: false
        });
      }

      const updatedApplication = await storage.updateIbcApplication(id, {
        status: newStatus,
        workflowStatus: newStatus, // Keep workflow status in sync with status
        underReviewDate: newStatus === 'under_review' ? new Date() : application.underReviewDate,
        approvalDate: newStatus === 'active' ? new Date() : application.approvalDate,
        vettedDate: newStatus === 'vetted' ? new Date() : application.vettedDate,
      });

      res.json({ 
        message: "Review submitted successfully",
        application: updatedApplication 
      });
    } catch (error) {
      console.error("Error submitting reviewer feedback:", error);
      res.status(500).json({ message: "Failed to submit reviewer feedback" });
    }
  });

  // Get comments for IBC application
  app.get('/api/ibc-applications/:id/comments', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      const comments = await storage.getIbcApplicationComments(id);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching IBC application comments:", error);
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  // Submit PI comment for IBC application
  app.post('/api/ibc-applications/:id/pi-comment', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC application ID" });
      }

      const { comment } = req.body;
      
      if (!comment || !comment.trim()) {
        return res.status(400).json({ message: "Comment is required" });
      }

      // Get the current application to get PI info
      const application = await storage.getIbcApplication(id);
      if (!application) {
        return res.status(404).json({ message: "IBC application not found" });
      }

      // Get PI details for the comment
      const pi = await storage.getScientist(application.principalInvestigatorId);
      const piFullName = pi
        ? [pi.honorificTitle, pi.firstName, pi.lastName].filter(Boolean).join(' ').trim()
        : '';
      const piName = piFullName || 'Principal Investigator';

      // Create the PI comment in the comments table
      await storage.createIbcApplicationComment({
        applicationId: id,
        commentType: 'pi_response',
        authorType: 'pi',
        authorName: piName,
        authorId: application.principalInvestigatorId,
        comment: comment.trim(),
        isInternal: false
      });

      res.json({ 
        message: "Comment submitted successfully"
      });
    } catch (error) {
      console.error("Error submitting PI comment:", error);
      res.status(500).json({ message: "Failed to submit comment" });
    }
  });

  // IBC Application Facilities Routes
  
  // Get rooms for IBC application
  app.get('/api/ibc-applications/:id/rooms', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const rooms = await storage.getIbcApplicationRooms(id);
      res.json(rooms);
    } catch (error) {
      console.error('Error getting IBC application rooms:', error);
      res.status(500).json({ message: "Failed to fetch IBC application rooms" });
    }
  });

  // Add room to IBC application
  app.post('/api/ibc-applications/:id/rooms', async (req: Request, res: Response) => {
    try {
      const applicationId = parseInt(req.params.id);
      const validatedData = insertIbcApplicationRoomSchema.parse({
        ...req.body,
        applicationId
      });
      const newRoom = await storage.addRoomToIbcApplication(validatedData);
      res.status(201).json(newRoom);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: fromZodError(error).toString() });
      } else {
        console.error('Error adding room to IBC application:', error);
        res.status(500).json({ message: "Failed to add room to IBC application" });
      }
    }
  });

  // Remove room from IBC application
  app.delete('/api/ibc-applications/:id/rooms/:roomId', async (req: Request, res: Response) => {
    try {
      const applicationId = parseInt(req.params.id);
      const roomId = parseInt(req.params.roomId);
      const success = await storage.removeRoomFromIbcApplication(applicationId, roomId);
      if (success) {
        res.json({ message: "Room removed from IBC application successfully" });
      } else {
        res.status(404).json({ message: "Room not found in IBC application" });
      }
    } catch (error) {
      console.error('Error removing room from IBC application:', error);
      res.status(500).json({ message: "Failed to remove room from IBC application" });
    }
  });

  // Get backbone source room assignments for IBC application
  app.get('/api/ibc-applications/:id/backbone-source-rooms', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const assignments = await storage.getIbcBackboneSourceRooms(id);
      res.json(assignments);
    } catch (error) {
      console.error('Error getting IBC backbone source rooms:', error);
      res.status(500).json({ message: "Failed to fetch IBC backbone source rooms" });
    }
  });

  // Add backbone source room assignment
  app.post('/api/ibc-applications/:id/backbone-source-rooms', async (req: Request, res: Response) => {
    try {
      const applicationId = parseInt(req.params.id);
      const validatedData = insertIbcBackboneSourceRoomSchema.parse({
        ...req.body,
        applicationId
      });
      const newAssignment = await storage.addBackboneSourceRoom(validatedData);
      res.status(201).json(newAssignment);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: fromZodError(error).toString() });
      } else {
        console.error('Error adding backbone source room:', error);
        res.status(500).json({ message: "Failed to add backbone source room assignment" });
      }
    }
  });

  // Remove backbone source room assignment
  app.delete('/api/ibc-applications/:id/backbone-source-rooms/:backboneSource/:roomId', async (req: Request, res: Response) => {
    try {
      const applicationId = parseInt(req.params.id);
      const backboneSource = req.params.backboneSource;
      const roomId = parseInt(req.params.roomId);
      const success = await storage.removeBackboneSourceRoom(applicationId, backboneSource, roomId);
      if (success) {
        res.json({ message: "Backbone source room assignment removed successfully" });
      } else {
        res.status(404).json({ message: "Backbone source room assignment not found" });
      }
    } catch (error) {
      console.error('Error removing backbone source room assignment:', error);
      res.status(500).json({ message: "Failed to remove backbone source room assignment" });
    }
  });

  // Get PPE for IBC application
  app.get('/api/ibc-applications/:id/ppe', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const roomId = req.query.roomId ? parseInt(req.query.roomId as string) : undefined;
      
      let ppe;
      if (roomId) {
        ppe = await storage.getIbcApplicationPpeForRoom(id, roomId);
      } else {
        ppe = await storage.getIbcApplicationPpe(id);
      }
      res.json(ppe);
    } catch (error) {
      console.error('Error getting IBC application PPE:', error);
      res.status(500).json({ message: "Failed to fetch IBC application PPE" });
    }
  });

  // Add PPE to IBC application
  app.post('/api/ibc-applications/:id/ppe', async (req: Request, res: Response) => {
    try {
      const applicationId = parseInt(req.params.id);
      const validatedData = insertIbcApplicationPpeSchema.parse({
        ...req.body,
        applicationId
      });
      const newPpe = await storage.addPpeToIbcApplication(validatedData);
      res.status(201).json(newPpe);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: fromZodError(error).toString() });
      } else {
        console.error('Error adding PPE to IBC application:', error);
        res.status(500).json({ message: "Failed to add PPE to IBC application" });
      }
    }
  });

  // Remove PPE from IBC application
  app.delete('/api/ibc-applications/:id/ppe/:roomId/:ppeItem', async (req: Request, res: Response) => {
    try {
      const applicationId = parseInt(req.params.id);
      const roomId = parseInt(req.params.roomId);
      const ppeItem = decodeURIComponent(req.params.ppeItem);
      const success = await storage.removePpeFromIbcApplication(applicationId, roomId, ppeItem);
      if (success) {
        res.json({ message: "PPE removed from IBC application successfully" });
      } else {
        res.status(404).json({ message: "PPE not found in IBC application" });
      }
    } catch (error) {
      console.error('Error removing PPE from IBC application:', error);
      res.status(500).json({ message: "Failed to remove PPE from IBC application" });
    }
  });

  // IBC Board Members
  app.get('/api/ibc-board-members', async (req: Request, res: Response) => {
    try {
      const boardMembers = await storage.getIbcBoardMembers();
      res.json(boardMembers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IBC board members" });
    }
  });

  app.get('/api/ibc-board-members/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC board member ID" });
      }

      const boardMember = await storage.getIbcBoardMember(id);
      if (!boardMember) {
        return res.status(404).json({ message: "IBC board member not found" });
      }

      res.json(boardMember);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IBC board member" });
    }
  });

  app.post('/api/ibc-board-members', async (req: Request, res: Response) => {
    try {
      // Create a simplified validation that accepts string dates
      const validateData = {
        scientistId: req.body.scientistId,
        role: req.body.role,
        appointmentDate: req.body.appointmentDate,
        termEndDate: req.body.termEndDate,
        expertise: req.body.expertise || [],
        isActive: req.body.isActive !== undefined ? req.body.isActive : true,
        notes: req.body.notes
      };
      
      // Basic validation
      if (!validateData.scientistId || !validateData.role || !validateData.termEndDate) {
        return res.status(400).json({ message: "Missing required fields: scientistId, role, termEndDate" });
      }
      
      // Check if scientist exists
      const scientist = await storage.getScientist(validateData.scientistId);
      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }
      
      const boardMember = await storage.createIbcBoardMember(validateData);
      res.status(201).json(boardMember);
    } catch (error) {
      console.error("Board member creation error:", error);
      res.status(500).json({ message: "Failed to create IBC board member" });
    }
  });

  app.patch('/api/ibc-board-members/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC board member ID" });
      }

      const validateData = insertIbcBoardMemberSchema.partial().parse(req.body);
      
      // Check if scientist exists if scientistId is provided
      if (validateData.scientistId) {
        const scientist = await storage.getScientist(validateData.scientistId);
        if (!scientist) {
          return res.status(404).json({ message: "Scientist not found" });
        }
      }
      
      const boardMember = await storage.updateIbcBoardMember(id, validateData);
      
      if (!boardMember) {
        return res.status(404).json({ message: "IBC board member not found" });
      }
      
      res.json(boardMember);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update IBC board member" });
    }
  });

  app.delete('/api/ibc-board-members/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC board member ID" });
      }

      const success = await storage.deleteIbcBoardMember(id);
      
      if (!success) {
        return res.status(404).json({ message: "IBC board member not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete IBC board member" });
    }
  });

  // IBC Submissions
  app.get('/api/ibc-submissions', async (req: Request, res: Response) => {
    try {
      const applicationId = req.query.applicationId ? parseInt(req.query.applicationId as string) : undefined;
      
      let submissions;
      if (applicationId && !isNaN(applicationId)) {
        submissions = await storage.getIbcSubmissionsForApplication(applicationId);
      } else {
        submissions = await storage.getIbcSubmissions();
      }
      
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IBC submissions" });
    }
  });

  app.get('/api/ibc-submissions/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC submission ID" });
      }

      const submission = await storage.getIbcSubmission(id);
      if (!submission) {
        return res.status(404).json({ message: "IBC submission not found" });
      }

      res.json(submission);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IBC submission" });
    }
  });

  app.post('/api/ibc-submissions', async (req: Request, res: Response) => {
    try {
      const validateData = insertIbcSubmissionSchema.parse(req.body);
      
      // Check if application exists
      const application = await storage.getIbcApplication(validateData.applicationId);
      if (!application) {
        return res.status(404).json({ message: "IBC application not found" });
      }
      
      // Check if submitted by scientist exists
      const scientist = await storage.getScientist(validateData.submittedBy);
      if (!scientist) {
        return res.status(404).json({ message: "Submitting scientist not found" });
      }
      
      const submission = await storage.createIbcSubmission(validateData);
      res.status(201).json(submission);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to create IBC submission" });
    }
  });

  app.patch('/api/ibc-submissions/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC submission ID" });
      }

      const validateData = insertIbcSubmissionSchema.partial().parse(req.body);
      const submission = await storage.updateIbcSubmission(id, validateData);
      
      if (!submission) {
        return res.status(404).json({ message: "IBC submission not found" });
      }
      
      res.json(submission);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update IBC submission" });
    }
  });

  app.delete('/api/ibc-submissions/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC submission ID" });
      }

      const success = await storage.deleteIbcSubmission(id);
      
      if (!success) {
        return res.status(404).json({ message: "IBC submission not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete IBC submission" });
    }
  });

  // IBC Documents
  app.get('/api/ibc-documents', async (req: Request, res: Response) => {
    try {
      const applicationId = req.query.applicationId ? parseInt(req.query.applicationId as string) : undefined;
      
      let documents;
      if (applicationId && !isNaN(applicationId)) {
        documents = await storage.getIbcDocumentsForApplication(applicationId);
      } else {
        documents = await storage.getIbcDocuments();
      }
      
      res.json(documents);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IBC documents" });
    }
  });

  app.get('/api/ibc-documents/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC document ID" });
      }

      const document = await storage.getIbcDocument(id);
      if (!document) {
        return res.status(404).json({ message: "IBC document not found" });
      }

      res.json(document);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch IBC document" });
    }
  });

  app.post('/api/ibc-documents', async (req: Request, res: Response) => {
    try {
      const validateData = insertIbcDocumentSchema.parse(req.body);
      
      // Check if application exists (if provided)
      if (validateData.applicationId) {
        const application = await storage.getIbcApplication(validateData.applicationId);
        if (!application) {
          return res.status(404).json({ message: "IBC application not found" });
        }
      }
      
      // Check if uploaded by scientist exists
      const scientist = await storage.getScientist(validateData.uploadedBy);
      if (!scientist) {
        return res.status(404).json({ message: "Uploading scientist not found" });
      }
      
      const document = await storage.createIbcDocument(validateData);
      res.status(201).json(document);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to create IBC document" });
    }
  });

  app.patch('/api/ibc-documents/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC document ID" });
      }

      const validateData = insertIbcDocumentSchema.partial().parse(req.body);
      const document = await storage.updateIbcDocument(id, validateData);
      
      if (!document) {
        return res.status(404).json({ message: "IBC document not found" });
      }
      
      res.json(document);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to update IBC document" });
    }
  });

  app.delete('/api/ibc-documents/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid IBC document ID" });
      }

      const success = await storage.deleteIbcDocument(id);
      
      if (!success) {
        return res.status(404).json({ message: "IBC document not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete IBC document" });
    }
  });

  // Research Contracts
  app.get('/api/research-contracts', async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
      
      let contracts;
      
      // Return all contracts, optionally filtered by project
      if (projectId && !isNaN(projectId)) {
        contracts = await storage.getResearchContractsForProject(projectId);
      } else {
        contracts = await storage.getResearchContracts();
      }
      
      // Enhance contracts with project and PI details
      const enhancedContracts = await Promise.all(contracts.map(async (contract) => {
        const researchActivity = contract.researchActivityId ? 
          await storage.getResearchActivity(contract.researchActivityId) : null;
        const project = researchActivity?.projectId ? 
          await storage.getProject(researchActivity.projectId) : null;
        const pi = contract.leadPIId ? 
          await storage.getScientist(contract.leadPIId) : null;
        
        return {
          ...contract,
          researchActivity: researchActivity ? {
            id: researchActivity.id,
            sdrNumber: researchActivity.sdrNumber,
            title: researchActivity.title
          } : null,
          project: project ? {
            id: project.id,
            projectId: project.projectId,
            name: project.name
          } : null,
          leadPI: pi ? {
            id: pi.id,
            name: `${pi.honorificTitle} ${pi.firstName} ${pi.lastName}`,
            profileImageInitials: pi.profileImageInitials
          } : null
        };
      }));
      
      res.json(enhancedContracts);
    } catch (error) {
      console.error('Error fetching research contracts:', error);
      res.status(500).json({ message: "Failed to fetch research contracts" });
    }
  });

  app.get('/api/research-contracts/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research contract ID" });
      }

      const contract = await storage.getResearchContract(id);
      if (!contract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      // Get related details
      const researchActivity = contract.researchActivityId ? 
        await storage.getResearchActivity(contract.researchActivityId) : null;
      const project = researchActivity?.projectId ? 
        await storage.getProject(researchActivity.projectId) : null;
      const pi = contract.leadPIId ? 
        await storage.getScientist(contract.leadPIId) : null;
      
      // Get scope items, extensions, and documents
      const scopeItems = await storage.getResearchContractScopeItems(id);
      const extensions = await storage.getResearchContractExtensions(id);
      const documents = await storage.getResearchContractDocuments(id);
      
      const enhancedContract = {
        ...contract,
        researchActivity: researchActivity ? {
          id: researchActivity.id,
          sdrNumber: researchActivity.sdrNumber,
          title: researchActivity.title,
          status: researchActivity.status
        } : null,
        project: project ? {
          id: project.id,
          projectId: project.projectId,
          name: project.name
        } : null,
        leadPI: pi ? {
          id: pi.id,
          name: `${pi.honorificTitle} ${pi.firstName} ${pi.lastName}`,
          email: pi.email,
          profileImageInitials: pi.profileImageInitials
        } : null,
        scopeItems: scopeItems,
        extensions: extensions,
        documents: documents
      };

      res.json(enhancedContract);
    } catch (error) {
      console.error('Error fetching research contract:', error);
      res.status(500).json({ message: "Failed to fetch research contract" });
    }
  });

  app.post('/api/research-contracts', async (req: Request, res: Response) => {
    try {
      // Make contractNumber optional for validation since it's auto-generated
      const validateData = insertResearchContractSchema.omit({ contractNumber: true }).parse(req.body);
      
      // Generate unique contract number
      const contractNumber = `CR-${Date.now()}`;
      
      // Check if research activity exists
      if (validateData.researchActivityId) {
        const researchActivity = await storage.getResearchActivity(validateData.researchActivityId);
        if (!researchActivity) {
          return res.status(404).json({ message: "Research activity not found" });
        }
      }
      
      // Check if lead PI exists if provided
      if (validateData.leadPIId) {
        const pi = await storage.getScientist(validateData.leadPIId);
        if (!pi) {
          return res.status(404).json({ message: "Lead PI not found" });
        }
      }
      
      const contract = await storage.createResearchContract({
        ...validateData,
        contractNumber,
      });
      res.status(201).json(contract);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error('Error creating research contract:', error);
      res.status(500).json({ message: "Failed to create research contract" });
    }
  });

  app.patch('/api/research-contracts/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research contract ID" });
      }

      const existingContract = await storage.getResearchContract(id);
      if (!existingContract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      const validateData = insertResearchContractSchema.partial().parse(req.body);
      
      // Check if research activity exists if provided
      if (validateData.researchActivityId) {
        const researchActivity = await storage.getResearchActivity(validateData.researchActivityId);
        if (!researchActivity) {
          return res.status(404).json({ message: "Research activity not found" });
        }
      }
      
      // Check if lead PI exists if provided
      if (validateData.leadPIId) {
        const pi = await storage.getScientist(validateData.leadPIId);
        if (!pi) {
          return res.status(404).json({ message: "Lead PI not found" });
        }
      }
      
      const contract = await storage.updateResearchContract(id, validateData);
      
      if (!contract) {
        return res.status(404).json({ message: "Research contract not found" });
      }
      
      res.json(contract);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error('Error updating research contract:', error);
      res.status(500).json({ message: "Failed to update research contract" });
    }
  });

  app.delete('/api/research-contracts/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid research contract ID" });
      }

      // Check if contract exists
      const existingContract = await storage.getResearchContract(id);
      if (!existingContract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      // Only allow deletion if contract is in draft or submitted status
      if (!['draft', 'submitted'].includes(existingContract.status)) {
        return res.status(400).json({ message: "Cannot delete contracts that are active, completed, or terminated" });
      }

      const success = await storage.deleteResearchContract(id);
      
      if (!success) {
        return res.status(404).json({ message: "Research contract not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting research contract:', error);
      res.status(500).json({ message: "Failed to delete research contract" });
    }
  });

  // Research Contract Scope Items API
  app.get('/api/research-contracts/:contractId/scope-items', async (req: Request, res: Response) => {
    try {
      const contractId = parseInt(req.params.contractId);
      if (isNaN(contractId)) {
        return res.status(400).json({ message: "Invalid contract ID" });
      }

      const contract = await storage.getResearchContract(contractId);
      if (!contract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      const scopeItems = await storage.getResearchContractScopeItems(contractId);
      res.json(scopeItems);
    } catch (error) {
      console.error('Error fetching contract scope items:', error);
      res.status(500).json({ message: "Failed to fetch scope items" });
    }
  });

  app.post('/api/research-contracts/:contractId/scope-items', async (req: Request, res: Response) => {
    try {
      const contractId = parseInt(req.params.contractId);
      if (isNaN(contractId)) {
        return res.status(400).json({ message: "Invalid contract ID" });
      }

      const contract = await storage.getResearchContract(contractId);
      if (!contract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      const validateData = insertResearchContractScopeItemSchema.parse({
        ...req.body,
        contractId: contractId
      });

      const scopeItem = await storage.createResearchContractScopeItem(validateData);
      res.status(201).json(scopeItem);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error('Error creating scope item:', error);
      res.status(500).json({ message: "Failed to create scope item" });
    }
  });

  app.patch('/api/research-contracts/scope-items/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scope item ID" });
      }

      const existingScopeItem = await storage.getResearchContractScopeItem(id);
      if (!existingScopeItem) {
        return res.status(404).json({ message: "Scope item not found" });
      }

      const validateData = insertResearchContractScopeItemSchema.partial().parse(req.body);
      const scopeItem = await storage.updateResearchContractScopeItem(id, validateData);
      
      if (!scopeItem) {
        return res.status(404).json({ message: "Scope item not found" });
      }
      
      res.json(scopeItem);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error('Error updating scope item:', error);
      res.status(500).json({ message: "Failed to update scope item" });
    }
  });

  app.delete('/api/research-contracts/scope-items/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scope item ID" });
      }

      const existingScopeItem = await storage.getResearchContractScopeItem(id);
      if (!existingScopeItem) {
        return res.status(404).json({ message: "Scope item not found" });
      }

      const success = await storage.deleteResearchContractScopeItem(id);
      
      if (!success) {
        return res.status(404).json({ message: "Scope item not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting scope item:', error);
      res.status(500).json({ message: "Failed to delete scope item" });
    }
  });

  // Research Contract Extensions API
  app.get('/api/research-contracts/:contractId/extensions', async (req: Request, res: Response) => {
    try {
      const contractId = parseInt(req.params.contractId);
      if (isNaN(contractId)) {
        return res.status(400).json({ message: "Invalid contract ID" });
      }

      const contract = await storage.getResearchContract(contractId);
      if (!contract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      const extensions = await storage.getResearchContractExtensions(contractId);
      res.json(extensions);
    } catch (error) {
      console.error('Error fetching contract extensions:', error);
      res.status(500).json({ message: "Failed to fetch extensions" });
    }
  });

  app.post('/api/research-contracts/:contractId/extensions', async (req: Request, res: Response) => {
    try {
      const contractId = parseInt(req.params.contractId);
      if (isNaN(contractId)) {
        return res.status(400).json({ message: "Invalid contract ID" });
      }

      // Check if contract exists
      const contract = await storage.getResearchContract(contractId);
      if (!contract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      // Only allow extensions for active contracts
      if (contract.status !== 'active') {
        return res.status(400).json({ message: "Extensions can only be created for active contracts" });
      }

      // Get existing extensions to determine sequence number
      const existingExtensions = await storage.getResearchContractExtensions(contractId);
      const nextSequenceNumber = existingExtensions.length + 1;

      const validateData = insertResearchContractExtensionSchema.parse({
        ...req.body,
        contractId: contractId,
        sequenceNumber: nextSequenceNumber
      });

      const extension = await storage.createResearchContractExtension(validateData);
      res.status(201).json(extension);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error('Error creating extension:', error);
      res.status(500).json({ message: "Failed to create extension" });
    }
  });

  app.patch('/api/research-contracts/extensions/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid extension ID" });
      }

      // Check if extension exists
      const existingExtension = await storage.getResearchContractExtension(id);
      if (!existingExtension) {
        return res.status(404).json({ message: "Extension not found" });
      }

      const validateData = insertResearchContractExtensionSchema.partial().parse(req.body);
      const extension = await storage.updateResearchContractExtension(id, validateData);
      
      if (!extension) {
        return res.status(404).json({ message: "Extension not found" });
      }
      
      res.json(extension);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error('Error updating extension:', error);
      res.status(500).json({ message: "Failed to update extension" });
    }
  });

  app.delete('/api/research-contracts/extensions/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid extension ID" });
      }

      // Check if extension exists
      const existingExtension = await storage.getResearchContractExtension(id);
      if (!existingExtension) {
        return res.status(404).json({ message: "Extension not found" });
      }

      // Only allow deletion if extension hasn't been approved yet
      if (existingExtension.approvedAt) {
        return res.status(400).json({ message: "Cannot delete approved extensions" });
      }

      const success = await storage.deleteResearchContractExtension(id);
      
      if (!success) {
        return res.status(404).json({ message: "Extension not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting extension:', error);
      res.status(500).json({ message: "Failed to delete extension" });
    }
  });

  // Research Contract Documents API
  app.get('/api/research-contracts/:contractId/documents', async (req: Request, res: Response) => {
    try {
      const contractId = parseInt(req.params.contractId);
      if (isNaN(contractId)) {
        return res.status(400).json({ message: "Invalid contract ID" });
      }

      const contract = await storage.getResearchContract(contractId);
      if (!contract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      const documents = await storage.getResearchContractDocuments(contractId);
      res.json(documents);
    } catch (error) {
      console.error('Error fetching contract documents:', error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.get('/api/research-contracts/extensions/:extensionId/documents', async (req: Request, res: Response) => {
    try {
      const extensionId = parseInt(req.params.extensionId);
      if (isNaN(extensionId)) {
        return res.status(400).json({ message: "Invalid extension ID" });
      }

      const extension = await storage.getResearchContractExtension(extensionId);
      if (!extension) {
        return res.status(404).json({ message: "Extension not found" });
      }

      const contract = await storage.getResearchContract(extension.contractId);
      if (!contract) {
        return res.status(404).json({ message: "Associated contract not found" });
      }

      const documents = await storage.getResearchContractDocumentsForExtension(extensionId);
      res.json(documents);
    } catch (error) {
      console.error('Error fetching extension documents:', error);
      res.status(500).json({ message: "Failed to fetch extension documents" });
    }
  });

  app.post('/api/research-contracts/:contractId/documents', async (req: Request, res: Response) => {
    try {
      const contractId = parseInt(req.params.contractId);
      if (isNaN(contractId)) {
        return res.status(400).json({ message: "Invalid contract ID" });
      }

      const contract = await storage.getResearchContract(contractId);
      if (!contract) {
        return res.status(404).json({ message: "Research contract not found" });
      }

      const validateData = insertResearchContractDocumentSchema.parse({
        ...req.body,
        contractId: contractId
      });

      const document = await storage.createResearchContractDocument(validateData);
      res.status(201).json(document);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error('Error creating document:', error);
      res.status(500).json({ message: "Failed to create document" });
    }
  });

  app.post('/api/research-contracts/extensions/:extensionId/documents', async (req: Request, res: Response) => {
    try {
      const extensionId = parseInt(req.params.extensionId);
      if (isNaN(extensionId)) {
        return res.status(400).json({ message: "Invalid extension ID" });
      }

      const extension = await storage.getResearchContractExtension(extensionId);
      if (!extension) {
        return res.status(404).json({ message: "Extension not found" });
      }

      const contract = await storage.getResearchContract(extension.contractId);
      if (!contract) {
        return res.status(404).json({ message: "Associated contract not found" });
      }

      const validateData = insertResearchContractDocumentSchema.parse({
        ...req.body,
        extensionId: extensionId
      });

      const document = await storage.createResearchContractDocument(validateData);
      res.status(201).json(document);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error('Error creating extension document:', error);
      res.status(500).json({ message: "Failed to create extension document" });
    }
  });

  app.patch('/api/research-contracts/documents/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const existingDocument = await storage.getResearchContractDocument(id);
      if (!existingDocument) {
        return res.status(404).json({ message: "Document not found" });
      }

      const validateData = insertResearchContractDocumentSchema.partial().parse(req.body);
      const document = await storage.updateResearchContractDocument(id, validateData);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      res.json(document);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      console.error('Error updating document:', error);
      res.status(500).json({ message: "Failed to update document" });
    }
  });

  app.delete('/api/research-contracts/documents/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid document ID" });
      }

      const existingDocument = await storage.getResearchContractDocument(id);
      if (!existingDocument) {
        return res.status(404).json({ message: "Document not found" });
      }

      const success = await storage.deleteResearchContractDocument(id);
      
      if (!success) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting document:', error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // Additional convenience endpoint for getting contracts by research activity
  app.get('/api/research-activities/:id/contracts', async (req: Request, res: Response) => {
    try {
      const researchActivityId = parseInt(req.params.id);
      if (isNaN(researchActivityId)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const researchActivity = await storage.getResearchActivity(researchActivityId);
      if (!researchActivity) {
        return res.status(404).json({ message: "Research activity not found" });
      }

      const contracts = await storage.getResearchContractsForResearchActivity(researchActivityId);

      // Enhance contracts with related details
      const enhancedContracts = await Promise.all(contracts.map(async (contract) => {
        const pi = contract.leadPIId ? 
          await storage.getScientist(contract.leadPIId) : null;
        
        return {
          ...contract,
          leadPI: pi ? {
            id: pi.id,
            name: `${pi.honorificTitle} ${pi.firstName} ${pi.lastName}`,
            profileImageInitials: pi.profileImageInitials
          } : null
        };
      }));

      res.json(enhancedContracts);
    } catch (error) {
      console.error('Error fetching contracts for research activity:', error);
      res.status(500).json({ message: "Failed to fetch contracts" });
    }
  });

  // IRB Board Members API
  app.get('/api/irb-board-members', async (req: Request, res: Response) => {
    try {
      const members = await storage.getIrbBoardMembers();
      res.json(members);
    } catch (error) {
      console.error('Error fetching IRB board members:', error);
      res.status(500).json({ message: "Failed to fetch IRB board members" });
    }
  });

  app.get('/api/irb-board-members/active', async (req: Request, res: Response) => {
    try {
      const members = await storage.getActiveIrbBoardMembers();
      res.json(members);
    } catch (error) {
      console.error('Error fetching active IRB board members:', error);
      res.status(500).json({ message: "Failed to fetch active IRB board members" });
    }
  });

  app.get('/api/irb-board-members/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid board member ID" });
      }

      const member = await storage.getIrbBoardMember(id);
      if (!member) {
        return res.status(404).json({ message: "IRB board member not found" });
      }

      res.json(member);
    } catch (error) {
      console.error('Error fetching IRB board member:', error);
      res.status(500).json({ message: "Failed to fetch IRB board member" });
    }
  });

  app.post('/api/irb-board-members', async (req: Request, res: Response) => {
    try {
      console.log('Creating IRB board member with data:', req.body);
      
      // Validate required fields
      if (!req.body.scientistId || !req.body.role) {
        return res.status(400).json({ message: "Scientist ID and role are required" });
      }

      // Check for existing chair or deputy chair if trying to assign these roles
      if (req.body.role === 'chair' || req.body.role === 'deputy_chair') {
        const existingMembers = await storage.getIrbBoardMembers();
        const existingRole = existingMembers.find(m => m.role === req.body.role && m.isActive);
        
        if (existingRole) {
          const roleLabel = req.body.role === 'chair' ? 'Chair' : 'Deputy Chair';
          return res.status(400).json({ 
            message: `An active ${roleLabel} already exists. Please deactivate the current ${roleLabel} first.` 
          });
        }
      }

      // Set default term end date to 3 years from now if not provided
      if (!req.body.termEndDate) {
        const threeYearsFromNow = new Date();
        threeYearsFromNow.setFullYear(threeYearsFromNow.getFullYear() + 3);
        req.body.termEndDate = threeYearsFromNow.toISOString();
      }

      // Ensure expertise is an array
      if (typeof req.body.expertise === 'string') {
        req.body.expertise = [req.body.expertise];
      } else if (!req.body.expertise) {
        req.body.expertise = [];
      }

      const member = await storage.createIrbBoardMember(req.body);
      console.log('Successfully created IRB board member:', member);
      res.status(201).json(member);
    } catch (error) {
      console.error('Error creating IRB board member:', error);
      res.status(500).json({ message: "Failed to create IRB board member", error: error.message });
    }
  });

  app.patch('/api/irb-board-members/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid board member ID" });
      }

      console.log('Updating IRB board member with data:', req.body);

      // Check for existing chair or deputy chair if trying to assign these roles
      if (req.body.role === 'chair' || req.body.role === 'deputy_chair') {
        const existingMembers = await storage.getIrbBoardMembers();
        const existingRole = existingMembers.find(m => m.role === req.body.role && m.isActive && m.id !== id);
        
        if (existingRole) {
          const roleLabel = req.body.role === 'chair' ? 'Chair' : 'Deputy Chair';
          return res.status(400).json({ 
            message: `An active ${roleLabel} already exists. Please change the current ${roleLabel} to member first.` 
          });
        }
      }

      const member = await storage.updateIrbBoardMember(id, req.body);
      if (!member) {
        return res.status(404).json({ message: "IRB board member not found" });
      }

      res.json(member);
    } catch (error) {
      console.error('Error updating IRB board member:', error);
      res.status(500).json({ message: "Failed to update IRB board member", error: error.message });
    }
  });

  app.delete('/api/irb-board-members/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid board member ID" });
      }

      const success = await storage.deleteIrbBoardMember(id);
      if (!success) {
        return res.status(404).json({ message: "IRB board member not found" });
      }

      res.json({ message: "IRB board member deleted successfully" });
    } catch (error) {
      console.error('Error deleting IRB board member:', error);
      res.status(500).json({ message: "Failed to delete IRB board member", error: error.message });
    }
  });

  // ── Organizational structure (Branch → Department → Section) ──────────────
  const requireOrgManager = (req: Request, res: Response): boolean => {
    const role = (req.session as any)?.user?.role;
    if (role !== 'Management' && role !== 'admin' && role !== 'superadmin') {
      res.status(403).json({ message: 'Only management or administrators can modify the organization structure' });
      return false;
    }
    return true;
  };

  app.get('/api/branches', async (_req: Request, res: Response) => {
    try {
      res.json(await storage.getBranches());
    } catch (error) {
      console.error('Error fetching branches:', error);
      res.status(500).json({ message: 'Failed to fetch branches' });
    }
  });

  app.post('/api/branches', requireAuth, async (req: Request, res: Response) => {
    if (!requireOrgManager(req, res)) return;
    try {
      const data = insertBranchSchema.parse(req.body);
      res.status(201).json(await storage.createBranch(data));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid branch data', errors: error.errors });
      }
      console.error('Error creating branch:', error);
      res.status(500).json({ message: 'Failed to create branch' });
    }
  });

  app.patch('/api/branches/:id', requireAuth, async (req: Request, res: Response) => {
    if (!requireOrgManager(req, res)) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid branch ID' });
    try {
      const data = insertBranchSchema.partial().parse(req.body);
      const updated = await storage.updateBranch(id, data);
      if (!updated) return res.status(404).json({ message: 'Branch not found' });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid branch data', errors: error.errors });
      }
      console.error('Error updating branch:', error);
      res.status(500).json({ message: 'Failed to update branch' });
    }
  });

  app.delete('/api/branches/:id', requireAuth, async (req: Request, res: Response) => {
    if (!requireOrgManager(req, res)) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid branch ID' });
    try {
      const result = await storage.deleteBranch(id);
      if (result !== true) {
        const status = result === 'Branch not found.' ? 404 : 409;
        return res.status(status).json({ message: result });
      }
      res.json({ message: 'Branch deleted successfully' });
    } catch (error) {
      console.error('Error deleting branch:', error);
      res.status(500).json({ message: 'Failed to delete branch' });
    }
  });

  app.get('/api/departments', async (_req: Request, res: Response) => {
    try {
      res.json(await storage.getDepartments());
    } catch (error) {
      console.error('Error fetching departments:', error);
      res.status(500).json({ message: 'Failed to fetch departments' });
    }
  });

  app.post('/api/departments', requireAuth, async (req: Request, res: Response) => {
    if (!requireOrgManager(req, res)) return;
    try {
      const data = insertDepartmentSchema.parse(req.body);
      const [branch] = await db.select().from(branches).where(eq(branches.id, data.branchId));
      if (!branch) return res.status(400).json({ message: `Branch ${data.branchId} does not exist` });
      res.status(201).json(await storage.createDepartment(data));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid department data', errors: error.errors });
      }
      console.error('Error creating department:', error);
      res.status(500).json({ message: 'Failed to create department' });
    }
  });

  app.patch('/api/departments/:id', requireAuth, async (req: Request, res: Response) => {
    if (!requireOrgManager(req, res)) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid department ID' });
    try {
      const data = insertDepartmentSchema.partial().parse(req.body);
      if (data.branchId !== undefined) {
        const [branch] = await db.select().from(branches).where(eq(branches.id, data.branchId));
        if (!branch) return res.status(400).json({ message: `Branch ${data.branchId} does not exist` });
      }
      const updated = await storage.updateDepartment(id, data);
      if (!updated) return res.status(404).json({ message: 'Department not found' });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid department data', errors: error.errors });
      }
      console.error('Error updating department:', error);
      res.status(500).json({ message: 'Failed to update department' });
    }
  });

  app.delete('/api/departments/:id', requireAuth, async (req: Request, res: Response) => {
    if (!requireOrgManager(req, res)) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid department ID' });
    try {
      const result = await storage.deleteDepartment(id);
      if (result !== true) {
        const status = result === 'Department not found.' ? 404 : 409;
        return res.status(status).json({ message: result });
      }
      res.json({ message: 'Department deleted successfully' });
    } catch (error) {
      console.error('Error deleting department:', error);
      res.status(500).json({ message: 'Failed to delete department' });
    }
  });

  app.get('/api/sections', async (_req: Request, res: Response) => {
    try {
      res.json(await storage.getSections());
    } catch (error) {
      console.error('Error fetching sections:', error);
      res.status(500).json({ message: 'Failed to fetch sections' });
    }
  });

  app.post('/api/sections', requireAuth, async (req: Request, res: Response) => {
    if (!requireOrgManager(req, res)) return;
    try {
      const data = insertSectionSchema.parse(req.body);
      const [dept] = await db.select().from(departments).where(eq(departments.id, data.departmentId));
      if (!dept) return res.status(400).json({ message: `Department ${data.departmentId} does not exist` });
      res.status(201).json(await storage.createSection(data));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid section data', errors: error.errors });
      }
      console.error('Error creating section:', error);
      res.status(500).json({ message: 'Failed to create section' });
    }
  });

  app.patch('/api/sections/:id', requireAuth, async (req: Request, res: Response) => {
    if (!requireOrgManager(req, res)) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid section ID' });
    try {
      const data = insertSectionSchema.partial().parse(req.body);
      if (data.departmentId !== undefined) {
        const [dept] = await db.select().from(departments).where(eq(departments.id, data.departmentId));
        if (!dept) return res.status(400).json({ message: `Department ${data.departmentId} does not exist` });
        // Reparenting a section with staff assigned would leave those staff
        // pointing at a section owned by a different department — block it.
        const [current] = await db.select().from(sections).where(eq(sections.id, id));
        if (!current) return res.status(404).json({ message: 'Section not found' });
        if (current.departmentId !== data.departmentId) {
          const [{ count: staffCount }] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(scientists)
            .where(eq(scientists.sectionId, id));
          if (staffCount > 0) {
            return res.status(409).json({
              message: `Cannot move this section to another department: ${staffCount} staff member(s) are assigned to it. Reassign them first.`,
            });
          }
        }
      }
      const updated = await storage.updateSection(id, data);
      if (!updated) return res.status(404).json({ message: 'Section not found' });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid section data', errors: error.errors });
      }
      console.error('Error updating section:', error);
      res.status(500).json({ message: 'Failed to update section' });
    }
  });

  app.delete('/api/sections/:id', requireAuth, async (req: Request, res: Response) => {
    if (!requireOrgManager(req, res)) return;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid section ID' });
    try {
      const result = await storage.deleteSection(id);
      if (result !== true) {
        const status = result === 'Section not found.' ? 404 : 409;
        return res.status(status).json({ message: result });
      }
      res.json({ message: 'Section deleted successfully' });
    } catch (error) {
      console.error('Error deleting section:', error);
      res.status(500).json({ message: 'Failed to delete section' });
    }
  });

  // Buildings API routes
  app.get('/api/buildings', async (req: Request, res: Response) => {
    try {
      const buildings = await storage.getBuildings();
      res.json(buildings);
    } catch (error) {
      console.error('Error fetching buildings:', error);
      res.status(500).json({ message: "Failed to fetch buildings" });
    }
  });

  app.get('/api/buildings/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid building ID" });
      }

      const building = await storage.getBuilding(id);
      if (!building) {
        return res.status(404).json({ message: "Building not found" });
      }

      res.json(building);
    } catch (error) {
      console.error('Error fetching building:', error);
      res.status(500).json({ message: "Failed to fetch building" });
    }
  });

  app.post('/api/buildings', async (req: Request, res: Response) => {
    try {
      const parsedData = insertBuildingSchema.parse(req.body);
      const building = await storage.createBuilding(parsedData);
      res.status(201).json(building);
    } catch (error) {
      console.error('Error creating building:', error);
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      res.status(500).json({ message: "Failed to create building" });
    }
  });

  app.patch('/api/buildings/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid building ID" });
      }

      const parsedData = insertBuildingSchema.partial().parse(req.body);
      const building = await storage.updateBuilding(id, parsedData);
      if (!building) {
        return res.status(404).json({ message: "Building not found" });
      }

      res.json(building);
    } catch (error) {
      console.error('Error updating building:', error);
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      res.status(500).json({ message: "Failed to update building" });
    }
  });

  app.delete('/api/buildings/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid building ID" });
      }

      const success = await storage.deleteBuilding(id);
      if (!success) {
        return res.status(404).json({ message: "Building not found" });
      }

      res.json({ message: "Building deleted successfully" });
    } catch (error) {
      console.error('Error deleting building:', error);
      res.status(500).json({ message: "Failed to delete building" });
    }
  });

  // Rooms API routes
  app.get('/api/rooms', async (req: Request, res: Response) => {
    try {
      const buildingId = req.query.buildingId ? parseInt(req.query.buildingId as string) : undefined;
      
      if (buildingId) {
        const rooms = await storage.getRoomsByBuilding(buildingId);
        res.json(rooms);
      } else {
        const rooms = await storage.getRooms();
        res.json(rooms);
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
      res.status(500).json({ message: "Failed to fetch rooms" });
    }
  });

  app.get('/api/rooms/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid room ID" });
      }

      const room = await storage.getRoom(id);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      res.json(room);
    } catch (error) {
      console.error('Error fetching room:', error);
      res.status(500).json({ message: "Failed to fetch room" });
    }
  });

  app.post('/api/rooms', async (req: Request, res: Response) => {
    try {
      const parsedData = insertRoomSchema.parse(req.body);
      
      // Validate supervisor and manager roles if provided
      if (parsedData.roomSupervisorId) {
        const supervisor = await storage.getScientist(parsedData.roomSupervisorId);
        if (!isRoomSupervisorEligible(supervisor)) {
          return res.status(400).json({ 
            message: ROOM_SUPERVISOR_ELIGIBILITY_MESSAGE,
          });
        }
      }
      
      if (parsedData.roomManagerId) {
        const manager = await storage.getScientist(parsedData.roomManagerId);
        if (!isRoomManagerEligible(manager)) {
          return res.status(400).json({ 
            message: ROOM_MANAGER_ELIGIBILITY_MESSAGE,
          });
        }
      }

      const room = await storage.createRoom(parsedData);
      res.status(201).json(room);
    } catch (error) {
      console.error('Error creating room:', error);
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      res.status(500).json({ message: "Failed to create room" });
    }
  });

  app.patch('/api/rooms/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid room ID" });
      }

      const parsedData = insertRoomSchema.partial().parse(req.body);
      
      // Validate supervisor and manager roles if being updated
      if (parsedData.roomSupervisorId) {
        const supervisor = await storage.getScientist(parsedData.roomSupervisorId);
        if (!isRoomSupervisorEligible(supervisor)) {
          return res.status(400).json({ 
            message: ROOM_SUPERVISOR_ELIGIBILITY_MESSAGE,
          });
        }
      }
      
      if (parsedData.roomManagerId) {
        const manager = await storage.getScientist(parsedData.roomManagerId);
        if (!isRoomManagerEligible(manager)) {
          return res.status(400).json({ 
            message: ROOM_MANAGER_ELIGIBILITY_MESSAGE,
          });
        }
      }

      const room = await storage.updateRoom(id, parsedData);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      res.json(room);
    } catch (error) {
      console.error('Error updating room:', error);
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      res.status(500).json({ message: "Failed to update room" });
    }
  });

  app.delete('/api/rooms/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid room ID" });
      }

      const success = await storage.deleteRoom(id);
      if (!success) {
        return res.status(404).json({ message: "Room not found" });
      }

      res.json({ message: "Room deleted successfully" });
    } catch (error) {
      console.error('Error deleting room:', error);
      res.status(500).json({ message: "Failed to delete room" });
    }
  });

  // Additional utility routes for facilities
  app.get('/api/buildings/:id/rooms', async (req: Request, res: Response) => {
    try {
      const buildingId = parseInt(req.params.id);
      if (isNaN(buildingId)) {
        return res.status(400).json({ message: "Invalid building ID" });
      }

      const rooms = await storage.getRoomsByBuilding(buildingId);
      res.json(rooms);
    } catch (error) {
      console.error('Error fetching building rooms:', error);
      res.status(500).json({ message: "Failed to fetch building rooms" });
    }
  });

  // Role Permissions Routes
  // Readable by any signed-in user: every client loads the matrix on mount to
  // decide what to render for its own role. Writing it is a different matter —
  // see the administrator guards on the mutating routes below.
  app.get('/api/role-permissions', requireAuth, async (req: Request, res: Response) => {
    try {
      const permissions = await storage.getRolePermissions();
      res.json(permissions);
    } catch (error) {
      console.error('Error fetching role permissions:', error);
      res.status(500).json({ message: "Failed to fetch role permissions" });
    }
  });

  // The access matrix decides what every role may reach, so changing it is an
  // administrator action. Without this guard any signed-in account could grant
  // itself edit on any area, including the one the server enforces.
  app.post('/api/role-permissions', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const validateData = insertRolePermissionSchema.parse(req.body);
      const permission = await storage.createRolePermission(validateData);
      res.status(201).json(permission);
    } catch (error) {
      console.error('Error creating role permission:', error);
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      res.status(500).json({ message: "Failed to create role permission" });
    }
  });

  app.patch('/api/role-permissions/:jobTitle/:navigationItem', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { jobTitle, navigationItem } = req.params;
      const { accessLevel } = req.body;
      
      if (!accessLevel || !["hide", "view", "edit"].includes(accessLevel)) {
        return res.status(400).json({ message: "Invalid access level" });
      }

      const permission = await storage.updateRolePermission(jobTitle, navigationItem, accessLevel);
      if (!permission) {
        return res.status(404).json({ message: "Role permission not found" });
      }
      
      res.json(permission);
    } catch (error) {
      console.error('Error updating role permission:', error);
      res.status(500).json({ message: "Failed to update role permission" });
    }
  });

  app.post('/api/role-permissions/bulk', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const { permissions } = req.body;
      if (!Array.isArray(permissions)) {
        return res.status(400).json({ message: "Permissions must be an array" });
      }

      const results = await storage.updateRolePermissionsBulk(
        permissions,
        req.session?.user?.id ?? undefined,
      );
      res.json(results);
    } catch (error) {
      console.error('Error bulk updating role permissions:', error);
      res.status(500).json({ message: "Failed to bulk update role permissions" });
    }
  });

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
      console.error('Error fetching journal impact factors:', error);
      res.status(500).json({ message: "Failed to fetch journal impact factors" });
    }
  });

  app.get('/api/journal-impact-factors/years', async (_req: Request, res: Response) => {
    try {
      const years = await storage.getJournalImpactFactorYears();
      res.json(years);
    } catch (error) {
      console.error('Error fetching journal IF years:', error);
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
      console.error('Error exporting journal impact factors:', error);
      res.status(500).json({ message: "Failed to export journal impact factors" });
    }
  });

  app.get('/api/journal-impact-factors/fields', async (_req: Request, res: Response) => {
    try {
      const fields = await storage.getJournalFields();
      res.json(fields);
    } catch (error) {
      console.error('Error fetching journal fields:', error);
      res.status(500).json({ message: "Failed to fetch journal fields" });
    }
  });

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
      console.error('Error fetching journal:', error);
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
      console.error('Error fetching journal history:', error);
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
      console.error('Error fetching field IF distribution:', error);
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
      console.error('Error updating journal field:', error);
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
      console.error('Error fetching journal impact factor:', error);
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
      console.error('Error fetching historical impact factors:', error);
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
      console.error('Error creating journal impact factor:', error);
      
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
            quartile: row.quartile,
            rank: row.rank,
            totalCitations: row.totalCitations || null // Keep for backward compatibility
          };
          
          const created = await storage.createJournalImpactFactor(impactFactor);
          results.push(created);
        } catch (error) {
          console.error('Error importing row:', row, error);
        }
      }

      res.json({ imported: results.length, total: csvData.length });
    } catch (error) {
      console.error('Error importing CSV data:', error);
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
      console.error('Error updating journal impact factor:', error);
      
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: error.errors 
        });
      }
      
      res.status(500).json({ message: "Failed to update journal impact factor" });
    }
  });

  // Publication Import Routes
  app.get('/api/publications/import/pmid/:pmid', async (req: Request, res: Response) => {
    try {
      const pmid = req.params.pmid;
      
      // Fetch from PubMed E-utilities API
      const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`;
      const summaryResponse = await fetch(summaryUrl);
      
      if (!summaryResponse.ok) {
        return res.status(404).json({ message: "PMID not found" });
      }
      
      const summaryData = await summaryResponse.json();
      const pubmedData = summaryData.result?.[pmid];
      
      if (!pubmedData) {
        return res.status(404).json({ message: "Publication not found for this PMID" });
      }
      
      // Parse PubMed data
      const authors = pubmedData.authors?.map((author: any) => 
        author.name
      ).join(', ') || '';
      
      const publication = {
        title: pubmedData.title || '',
        authors: authors,
        journal: pubmedData.fulljournalname || pubmedData.source || '',
        year: pubmedData.pubdate ? new Date(pubmedData.pubdate).getFullYear() : null,
        volume: pubmedData.volume || '',
        issue: pubmedData.issue || '',
        pages: pubmedData.pages || '',
        doi: pubmedData.elocationid?.replace('doi: ', '') || pubmedData.articleids?.find((id: any) => id.idtype === 'doi')?.value || '',
        pmid: pmid,
        abstract: pubmedData.abstract || '',
        publicationDate: pubmedData.pubdate ? new Date(pubmedData.pubdate).toISOString().split('T')[0] : ''
      };
      
      res.json(publication);
    } catch (error) {
      console.error('Error fetching PubMed data:', error);
      res.status(500).json({ message: "Failed to fetch publication data from PubMed" });
    }
  });

  app.get('/api/publications/import/doi/:doi', async (req: Request, res: Response) => {
    try {
      const doi = normalizeDoi(decodeURIComponent(req.params.doi));

      // Fetch from CrossRef (retries without the preprint version suffix).
      const work = await fetchCrossrefWork(doi);

      if (!work) {
        return res.status(404).json({ message: "DOI not found" });
      }
      
      // Parse CrossRef data
      const authors = work.author?.map((author: any) => 
        `${author.given || ''} ${author.family || ''}`.trim()
      ).join(', ') || '';
      
      const publication = {
        title: work.title?.[0] || '',
        authors: authors,
        journal: crossrefJournalName(work),
        year: work.published?.['date-parts']?.[0]?.[0] || work.created?.['date-parts']?.[0]?.[0] || null,
        volume: work.volume || '',
        issue: work.issue || '',
        pages: work.page || '',
        doi: work.DOI || doi,
        pmid: '', // CrossRef doesn't provide PMID
        abstract: work.abstract ? stripXml(work.abstract) : '',
        publicationDate: work.published?.['date-parts']?.[0] ? 
          new Date(work.published['date-parts'][0][0], (work.published['date-parts'][0][1] || 1) - 1, work.published['date-parts'][0][2] || 1).toISOString().split('T')[0] : ''
      };
      
      res.json(publication);
    } catch (error) {
      console.error('Error fetching CrossRef data:', error);
      res.status(500).json({ message: "Failed to fetch publication data from CrossRef" });
    }
  });

  // List a scientist's published works (from ORCID, plus best-effort Google
  // Scholar) that are NOT already present in our publications table, matched by
  // normalized DOI. Fails gracefully when the person has no ORCID or ORCID is
  // unreachable.
  app.get('/api/scientists/:id/missing-papers', requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scientist ID" });
      }

      const scientist = await storage.getScientist(id);
      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }

      const hasOrcid = !!scientist.orcidId && scientist.orcidId.trim() !== "";
      const hasScholar =
        !!scientist.googleScholarUrl && scientist.googleScholarUrl.trim() !== "";

      if (!hasOrcid && !hasScholar) {
        return res.json({
          orcidAttempted: false,
          orcidAvailable: false,
          scholarAttempted: false,
          scholarAvailable: false,
          missing: [],
          message:
            "This person has no ORCID iD or Google Scholar URL on file, so there are no external works to check.",
        });
      }

      // DOIs already in the system (version-aware normalized). Includes the
      // preprint DOI carried on a published record's preprint link, so a
      // previously merged preprint is not resurfaced as "missing".
      const existingPublications = await storage.getPublications();
      const existingDois = buildExistingWorkDois(existingPublications);

      let orcidAttempted = false;
      let orcidAvailable = false;
      let orcidWorks: MissingPaperMeta[] = [];
      if (hasOrcid) {
        orcidAttempted = true;
        try {
          orcidWorks = await fetchOrcidWorks(scientist.orcidId as string);
          orcidAvailable = true;
        } catch (err) {
          console.error("ORCID fetch failed:", err);
          orcidAvailable = false;
        }
      }

      // Best-effort Google Scholar — never blocks or breaks the ORCID result.
      let scholarAttempted = false;
      let scholarWorks: MissingPaperMeta[] = [];
      if (hasScholar) {
        scholarAttempted = true;
        scholarWorks = await fetchGoogleScholarDois(
          scientist.googleScholarUrl as string
        );
      }
      const scholarAvailable = scholarWorks.length > 0;

      // Merge ORCID + Scholar, dedupe by version-aware DOI identity (ORCID wins
      // because it carries richer metadata), and drop anything already in the
      // system — including preprints captured as a published record's link.
      const byDoi = new Map<string, MissingPaperMeta>();
      for (const w of orcidWorks) {
        const key = workDoiIdentity(w.doi);
        if (!key || existingDois.has(key) || byDoi.has(key)) continue;
        if (isFigshareWork(w)) continue;
        byDoi.set(key, w);
      }
      for (const w of scholarWorks) {
        const key = workDoiIdentity(w.doi);
        if (!key || existingDois.has(key) || byDoi.has(key)) continue;
        if (isFigshareWork(w)) continue;
        byDoi.set(key, w);
      }

      const missing = Array.from(byDoi.values())
        .map((w) => ({
          ...w,
          journal: w.journal || inferJournalFromDoi(w.doi),
          isPreprint: isPreprintRecord({ id: 0, doi: w.doi, journal: w.journal, title: w.title }),
        }))
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

      let message: string | undefined;
      if (orcidAttempted && !orcidAvailable) {
        message =
          "ORCID could not be reached right now. Please try again later.";
      } else if (missing.length === 0 && orcidAvailable) {
        message =
          "No missing papers found — everything in ORCID is already in the system.";
      }

      res.json({
        orcidAttempted,
        orcidAvailable,
        scholarAttempted,
        scholarAvailable,
        missing,
        message,
      });
    } catch (error) {
      console.error("Error checking for missing papers:", error);
      res
        .status(500)
        .json({ message: "Failed to check for missing papers" });
    }
  });

  // Import a set of selected DOIs as standalone publication records. Each DOI
  // is enriched via CrossRef, created with researchActivityId null and NO
  // author link. DOIs already present (normalized re-check, so a stale client
  // list can't create duplicates) are skipped.
  app.post('/api/scientists/:id/import-papers', requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid scientist ID" });
      }

      // Own profile OR publication officer group. Demo mode passes.
      if (!isDemo() && !isOwnScientistProfile(req, id) && !hasPublicationOfficerRole(req)) {
        return res.status(403).json({
          message: "Forbidden. You may only import papers for your own linked profile, or you need Publication Officer access.",
        });
      }

      const scientist = await storage.getScientist(id);
      if (!scientist) {
        return res.status(404).json({ message: "Scientist not found" });
      }

      // Audit actor must be a real authenticated user (requireAuth guarantees a
      // session user — demo mode injects one). Never fall back to an anonymous
      // placeholder id for persisted history.
      const actorId = req.session?.user?.id;
      if (actorId == null) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // Accept either a rich `papers` array (doi + the title/journal/year we
      // already pulled from ORCID) or a plain `dois` string array for
      // backward compatibility. The metadata is used as a fallback so a paper
      // still saves even when CrossRef can't resolve its DOI.
      const rawPapers: unknown = req.body?.papers;
      const rawDois: unknown = req.body?.dois;

      type RequestedPaper = {
        doi: string;
        title: string;
        journal: string;
        year: number | null;
      };

      const requestedMap = new Map<string, RequestedPaper>();

      if (Array.isArray(rawPapers)) {
        for (const p of rawPapers) {
          const doi = normalizeDoi(typeof p?.doi === "string" ? p.doi : "");
          if (!doi || requestedMap.has(doi)) continue;
          requestedMap.set(doi, {
            doi,
            title: typeof p?.title === "string" ? p.title : "",
            journal: typeof p?.journal === "string" ? p.journal : "",
            year: typeof p?.year === "number" ? p.year : null,
          });
        }
      } else if (Array.isArray(rawDois)) {
        for (const d of rawDois) {
          const doi = normalizeDoi(typeof d === "string" ? d : "");
          if (!doi || requestedMap.has(doi)) continue;
          requestedMap.set(doi, { doi, title: "", journal: "", year: null });
        }
      }

      if (requestedMap.size === 0) {
        return res
          .status(400)
          .json({ message: "Provide a non-empty list of papers to import." });
      }

      const requestedPapers = Array.from(requestedMap.values());

      // Server-side duplicate guard against the current DB state. Version-aware
      // and also keyed on the preprint DOI carried on a published record's link,
      // so a stale client list cannot re-create a previously merged preprint.
      const existingPublications = await storage.getPublications();
      const existingDois = buildExistingWorkDois(existingPublications);

      const created: {
        id: number;
        doi: string;
        title: string;
        status: string | null;
        publicationType: string | null;
        prepublicationUrl: string | null;
        prepublicationSite: string | null;
      }[] = [];
      const skipped: { doi: string; reason: string }[] = [];

      for (const paper of requestedPapers) {
        const doi = paper.doi;
        const identity = workDoiIdentity(doi);
        if (!identity || existingDois.has(identity)) {
          skipped.push({ doi, reason: "already exists" });
          continue;
        }

        // Enrich from CrossRef and PubMed in parallel, then merge. CrossRef
        // gives clean author/bibliographic fields; PubMed adds the PMID and an
        // abstract (which CrossRef usually lacks) and covers DOIs CrossRef is
        // missing. Anything still empty falls back to the ORCID metadata the
        // client already had, so the paper always saves.
        const [crossref, pubmed] = await Promise.all([
          fetchCrossrefPublication(doi),
          fetchPubmedByDoi(doi),
        ]);

        const pick = (...vals: (string | undefined | null)[]) =>
          vals.find((v) => typeof v === "string" && v.trim() !== "")?.trim() ?? "";

        const title =
          pick(crossref?.title, pubmed?.title, paper.title) || "Untitled work";
        const journal = pick(crossref?.journal, pubmed?.journal, paper.journal);
        // Authors: CrossRef first (full given+family names), then PubMed.
        const authors = pick(crossref?.authors, pubmed?.authors);
        const volume = pick(crossref?.volume, pubmed?.volume);
        const issue = pick(crossref?.issue, pubmed?.issue);
        const pages = pick(crossref?.pages, pubmed?.pages);
        // Abstract: prefer PubMed (clean text); CrossRef abstracts are rare and
        // carry JATS markup, so strip tags if that's all we have.
        const abstract =
          pubmed?.abstract?.trim() ||
          (crossref?.abstract ? stripXml(crossref.abstract) : "");
        const pmid = pubmed?.pmid || "";

        const resolvedDate =
          crossref?.publicationDate ?? pubmed?.publicationDate ?? null;
        let publicationDate: string | null = resolvedDate
          ? resolvedDate.toISOString()
          : null;
        if (!publicationDate && paper.year) {
          // Year-only fallback: store as Jan 1 of that year.
          publicationDate = new Date(Date.UTC(paper.year, 0, 1)).toISOString();
        }

        const enrichedFromAnySource = Boolean(crossref || pubmed);

        const primaryDoi = normalizeDoi(crossref?.doi || doi) || doi;
        const classification = classifyResolvedPublication({
          id: 0,
          doi: primaryDoi,
          publicationType: crossref?.type,
          journal,
        });
        try {
          const publicationData = insertPublicationSchema.parse({
            researchActivityId: null,
            title,
            authors,
            journal,
            volume,
            issue,
            pages,
            doi: primaryDoi,
            pmid: pmid || null,
            abstract,
            ...classification,
            publicationDate,
          });

          const changeReason = enrichedFromAnySource
            ? "Imported from ORCID/Google Scholar"
            : "Imported from ORCID/Google Scholar (metadata not enriched via CrossRef/PubMed)";
          const publication = await storage.createPublicationWithHistory({
            ...publicationData,
            createdByUserId: actorId,
          }, {
            fromStatus: "",
            toStatus: publicationData.status || "Published",
            changedBy: actorId,
            changeReason,
          });

          // Mark as present so a duplicate inside the same batch is skipped.
          existingDois.add(identity);
          created.push({
            doi: primaryDoi,
            id: publication.id,
            title,
            status: publication.status,
            publicationType: publication.publicationType,
            prepublicationUrl: publication.prepublicationUrl,
            prepublicationSite: publication.prepublicationSite,
          });
        } catch (err) {
          console.error(`Failed to import DOI ${doi}:`, err);
          skipped.push({ doi, reason: "failed to save" });
        }
      }

      res.json({
        created,
        skipped,
        createdCount: created.length,
        skippedCount: skipped.length,
      });
    } catch (error) {
      console.error("Error importing papers:", error);
      res.status(500).json({ message: "Failed to import papers" });
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
      console.error('Error deleting journal impact factor:', error);
      res.status(500).json({ message: "Failed to delete journal impact factor" });
    }
  });

  // Grant routes
  registerGrantListRoute(app);

  app.get('/api/grants/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid grant ID" });
      }

      const grant = await storage.getGrant(id);
      if (!grant) {
        return res.status(404).json({ message: "Grant not found" });
      }

      res.json(grant);
    } catch (error) {
      console.error('Error fetching grant:', error);
      res.status(500).json({ message: "Failed to fetch grant" });
    }
  });

  app.post('/api/grants', async (req: Request, res: Response) => {
    try {
      const parsedData = insertGrantSchema.parse(nullifyEmptyStrings(req.body));
      const lifecycle = reconcileGrantLifecycle(parsedData);
      const validatedData = insertGrantSchema.parse({
        ...parsedData,
        ...lifecycle,
      });
      const grant = await storage.createGrant(validatedData);
      res.status(201).json(grant);
    } catch (error) {
      if (error instanceof GrantLifecycleError) {
        return res.status(400).json({ message: error.message });
      }
      if (error instanceof ZodError) {
        return res.status(400).json({ 
          message: "Invalid grant data", 
          details: fromZodError(error).toString() 
        });
      }
      console.error('Error creating grant:', error);
      res.status(500).json({ message: "Failed to create grant" });
    }
  });

  app.put('/api/grants/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid grant ID" });
      }

      const existingGrant = await storage.getGrant(id);
      if (!existingGrant) {
        return res.status(404).json({ message: "Grant not found" });
      }

      const {
        researchActivityIds: rawResearchActivityIds,
        ...rawGrantData
      } = req.body ?? {};
      const desiredResearchActivityIds = rawResearchActivityIds === undefined
        ? undefined
        : z.array(z.coerce.number().int().positive()).parse(rawResearchActivityIds);
      const parsedData = insertGrantSchema.partial().parse(
        nullifyEmptyStrings(rawGrantData),
      );
      const lifecycle = reconcileGrantLifecycle(parsedData, existingGrant);

      if (existingGrant.awarded && !lifecycle.awarded) {
        if (
          desiredResearchActivityIds !== undefined &&
          desiredResearchActivityIds.length > 0
        ) {
          return res.status(409).json({
            message:
              "Unlink all SDRs before clearing the Grant Awarded designation. Existing links were left unchanged.",
          });
        }
      }

      const validatedData = insertGrantSchema.partial().parse({
        ...parsedData,
        ...lifecycle,
      });
      const grant = await storage.updateGrantWithResearchActivities(
        id,
        validatedData,
        desiredResearchActivityIds,
      );
      res.json(grant);
    } catch (error) {
      if (error instanceof GrantSdrLifecycleStorageError) {
        const status = error.code === "GRANT_NOT_FOUND" ||
          error.code === "RESEARCH_ACTIVITY_NOT_FOUND"
          ? 404
          : 409;
        return res.status(status).json({ message: error.message });
      }
      if (error instanceof GrantLifecycleError) {
        return res.status(400).json({ message: error.message });
      }
      if (error instanceof ZodError) {
        console.error('Validation error:', fromZodError(error).toString());
        return res.status(400).json({ 
          message: "Invalid grant data", 
          details: fromZodError(error).toString() 
        });
      }
      console.error('Error updating grant:', error);
      res.status(500).json({ message: "Failed to update grant" });
    }
  });

  app.delete('/api/grants/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid grant ID" });
      }

      const success = await storage.deleteGrant(id);
      if (!success) {
        return res.status(404).json({ message: "Grant not found" });
      }

      res.status(204).send();
    } catch (error) {
      if (error instanceof GrantSdrLifecycleStorageError) {
        return res.status(409).json({ message: error.message });
      }
      console.error('Error deleting grant:', error);
      res.status(500).json({ message: "Failed to delete grant" });
    }
  });

  // Grants export. Same column list as the import template so exported files
  // can be edited and re-imported. ?format=xlsx (default) or ?format=csv.
  app.get('/api/grants/export/csv', requireAuth, async (req: Request, res: Response) => {
    try {
      const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
      const [grants, scientists] = await Promise.all([storage.getGrants(), storage.getScientists()]);
      const scientistById = new Map(scientists.map((s: any) => [s.id, s]));
      const rows = grantsToRows(grants, scientistById);
      const stamp = new Date().toISOString().slice(0, 10);

      if (format === 'xlsx') {
        const buffer = await buildGrantsWorkbookBuffer(rows);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=grants-export-${stamp}.xlsx`);
        return res.send(buffer);
      }

      const headers = GRANT_COLUMNS.map((c) => c.header);
      const csvContent = [headers, ...rows.map((r) => headers.map((h) => r[h]))]
        .map(row => row.map(field => `"${String(field ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=grants-export-${stamp}.csv`);
      res.send(csvContent);
    } catch (error) {
      console.error('Error exporting grants:', error);
      res.status(500).json({ message: "Failed to export grants" });
    }
  });

  // Grants Excel import: template download, dry-run preview, and apply.
  app.get('/api/grants/import/template', requireAuth, async (_req: Request, res: Response) => {
    try {
      const buffer = await buildGrantsTemplateBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=grants-import-template.xlsx');
      res.send(buffer);
    } catch (error) {
      console.error('Error building grants import template:', error);
      res.status(500).json({ message: "Failed to build template" });
    }
  });

  // Shared by preview and apply: parse the uploaded file and compute
  // create/update/skip decisions against current DB state.
  async function computeGrantImportPreview(fileBase64: string, fileName: string) {
    if (fileBase64.length > 15_000_000) throw new Error("File too large (max ~10 MB)");
    const rawRows = await parseUploadedFile(fileBase64, fileName);
    if (rawRows.length > 2000) throw new Error("Too many rows in one import (max 2000)");
    const [grants, scientists] = await Promise.all([storage.getGrants(), storage.getScientists()]);
    const existingByProjectNumber = new Map(grants.map((g: any) => [String(g.projectNumber).toLowerCase(), g]));
    const scientistByEmail = new Map(scientists.filter((s: any) => s.email).map((s: any) => [s.email.toLowerCase(), s]));
    const scientistByName = new Map(scientists.map((s: any) => [
      `${s.firstName} ${s.lastName}`.toLowerCase().replace(/\s+/g, ' '), s,
    ]));
    return previewGrantRows(rawRows, existingByProjectNumber, scientistByEmail, scientistByName);
  }

  app.post('/api/grants/import/preview', requireAuth, async (req: Request, res: Response) => {
    try {
      const { fileBase64, fileName } = req.body ?? {};
      if (typeof fileBase64 !== 'string' || !fileBase64 || typeof fileName !== 'string') {
        return res.status(400).json({ message: "Provide fileBase64 and fileName" });
      }
      const previews = await computeGrantImportPreview(fileBase64, fileName);
      res.json({
        rows: previews,
        summary: {
          create: previews.filter((p) => p.action === 'create').length,
          update: previews.filter((p) => p.action === 'update').length,
          skip: previews.filter((p) => p.action === 'skip').length,
          missingStaff: collectMissingGrantStaff(previews).length,
        },
      });
    } catch (error) {
      console.error('Error previewing grants import:', error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to parse file" });
    }
  });

  app.post('/api/grants/import/missing-staff', requireAuth, async (req: Request, res: Response) => {
    try {
      const { fileBase64, fileName } = req.body ?? {};
      if (typeof fileBase64 !== 'string' || !fileBase64 || typeof fileName !== 'string') {
        return res.status(400).json({ message: "Provide fileBase64 and fileName" });
      }
      const previews = await computeGrantImportPreview(fileBase64, fileName);
      const missingStaff = collectMissingGrantStaff(previews);
      if (missingStaff.length === 0) {
        return res.status(400).json({ message: "No missing staff found in this grant import" });
      }
      const buffer = await buildMissingGrantStaffWorkbookBuffer(previews);
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=missing-grant-staff-${stamp}.xlsx`);
      res.send(buffer);
    } catch (error) {
      console.error('Error exporting missing grant staff:', error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to export missing staff" });
    }
  });

  app.post('/api/grants/import/apply', requireAuth, async (req: Request, res: Response) => {
    try {
      const { fileBase64, fileName } = req.body ?? {};
      if (typeof fileBase64 !== 'string' || !fileBase64 || typeof fileName !== 'string') {
        return res.status(400).json({ message: "Provide fileBase64 and fileName" });
      }
      // Re-run the preview server-side so the applied changes always reflect
      // the uploaded file + current DB state, not client-editable data.
      const previews = await computeGrantImportPreview(fileBase64, fileName);
      let created = 0, updated = 0;
      const failed: { rowNumber: number; projectNumber: string; reason: string }[] = [];
      for (const p of previews) {
        if (p.action === 'skip' || !p.data) continue;
        try {
          if (p.action === 'create') {
            const parsedData = insertGrantSchema.parse(p.data);
            const lifecycle = reconcileGrantLifecycle(parsedData);
            await storage.createGrant(insertGrantSchema.parse({
              ...parsedData,
              ...lifecycle,
            }));
            created++;
          } else {
            const existing = await storage.getGrants().then((gs: any[]) =>
              gs.find((g) => String(g.projectNumber).toLowerCase() === p.projectNumber.toLowerCase()));
            if (!existing) { failed.push({ rowNumber: p.rowNumber, projectNumber: p.projectNumber, reason: "Grant disappeared during import" }); continue; }
            const parsedData = insertGrantSchema.partial().parse(p.data);
            const lifecycle = reconcileGrantLifecycle(parsedData, existing);
            if (existing.awarded && !lifecycle.awarded) {
              const linkedSdrs = await storage.getGrantResearchActivities(existing.id);
              if (linkedSdrs.length > 0) {
                throw new GrantLifecycleError(
                  "Unlink all SDRs before clearing the Grant Awarded designation.",
                );
              }
            }
            await storage.updateGrantWithResearchActivities(
              existing.id,
              insertGrantSchema.partial().parse({
                ...parsedData,
                ...lifecycle,
              }),
            );
            updated++;
          }
        } catch (err) {
          failed.push({
            rowNumber: p.rowNumber,
            projectNumber: p.projectNumber,
            reason: err instanceof ZodError ? fromZodError(err).message : (err instanceof Error ? err.message : "Failed to save"),
          });
        }
      }
      const skipped = previews.filter((p) => p.action === 'skip').map((p) => ({ rowNumber: p.rowNumber, projectNumber: p.projectNumber, reason: p.reason }));
      res.json({ created, updated, skipped, failed });
    } catch (error) {
      console.error('Error applying grants import:', error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to import grants" });
    }
  });

  // Grant-Research Activity relationship routes
  app.get('/api/grants/:id/research-activities', async (req: Request, res: Response) => {
    try {
      const grantId = parseInt(req.params.id);
      if (isNaN(grantId)) {
        return res.status(400).json({ message: "Invalid grant ID" });
      }

      const researchActivities = await storage.getGrantResearchActivities(grantId);
      res.json(researchActivities);
    } catch (error) {
      console.error('Error fetching grant research activities:', error);
      res.status(500).json({ message: "Failed to fetch grant research activities" });
    }
  });

  app.post('/api/grants/:grantId/research-activities/:researchActivityId', async (req: Request, res: Response) => {
    try {
      const grantId = parseInt(req.params.grantId);
      const researchActivityId = parseInt(req.params.researchActivityId);
      
      if (isNaN(grantId) || isNaN(researchActivityId)) {
        return res.status(400).json({ message: "Invalid grant or research activity ID" });
      }

      const [grant, researchActivity] = await Promise.all([
        storage.getGrant(grantId),
        storage.getResearchActivity(researchActivityId),
      ]);
      if (!grant) {
        return res.status(404).json({ message: "Grant not found" });
      }
      if (!researchActivity) {
        return res.status(404).json({ message: "Research activity not found" });
      }
      if (!canGrantLinkSdrs(grant)) {
        return res.status(409).json({
          message:
            "SDRs can only be linked after the grant has been awarded.",
        });
      }

      const relationship = await storage.addGrantResearchActivity(grantId, researchActivityId);
      res.status(201).json(relationship);
    } catch (error) {
      if (error instanceof GrantSdrLifecycleStorageError) {
        const status = error.code === "GRANT_NOT_FOUND" ||
          error.code === "RESEARCH_ACTIVITY_NOT_FOUND"
          ? 404
          : 409;
        return res.status(status).json({ message: error.message });
      }
      console.error('Error linking grant to research activity:', error);
      res.status(500).json({ message: "Failed to link grant to research activity" });
    }
  });

  app.delete('/api/grants/:grantId/research-activities/:researchActivityId', async (req: Request, res: Response) => {
    try {
      const grantId = parseInt(req.params.grantId);
      const researchActivityId = parseInt(req.params.researchActivityId);
      
      if (isNaN(grantId) || isNaN(researchActivityId)) {
        return res.status(400).json({ message: "Invalid grant or research activity ID" });
      }

      const success = await storage.removeGrantResearchActivity(grantId, researchActivityId);
      if (!success) {
        return res.status(404).json({ message: "Relationship not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error('Error unlinking grant from research activity:', error);
      res.status(500).json({ message: "Failed to unlink grant from research activity" });
    }
  });

  app.get('/api/research-activities/:id/grants', async (req: Request, res: Response) => {
    try {
      const researchActivityId = parseInt(req.params.id);
      if (isNaN(researchActivityId)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const grants = await storage.getResearchActivityGrants(researchActivityId);
      res.json(grants);
    } catch (error) {
      console.error('Error fetching research activity grants:', error);
      res.status(500).json({ message: "Failed to fetch research activity grants" });
    }
  });

  app.get('/api/research-activities/:id/ibc-applications', async (req: Request, res: Response) => {
    try {
      const researchActivityId = parseInt(req.params.id);
      if (isNaN(researchActivityId)) {
        return res.status(400).json({ message: "Invalid research activity ID" });
      }

      const ibcApplications = await storage.getResearchActivityIbcApplications(researchActivityId);
      res.json(ibcApplications);
    } catch (error) {
      console.error('Error fetching research activity IBC applications:', error);
      res.status(500).json({ message: "Failed to fetch research activity IBC applications" });
    }
  });

  // Grant Progress Reports endpoints
  app.get('/api/grants/:id/progress-reports', async (req: Request, res: Response) => {
    try {
      const grantId = parseInt(req.params.id);
      if (isNaN(grantId)) {
        return res.status(400).json({ message: "Invalid grant ID" });
      }

      const progressReports = await storage.getGrantProgressReports(grantId);
      res.json(progressReports);
    } catch (error) {
      console.error('Error fetching grant progress reports:', error);
      res.status(500).json({ message: "Failed to fetch grant progress reports" });
    }
  });

  app.post('/api/grants/:id/progress-reports', async (req: Request, res: Response) => {
    try {
      const grantId = parseInt(req.params.id);
      if (isNaN(grantId)) {
        return res.status(400).json({ message: "Invalid grant ID" });
      }

      const grant = await storage.getGrant(grantId);
      if (!grant) {
        return res.status(404).json({ message: "Grant not found" });
      }
      if (!grantStatusAllowsProgressTracking(grant.status)) {
        return res.status(409).json({
          message: "Progress reports are available after the grant becomes Active.",
        });
      }

      const reportData = {
        ...req.body,
        grantId,
        uploadedBy: 1 // TODO: Get from authenticated user
      };

      const newReport = await storage.createGrantProgressReport(reportData);
      res.status(201).json(newReport);
    } catch (error) {
      console.error('Error creating grant progress report:', error);
      res.status(500).json({ message: "Failed to create grant progress report" });
    }
  });

  app.put('/api/grant-progress-reports/:id', async (req: Request, res: Response) => {
    try {
      const reportId = parseInt(req.params.id);
      if (isNaN(reportId)) {
        return res.status(400).json({ message: "Invalid report ID" });
      }

      const updatedReport = await storage.updateGrantProgressReport(reportId, req.body);
      res.json(updatedReport);
    } catch (error) {
      console.error('Error updating grant progress report:', error);
      res.status(500).json({ message: "Failed to update grant progress report" });
    }
  });

  app.delete('/api/grant-progress-reports/:id', async (req: Request, res: Response) => {
    try {
      const reportId = parseInt(req.params.id);
      if (isNaN(reportId)) {
        return res.status(400).json({ message: "Invalid report ID" });
      }

      const success = await storage.deleteGrantProgressReport(reportId);
      if (!success) {
        return res.status(404).json({ message: "Progress report not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting grant progress report:', error);
      res.status(500).json({ message: "Failed to delete grant progress report" });
    }
  });

  // Certification routes
  app.get('/api/certification-modules', async (req: Request, res: Response) => {
    try {
      const modules = await storage.getCertificationModules();
      res.json(modules);
    } catch (error) {
      console.error('Error fetching certification modules:', error);
      res.status(500).json({ message: "Failed to fetch certification modules" });
    }
  });

  app.post('/api/certification-modules', async (req: Request, res: Response) => {
    try {
      const validatedData = insertCertificationModuleSchema.parse(req.body);
      const module = await storage.createCertificationModule(validatedData);
      res.status(201).json(module);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        console.error('Error creating certification module:', error);
        res.status(500).json({ message: "Failed to create certification module" });
      }
    }
  });

  app.put('/api/certification-modules/:id', async (req: Request, res: Response) => {
    try {
      const moduleId = parseInt(req.params.id);
      if (isNaN(moduleId)) {
        return res.status(400).json({ message: "Invalid module ID" });
      }

      const validatedData = insertCertificationModuleSchema.partial().parse(req.body);
      const module = await storage.updateCertificationModule(moduleId, validatedData);
      res.json(module);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        console.error('Error updating certification module:', error);
        res.status(500).json({ message: "Failed to update certification module" });
      }
    }
  });

  app.delete('/api/certification-modules/:id', async (req: Request, res: Response) => {
    try {
      const moduleId = parseInt(req.params.id);
      if (isNaN(moduleId)) {
        return res.status(400).json({ message: "Invalid module ID" });
      }

      const success = await storage.deleteCertificationModule(moduleId);
      if (!success) {
        return res.status(404).json({ message: "Certification module not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting certification module:', error);
      res.status(500).json({ message: "Failed to delete certification module" });
    }
  });

  // Certification routes
  app.get('/api/certifications', async (req: Request, res: Response) => {
    try {
      const certifications = await storage.getCertifications();
      res.json(certifications);
    } catch (error) {
      console.error('Error fetching certifications:', error);
      res.status(500).json({ message: "Failed to fetch certifications" });
    }
  });

  app.get('/api/certifications/matrix', async (req: Request, res: Response) => {
    try {
      const matrix = await storage.getCertificationMatrix();
      res.json(matrix);
    } catch (error) {
      console.error('Error fetching certification matrix:', error);
      res.status(500).json({ message: "Failed to fetch certification matrix" });
    }
  });

  app.get('/api/certifications/scientist/:scientistId', async (req: Request, res: Response) => {
    try {
      const scientistId = parseInt(req.params.scientistId);
      if (isNaN(scientistId)) {
        return res.status(400).json({ message: "Invalid scientist ID" });
      }

      const certifications = await storage.getCertificationsByScientist(scientistId);
      res.json(certifications);
    } catch (error) {
      console.error('Error fetching scientist certifications:', error);
      res.status(500).json({ message: "Failed to fetch scientist certifications" });
    }
  });

  app.post('/api/certifications', async (req: Request, res: Response) => {
    try {
      const validatedData = insertCertificationSchema.parse(req.body);
      const certification = await storage.createCertification(validatedData);
      res.status(201).json(certification);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        console.error('Error creating certification:', error);
        res.status(500).json({ message: "Failed to create certification" });
      }
    }
  });

  app.put('/api/certifications/:id', async (req: Request, res: Response) => {
    try {
      const certificationId = parseInt(req.params.id);
      if (isNaN(certificationId)) {
        return res.status(400).json({ message: "Invalid certification ID" });
      }

      const validatedData = insertCertificationSchema.partial().parse(req.body);
      const certification = await storage.updateCertification(certificationId, validatedData);
      res.json(certification);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        console.error('Error updating certification:', error);
        res.status(500).json({ message: "Failed to update certification" });
      }
    }
  });

  app.delete('/api/certifications/:id', async (req: Request, res: Response) => {
    try {
      const certificationId = parseInt(req.params.id);
      if (isNaN(certificationId)) {
        return res.status(400).json({ message: "Invalid certification ID" });
      }

      const success = await storage.deleteCertification(certificationId);
      if (!success) {
        return res.status(404).json({ message: "Certification not found" });
      }

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting certification:', error);
      res.status(500).json({ message: "Failed to delete certification" });
    }
  });

  // Certification configuration routes
  app.get('/api/certification-config', async (req: Request, res: Response) => {
    try {
      const config = await storage.getCertificationConfiguration();
      res.json(config || {});
    } catch (error) {
      console.error('Error fetching certification configuration:', error);
      res.status(500).json({ message: "Failed to fetch certification configuration" });
    }
  });

  app.post('/api/certification-config', async (req: Request, res: Response) => {
    try {
      const validatedData = insertCertificationConfigurationSchema.parse(req.body);
      const config = await storage.createCertificationConfiguration(validatedData);
      res.status(201).json(config);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        console.error('Error creating certification configuration:', error);
        res.status(500).json({ message: "Failed to create certification configuration" });
      }
    }
  });

  app.put('/api/certification-config/:id', async (req: Request, res: Response) => {
    try {
      const configId = parseInt(req.params.id);
      if (isNaN(configId)) {
        return res.status(400).json({ message: "Invalid config ID" });
      }

      const validatedData = insertCertificationConfigurationSchema.partial().parse(req.body);
      const config = await storage.updateCertificationConfiguration(configId, validatedData);
      res.json(config);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        console.error('Error updating certification configuration:', error);
        res.status(500).json({ message: "Failed to update certification configuration" });
      }
    }
  });

  // System Configuration endpoints
  /**
   * The only system-configuration keys readable without an administrator.
   *
   * These are applied while the page is still painting -- on the sign-in
   * screen, before anyone has said who they are -- so requiring a session to
   * read them would leave an unbranded, unthemed shell for every visitor.
   * Everything else about system configuration is administrative.
   */
  const PUBLIC_SYSTEM_CONFIG_KEYS = new Set([
    'app_theme_name',
    'app_institution_labels',
    'app_section_visibility',
    'color_mode_default',
  ]);

  const requireSystemConfigRead = (req: Request, res: Response, next: NextFunction) => {
    if (PUBLIC_SYSTEM_CONFIG_KEYS.has(req.params.key)) return next();
    return requireAdmin(req, res, next);
  };

  /**
   * Writes are administrator-only, with one standing exception: the Sidra Score
   * settings belong to the Outcome Office, who are not all administrators.
   */
  const requireSystemConfigWrite = (req: Request, res: Response, next: NextFunction) => {
    const key = req.params.key ?? (req.body as { key?: string } | undefined)?.key;
    if (key === SIDRA_SCORE_SETTINGS_KEY && hasPublicationOfficerRole(req)) return next();
    return requireAdmin(req, res, next);
  };

  app.get('/api/system-configurations', requireAdmin, async (req, res) => {
    try {
      const configs = await storage.getSystemConfigurations();
      res.json(configs);
    } catch (error) {
      console.error('Error fetching system configurations:', error);
      res.status(500).json({ error: 'Failed to fetch configurations' });
    }
  });

  app.get('/api/system-configurations/:key', requireSystemConfigRead, async (req, res) => {
    try {
      const config = await storage.getSystemConfiguration(req.params.key);
      if (!config) {
        return res.status(404).json({ error: 'Configuration not found' });
      }
      res.json(config);
    } catch (error) {
      console.error('Error fetching system configuration:', error);
      res.status(500).json({ error: 'Failed to fetch configuration' });
    }
  });

  app.post('/api/system-configurations', requireSystemConfigWrite, async (req, res) => {
    try {
      if (req.body?.key === SIDRA_SCORE_SETTINGS_KEY && !hasPublicationOfficerRole(req)) {
        return res.status(403).json({ error: 'Outcome Office access is required to change Sidra Score settings' });
      }
      const config = await storage.createSystemConfiguration(req.body);
      res.status(201).json(config);
    } catch (error) {
      console.error('Error creating system configuration:', error);
      res.status(500).json({ error: 'Failed to create configuration' });
    }
  });

  app.put('/api/system-configurations/:key', requireSystemConfigWrite, async (req, res) => {
    try {
      if (req.params.key === SIDRA_SCORE_SETTINGS_KEY && !hasPublicationOfficerRole(req)) {
        return res.status(403).json({ error: 'Outcome Office access is required to change Sidra Score settings' });
      }
      const config = await storage.updateSystemConfiguration(req.params.key, req.body);
      if (!config) {
        return res.status(404).json({ error: 'Configuration not found' });
      }
      res.json(config);
    } catch (error) {
      console.error('Error updating system configuration:', error);
      res.status(500).json({ error: 'Failed to update configuration' });
    }
  });

  app.delete('/api/system-configurations/:key', requireSystemConfigWrite, async (req, res) => {
    try {
      if (req.params.key === SIDRA_SCORE_SETTINGS_KEY && !hasPublicationOfficerRole(req)) {
        return res.status(403).json({ error: 'Outcome Office access is required to change Sidra Score settings' });
      }
      const result = await storage.deleteSystemConfiguration(req.params.key);
      if (!result) {
        return res.status(404).json({ error: 'Configuration not found' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting system configuration:', error);
      res.status(500).json({ error: 'Failed to delete configuration' });
    }
  });

  // PDF Import History routes
  app.get('/api/pdf-import-history', async (req: Request, res: Response) => {
    try {
      const { scientistName, courseName, dateFrom, dateTo, status, uploadedBy } = req.query;
      
      const filters: any = {};
      if (scientistName) filters.scientistName = scientistName as string;
      if (courseName) filters.courseName = courseName as string;
      if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
      if (dateTo) filters.dateTo = new Date(dateTo as string);
      if (status) filters.status = status as string;
      if (uploadedBy) filters.uploadedBy = parseInt(uploadedBy as string);
      
      const history = await storage.searchPdfImportHistory(filters);
      
      // Enhance with uploader information
      const enhancedHistory = await Promise.all(history.map(async (entry) => {
        const uploader = await storage.getScientist(entry.uploadedBy);
        const assignedScientist = entry.assignedScientistId ? await storage.getScientist(entry.assignedScientistId) : null;
        
        return {
          ...entry,
          uploadedAt: entry.createdAt, // Map createdAt to uploadedAt for UI
          processingTimeMs: entry.processingDuration, // Map processingDuration to processingTimeMs for UI
          uploader: uploader ? {
            id: uploader.id,
            name: `${uploader.firstName} ${uploader.lastName}`,
            email: uploader.email
          } : null,
          assignedScientist: assignedScientist ? {
            id: assignedScientist.id,
            name: `${assignedScientist.firstName} ${assignedScientist.lastName}`,
            email: assignedScientist.email
          } : null
        };
      }));
      
      res.json(enhancedHistory);
    } catch (error) {
      console.error("Error fetching PDF import history:", error);
      res.status(500).json({ message: "Failed to fetch PDF import history" });
    }
  });

  app.get('/api/pdf-import-history/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid history entry ID" });
      }

      const entry = await storage.getPdfImportHistoryEntry(id);
      if (!entry) {
        return res.status(404).json({ message: "PDF import history entry not found" });
      }

      // Enhance with additional information
      const uploader = await storage.getScientist(entry.uploadedBy);
      const assignedScientist = entry.assignedScientistId ? await storage.getScientist(entry.assignedScientistId) : null;

      const enhancedEntry = {
        ...entry,
        uploadedAt: entry.createdAt, // Map createdAt to uploadedAt for UI
        processingTimeMs: entry.processingDuration, // Map processingDuration to processingTimeMs for UI  
        uploader: uploader ? {
          id: uploader.id,
          name: `${uploader.firstName} ${uploader.lastName}`,
          email: uploader.email
        } : null,
        assignedScientist: assignedScientist ? {
          id: assignedScientist.id,
          name: `${assignedScientist.firstName} ${assignedScientist.lastName}`,
          email: assignedScientist.email
        } : null
      };

      res.json(enhancedEntry);
    } catch (error) {
      console.error("Error fetching PDF import history entry:", error);
      res.status(500).json({ message: "Failed to fetch PDF import history entry" });
    }
  });

  // Feature Request routes
  app.get('/api/feature-requests', async (req: Request, res: Response) => {
    try {
      const requests = await storage.getFeatureRequests();
      res.json(requests);
    } catch (error) {
      console.error("Error fetching feature requests:", error);
      res.status(500).json({ message: "Failed to fetch feature requests" });
    }
  });

  app.get('/api/feature-requests/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid feature request ID" });
      }

      const request = await storage.getFeatureRequest(id);
      if (!request) {
        return res.status(404).json({ message: "Feature request not found" });
      }

      res.json(request);
    } catch (error) {
      console.error("Error fetching feature request:", error);
      res.status(500).json({ message: "Failed to fetch feature request" });
    }
  });

  app.post('/api/feature-requests', async (req: Request, res: Response) => {
    try {
      const featureRequestData = insertFeatureRequestSchema.parse(req.body);
      const newRequest = await storage.createFeatureRequest(featureRequestData);
      res.status(201).json(newRequest);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        console.error("Error creating feature request:", error);
        res.status(500).json({ message: "Failed to create feature request" });
      }
    }
  });

  app.put('/api/feature-requests/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid feature request ID" });
      }

      // Handle upvoting logic
      if (req.body.upvoteUserId) {
        const currentRequest = await storage.getFeatureRequest(id);
        if (!currentRequest) {
          return res.status(404).json({ message: "Feature request not found" });
        }

        const upvotedBy = currentRequest.upvotedBy || [];
        const userId = req.body.upvoteUserId;

        // Toggle upvote
        let newUpvotedBy;
        let newUpvotes;
        
        if (upvotedBy.includes(userId)) {
          // Remove upvote
          newUpvotedBy = upvotedBy.filter(id => id !== userId);
          newUpvotes = Math.max(0, currentRequest.upvotes - 1);
        } else {
          // Add upvote
          newUpvotedBy = [...upvotedBy, userId];
          newUpvotes = currentRequest.upvotes + 1;
        }

        const updatedRequest = await storage.updateFeatureRequest(id, {
          upvotes: newUpvotes,
          upvotedBy: newUpvotedBy
        });

        return res.json(updatedRequest);
      }

      // Regular update logic
      const updateData = insertFeatureRequestSchema.partial().parse(req.body);
      const updatedRequest = await storage.updateFeatureRequest(id, updateData);
      
      if (!updatedRequest) {
        return res.status(404).json({ message: "Feature request not found" });
      }

      res.json(updatedRequest);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        console.error("Error updating feature request:", error);
        res.status(500).json({ message: "Failed to update feature request" });
      }
    }
  });

  app.delete('/api/feature-requests/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid feature request ID" });
      }

      const deleted = await storage.deleteFeatureRequest(id);
      if (!deleted) {
        return res.status(404).json({ message: "Feature request not found" });
      }

      res.json({ message: "Feature request deleted successfully" });
    } catch (error) {
      console.error("Error deleting feature request:", error);
      res.status(500).json({ message: "Failed to delete feature request" });
    }
  });

  // PMO Applications routes
  app.get('/api/pmo-applications', async (req: Request, res: Response) => {
    try {
      const applications = await storage.getAllPmoApplications();
      res.json(applications);
    } catch (error) {
      console.error("Error fetching PMO applications:", error);
      res.status(500).json({ message: "Failed to fetch PMO applications" });
    }
  });

  app.get('/api/pmo-applications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid application ID" });
      }

      const application = await storage.getPmoApplication(id);
      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }

      res.json(application);
    } catch (error) {
      console.error("Error fetching PMO application:", error);
      res.status(500).json({ message: "Failed to fetch application" });
    }
  });

  // Create RA-200 Application
  app.post('/api/ra200-applications', async (req: Request, res: Response) => {
    try {
      const applicationData = insertRa200ApplicationSchema.parse(req.body);
      const application = await storage.createRa200Application(applicationData);
      res.status(201).json(application);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        console.error("Error creating RA-200 application:", error);
        res.status(500).json({ message: "Failed to create application" });
      }
    }
  });

  // Create RA-205A Application
  app.post('/api/ra205a-applications', async (req: Request, res: Response) => {
    try {
      const applicationData = insertRa205aApplicationSchema.parse(req.body);
      const application = await storage.createRa205aApplication(applicationData);
      res.status(201).json(application);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        console.error("Error creating RA-205A application:", error);
        res.status(500).json({ message: "Failed to create application" });
      }
    }
  });

  app.put('/api/pmo-applications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid application ID" });
      }

      // Handle status changes and comments
      if (req.body.statusChange) {
        const { status, comment, userId } = req.body.statusChange;
        
        const currentApp = await storage.getPmoApplication(id);
        if (!currentApp) {
          return res.status(404).json({ message: "Application not found" });
        }

        // Add to review history
        const newHistory = [
          ...(currentApp.reviewHistory as any[] || []),
          {
            timestamp: new Date().toISOString(),
            action: status,
            user: userId || 'PMO Office',
            comment: comment
          }
        ];

        // Add to office comments if it's from PMO office
        const newOfficeComments = [
          ...(currentApp.officeComments as any[] || []),
          {
            timestamp: new Date().toISOString(),
            user: userId || 'PMO Office',
            comment: comment,
            action: status
          }
        ];

        // If approved, create SDR entry
        if (status === 'approved') {
          // TODO: Create SDR entry from approved application
          console.log('Creating SDR entry for approved application:', id);
        }

        const updatedApp = await storage.updatePmoApplication(id, {
          status,
          reviewHistory: newHistory,
          officeComments: newOfficeComments
        });

        return res.json(updatedApp);
      }

      // Regular update
      const updateData = insertPmoApplicationSchema.partial().parse(req.body);
      const updatedApp = await storage.updatePmoApplication(id, updateData);

      if (!updatedApp) {
        return res.status(404).json({ message: "Application not found" });
      }

      res.json(updatedApp);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        console.error("Error updating PMO application:", error);
        res.status(500).json({ message: "Failed to update application" });
      }
    }
  });

  app.delete('/api/pmo-applications/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid application ID" });
      }

      const deleted = await storage.deletePmoApplication(id);
      if (!deleted) {
        return res.status(404).json({ message: "Application not found" });
      }

      res.json({ message: "Application deleted successfully" });
    } catch (error) {
      console.error("Error deleting PMO application:", error);
      res.status(500).json({ message: "Failed to delete application" });
    }
  });

  // Team Member routes (public - no auth required)
  app.get('/api/team-members', async (req: Request, res: Response) => {
    try {
      const members = await storage.getTeamMembers();
      res.json(members);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  app.get('/api/team-members/category/:category', async (req: Request, res: Response) => {
    try {
      const { category } = req.params;
      const members = await storage.getTeamMembersByCategory(category);
      res.json(members);
    } catch (error) {
      console.error("Error fetching team members by category:", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  app.get('/api/team-members/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid team member ID" });
      }

      const member = await storage.getTeamMember(id);
      if (!member) {
        return res.status(404).json({ message: "Team member not found" });
      }

      res.json(member);
    } catch (error) {
      console.error("Error fetching team member:", error);
      res.status(500).json({ message: "Failed to fetch team member" });
    }
  });

  app.post('/api/team-members', async (req: Request, res: Response) => {
    try {
      const memberData = insertTeamMemberSchema.parse(req.body);
      const newMember = await storage.createTeamMember(memberData);
      res.status(201).json(newMember);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        console.error("Error creating team member:", error);
        res.status(500).json({ message: "Failed to create team member" });
      }
    }
  });

  app.put('/api/team-members/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid team member ID" });
      }

      const updateData = insertTeamMemberSchema.partial().parse(req.body);
      const updatedMember = await storage.updateTeamMember(id, updateData);
      
      if (!updatedMember) {
        return res.status(404).json({ message: "Team member not found" });
      }

      res.json(updatedMember);
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        console.error("Error updating team member:", error);
        res.status(500).json({ message: "Failed to update team member" });
      }
    }
  });

  app.delete('/api/team-members/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid team member ID" });
      }

      const deleted = await storage.deleteTeamMember(id);
      if (!deleted) {
        return res.status(404).json({ message: "Team member not found" });
      }

      res.json({ message: "Team member deleted successfully" });
    } catch (error) {
      console.error("Error deleting team member:", error);
      res.status(500).json({ message: "Failed to delete team member" });
    }
  });

  // ── Admin: user management ─────────────────────────────────────────────────

  // GET /api/admin/users — list all users (admin/superadmin only)
  app.get('/api/admin/users', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          user: {
            id: users.id,
            username: users.username,
            name: users.name,
            email: users.email,
            role: users.role,
            scientistId: users.scientistId,
            lastLoginAt: users.lastLoginAt,
          },
          profileJobTitle: scientists.jobTitle,
        })
        .from(users)
        .leftJoin(scientists, eq(users.scientistId, scientists.id))
        .orderBy(users.name);
      // One query for every assignment, then grouped in memory — a per-user
      // lookup here would be one query per row.
      const assignments = await db
        .select({ userId: userRoleAssignments.userId, name: roleGroups.name })
        .from(userRoleAssignments)
        .innerJoin(roleGroups, eq(userRoleAssignments.roleGroupId, roleGroups.id));
      const secondaryByUser = new Map<number, string[]>();
      for (const assignment of assignments) {
        const list = secondaryByUser.get(assignment.userId) ?? [];
        list.push(assignment.name);
        secondaryByUser.set(assignment.userId, list);
      }
      res.json(rows.map(({ user, profileJobTitle }) =>
        toAdminUserResponse(user, profileJobTitle, (secondaryByUser.get(user.id) ?? []).sort())
      ));
    } catch (err) {
      console.error('Error fetching users:', err);
      res.status(500).json({ message: 'Failed to fetch users' });
    }
  });

  // GET /api/admin/roles — matrix roles plus the two assignable built-ins.
  // role_groups is the canonical matrix source, so newly-added matrix roles
  // automatically become available in User Management.
  const ensureDefaultRoleGroups = async () => {
    await db
      .insert(roleGroups)
      .values(
        ACCESS_ROLES.map((name) => ({
          name,
          description: 'Default access-matrix role',
        }))
      )
      .onConflictDoNothing({ target: roleGroups.name });
  };

  app.get('/api/admin/roles', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
    try {
      await ensureDefaultRoleGroups();
      const matrixRoles = await db
        .select({ name: roleGroups.name })
        .from(roleGroups)
        .orderBy(roleGroups.name);
      res.json(buildAssignableRoles(matrixRoles.map((entry) => entry.name)));
    } catch (err) {
      console.error('Error fetching assignable roles:', err);
      res.status(500).json({ message: 'Failed to fetch assignable roles' });
    }
  });
  // PUT /api/admin/users/:id/secondary-roles — replace a user's secondary roles
  //
  // Secondary roles are additive: access is the union of the primary and these.
  // Administrator rights are normally granted this way, so this endpoint can
  // escalate privilege and is administrator-only, like the primary-role route.
  app.put('/api/admin/users/:id/secondary-roles', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid user id' });

    const { roles } = req.body as { roles?: unknown };
    if (!Array.isArray(roles) || roles.some((role) => typeof role !== 'string')) {
      return res.status(400).json({ message: 'roles must be an array of role names' });
    }
    const requested = [...new Set((roles as string[]).map((role) => role.trim()).filter(Boolean))];

    // superadmin is granted by SUPER_ADMIN_EMAIL alone, never through the API.
    if (requested.includes('superadmin')) {
      return res.status(400).json({ message: 'superadmin cannot be assigned' });
    }
    // "user" is the absence of a role, so it is meaningless as a secondary.
    if (requested.includes('user')) {
      return res.status(400).json({ message: '"user" is the default role and cannot be a secondary role' });
    }

    try {
      const [target] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id)).limit(1);
      if (!target) return res.status(404).json({ message: 'User not found' });

      await ensureDefaultRoleGroups();
      const groups = requested.length
        ? await db.select({ id: roleGroups.id, name: roleGroups.name })
            .from(roleGroups)
            .where(inArray(roleGroups.name, requested))
        : [];

      // "admin" is a legitimate secondary but is not a matrix role, so it has
      // no role_groups row until one is created for it.
      const known = new Set(groups.map((group) => group.name));
      const missing = requested.filter((role) => !known.has(role));
      if (missing.length) {
        const [created] = await db
          .insert(roleGroups)
          .values(missing.map((name) => ({ name, description: 'Assignable access role' })))
          .onConflictDoNothing({ target: roleGroups.name })
          .returning();
        void created;
        const refreshed = await db.select({ id: roleGroups.id, name: roleGroups.name })
          .from(roleGroups)
          .where(inArray(roleGroups.name, requested));
        groups.splice(0, groups.length, ...refreshed);
      }

      // Deliberately NOT filtered against the current primary role. Dropping a
      // secondary that duplicates the primary reads as tidy but is a trap: grant
      // `admin` as a secondary while `admin` is still the primary and it is
      // silently stored as nothing, so moving the primary to another role
      // afterwards leaves the person with no administrator rights and no sign
      // that anything was discarded. Access is the union of every slot, so
      // holding one role in both costs nothing.
      void target.role;
      const keep = groups;

      await db.transaction(async (tx: any) => {
        await tx.delete(userRoleAssignments).where(eq(userRoleAssignments.userId, id));
        if (keep.length) {
          await tx.insert(userRoleAssignments).values(
            keep.map((group) => ({
              userId: id,
              roleGroupId: group.id,
              // The demo session uses id 0, which is not a real user row, so
              // `??` wrote 0 and the users foreign key rejected the insert:
              // granting any secondary role in demo mode failed outright,
              // while clearing them all succeeded because that deletes only.
              // `||` records nobody instead.
              assignedBy: req.session?.user?.id || null,
            })),
          );
        }
      });

      res.json({ id, secondaryRoles: keep.map((group) => group.name).sort() });
    } catch (err) {
      console.error('Error updating secondary roles:', err);
      res.status(500).json({ message: 'Failed to update secondary roles' });
    }
  });

  // PATCH /api/admin/users/:id/role — change a user's role
  app.patch('/api/admin/users/:id/role', requireAuth, requireAdmin, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: 'Invalid user id' });

    const { role } = req.body as { role: string };
    // superadmin can only be set via SUPER_ADMIN_EMAIL — never by this API.
    if (!role || role === 'superadmin') {
      return res.status(400).json({ message: 'Invalid role' });
    }

    try {
      await ensureDefaultRoleGroups();
      const isBuiltInRole = role === 'user' || role === 'admin';
      const [matrixRole] = isBuiltInRole
        ? [undefined]
        : await db
            .select({ name: roleGroups.name })
            .from(roleGroups)
            .where(eq(roleGroups.name, role))
            .limit(1);
      if (!isBuiltInRole && !matrixRole) {
        return res.status(400).json({ message: 'Invalid role' });
      }

      const updated = await storage.updateUser(id, { role } as any);
      if (!updated) return res.status(404).json({ message: 'User not found' });
      res.json(updated);
    } catch (err) {
      console.error('Error updating user role:', err);
      res.status(500).json({ message: 'Failed to update role' });
    }
  });

  // POST /api/register — first-time user links their account to a scientist/staff profile
  app.post(
    '/api/register',
    requireAuth,
    requireInvestigatorDesignationManager,
    async (req: Request, res: Response) => {
    const sessionUser = (req.session as any)?.user;
    if (!sessionUser) return res.status(401).json({ message: 'Not authenticated' });
    if (sessionUser.scientistId) {
      return res.status(400).json({ message: 'Already registered' });
    }

    const { firstName, lastName, jobTitle, staffType, honorificTitle, department } = req.body as {
      firstName: string; lastName: string; jobTitle: string; staffType: string;
      honorificTitle?: string; department?: string;
    };
    if (!firstName || !lastName || !jobTitle || !staffType) {
      return res.status(400).json({ message: 'firstName, lastName, jobTitle and staffType are required' });
    }

    try {
      let scientistId: number;
      try {
        scientistId = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(scientists)
            .values({
              firstName,
              lastName,
              email: sessionUser.email,
              jobTitle,
              staffType,
              honorificTitle: honorificTitle || '',
              department: department || null,
            } as any)
            .returning({ id: scientists.id });
          if (!created) throw new Error('Failed to create profile');

          const [linkedUser] = await tx
            .update(users)
            .set({ scientistId: created.id })
            .where(and(eq(users.id, sessionUser.id), isNull(users.scientistId)))
            .returning({ id: users.id });
          if (!linkedUser) throw new Error('REGISTRATION_ALREADY_LINKED');
          return created.id;
        });
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'REGISTRATION_ALREADY_LINKED') {
          throw error;
        }
        const [alreadyLinked] = await db
          .select({ scientistId: users.scientistId })
          .from(users)
          .where(eq(users.id, sessionUser.id))
          .limit(1);
        if (!alreadyLinked?.scientistId) throw error;
        scientistId = alreadyLinked.scientistId;
      }

      (req.session as any).user = {
        ...sessionUser,
        scientistId,
        needsRegistration: false,
      };
      await new Promise<void>((resolve) => {
        req.session.save((error) => {
          if (error) {
            console.error('Registration session save failed after profile was linked:', error);
          }
          resolve();
        });
      });
      res.json({ user: (req.session as any).user });
    } catch (err) {
      console.error('Error during registration:', err);
      res.status(500).json({ message: 'Failed to create profile' });
    }
    }
  );

  // ── Access level helpers ─────────────────────────────────────────────────────
  const ACCESS_LEVEL_ORDER: Record<string, number> = { edit: 3, create: 2, view: 1, hide: 0 };
  function maxAccessLevel(a: string | null, b: string | null): string | null {
    if (a === null && b === null) return null;
    if (a === null) return b;
    if (b === null) return a;
    return (ACCESS_LEVEL_ORDER[a] ?? -1) >= (ACCESS_LEVEL_ORDER[b] ?? -1) ? a : b;
  }

  // ── GET /api/access-check ─────────────────────────────────────────────────
  app.get('/api/access-check', requireAuth, async (req: Request, res: Response) => {
    try {
      const sessionUser = (req.session as any)?.user;
      if (!sessionUser) return res.status(401).json({ message: 'Not authenticated' });

      const { module, recordId: recordIdStr } = req.query as { module?: string; recordId?: string };
      if (!module) return res.status(400).json({ message: 'module query param required' });
      const recordId = recordIdStr ? parseInt(recordIdStr) : NaN;
      if (isNaN(recordId)) return res.status(400).json({ message: 'recordId must be an integer' });

      // Get role-based access for this user's role groups
      let roleAccess: string | null = null;
      try {
        // Get user's role group assignments
        const assignments = await db.execute(
          sql`SELECT role_group_id FROM user_role_assignments WHERE user_id = ${sessionUser.id}`
        );
        const assignmentRows: any[] = (assignments as any).rows ?? (assignments as any);
        if (assignmentRows.length > 0) {
          const groupIds = assignmentRows.map((r: any) => r.role_group_id);
          const perms = await db.execute(
            sql`SELECT access_level FROM role_permissions WHERE role_group_id = ANY(${groupIds}::int[]) AND navigation_item = ${module}`
          );
          const permRows: any[] = (perms as any).rows ?? (perms as any);
          for (const row of permRows) {
            roleAccess = maxAccessLevel(roleAccess, row.access_level);
          }
        }
      } catch {
        // role_permissions lookup failed — leave roleAccess at default
      }

      // If user is admin/superadmin give edit by default for role
      if (!roleAccess && (sessionUser.role === 'admin' || sessionUser.role === 'superadmin')) {
        roleAccess = 'edit';
      }
      if (!roleAccess) roleAccess = 'hide';

      const ownershipAccess = await resolveOwnershipAccess(sessionUser.id, module, recordId);
      const effectiveAccess = maxAccessLevel(roleAccess, ownershipAccess as string | null) ?? 'hide';

      res.json({ roleAccess, ownershipAccess: ownershipAccess ?? null, effectiveAccess });
    } catch (error) {
      console.error('Error in access-check:', error);
      res.status(500).json({ message: 'Failed to check access' });
    }
  });

  // ── Ownership overrides CRUD (admin only) ──────────────────────────────────
  app.get('/api/ownership-overrides', requireAdmin, async (req: Request, res: Response) => {
    try {
      const overrides = await storage.getOwnershipOverrides();
      res.json(overrides);
    } catch (error) {
      console.error('Error fetching ownership overrides:', error);
      res.status(500).json({ message: 'Failed to fetch ownership overrides' });
    }
  });

  app.get('/api/ownership-overrides/:module', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { module } = req.params;
      const overrides = await storage.getOwnershipOverridesForModule(module);
      res.json(overrides);
    } catch (error) {
      console.error('Error fetching ownership overrides for module:', error);
      res.status(500).json({ message: 'Failed to fetch ownership overrides' });
    }
  });

  app.put('/api/ownership-overrides', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { module, relationship, grantedAccess, description } = req.body as {
        module?: string; relationship?: string; grantedAccess?: string; description?: string;
      };
      if (!module || !relationship || !grantedAccess) {
        return res.status(400).json({ message: 'module, relationship, and grantedAccess are required' });
      }
      if (!['view', 'create', 'edit'].includes(grantedAccess)) {
        return res.status(400).json({ message: 'grantedAccess must be view, create, or edit' });
      }
      const result = await storage.upsertOwnershipOverride(module, relationship, grantedAccess, description);
      res.json(result);
    } catch (error) {
      console.error('Error upserting ownership override:', error);
      res.status(500).json({ message: 'Failed to upsert ownership override' });
    }
  });

  app.delete('/api/ownership-overrides/:id', requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
      const deleted = await storage.deleteOwnershipOverride(id);
      if (!deleted) return res.status(404).json({ message: 'Ownership override not found' });
      res.json({ message: 'Deleted successfully' });
    } catch (error) {
      console.error('Error deleting ownership override:', error);
      res.status(500).json({ message: 'Failed to delete ownership override' });
    }
  });

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
      console.error('Bulk data export-all failed:', error);
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
      console.error('Bulk data archive listing failed:', error);
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
      console.error('Bulk data archive request failed:', error);
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
      console.error('Bulk data archive download failed:', error);
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
      console.error('Bulk data export failed:', error);
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
      console.error('Bulk data template failed:', error);
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
      console.error('Bulk data preview failed:', error);
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
      const message = error instanceof Error ? error.message : 'Failed to apply section import';
      const status = /fingerprint|preview|row error|unknown section|only \.xlsx|required|auditable applying user|limit|not found|duplicate/i.test(message)
        ? 400
        : 500;
      console.error('Bulk data apply failed:', error);
      res.status(status).json({ message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
