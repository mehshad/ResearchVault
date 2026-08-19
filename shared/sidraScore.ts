/**
 * Shared Sidra Score types, defaults and validation schema.
 * Used by both server (service + routes) and client.
 */
import { z } from "zod";

// ── Canonical multiplier keys ──────────────────────────────────────────────────
export const CANONICAL_MULTIPLIER_KEYS = [
  "First Author",
  "Second or Second Last Author",
  "Last Author",
  "Corresponding Author",
] as const;

export type CanonicalMultiplierKey = typeof CANONICAL_MULTIPLIER_KEYS[number];

export const DEFAULT_MULTIPLIERS: Record<CanonicalMultiplierKey, number> = {
  "First Author": 2,
  "Second or Second Last Author": 1.5,
  "Last Author": 2,
  "Corresponding Author": 2,
};

// ── Settings shape ─────────────────────────────────────────────────────────────

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export const sidraScoreSettingsSchema = z
  .object({
    /** Rolling-year window (used when startMonth/endMonth are absent). */
    years: z.number().int().min(1).max(50).default(5),
    /** Custom range start in YYYY-MM format. Must accompany endMonth. */
    startMonth: z
      .string()
      .regex(monthPattern, "Must be YYYY-MM")
      .optional(),
    /** Custom range end in YYYY-MM format. Must accompany startMonth. */
    endMonth: z
      .string()
      .regex(monthPattern, "Must be YYYY-MM")
      .optional(),
    /** Which year's IF to look up: prior year, publication year, or latest available. */
    impactFactorYear: z
      .enum(["prior", "publication", "latest"])
      .default("publication"),
    /** Override any of the four canonical role multipliers. */
    multipliers: z
      .object({
        "First Author": z.number().min(0).default(2),
        "Second or Second Last Author": z.number().min(0).default(1.5),
        "Last Author": z.number().min(0).default(2),
        "Corresponding Author": z.number().min(0).default(2),
      })
      .default({}),
    /** When true, publications with non-"Published *" status are included. */
    includeNonVetted: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    const hasStart = typeof data.startMonth === "string";
    const hasEnd = typeof data.endMonth === "string";
    if (hasStart !== hasEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startMonth and endMonth must both be provided together",
      });
    }
    if (hasStart && hasEnd && data.startMonth! > data.endMonth!) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startMonth must not be after endMonth",
      });
    }
  });

export type SidraScoreSettings = z.infer<typeof sidraScoreSettingsSchema>;

export const DEFAULT_SIDRA_SCORE_SETTINGS: SidraScoreSettings = {
  years: 5,
  startMonth: undefined,
  endMonth: undefined,
  impactFactorYear: "publication",
  multipliers: { ...DEFAULT_MULTIPLIERS },
  includeNonVetted: false,
};

// ── System-config key ──────────────────────────────────────────────────────────
export const SIDRA_SCORE_SETTINGS_KEY = "sidra_score_settings";

// ── Result types ───────────────────────────────────────────────────────────────

/** A single publication that was excluded from the score calculation. */
export interface SidraExcludedPublication {
  title: string;
  journal: string | null;
  /** Human-readable explanation for exclusion. */
  reason: string;
  /** Actionable suggestion for the publication office. */
  action: string;
}

/** A single publication that contributed to the score, with per-row details. */
export interface SidraIncludedPublication {
  title: string;
  journal: string | null;
  publicationDate: string | null;
  impactFactor: number;
  targetYear: number;
  actualYear: number;
  usedFallback: boolean;
  authorshipTypes: string[];
  appliedMultipliers: string[];
  multiplier: number;
  publicationScore: number;
}

/** Result for a single scientist. */
export interface SidraScoreResult {
  id: number;
  honorificTitle: string | null;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  department: string | null;
  publicationsCount: number;
  sidraScore: number;
  /** Back-compat: titles of publications with no IF on record. */
  missingImpactFactorPublications: string[];
  excludedPublications: SidraExcludedPublication[];
  calculationDetails: SidraIncludedPublication[];
  /** The settings used to produce this result. */
  settings: SidraScoreSettings;
}
