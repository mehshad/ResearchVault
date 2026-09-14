/**
 * Publication discovery and lookup: ORCID works, Google Scholar, Crossref,
 * PubMed, OpenAlex and Europe PMC, plus the DOI normalisation the routes
 * compare with.
 *
 * Lifted out of server/routes.ts, where these sat as 880 lines of pure
 * functions ahead of the first route, untested because nothing could import
 * them. They call the outside world through global fetch only, so a test
 * can stand in for it.
 */
import { normalizeDoi as canonicalDoi, isPreprintRecord } from "@shared/publicationDeduplication";

// Normalize a free-form DOI for comparison: lowercase, strip any resolver
// prefix (https://doi.org/, http://dx.doi.org/, doi:) and surrounding noise.
// The `doi` column is free-form and not unique, so all DOI matching goes
// through this normalizer to avoid false "missing" / duplicate results.
export function normalizeDoi(doi: string | null | undefined): string {
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
export function preprintLinkToDoi(url: string | null | undefined): string | null {
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
export function buildExistingWorkDois(
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
export function workDoiIdentity(doi: string | null | undefined): string {
  return canonicalDoi(doi) ?? "";
}

export interface MissingPaperMeta {
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
export function nullifyEmptyStrings(obj: Record<string, any>): Record<string, any> {
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

export function isFigshareWork(w: MissingPaperMeta): boolean {
  const doi = (w.doi || "").toLowerCase();
  if (doi.startsWith("10.6084/")) return true;
  const text = `${w.journal || ""} ${w.title || ""}`.toLowerCase();
  return text.includes("figshare");
}

// Publisher platforms whose ORCID summaries frequently omit the journal title.
// Maps DOI prefix → the journal/server name to display.
export const DOI_PREFIX_JOURNALS: [string, string][] = [
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
export function inferJournalFromDoi(doi: string): string {
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
export async function fetchOrcidWorks(orcidId: string): Promise<MissingPaperMeta[]> {
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
export function validateGoogleScholarUrl(scholarUrl: string): URL | null {
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
export async function fetchGoogleScholarDois(scholarUrl: string): Promise<MissingPaperMeta[]> {
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
export function stripDoiVersionSuffix(doi: string): string {
  if (!/^10\.1101\//i.test(doi)) return doi;
  return doi.replace(/v\d+$/i, "");
}

// Fetch a CrossRef work record. If the DOI is genuinely not found (404), retry
// once with the preprint version suffix stripped. Returns the `message` object
// or null. We only retry on 404 (not transient 429/5xx) so a temporary error
// can't make us silently resolve a different DOI form.
export async function fetchCrossrefWork(doi: string): Promise<any | null> {
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
export function crossrefJournalName(work: any): string {
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
export async function fetchCrossrefPublication(doi: string): Promise<{
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
export function stripXml(input: string): string {
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
export function xmlText(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? stripXml(m[1]) : "";
}

// PubMed enrichment: resolve a DOI to a PMID via E-utilities esearch, then
// efetch the record to recover the abstract, PMID, authors, and bibliographic
// fields that CrossRef often lacks (CrossRef rarely has abstracts and some
// publishers — e.g. Science — aren't in CrossRef at all). Best-effort: any
// failure returns null and the caller falls back to CrossRef/ORCID metadata.
export async function fetchPubmedByDoi(doi: string): Promise<{
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

export interface DiscoveredPaper {
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
export function pickMatchedAffiliation(
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
export interface DiscoveryQuery {
  authorName?: string;
  orcidId?: string;
  affiliation?: string;
  query?: string;
  yearFrom?: number | null;
  yearTo?: number | null;
}

export const DISCOVERY_RESULT_CAP = 50; // per source, per query
export const DISCOVERY_TIMEOUT_MS = 12000;
// Polite identification for OpenAlex / Crossref (mailto) per their etiquette.
export const DISCOVERY_CONTACT = "research@qbridge.local";
export const DISCOVERY_USER_AGENT = `Q-BRIDGE/1.0 (mailto:${DISCOVERY_CONTACT})`;

export async function fetchJsonWithTimeout(
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

export function withinYearRange(
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
export async function discoverOpenAlex(q: DiscoveryQuery): Promise<DiscoveredPaper[]> {
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
export async function discoverPubmed(q: DiscoveryQuery): Promise<DiscoveredPaper[]> {
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
export async function discoverCrossref(q: DiscoveryQuery): Promise<DiscoveredPaper[]> {
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
export async function discoverEuropePmc(q: DiscoveryQuery): Promise<DiscoveredPaper[]> {
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
export async function discoverOrcid(q: DiscoveryQuery): Promise<DiscoveredPaper[]> {
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

export const DISCOVERY_FETCHERS: Record<
  string,
  (q: DiscoveryQuery) => Promise<DiscoveredPaper[]>
> = {
  orcid: discoverOrcid,
  openalex: discoverOpenAlex,
  pubmed: discoverPubmed,
  crossref: discoverCrossref,
  europepmc: discoverEuropePmc,
};
