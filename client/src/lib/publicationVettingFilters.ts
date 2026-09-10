/**
 * The Publication vetting filters, remembered between visits.
 *
 * An officer works the same slice of the queue every day -- one stage, no
 * outstanding issues, this year -- and was re-choosing all of it on every
 * visit, including after following a publication and coming back. The choices
 * are view state, not data: they belong to one person on one browser and never
 * need to reach the server, which is the same reasoning as the other entries in
 * uiPreference.ts.
 *
 * Stored as one JSON value rather than six keys so the set is written and read
 * atomically -- a half-applied filter set is a queue that looks wrong for
 * reasons nobody can see.
 *
 * Every stored value is checked on the way back in. A shape that no longer
 * matches -- a year range the app has stopped offering, a status renamed, an
 * object someone hand-edited -- falls back to the default for that field rather
 * than being trusted, because a filter nobody can account for silently hides
 * work.
 */
import { readPreference, writePreference } from "./uiPreference";

export const VETTING_FILTERS_KEY = "publication-vetting-filters";

export type VettingYearRange = "this-year" | "3" | "5" | "all";

export const VETTING_YEAR_RANGES: readonly VettingYearRange[] = [
  "this-year",
  "3",
  "5",
  "all",
];

export interface VettingFilters {
  /** Workflow status, or the all-states sentinel. */
  status: string;
  /** Issue/tag filter. */
  tag: string;
  /** Scientist id as a string, or "all". */
  scientistId: string;
  /** YYYY-MM-DD, or empty. */
  dateFrom: string;
  /** YYYY-MM-DD, or empty. */
  dateTo: string;
  yearRange: VettingYearRange;
}

/**
 * What the queue opens on before anybody has chosen otherwise.
 *
 * Published with no outstanding issues, this year: those are the records
 * awaiting an office decision, and everything else was in the way of them.
 */
export const DEFAULT_VETTING_FILTERS: VettingFilters = {
  status: "Published",
  tag: "no-issues",
  scientistId: "all",
  dateFrom: "",
  dateTo: "",
  yearRange: "this-year",
};

/** A date input's value: YYYY-MM-DD, or nothing at all. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Long enough for any status or id the app uses, short enough that a stored
 * value cannot become a payload.
 */
const MAX_LENGTH = 120;

function cleanString(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_LENGTH) return fallback;
  return trimmed;
}

function cleanDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return ISO_DATE.test(trimmed) ? trimmed : "";
}

/**
 * Reduce a stored blob to something the screen can apply.
 *
 * Takes the defaults as an argument rather than importing them, because the
 * defaults are the page's decision -- which stage the queue opens on is a
 * judgement about what work looks like, not a storage concern.
 */
export function parseVettingFilters(
  raw: unknown,
  defaults: VettingFilters,
): VettingFilters {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
  const stored = raw as Record<string, unknown>;
  const yearRange = stored.yearRange;
  return {
    status: cleanString(stored.status, defaults.status),
    tag: cleanString(stored.tag, defaults.tag),
    scientistId: cleanString(stored.scientistId, defaults.scientistId),
    dateFrom: cleanDate(stored.dateFrom),
    dateTo: cleanDate(stored.dateTo),
    yearRange: VETTING_YEAR_RANGES.includes(yearRange as VettingYearRange)
      ? (yearRange as VettingYearRange)
      : defaults.yearRange,
  };
}

export function readVettingFilters(defaults: VettingFilters): VettingFilters {
  const stored = readPreference(VETTING_FILTERS_KEY);
  if (!stored) return defaults;
  try {
    return parseVettingFilters(JSON.parse(stored), defaults);
  } catch {
    // Not JSON any more. The defaults are a working queue; a parse error is not
    // worth an empty screen.
    return defaults;
  }
}

export function writeVettingFilters(filters: VettingFilters): void {
  writePreference(VETTING_FILTERS_KEY, JSON.stringify(filters));
}
