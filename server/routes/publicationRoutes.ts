/**
 * Publications: list, detail, create/update/delete, workflow, authors, SDR links, history, export.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { storage } from "../databaseStorage";
import { resolveAuthorCheckSubject } from "../authorCheckSubject";
import { normaliseAdditionalSdrIds } from "@shared/publicationSdrLinks";
import { canViewPublication, canViewUnpublishedScientistPublications, isPublicScientistProfilePublicationStatus, type ScientistPublicationViewer } from "../scientistPublicationVisibility";
import { ZodError, z } from "zod";
import { fromZodError } from "zod-validation-error";
import { db } from "../db";
import { scientists, publicationAuthors, journals, manuscriptHistory, users, type ResearchActivity } from "@shared/schema";
import { and, eq, desc, count, type SQL } from "drizzle-orm";
import { insertPublicationSchema, insertPublicationAuthorSchema } from "@shared/schema";
import { requireAuth, requirePublicationOfficer, getAuthMode } from "../auth";
import { matchesAuthorName, isLinkedAuthorInAuthorsText, isUnambiguousAuthorMatch, suggestInternalAuthors, classifyAuthorEntries } from "@shared/authorMatching";
import { detectDuplicateGroups, pickDefaultSurvivorId, classifyResolvedPublication, preprintRepairEvidence } from "@shared/publicationDeduplication";
import { buildLinkImportTemplate, previewLinkImport } from "../publicationLinksImport";
import { hasPublicationOfficerRole, canEditPublicationForLinkedScientists, canManagePublicationAuthorLink, canCreatePublicationForResearchActivity } from "../sidraScoreRoutes";
import { rejectGenericPublicationWorkflowMutation, rejectPublicationCreateWorkflowMutation, rejectProtectedPublicationStatusFields, getStatusTransitionWorkflowViolation, parsePublicationStatusFields } from "../publicationMutationPolicy";
import { createIpVettingHandler, createInvalidatePublishedHandler, createInvalidAuthorActionHandler, createRevertFinalHandler, selectInvalidLinkedPublications } from "../publicationWorkflowRoutes";
import { PUBLISHED_INVALID_STATUS, PUBLISHED_STATUS, WITHDRAWN_STATUS, hasSdrOrExemption, validateSdrExemptionReason } from "@shared/publicationWorkflow";
import { logError } from "../logger";

export function getScientistPublicationViewer(req: Request): ScientistPublicationViewer {
  // The signed-in session is the sole authority. Demo used to accept viewer=*
  // query hints here so the client selector could claim any role or identity;
  // demo is real seeded accounts now, so those hints are gone.
  return {
    userId: req.session.user?.id,
    role: req.session.user?.role,
    scientistId: req.session.user?.scientistId,
  };
}

export function registerPublicationRoutes(app: Express): void {
  app.get('/api/publications/link-import/template', requirePublicationOfficer, async (_req: Request, res: Response) => {
    try {
      const buf = await buildLinkImportTemplate();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="publication-links-template.xlsx"');
      res.send(buf);
    } catch (error) {
      logError("Error building link-import template", "routes", error);
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
      logError("Error previewing link import", "routes", error);
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
      logError("Error applying link import", "routes", error);
      res.status(500).json({ message: "Failed to apply links" });
    }
  });

  app.get('/api/publications', async (req: Request, res: Response) => {
    try {
      const researchActivityId = req.query.researchActivityId ? parseInt(req.query.researchActivityId as string) : undefined;
      const programId = req.query.programId ? parseInt(req.query.programId as string) : undefined;
      const page = req.query.page ? parseInt(req.query.page as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      
      // Validate pagination params if provided
      if ((page !== undefined && (isNaN(page) || page < 1)) || 
          (limit !== undefined && (isNaN(limit) || limit < 1))) {
        return res.status(400).json({ message: "Invalid pagination parameters. page and limit must be positive integers." });
      }
      
      const hasOfficeAccess =
        req.query.officeAccess === "true" &&
        hasPublicationOfficerRole(req);

      // The office list pages in SQL: the total comes from a count and only
      // the requested rows are loaded. Every other case (an SDR's or program's
      // publications, or a viewer whose rows must be filtered one by one) is a
      // small set and pages in memory below, as before (finding #28).
      let publications;
      let sqlPage: { total: number } | null = null;
      if (researchActivityId && !isNaN(researchActivityId)) {
        publications = await storage.getPublicationsForResearchActivity(researchActivityId);
      } else if (programId && !isNaN(programId)) {
        // The SDRs of the program's projects, resolved on the server so the
        // program page does not have to pull every publication to find its own.
        publications = await storage.getPublicationsForProgram(programId);
      } else if (hasOfficeAccess && page !== undefined && limit !== undefined) {
        const paged = await storage.getPublicationsPage(limit, (page - 1) * limit);
        publications = paged.rows;
        sqlPage = { total: paged.total };
      } else {
        publications = await storage.getPublications();
      }

      // Authors for these rows only, not the whole table.
      const allPublicationAuthors = await storage.getPublicationAuthorsForPublications(
        publications.map((publication) => publication.id),
      );
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
      if (!hasOfficeAccess) {
        const viewer = getScientistPublicationViewer(req);
        publications = publications.filter((publication) =>
          canViewPublication(
            viewer,
            publication,
            authorsByPublication.get(publication.id) ?? [],
          )
        );
      }
      
      // Enhance publications with research activity details: the primary SDR
      // and any additional ones. Both read from one load of the activities
      // rather than a query per row.
      const activityById = new Map(
        (await storage.getResearchActivities()).map((activity) => [activity.id, activity]),
      );
      const additionalActivityIdsByPublication = new Map<number, number[]>();
      for (const link of await storage.getAllPublicationResearchActivityLinks()) {
        const ids = additionalActivityIdsByPublication.get(link.publicationId) ?? [];
        ids.push(link.researchActivityId);
        additionalActivityIdsByPublication.set(link.publicationId, ids);
      }
      const enhancedPublications = await Promise.all(publications.map(async (pub) => {
        const researchActivity = pub.researchActivityId ? activityById.get(pub.researchActivityId) ?? null : null;
        const additionalResearchActivities = (additionalActivityIdsByPublication.get(pub.id) ?? [])
          .map((activityId) => activityById.get(activityId))
          .filter((activity): activity is NonNullable<typeof activity> => activity != null)
          .map(summariseResearchActivity);
        const canSeeInvalidReason =
          hasPublicationOfficerRole(req) ||
          (req.session.user?.scientistId != null &&
            (authorsByPublication.get(pub.id) ?? []).some((author) =>
              author.scientistId === req.session.user!.scientistId
            ));
        const { invalidReason: _privateInvalidReason, ...safePublication } = pub;
        return {
          ...safePublication,
          ...(canSeeInvalidReason ? { invalidReason: pub.invalidReason } : {}),
          researchActivity: researchActivity ? summariseResearchActivity(researchActivity) : null,
          additionalResearchActivities,
        };
      }));
      
      // Apply pagination if requested. When the page came from SQL the rows are
      // already the page and the total is the table's count.
      if (page !== undefined && limit !== undefined) {
        const total = sqlPage ? sqlPage.total : enhancedPublications.length;
        const startIndex = (page - 1) * limit;
        const paginatedPublications = sqlPage
          ? enhancedPublications
          : enhancedPublications.slice(startIndex, startIndex + limit);
        res.json({
          data: paginatedPublications,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
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
      logError('Error getting publication journal counts', "routes", error);
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
      logError('Error getting publication author counts', "routes", error);
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
      logError('Error building publication author map', "routes", error);
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

      const [allPublications, allAuthors, allScientists] = await Promise.all([
        storage.getPublications(),
        storage.getAllPublicationAuthors(),
        // Needed to spot a name in the author text belonging to somebody on
        // staff who is not linked. The check used to answer only "is anyone
        // linked" and "does each linked author appear in the text", so a record
        // with one author linked and three colleagues unlinked passed clean.
        storage.getScientists(),
      ]);
      const matchableScientists = allScientists
        .filter((s) => s.firstName && s.lastName)
        .map((s) => ({ id: s.id, firstName: s.firstName as string, lastName: s.lastName as string }));

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
          // Every name in the free-text list, told apart: already linked, on
          // staff but unlinked, or not on staff. Shared with the Outcome Office
          // view and with "Auto-connect authors", so all three agree about who
          // is missing.
          const authorEntries = classifyAuthorEntries(
            pub.authors,
            matchableScientists,
            linkedAuthors.map(a => a.scientistId),
          );
          const missedAuthors = authorEntries
            .filter(e => e.status === "missed")
            .map(e => ({ scientistId: e.scientistId as number, name: e.text }));

          if (linkedAuthors.length === 0) {
            return { publication: pub, reason: "no_internal_authors" as const, authorEntries, missedAuthors };
          }

          const mismatched = linkedAuthors.filter(
            a => !isLinkedAuthorInAuthorsText(pub.authors, a.scientist.firstName, a.scientist.lastName)
          );

          if (mismatched.length > 0) {
            return {
              publication: pub,
              reason: "author_mismatch" as const,
              authorEntries,
              missedAuthors,
              mismatchedAuthors: mismatched.map(a => ({
                scientistId: a.scientistId,
                firstName: a.scientist.firstName,
                lastName: a.scientist.lastName,
              })),
            };
          }

          // Everything linked checks out, but colleagues in the author list are
          // not linked. This returned null before, so the record never appeared.
          if (missedAuthors.length > 0) {
            return { publication: pub, reason: "missing_internal_links" as const, authorEntries, missedAuthors };
          }

          return null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      res.json(flagged);
    } catch (error) {
      logError("Error finding publications needing author fixes", "routes", error);
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
      logError("Error fetching invalid publication issues", "routes", error);
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
      logError("Error detecting duplicate publications", "routes", error);
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
      logError("Error counting duplicate publication groups", "routes", error);
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

      const changedBy = req.session?.user?.id ?? null;

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
      logError("Error merging publications", "routes", error);
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
      logError("Error listing preprint repair candidates", "routes", error);
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
      logError("Error repairing preprint publications", "routes", error);
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
      const linkedAuthors = (await storage.getPublicationAuthors(publication.id))
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
        researchActivity: researchActivity ? summariseResearchActivity(researchActivity) : null,
        additionalResearchActivities: (await storage.getPublicationResearchActivities(id))
          .map(summariseResearchActivity),
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
      // Additional SDRs, sent with the record so the form saves in one step.
      // Optional; the primary above carries every rule. Checked before the
      // record is written so a bad id refuses the whole request rather than
      // leaving a publication behind without its links.
      const additionalIds = Array.isArray(req.body.additionalResearchActivityIds)
        ? normaliseAdditionalSdrIds(publicationData.researchActivityId, req.body.additionalResearchActivityIds)
        : null;
      if (additionalIds) {
        const missing = await findMissingResearchActivityIds(additionalIds);
        if (missing.length > 0) {
          return res.status(404).json({ message: `Research activity ${missing.join(", ")} not found` });
        }
      }

      const creatorUserId = req.session?.user?.id || null;
      const publication = await storage.createPublication({
        ...publicationData,
        ...exemption.fields,
        createdByUserId: creatorUserId,
      } as any);

      if (additionalIds && additionalIds.length > 0) {
        await storage.setPublicationResearchActivities(publication.id, additionalIds);
      }

      // Create initial history entry for publication creation, attributed to
      // the session user so the timeline shows who created the record. With
      // no session there is nobody to name, and the row says so (null) rather
      // than crediting the legacy default user 1.
      await storage.createManuscriptHistoryEntry({
        publicationId: publication.id,
        fromStatus: '',
        toStatus: publication.status || 'Concept',
        changedBy: creatorUserId ?? null,
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
          changedBy: creatorUserId ?? null,
          changeReason: `No SDR: ${exemption.fields.sdrExemptionReason}`,
        });
      }

      await req.audit.logInsert("publications", publication.id, publication as Record<string, unknown>);
      res.status(201).json(publication);
    } catch (error) {
      logError("Publication creation error", "routes", error);
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      res.status(500).json({ message: "Failed to create publication", error: error instanceof Error ? error.message : String(error) });
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

      // Additional SDRs travel with the edit. The list sent is the whole set,
      // normalised against whichever primary the record will have after this
      // update, and checked before anything is written.
      const primaryAfterUpdate = validateData.researchActivityId !== undefined
        ? validateData.researchActivityId
        : existing.researchActivityId;
      const additionalIds = Array.isArray(req.body.additionalResearchActivityIds)
        ? normaliseAdditionalSdrIds(primaryAfterUpdate, req.body.additionalResearchActivityIds)
        : null;
      if (additionalIds) {
        const missing = await findMissingResearchActivityIds(additionalIds);
        if (missing.length > 0) {
          return res.status(404).json({ message: `Research activity ${missing.join(", ")} not found` });
        }
      }

      const publication = await storage.updatePublication(id, {
        ...validateData,
        ...exemption.fields,
      });

      if (!publication) {
        return res.status(404).json({ message: "Publication not found" });
      }

      if (additionalIds) {
        await storage.setPublicationResearchActivities(id, additionalIds);
      }

      if (typeof exemption.fields.sdrExemptionReason === 'string') {
        await storage.createManuscriptHistoryEntry({
          publicationId: id,
          fromStatus: existing.status || '',
          toStatus: publication.status || '',
          changedField: 'sdrExemption',
          oldValue: existing.sdrExemptionReason ?? null,
          newValue: exemption.fields.sdrExemptionReason as string,
          changedBy: req.session?.user?.id ?? null,
          changeReason: `No SDR: ${exemption.fields.sdrExemptionReason}`,
        });
      }

      await req.audit.logUpdate(
        "publications", id,
        existing as Record<string, unknown>,
        publication as Record<string, unknown>,
        req.body?.reason,
      );
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
      
      if (sealedCheck) await req.audit.logDelete("publications", id, sealedCheck as Record<string, unknown>);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete publication" });
    }
  });

  // Manuscript History
  // What a publication payload says about an SDR it is linked to: enough to
  // name it, link to it, and place it under its project.
  function summariseResearchActivity(activity: ResearchActivity) {
    return {
      id: activity.id,
      sdrNumber: activity.sdrNumber,
      title: activity.title,
      projectId: activity.projectId,
    };
  }

  async function findMissingResearchActivityIds(ids: number[]): Promise<number[]> {
    const found = await Promise.all(ids.map((activityId) => storage.getResearchActivity(activityId)));
    return ids.filter((_, index) => !found[index]);
  }

  // The additional SDRs a publication is linked to, beyond the one on the
  // record. The primary stays on the record and keeps every rule; these are
  // optional, and a paper is listed on each of them.
  app.get('/api/publications/:id/research-activities', async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }
      const publication = await storage.getPublication(id);
      if (!publication) {
        return res.status(404).json({ message: "Publication not found" });
      }
      const linkedAuthors = await storage.getPublicationAuthors(id);
      if (!canViewPublication(
        getScientistPublicationViewer(req),
        publication,
        linkedAuthors.map((author) => ({
          scientistId: author.scientistId,
          supervisorId: author.scientist?.supervisorId ?? null,
        })),
      )) {
        return res.status(404).json({ message: "Publication not found" });
      }
      const activities = await storage.getPublicationResearchActivities(id);
      res.json(activities.map(summariseResearchActivity));
    } catch (error) {
      logError("Error fetching publication research activities", "routes", error);
      res.status(500).json({ message: "Failed to fetch publication research activities" });
    }
  });

  // Replaces the set. Same rule as editing the record: not sealed, and the
  // caller is linked to the paper or works in the Outcome Office.
  app.put('/api/publications/:id/research-activities', requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }
      if (!Array.isArray(req.body?.researchActivityIds)) {
        return res.status(400).json({ message: "researchActivityIds must be a list of research activity ids" });
      }
      const existing = await storage.getPublication(id);
      if (!existing) {
        return res.status(404).json({ message: "Publication not found" });
      }
      if (existing.status === 'Published *') {
        return res.status(403).json({
          message: "This publication is sealed (Published *). Revert the final approval in the Outcome Office before editing.",
        });
      }
      const linkedAuthors = await storage.getPublicationAuthors(id);
      if (!canEditPublicationForLinkedScientists(req, linkedAuthors.map((author) => author.scientistId))) {
        return res.status(403).json({
          message:
            "You may only edit publications linked to your scientist profile. Add or confirm your own internal-author link first, or ask Outcome Office for help.",
        });
      }
      const additionalIds = normaliseAdditionalSdrIds(existing.researchActivityId, req.body.researchActivityIds);
      const missing = await findMissingResearchActivityIds(additionalIds);
      if (missing.length > 0) {
        return res.status(404).json({ message: `Research activity ${missing.join(", ")} not found` });
      }
      const activities = await storage.setPublicationResearchActivities(id, additionalIds);
      res.json(activities.map(summariseResearchActivity));
    } catch (error) {
      logError("Error updating publication research activities", "routes", error);
      res.status(500).json({ message: "Failed to update publication research activities" });
    }
  });

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

      // changed_by is the account that made the change (a users FK since
      // finding #8), so the name comes from users alone. It used to left-join
      // scientists on the same value as well, and a row written with a
      // scientist id by an older path showed whichever user shared that id.
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
        })
        .from(manuscriptHistory)
        .leftJoin(users, eq(manuscriptHistory.changedBy, users.id))
        .where(eq(manuscriptHistory.publicationId, id))
        .orderBy(desc(manuscriptHistory.createdAt));

      const history = rows.map((r) => {
        return {
          id: r.id,
          publicationId: r.publicationId,
          fromStatus: r.fromStatus,
          toStatus: r.toStatus,
          changedField: r.changedField,
          oldValue: r.oldValue,
          newValue: r.newValue,
          changedBy: r.changedBy,
          changedByName: r.userName ?? null,
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
      logError('Error fetching manuscript history', "routes", error);
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
      logError("Error finalizing publication", "routes", error);
      res.status(500).json({ message: "Failed to finalize publication" });
    }
  });

  app.patch('/api/publications/:id/status', requireAuth, rejectProtectedPublicationStatusFields, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid publication ID" });
      }

      const { status, changes } = req.body;

      // Coerced, not trusted as sent: a date arrives here as a string and the
      // column is a timestamp.
      const parsedFields = parsePublicationStatusFields(req.body?.updatedFields);
      if (!parsedFields.ok) {
        return res.status(400).json({ message: parsedFields.message });
      }
      const updatedFields = parsedFields.fields;

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

      // Audit the status transition — this is the most important write in the
      // publications workflow: it captures reviewer decisions, rejections, and
      // final approvals with full context.
      await req.audit.logStatusChange(
        "publications", id,
        currentStatus,
        status,
        undefined,
        req.body?.changeReason ?? req.body?.reason,
      );

      res.json(updatedPublication);
    } catch (error) {
      logError('Error updating publication status', "routes", error);
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
      logError("Error fetching publication authors", "routes", error);
      res.status(500).json({ message: "Failed to fetch publication authors", error: error instanceof Error ? error.message : String(error) });
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

      // An author of the paper may manage any of its links; anyone else may
      // manage only their own, and a new self-link must also match the
      // free-text author list. Outcome Office may manage any link.
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
          authorNameMatches,
          existingAuthors.map((author) => author.scientistId)
        )
      ) {
        return res.status(403).json({
          message:
            "You may only manage internal-author links on a publication you are an author of. Ask Outcome Office to correct links elsewhere.",
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
        // Recorded because an author may now change a co-author's link, and
        // a change to somebody else's authorship credit has to be
        // attributable rather than anonymous. linkedByUserId alone says who
        // created a link, not who last altered one.
        await req.audit.logUpdate(
          "publication_authors",
          existingAuthor.id,
          {
            authorshipType: existingAuthor.authorshipType,
            authorPosition: existingAuthor.authorPosition,
          },
          {
            authorshipType: updatedAuthor?.authorshipType ?? null,
            authorPosition: updatedAuthor?.authorPosition ?? null,
          },
          `Internal-author link updated on publication ${publicationId}`,
        );
        res.status(200).json(updatedAuthor);
      } else {
        // Add new author
        const author = await storage.addPublicationAuthor({
          ...validateData,
          linkMethod: "manual",
          linkedByUserId: actorId,
        });
        await req.audit.logInsert(
          "publication_authors",
          author.id,
          author as unknown as Record<string, unknown>,
          `Internal author linked to publication ${publicationId}`,
        );
        res.status(201).json(author);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ message: fromZodError(error).message });
      }
      logError("Failed to add publication author", "routes", error);
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
          false,
          existingAuthors.map((author) => author.scientistId)
        )
      ) {
        return res.status(403).json({
          message:
            "You may only remove internal-author links on a publication you are an author of. Ask Outcome Office to correct links elsewhere.",
        });
      }

      const success = await storage.removePublicationAuthor(publicationId, scientistId);
      
      if (!success) {
        return res.status(404).json({ message: "Publication author not found" });
      }
      
      // A removal leaves nothing behind to show who did it, which is the
      // whole reason an author may now remove somebody else's link.
      if (existingAuthor) {
        await req.audit.logDelete(
          "publication_authors",
          existingAuthor.id,
          {
            publicationId,
            scientistId,
            authorshipType: existingAuthor.authorshipType,
            authorPosition: existingAuthor.authorPosition,
          },
          `Internal-author link removed from publication ${publicationId}`,
        );
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
      logError("Error suggesting publication authors", "routes", error);
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
      logError("Error bulk-linking publication authors", "routes", error);
      res.status(500).json({ message: "Failed to link publication authors" });
    }
  });

  // Paper Discovery — search multiple external sources for papers, merge and
  // dedup by DOI, and flag which results already exist in the portal. Restricted
  // to publication-office staff since it is an institution-wide discovery tool.
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
      logError('Error exporting publications', "routes", error);
      res.status(500).json({ message: "Failed to export publications" });
    }
  });

  // Patents
}
