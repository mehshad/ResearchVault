/**
 * Bulk "Import Links" for the Outcome Office New Publications page.
 *
 * Officers download an Excel template with 4 columns:
 *   1. Publication ID       — a DOI or PMID identifying an existing publication
 *   2. Publication ID Type  — "DOI" or "PMID"
 *   3. Link Type            — "SDR" (link to a research activity) or "Staff"
 *                             (link an internal author)
 *   4. Link                 — the SDR number (e.g. SDR200079) or the staff
 *                             member's name (e.g. John Smith)
 *
 * The filled file is uploaded (base64, same convention as the staff import),
 * previewed row-by-row (matched vs ignored with a reason), then applied.
 */
import ExcelJS from "exceljs";
import { parseUploadedFile } from "./scientistsImportExport";
import { normalizeDoi } from "@shared/publicationDeduplication";
import type { Publication, ResearchActivity, Scientist } from "@shared/schema";

export const TEMPLATE_HEADERS = [
  "Publication ID",
  "Publication ID Type",
  "Link Type",
  "Link",
] as const;

export async function buildLinkImportTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Links");
  ws.addRow([...TEMPLATE_HEADERS]);
  ws.getRow(1).font = { bold: true };
  ws.addRow(["10.1186/s12967-023-04705-3", "DOI", "SDR", "SDR200079"]);
  ws.addRow(["37845706", "PMID", "Staff", "John Smith"]);
  ws.columns.forEach((c) => (c.width = 32));
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** Diacritic-stripped, lowercased, whitespace-collapsed. */
function fold(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip honorifics/titles from a folded name. */
function stripTitles(folded: string): string {
  return folded
    .replace(/\b(dr|prof|professor|mr|mrs|ms|md|phd)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface LinkImportRow {
  row: number; // 1-based data row number (excluding header)
  idValue: string;
  idType: string;
  linkType: string;
  linkValue: string;
  status: "matched" | "ignored";
  reason?: string;
  publicationId?: number;
  publicationTitle?: string;
  // SDR match details
  researchActivityId?: number;
  sdrNumber?: string;
  sdrTitle?: string;
  // Staff match details
  scientistId?: number;
  scientistName?: string;
  scientistJobTitle?: string;
  alreadyLinked?: boolean;
}

function pickColumn(rowObj: Record<string, any>, candidates: string[]): string {
  const keys = Object.keys(rowObj);
  // Exact header matches first — a substring pass alone would let "Link"
  // wrongly resolve to the "Link Type" column.
  for (const cand of candidates) {
    const key = keys.find((k) => fold(k) === fold(cand));
    if (key !== undefined) return String(rowObj[key] ?? "").trim();
  }
  for (const cand of candidates) {
    const key = keys.find((k) => fold(k).includes(fold(cand)));
    if (key !== undefined) return String(rowObj[key] ?? "").trim();
  }
  return "";
}

export function scientistDisplayName(s: Scientist): string {
  return [s.honorificTitle, s.firstName, s.lastName].filter(Boolean).join(" ").trim();
}

function matchScientistByName(name: string, scientists: Scientist[]): Scientist[] {
  const wanted = stripTitles(fold(name));
  if (!wanted) return [];
  const matches: Scientist[] = [];
  for (const s of scientists) {
    const first = stripTitles(fold(s.firstName));
    const last = stripTitles(fold(s.lastName));
    if (!last) continue;
    const fl = `${first} ${last}`.trim();
    const lf = `${last} ${first}`.trim();
    if (wanted === fl || wanted === lf || wanted === last) {
      matches.push(s);
      continue;
    }
    // All tokens of the wanted name appear in the scientist's full name
    // (handles middle names / extra initials in either direction).
    const tokens = wanted.split(" ").filter(Boolean);
    const nameTokens = new Set(fl.split(" ").filter(Boolean));
    if (tokens.length >= 2 && tokens.every((t) => nameTokens.has(t))) {
      matches.push(s);
    }
  }
  return matches;
}

export async function previewLinkImport(
  fileBase64: string,
  fileName: string,
  data: {
    publications: Publication[];
    researchActivities: ResearchActivity[];
    scientists: Scientist[];
    publicationAuthors: Map<number, Set<number>>; // pubId -> linked scientistIds
  },
): Promise<LinkImportRow[]> {
  // Same upload cap as the staff import; reject before decoding.
  if (fileBase64.length > 8 * 1024 * 1024) {
    throw new Error("File is too large (max ~6 MB). Split it into smaller files.");
  }
  const rawRows = await parseUploadedFile(fileBase64, fileName);
  if (rawRows.length > 2000) {
    throw new Error(`Too many rows (${rawRows.length}). Limit each file to 2000 rows.`);
  }

  // Multimaps: an identifier shared by several publication records (duplicates
  // are supported elsewhere) must be reported as ambiguous, not silently
  // linked to an arbitrary record.
  const byDoi = new Map<string, Publication[]>();
  const byPmid = new Map<string, Publication[]>();
  const push = (map: Map<string, Publication[]>, key: string, p: Publication) => {
    const list = map.get(key);
    if (list) { if (!list.includes(p)) list.push(p); } else map.set(key, [p]);
  };
  for (const p of data.publications) {
    const d = normalizeDoi(p.doi);
    if (d) push(byDoi, d, p);
    for (const alt of (p as any).alternateDois ?? []) {
      const a = normalizeDoi(alt);
      if (a) push(byDoi, a, p);
    }
    const pm = String((p as any).pmid ?? "").trim();
    if (pm) push(byPmid, pm, p);
  }
  const sdrByNumber = new Map<string, ResearchActivity>();
  for (const ra of data.researchActivities) {
    if (ra.sdrNumber) sdrByNumber.set(fold(ra.sdrNumber), ra);
  }

  const results: LinkImportRow[] = [];
  // Within-file conflict tracking: only the first SDR row per publication is
  // applied (later ones would silently overwrite it), and duplicate rows for
  // the same (publication, target) pair are ignored.
  const sdrRowByPub = new Map<number, number>(); // pubId -> first data-row with an SDR link
  const seenStaffPairs = new Set<string>(); // "pubId:scientistId"
  rawRows.forEach((rowObj, i) => {
    const idValue = pickColumn(rowObj, ["Publication ID"]);
    const idType = pickColumn(rowObj, ["Publication ID Type", "ID Type"]).toUpperCase();
    const linkType = pickColumn(rowObj, ["Link Type"]);
    const linkValue = pickColumn(rowObj, ["Link"]);
    const base: LinkImportRow = {
      row: i + 1,
      idValue,
      idType,
      linkType,
      linkValue,
      status: "ignored",
    };

    // Skip fully empty rows silently
    if (!idValue && !idType && !linkType && !linkValue) return;

    if (!idValue || !linkValue) {
      results.push({ ...base, reason: "Missing publication ID or link value" });
      return;
    }

    let candidates: Publication[] = [];
    if (idType === "PMID") {
      candidates = byPmid.get(idValue.replace(/^pmid:?\s*/i, "").trim()) ?? [];
    } else if (idType === "DOI" || !idType) {
      const d = normalizeDoi(idValue);
      candidates = (d ? byDoi.get(d) : undefined) ?? [];
    } else {
      results.push({ ...base, reason: `Unknown ID type "${idType}" (use DOI or PMID)` });
      return;
    }
    if (candidates.length === 0) {
      results.push({ ...base, reason: `No publication found with ${idType || "DOI"} "${idValue}"` });
      return;
    }
    if (candidates.length > 1) {
      results.push({
        ...base,
        reason: `Ambiguous ${idType || "DOI"} "${idValue}" matches ${candidates.length} publication records — merge the duplicates first`,
      });
      return;
    }
    const pub = candidates[0];
    base.publicationId = pub.id;
    base.publicationTitle = pub.title;

    const lt = fold(linkType);
    if (lt === "sdr") {
      const ra = sdrByNumber.get(fold(linkValue));
      if (!ra) {
        results.push({ ...base, reason: `No SDR found with number "${linkValue}"` });
        return;
      }
      const firstSdrRow = sdrRowByPub.get(pub.id);
      if (firstSdrRow !== undefined) {
        results.push({
          ...base,
          reason: `Conflicts with row ${firstSdrRow} — a publication can only be linked to one SDR; only the first row is applied`,
        });
        return;
      }
      sdrRowByPub.set(pub.id, base.row);
      const already = pub.researchActivityId === ra.id;
      results.push({
        ...base,
        status: "matched",
        researchActivityId: ra.id,
        sdrNumber: ra.sdrNumber,
        sdrTitle: ra.title,
        alreadyLinked: already,
        reason: already
          ? "Publication is already linked to this SDR"
          : pub.researchActivityId
            ? "Publication is linked to a different SDR — it will be replaced"
            : undefined,
      });
    } else if (lt === "staff") {
      const matches = matchScientistByName(linkValue, data.scientists);
      if (matches.length === 0) {
        results.push({ ...base, reason: `No staff member found matching "${linkValue}"` });
        return;
      }
      if (matches.length > 1) {
        results.push({
          ...base,
          reason: `Ambiguous name "${linkValue}" matches ${matches.length} staff members (${matches
            .slice(0, 3)
            .map(scientistDisplayName)
            .join("; ")})`,
        });
        return;
      }
      const s = matches[0];
      const pairKey = `${pub.id}:${s.id}`;
      if (seenStaffPairs.has(pairKey)) {
        results.push({ ...base, reason: "Duplicate row — this staff link already appears earlier in the file" });
        return;
      }
      seenStaffPairs.add(pairKey);
      const already = data.publicationAuthors.get(pub.id)?.has(s.id) ?? false;
      results.push({
        ...base,
        status: "matched",
        scientistId: s.id,
        scientistName: scientistDisplayName(s),
        scientistJobTitle: s.jobTitle ?? undefined,
        alreadyLinked: already,
        reason: already ? "Staff member is already linked to this publication" : undefined,
      });
    } else {
      results.push({ ...base, reason: `Unknown link type "${linkType}" (use SDR or Staff)` });
    }
  });

  return results;
}
