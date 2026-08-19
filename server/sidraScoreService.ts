/**
 * Sidra Score calculation service.
 * Pure business-logic functions, no Express references — testable in isolation.
 */
import { db } from "./db";
import { storage, normalizeJournalName } from "./databaseStorage";
import { publicationAuthors, journals, journalImpactFactorMetrics } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import {
  SidraScoreSettings,
  SidraScoreResult,
  SidraExcludedPublication,
  SidraIncludedPublication,
  DEFAULT_SIDRA_SCORE_SETTINGS,
  SIDRA_SCORE_SETTINGS_KEY,
  sidraScoreSettingsSchema,
} from "@shared/sidraScore";

// ── Authorship normalization ───────────────────────────────────────────────────

/**
 * Normalizes stored/legacy authorship labels to canonical multiplier keys.
 * Co- variants share the same weight as the base role; old senior-author
 * labels map to Last Author.
 */
export function normalizeAuthorshipType(type: string): string {
  const t = type.trim();
  if (
    t === "Senior Author" ||
    t === "Senior/Last Author" ||
    t === "Co-Senior/Last Author" ||
    t === "Co-Last Author"
  )
    return "Last Author";
  if (t === "Co-First Author") return "First Author";
  return t;
}

// ── Settings persistence ───────────────────────────────────────────────────────

/**
 * Load official Sidra-score settings from system_configurations.
 * Returns DEFAULT_SIDRA_SCORE_SETTINGS if the record is absent or invalid.
 */
export async function loadOfficialSettings(): Promise<SidraScoreSettings> {
  try {
    const row = await storage.getSystemConfiguration(SIDRA_SCORE_SETTINGS_KEY);
    if (!row) return { ...DEFAULT_SIDRA_SCORE_SETTINGS };
    const parsed = sidraScoreSettingsSchema.safeParse(row.value);
    if (!parsed.success) return { ...DEFAULT_SIDRA_SCORE_SETTINGS };
    return parsed.data;
  } catch {
    return { ...DEFAULT_SIDRA_SCORE_SETTINGS };
  }
}

/**
 * Persist Sidra-score settings to system_configurations (upsert).
 * Returns the normalized settings that were saved.
 */
export async function saveOfficialSettings(
  raw: unknown
): Promise<SidraScoreSettings> {
  const settings = sidraScoreSettingsSchema.parse(raw);
  const existing = await storage.getSystemConfiguration(SIDRA_SCORE_SETTINGS_KEY);
  if (existing) {
    await storage.updateSystemConfiguration(SIDRA_SCORE_SETTINGS_KEY, {
      value: settings as any,
    });
  } else {
    await storage.createSystemConfiguration({
      key: SIDRA_SCORE_SETTINGS_KEY,
      value: settings as any,
      description: "Office-wide Sidra Score calculation settings",
      category: "publications",
      isUserConfigurable: false,
    });
  }
  return settings;
}

// ── Core calculation ───────────────────────────────────────────────────────────

/** Result of the batched pre-fetch step (reusable across multiple scientist calculations). */
export interface SidraDataBundle {
  /** scientistId → publicationId → combined authorship-type string (comma-joined) */
  authorshipByScientist: Map<number, Map<number, string>>;
  /** normalizedJournalName → year → impactFactor */
  ifByJournalYear: Map<string, Map<number, number>>;
  currentYear: number;
}

/**
 * Fetch all authorships and impact-factor metrics in two batched queries.
 * Pass `scientistIds` to restrict to a subset (e.g. scientific staff only).
 */
export async function fetchSidraDataBundle(
  scientistIds: number[]
): Promise<SidraDataBundle> {
  const currentYear = new Date().getFullYear();

  if (scientistIds.length === 0) {
    return {
      authorshipByScientist: new Map(),
      ifByJournalYear: new Map(),
      currentYear,
    };
  }

  const [allAuthorRows, allMetricRows] = await Promise.all([
    db
      .select({
        publicationId: publicationAuthors.publicationId,
        scientistId: publicationAuthors.scientistId,
        authorshipType: publicationAuthors.authorshipType,
      })
      .from(publicationAuthors)
      .where(inArray(publicationAuthors.scientistId, scientistIds)),
    db
      .select({
        journalName: journals.journalName,
        year: journalImpactFactorMetrics.year,
        impactFactor: journalImpactFactorMetrics.impactFactor,
      })
      .from(journalImpactFactorMetrics)
      .innerJoin(
        journals,
        eq(journalImpactFactorMetrics.journalId, journals.id)
      ),
  ]);

  const authorshipByScientist = new Map<number, Map<number, string>>();
  for (const row of allAuthorRows) {
    let m = authorshipByScientist.get(row.scientistId);
    if (!m) {
      m = new Map();
      authorshipByScientist.set(row.scientistId, m);
    }
    const existing = m.get(row.publicationId);
    m.set(
      row.publicationId,
      existing ? `${existing},${row.authorshipType}` : row.authorshipType
    );
  }

  const ifByJournalYear = new Map<string, Map<number, number>>();
  for (const m of allMetricRows) {
    const ifVal =
      m.impactFactor != null ? parseFloat(String(m.impactFactor)) : NaN;
    if (!Number.isFinite(ifVal)) continue;
    const key = normalizeJournalName(m.journalName);
    let yearMap = ifByJournalYear.get(key);
    if (!yearMap) {
      yearMap = new Map();
      ifByJournalYear.set(key, yearMap);
    }
    yearMap.set(m.year, ifVal);
  }

  return { authorshipByScientist, ifByJournalYear, currentYear };
}

/** Look up an IF value for a journal name and target year. Returns null if not found. */
export function lookupIf(
  ifByJournalYear: Map<string, Map<number, number>>,
  journalName: string,
  year: number
): number | null {
  const yearMap = ifByJournalYear.get(normalizeJournalName(journalName));
  if (!yearMap) return null;
  const v = yearMap.get(year);
  return v != null ? v : null;
}

// ── Exclusion reason helpers ───────────────────────────────────────────────────

/** All status values that qualify a publication for scoring. */
const QUALIFYING_STATUSES = [
  "published",
  "published *",
  "accepted/in press",
  "in press",
];

function makeExcluded(
  title: string,
  journal: string | null | undefined,
  reason: string,
  action: string
): SidraExcludedPublication {
  return { title, journal: journal ?? null, reason, action };
}

// ── Per-scientist score calculation ───────────────────────────────────────────

export interface ScientistLike {
  id: number;
  honorificTitle?: string | null;
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  department?: string | null;
}

export interface PublicationLike {
  id: number;
  title: string;
  journal?: string | null;
  /** Accepts both a Date object (from Drizzle ORM) or an ISO string. */
  publicationDate?: Date | string | null;
  status?: string | null;
}

/**
 * Calculate the Sidra Score for a single scientist given the pre-fetched data
 * bundle and the full publication list. Does NOT hit the database.
 */
export function calculateScientistScore(
  scientist: ScientistLike,
  allPublications: PublicationLike[],
  bundle: SidraDataBundle,
  settings: SidraScoreSettings
): SidraScoreResult {
  const {
    years,
    startMonth,
    endMonth,
    impactFactorYear,
    multipliers,
    includeNonVetted,
  } = settings;

  const finalMultipliers = {
    "First Author": multipliers["First Author"] ?? 2,
    "Second or Second Last Author":
      multipliers["Second or Second Last Author"] ?? 1.5,
    "Last Author": multipliers["Last Author"] ?? 2,
    "Corresponding Author": multipliers["Corresponding Author"] ?? 2,
  };

  const { authorshipByScientist, ifByJournalYear, currentYear } = bundle;

  // Compute date range
  const useCustomRange =
    typeof startMonth === "string" && typeof endMonth === "string";
  let cutoffDate: Date;
  let rangeEndDate: Date | null = null;
  if (useCustomRange) {
    const [sy, sm] = startMonth!.split("-").map(Number);
    const [ey, em] = endMonth!.split("-").map(Number);
    cutoffDate = new Date(sy, sm - 1, 1);
    rangeEndDate = new Date(ey, em, 0, 23, 59, 59, 999);
  } else {
    cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - years);
  }

  let totalScore = 0;
  let publicationsCount = 0;
  const missingImpactFactorPublications: string[] = [];
  const excludedPublications: SidraExcludedPublication[] = [];
  const calculationDetails: SidraIncludedPublication[] = [];

  const authorshipMap = authorshipByScientist.get(scientist.id);
  if (authorshipMap) {
    for (const pub of allPublications) {
      const authorshipTypeStr = authorshipMap.get(pub.id);
      // Not linked to this scientist — silently skip (not an exclusion).
      if (!authorshipTypeStr) continue;

      // ── Gate 1: publication date must exist ──
      if (!pub.publicationDate) {
        excludedPublications.push(
          makeExcluded(
            pub.title,
            pub.journal,
            "Missing publication date",
            "Check the manuscript details and ask the Outcome Office to add its publication date."
          )
        );
        continue;
      }

      const pubDate = pub.publicationDate instanceof Date
        ? pub.publicationDate
        : new Date(pub.publicationDate as string);
      if (Number.isNaN(pubDate.getTime())) {
        excludedPublications.push(
          makeExcluded(
            pub.title,
            pub.journal,
            "Invalid publication date",
            "Check the date on this manuscript and ask the Outcome Office to correct the publication record."
          )
        );
        continue;
      }

      // ── Gate 2: within the official scoring window ──
      if (pubDate < cutoffDate) {
        excludedPublications.push(
          makeExcluded(
            pub.title,
            pub.journal,
            `Published before the scoring window (${pubDate.toISOString().slice(0, 10)})`,
            "No action needed — publication is outside the scoring period."
          )
        );
        continue;
      }
      if (rangeEndDate && pubDate > rangeEndDate) {
        excludedPublications.push(
          makeExcluded(
            pub.title,
            pub.journal,
            `Published after the scoring window end (${pubDate.toISOString().slice(0, 10)})`,
            "No action needed — publication is outside the scoring period."
          )
        );
        continue;
      }

      // ── Gate 3: eligible publication status ──
      const statusLc = (pub.status || "").toLowerCase();
      if (!QUALIFYING_STATUSES.includes(statusLc)) {
        excludedPublications.push(
          makeExcluded(
            pub.title,
            pub.journal,
            `Unsupported status: "${pub.status}"`,
            "Ask the Outcome Office to review and correct the publication status if it is inaccurate."
          )
        );
        continue;
      }

      // ── Gate 4: journal name must be present ──
      if (!pub.journal || pub.journal.trim() === "") {
        excludedPublications.push(
          makeExcluded(
            pub.title,
            pub.journal,
            "Missing journal name",
            "Check the manuscript details and ask the Outcome Office to add its journal."
          )
        );
        continue;
      }

      // ── Gate 5: vetted status check ──
      if (!includeNonVetted && statusLc !== "published *") {
        excludedPublications.push(
          makeExcluded(
            pub.title,
            pub.journal,
            `Not vetted (status: ${pub.status})`,
            "Ask the Outcome Office to verify the manuscript and mark it as 'Published *' when appropriate."
          )
        );
        continue;
      }

      // ── Gate 6: impact factor lookup ──
      const pubYear = pubDate.getFullYear();
      let targetYear: number;
      if (impactFactorYear === "prior") targetYear = pubYear - 1;
      else if (impactFactorYear === "publication") targetYear = pubYear;
      else targetYear = currentYear;

      let ifValue = lookupIf(ifByJournalYear, pub.journal, targetYear);
      let actualYear = targetYear;
      let usedFallback = false;

      if (ifValue == null) {
        usedFallback = true;
        const fallbackYears =
          impactFactorYear === "latest"
            ? Array.from(
                { length: Math.max(0, currentYear - 1 - 2020 + 1) },
                (_, i) => currentYear - 1 - i
              )
            : [targetYear + 1, targetYear - 1, targetYear + 2, targetYear - 2].filter(
                (y) => y >= 2020
              );
        for (const fy of fallbackYears) {
          const v = lookupIf(ifByJournalYear, pub.journal, fy);
          if (v != null) {
            ifValue = v;
            actualYear = fy;
            break;
          }
        }
      }

      if (ifValue == null || !Number.isFinite(ifValue)) {
        missingImpactFactorPublications.push(pub.title);
        excludedPublications.push(
          makeExcluded(
            pub.title,
            pub.journal,
            "No impact factor on record",
            `Ask the Outcome Office to add the impact factor for "${pub.journal}" (year ${targetYear}).`
          )
        );
        continue;
      }

      // ── Include and score ──
      publicationsCount++;
      const authorshipTypes = authorshipTypeStr
        .split(",")
        .map((t) => normalizeAuthorshipType(t));
      let multiplier = 1;
      let appliedMultipliers: string[] = [];
      for (const type of authorshipTypes) {
        const mul = (finalMultipliers as Record<string, number>)[type];
        if (mul != null && !isNaN(mul)) {
          if (mul > multiplier) {
            multiplier = mul;
            appliedMultipliers = [type];
          } else if (
            mul === multiplier &&
            !appliedMultipliers.includes(type)
          ) {
            appliedMultipliers.push(type);
          }
        }
      }

      const publicationScore = ifValue * multiplier;
      totalScore += publicationScore;

      calculationDetails.push({
        title: pub.title,
        journal: pub.journal ?? null,
        publicationDate: pub.publicationDate instanceof Date
          ? pub.publicationDate.toISOString()
          : (pub.publicationDate ?? null),
        impactFactor: ifValue,
        targetYear,
        actualYear,
        usedFallback,
        authorshipTypes,
        appliedMultipliers,
        multiplier,
        publicationScore,
      });
    }
  }

  return {
    id: scientist.id,
    honorificTitle: scientist.honorificTitle ?? null,
    firstName: scientist.firstName,
    lastName: scientist.lastName,
    jobTitle: scientist.jobTitle ?? null,
    department: scientist.department ?? null,
    publicationsCount,
    sidraScore: totalScore,
    missingImpactFactorPublications,
    excludedPublications,
    calculationDetails,
    settings,
  };
}

// ── Office-wide calculation (all scientific staff) ────────────────────────────

/**
 * Calculate Sidra Scores for every scientific staff member.
 * Uses batched DB queries; does not accept arbitrary settings from callers —
 * settings are validated and normalized before being passed in.
 */
export async function calculateAllScientistScores(
  settings: SidraScoreSettings
): Promise<SidraScoreResult[]> {
  const allScientists = await storage.getScientists();
  const scientificScientists = allScientists.filter(
    (s) => s.staffType === "scientific"
  );

  if (scientificScientists.length === 0) return [];

  const scientificIds = scientificScientists.map((s) => s.id);
  const [allPublications, bundle] = await Promise.all([
    storage.getPublications(),
    fetchSidraDataBundle(scientificIds),
  ]);

  const rankings = scientificScientists.map((scientist) =>
    calculateScientistScore(scientist, allPublications, bundle, settings)
  );

  rankings.sort((a, b) => b.sidraScore - a.sidraScore);
  return rankings;
}

/**
 * Calculate Sidra Score for a single scientist identified by id.
 * Fetches only their authorship rows; still needs all publications for join.
 */
export async function calculateSingleScientistScore(
  scientistId: number,
  settings: SidraScoreSettings
): Promise<SidraScoreResult | null> {
  const scientist = await storage.getScientist(scientistId);
  if (!scientist) return null;

  const [allPublications, bundle] = await Promise.all([
    storage.getPublications(),
    fetchSidraDataBundle([scientistId]),
  ]);

  return calculateScientistScore(scientist, allPublications, bundle, settings);
}
