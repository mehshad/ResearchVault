// Shared duplicate-detection logic for publications, used by the server
// duplicate-detection endpoint and (for default survivor selection) the client
// merge dialog. Keeping it here gives one source of truth for how DOIs/titles
// are normalized and how duplicate groups are formed.
//
// Detection rules (see task spec):
//   1. Exact DOI match (normalized)
//   2. Exact PMID match
//   3. Fuzzy metadata match (normalized title + same year + author overlap)
//   4. Preprint <-> published match (one record is a preprint, the other the
//      published version of the same work, matched by normalized title + author)
//
// Author comparison reuses `matchesAuthorName` from ./authorMatching so the same
// tolerant academic-citation rules drive duplicate detection and author linking.

import { matchesAuthorName } from "./authorMatching";

export type DuplicateReason = "doi" | "pmid" | "metadata" | "preprint-pair";

/** Minimal publication shape needed to detect duplicates. */
export interface DedupPublication {
  id: number;
  title?: string | null;
  authors?: string | null;
  journal?: string | null;
  doi?: string | null;
  pmid?: string | null;
  publicationDate?: string | Date | null;
  publicationType?: string | null;
  prepublicationUrl?: string | null;
  prepublicationSite?: string | null;
  abstract?: string | null;
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
}

export interface DuplicateGroup {
  /** Every reason that applies to at least one pair within the group. */
  reasons: DuplicateReason[];
  /** True when the group contains a preprint and its published counterpart. */
  isPreprintPair: boolean;
  /** Ids of the publications in this duplicate group (always length >= 2). */
  publicationIds: number[];
}

// DOI prefixes of common preprint servers (openRxiv, arXiv, Research Square,
// ChemRxiv, PsyArXiv). Used both to strip version suffixes and to flag a record
// as a preprint.
const PREPRINT_DOI_PREFIXES = [
  "10.1101/", // bioRxiv / medRxiv
  "10.48550/", // arXiv
  "10.21203/", // Research Square
  "10.26434/", // ChemRxiv
  "10.31234/", // PsyArXiv
  "10.31219/", // OSF preprints
  "10.22541/", // Authorea
];

const PREPRINT_KEYWORDS = [
  "biorxiv",
  "medrxiv",
  "arxiv",
  "research square",
  "researchsquare",
  "chemrxiv",
  "psyarxiv",
  "ssrn",
  "preprint",
  "osf",
];

/**
 * Normalize a DOI for matching: lowercase, strip a resolver prefix
 * (https://doi.org/ or doi:), and strip a trailing preprint version suffix
 * (vN) for known preprint-server DOIs so v1/v2 of the same preprint collapse.
 */
export function normalizeDoi(doi: string | null | undefined): string | null {
  if (!doi) return null;
  let d = doi.trim().toLowerCase();
  if (!d) return null;
  d = d.replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
  d = d.replace(/^doi:\s*/, "");
  d = d.trim();
  if (!d) return null;
  if (PREPRINT_DOI_PREFIXES.some((p) => d.startsWith(p))) {
    // Strip a trailing version marker, including an Authorea-style "/vN" path
    // segment, so v1/v2 of the same preprint collapse to one identity.
    d = d.replace(/\/?v\d+$/, "");
  }
  return d || null;
}

/** Normalize a title for fuzzy matching: lowercase, drop all non-alphanumerics. */
export function normalizeTitle(title: string | null | undefined): string {
  return (title || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizePmid(pmid: string | null | undefined): string | null {
  const p = (pmid || "").trim();
  return p ? p : null;
}

function yearOf(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d.getUTCFullYear();
}

/**
 * Does the record itself look like a preprint (as opposed to a published
 * article)? Looks at the DOI host, the publication type, and the journal /
 * prepublication-site name. We intentionally do NOT treat a bare
 * `prepublicationUrl` as proof, since published records carry that link too.
 */
export function isPreprintRecord(pub: DedupPublication): boolean {
  const doi = normalizeDoi(pub.doi);
  if (doi && PREPRINT_DOI_PREFIXES.some((p) => doi.startsWith(p))) return true;

  const type = (pub.publicationType || "").toLowerCase();
  if (type.includes("preprint")) return true;

  const haystack = `${pub.journal || ""} ${pub.prepublicationSite || ""}`.toLowerCase();
  if (PREPRINT_KEYWORDS.some((k) => haystack.includes(k))) return true;

  return false;
}

/**
 * Name of the preprint server a record came from, constrained to the exact
 * values accepted by the `prepublicationSite` radio group on the publication
 * edit/detail forms: "arXiv", "bioRxiv", "medRxiv", "Research Square", or
 * "Other". Returns null when the record is not recognizably a preprint.
 *
 * The record's own site / journal text is checked first (lowercased match) —
 * that's the only way to tell bioRxiv from medRxiv, which share the `10.1101`
 * DOI prefix. Otherwise we fall back to the DOI prefix, mapping any preprint
 * server we can't pin to a specific radio option (incl. `10.1101`) to "Other".
 */
export function preprintServerName(pub: DedupPublication): string | null {
  const text = `${pub.prepublicationSite || ""} ${pub.journal || ""}`.toLowerCase();

  // Text-based detection first. bioRxiv / medRxiv can only be distinguished
  // here since they share a DOI prefix.
  if (text.includes("biorxiv")) return "bioRxiv";
  if (text.includes("medrxiv")) return "medRxiv";
  if (text.includes("research square") || text.includes("researchsquare")) {
    return "Research Square";
  }
  // Recognizable preprint servers that have no dedicated radio option collapse
  // to "Other". Check these before the bare "arxiv" match because e.g.
  // "psyarxiv" / "chemrxiv" contain "rxiv" and "psyarxiv" contains "arxiv".
  if (
    text.includes("psyarxiv") ||
    text.includes("chemrxiv") ||
    text.includes("ssrn") ||
    text.includes("osf")
  ) {
    return "Other";
  }
  if (text.includes("arxiv")) return "arXiv";

  // DOI prefix fallback for records lacking descriptive site/journal text.
  const doi = normalizeDoi(pub.doi);
  if (doi) {
    if (doi.startsWith("10.48550/")) return "arXiv";
    if (doi.startsWith("10.21203/")) return "Research Square";
    if (PREPRINT_DOI_PREFIXES.some((p) => doi.startsWith(p))) return "Other";
  }

  // A generic "preprint" mention with no recognizable server still marks the
  // record as a preprint of unknown origin.
  if (
    text.includes("preprint") ||
    (pub.publicationType || "").toLowerCase().includes("preprint")
  ) {
    return "Other";
  }

  return null;
}

/**
 * Build a stable link to a preprint record: prefer an explicit prepublication
 * URL, else a doi.org link from its (version-stripped) DOI. Returns null when
 * neither is available.
 */
export function preprintLink(pub: DedupPublication): string | null {
  if (pub.prepublicationUrl && pub.prepublicationUrl.trim()) {
    return pub.prepublicationUrl.trim();
  }
  const doi = normalizeDoi(pub.doi);
  if (doi) return `https://doi.org/${doi}`;
  return null;
}

/** Parse the lead (first) author of a free-text list into first/last name. */
function parseLeadAuthor(
  authors: string | null | undefined,
): { firstName: string; lastName: string } | null {
  if (!authors) return null;
  const entry = authors.split(/[,;]/)[0]?.trim();
  if (!entry) return null;
  const tokens = entry.replace(/\./g, "").split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;

  const isInitials = (t: string) => t.length <= 3 && t === t.toUpperCase();
  // "Hendrickx W" (LastName Initials)
  if (isInitials(tokens[1]) && !isInitials(tokens[0])) {
    return { lastName: tokens[0], firstName: tokens[1] };
  }
  // "Wouter Hendrickx" (FirstName ... LastName)
  return { firstName: tokens[0], lastName: tokens[tokens.length - 1] };
}

/**
 * Do two free-text author lists plausibly describe the same authorship? True
 * when the lead author of one list matches the other (via matchesAuthorName in
 * either direction), or the two lists share a surname token. Conservative
 * fallback avoids merging same-title papers by different groups.
 */
export function authorsOverlap(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;

  const leadA = parseLeadAuthor(a);
  if (leadA && matchesAuthorName(b, leadA.firstName, leadA.lastName)) return true;

  const leadB = parseLeadAuthor(b);
  if (leadB && matchesAuthorName(a, leadB.firstName, leadB.lastName)) return true;

  const tokensOf = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z\s,;-]/g, "")
        .split(/[,;\s]+/)
        .filter((t) => t.length >= 4),
    );
  const sa = tokensOf(a);
  const sb = tokensOf(b);
  for (const t of sa) if (sb.has(t)) return true;
  return false;
}

class UnionFind {
  private parent = new Map<number, number>();
  constructor(ids: number[]) {
    for (const id of ids) this.parent.set(id, id);
  }
  find(x: number): number {
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // path compression
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Is this pair a fuzzy metadata duplicate (title + year + author overlap)? */
function isMetadataDuplicate(p: DedupPublication, q: DedupPublication): boolean {
  const tp = normalizeTitle(p.title);
  const tq = normalizeTitle(q.title);
  if (!tp || tp !== tq) return false;
  const yp = yearOf(p.publicationDate);
  const yq = yearOf(q.publicationDate);
  if (yp === null || yq === null || yp !== yq) return false;
  // When one record has no author data at all, the author-overlap check can
  // never pass — but an exact normalized-title match in the same year is
  // already strong evidence, so flag the pair instead of silently skipping it.
  const pHasAuthors = !!p.authors?.trim();
  const qHasAuthors = !!q.authors?.trim();
  if (!pHasAuthors || !qHasAuthors) return true;
  return authorsOverlap(p.authors, q.authors);
}

/** Is this pair a preprint <-> published pair (one preprint, one not)? */
function isPreprintPairDuplicate(
  p: DedupPublication,
  q: DedupPublication,
): boolean {
  const tp = normalizeTitle(p.title);
  const tq = normalizeTitle(q.title);
  if (!tp || tp !== tq) return false;
  if (isPreprintRecord(p) === isPreprintRecord(q)) return false;
  return authorsOverlap(p.authors, q.authors);
}

/**
 * Detect duplicate groups across a set of publications. Returns one entry per
 * group of 2+ records, tagged with every detection reason that applies and a
 * flag for preprint<->published groups.
 */
export function detectDuplicateGroups(
  publications: DedupPublication[],
): DuplicateGroup[] {
  const ids = publications.map((p) => p.id);
  const uf = new UnionFind(ids);
  const byId = new Map(publications.map((p) => [p.id, p]));

  // Rule 1 + 2: bucket by exact normalized DOI / PMID and union each bucket.
  const doiBuckets = new Map<string, number[]>();
  const pmidBuckets = new Map<string, number[]>();
  // Bucket by normalized title to keep the fuzzy O(n^2) comparison cheap — only
  // records sharing a title can be metadata / preprint-pair duplicates.
  const titleBuckets = new Map<string, number[]>();

  for (const p of publications) {
    const doi = normalizeDoi(p.doi);
    if (doi) (doiBuckets.get(doi) ?? doiBuckets.set(doi, []).get(doi)!).push(p.id);
    const pmid = normalizePmid(p.pmid);
    if (pmid)
      (pmidBuckets.get(pmid) ?? pmidBuckets.set(pmid, []).get(pmid)!).push(p.id);
    const title = normalizeTitle(p.title);
    if (title)
      (titleBuckets.get(title) ?? titleBuckets.set(title, []).get(title)!).push(
        p.id,
      );
  }

  for (const bucket of doiBuckets.values())
    for (let i = 1; i < bucket.length; i++) uf.union(bucket[0], bucket[i]);
  for (const bucket of pmidBuckets.values())
    for (let i = 1; i < bucket.length; i++) uf.union(bucket[0], bucket[i]);

  // Rule 3 + 4: pairwise within each title bucket.
  for (const bucket of titleBuckets.values()) {
    if (bucket.length < 2) continue;
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const p = byId.get(bucket[i])!;
        const q = byId.get(bucket[j])!;
        if (isMetadataDuplicate(p, q) || isPreprintPairDuplicate(p, q)) {
          uf.union(p.id, q.id);
        }
      }
    }
  }

  // Build connected components.
  const components = new Map<number, number[]>();
  for (const id of ids) {
    const root = uf.find(id);
    (components.get(root) ?? components.set(root, []).get(root)!).push(id);
  }

  const groups: DuplicateGroup[] = [];
  for (const member of components.values()) {
    if (member.length < 2) continue;
    const pubs = member.map((id) => byId.get(id)!);
    const reasons = new Set<DuplicateReason>();
    let isPreprintPair = false;

    for (let i = 0; i < pubs.length; i++) {
      for (let j = i + 1; j < pubs.length; j++) {
        const p = pubs[i];
        const q = pubs[j];
        const dp = normalizeDoi(p.doi);
        const dq = normalizeDoi(q.doi);
        if (dp && dq && dp === dq) reasons.add("doi");
        const pp = normalizePmid(p.pmid);
        const pq = normalizePmid(q.pmid);
        if (pp && pq && pp === pq) reasons.add("pmid");
        if (isMetadataDuplicate(p, q)) reasons.add("metadata");
        if (isPreprintPairDuplicate(p, q)) {
          reasons.add("preprint-pair");
          isPreprintPair = true;
        }
      }
    }

    groups.push({
      reasons: Array.from(reasons),
      isPreprintPair,
      publicationIds: member.slice().sort((a, b) => a - b),
    });
  }

  // Stable, deterministic ordering: preprint pairs first, then by smallest id.
  groups.sort((a, b) => {
    if (a.isPreprintPair !== b.isPreprintPair) return a.isPreprintPair ? -1 : 1;
    return Math.min(...a.publicationIds) - Math.min(...b.publicationIds);
  });

  return groups;
}

/** Count of non-empty "completeness" fields, used to pick a default survivor. */
function completenessScore(p: DedupPublication): number {
  const fields = [
    p.abstract,
    p.journal,
    p.volume,
    p.issue,
    p.pages,
    p.doi,
    p.pmid,
    p.publicationDate,
  ];
  return fields.reduce((n, f) => n + (f ? 1 : 0), 0);
}

/**
 * Choose the default surviving record for a group: prefer the published version
 * over a preprint, then a record with a PMID, then a DOI, then the most complete
 * record, breaking ties by the lowest id.
 */
export function pickDefaultSurvivorId(publications: DedupPublication[]): number {
  const ranked = publications.slice().sort((a, b) => {
    const pa = isPreprintRecord(a) ? 1 : 0;
    const pb = isPreprintRecord(b) ? 1 : 0;
    if (pa !== pb) return pa - pb; // non-preprint first
    const ha = a.pmid ? 0 : 1;
    const hb = b.pmid ? 0 : 1;
    if (ha !== hb) return ha - hb; // has PMID first
    const da = a.doi ? 0 : 1;
    const dbb = b.doi ? 0 : 1;
    if (da !== dbb) return da - dbb; // has DOI first
    const ca = completenessScore(a);
    const cb = completenessScore(b);
    if (ca !== cb) return cb - ca; // most complete first
    return a.id - b.id; // lowest id
  });
  return ranked[0].id;
}
