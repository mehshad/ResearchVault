/**
 * Finding papers: discovery, PMID/DOI lookups, and a scientist's missing papers.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express, Request, Response } from "express";
import { storage } from "../databaseStorage";
import { db } from "../db";
import { scientists } from "@shared/schema";
import { and, count } from "drizzle-orm";
import { insertPublicationSchema } from "@shared/schema";
import { requireAuth, requirePublicationOfficer } from "../auth";
import { suggestInternalAuthors } from "@shared/authorMatching";
import { isPreprintRecord, classifyResolvedPublication } from "@shared/publicationDeduplication";
import { isOwnScientistProfile, hasPublicationOfficerRole } from "../sidraScoreRoutes";
import { logError } from "../logger";
import { normalizeDoi, buildExistingWorkDois, workDoiIdentity, isFigshareWork, inferJournalFromDoi, fetchOrcidWorks, fetchGoogleScholarDois, fetchCrossrefWork, crossrefJournalName, fetchCrossrefPublication, stripXml, fetchPubmedByDoi, withinYearRange, DISCOVERY_FETCHERS } from "../publicationDiscovery";
import type { MissingPaperMeta, DiscoveredPaper, DiscoveryQuery } from "../publicationDiscovery";

export function registerPublicationDiscoveryRoutes(app: Express): void {
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
      logError("Error discovering papers", "routes", error);
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
              logError(`Failed to auto-link scientist ${s.scientistId} on pub ${publication.id}`, "routes", linkErr);
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
          logError(`Failed to import discovered DOI ${doi}`, "routes", err);
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
      logError("Error importing discovered papers", "routes", error);
      res.status(500).json({ message: "Failed to import discovered papers" });
    }
  });

  // Publication Export  
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
      logError('Error fetching PubMed data', "routes", error);
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
      logError('Error fetching CrossRef data', "routes", error);
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
          logError("ORCID fetch failed", "routes", err);
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
      logError("Error checking for missing papers", "routes", error);
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

      // Own profile, or a publication officer.
      if (!isOwnScientistProfile(req, id) && !hasPublicationOfficerRole(req)) {
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
          logError(`Failed to import DOI ${doi}`, "routes", err);
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
      logError("Error importing papers", "routes", error);
      res.status(500).json({ message: "Failed to import papers" });
    }
  });

  // Grant routes
}
