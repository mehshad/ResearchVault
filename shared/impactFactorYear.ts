/**
 * Which year's impact factor a manuscript is scored against.
 *
 * Two settings decide it, and they answer different questions.
 *
 * `impactFactorYear` asks *which* year relative to publication: the year before
 * (what the authors could see when they chose the journal), the publication
 * year itself, or the latest available.
 *
 * `impactFactorCutoff` asks *when the year turns over*. Journal Citation
 * Reports releases a year's factors in the middle of the following year, so for
 * several months of every calendar year the "current" factor does not exist
 * yet. Scoring a January manuscript against a factor nobody had published is
 * the problem this setting exists for: the office sets the day the score rolls
 * to the next year, and until then a manuscript counts as the previous year's.
 *
 * The default is 1 January, which is exactly the old behaviour -- a year turns
 * over when the calendar does. Nothing changes for anybody who does not set it.
 */

/**
 * DD-MM, the way dates are written here. "30-06" is 30 June.
 *
 * Day first rather than month first because that is how the office writes a
 * date, and a format that reads as a date but means something else is worse
 * than one that is obviously unfamiliar: "06-07" is a valid date under both
 * readings and means two different days.
 */
export type ImpactFactorCutoff = string;

/** 1 January: the year turns over with the calendar, as it always did. */
export const DEFAULT_IMPACT_FACTOR_CUTOFF: ImpactFactorCutoff = "01-01";

export const IMPACT_FACTOR_CUTOFF_PATTERN = /^(0[1-9]|[12]\d|3[01])-(0[1-9]|1[0-2])$/;

/** Days in each month, ignoring leap years -- 29 February is allowed. */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * A cut-off has to be a day that exists.
 *
 * The shape check alone would accept "31-02", which is not a date. It would not
 * throw -- the comparison below would quietly behave as though the cut-off were
 * 1 March -- and a setting that silently means a different day than it says is
 * worse than one that is refused.
 */
export function isValidImpactFactorCutoff(value: unknown): value is ImpactFactorCutoff {
  if (typeof value !== "string" || !IMPACT_FACTOR_CUTOFF_PATTERN.test(value)) return false;
  const [day, month] = value.split("-").map(Number);
  return day <= DAYS_IN_MONTH[month - 1];
}

/**
 * The year a publication date counts as, once the cut-off is applied.
 *
 * A date on or after the cut-off counts as its own calendar year; anything
 * earlier counts as the year before. With the default 01-01 every date is on or
 * after the cut-off, so the answer is always the calendar year -- which is why
 * the default changes nothing.
 */
export function effectiveImpactFactorYear(
  publicationDate: Date,
  cutoff: ImpactFactorCutoff = DEFAULT_IMPACT_FACTOR_CUTOFF,
): number {
  const year = publicationDate.getUTCFullYear();
  if (!isValidImpactFactorCutoff(cutoff)) return year;

  const [day, month] = cutoff.split("-").map(Number);
  const publishedMonth = publicationDate.getUTCMonth() + 1;
  const publishedDay = publicationDate.getUTCDate();

  const beforeCutoff =
    publishedMonth < month || (publishedMonth === month && publishedDay < day);
  return beforeCutoff ? year - 1 : year;
}

/** How the two settings combine into the year actually looked up. */
export function impactFactorLookupYear(
  publicationDate: Date,
  settings: {
    impactFactorYear: "prior" | "publication" | "latest";
    impactFactorCutoff?: ImpactFactorCutoff;
  },
  currentYear: number,
): number {
  if (settings.impactFactorYear === "latest") return currentYear;
  const effective = effectiveImpactFactorYear(publicationDate, settings.impactFactorCutoff);
  return settings.impactFactorYear === "prior" ? effective - 1 : effective;
}

/** The earliest edition the scorer will reach for. */
export const EARLIEST_IMPACT_FACTOR_YEAR = 2020;

/**
 * A JIF year written with the edition it was published in.
 *
 * Neither name alone is enough on a screen. "2025 impact factor" reads as
 * out-of-date to somebody who has just downloaded Journal Citation Reports
 * 2026; "2026 not loaded" reads as plainly false to the same person, because
 * they loaded JCR 2026 last week. Both were reported as confusing, and both
 * were describing the right thing under a name the reader did not have.
 *
 * A JIF year is published in the edition named for the following year: the
 * 2025 Journal Impact Factors are in Journal Citation Reports 2026.
 */
export function formatImpactFactorYear(jifYear: number): string {
  return `${jifYear} JIF (JCR ${jifYear + 1})`;
}

/**
 * The year an impact factor would be read from, given which editions exist.
 *
 * Asking for a year is not the same as finding one. The scorer falls back to
 * nearby editions when the year it wants is missing, and this reproduces that
 * order: one year later, one earlier, two later, two earlier — preferring a
 * newer edition to an older one at the same distance, which matters because the
 * missing year is usually the most recent.
 *
 * **An approximation of what the scorer does, on purpose.** The scorer asks
 * whether *that journal* has a factor in each year; this asks whether the
 * edition was loaded at all. So it answers "which edition would be reached for"
 * rather than "what will this particular manuscript score", which is the right
 * granularity for a settings screen describing a rule rather than a record.
 */
export function resolveImpactFactorYear(
  targetYear: number,
  availableYears: readonly number[],
  mode: "prior" | "publication" | "latest" = "publication",
): { year: number | null; fellBack: boolean } {
  const available = new Set(availableYears);
  if (available.has(targetYear)) return { year: targetYear, fellBack: false };

  const candidates =
    mode === "latest"
      ? [...availableYears].sort((a, b) => b - a)
      : [targetYear + 1, targetYear - 1, targetYear + 2, targetYear - 2].filter(
          (year) => year >= EARLIEST_IMPACT_FACTOR_YEAR,
        );

  for (const year of candidates) {
    if (available.has(year)) return { year, fellBack: true };
  }
  return { year: null, fellBack: false };
}

export interface ImpactFactorExample {
  /** ISO date of the imaginary manuscript. */
  publishedOn: string;
  /** Human description of where it falls relative to the cut-off. */
  situation: string;
  /** The year the settings ask for. */
  usesYear: number;
  /**
   * The year an impact factor would actually be read from, or null when
   * nothing loaded is close enough. Differs from usesYear when the wanted
   * edition has not been loaded.
   */
  resolvedYear: number | null;
}

/**
 * Three imaginary manuscripts, and the impact factor each would be scored on.
 *
 * A cut-off date is the kind of setting whose effect nobody can predict from
 * reading it -- "switch on 30 June" says nothing about what happens to a paper
 * published in March. Three worked examples astride the boundary say it
 * exactly, and they are computed from the live settings rather than written
 * out, so they cannot describe a rule the code stopped following.
 *
 * The dates are chosen relative to the cut-off, not fixed: one comfortably
 * before, one the day before, one on the day. The pair either side of the
 * boundary is the point -- two manuscripts a day apart scoring against
 * different years is the surprising part, and seeing it is the whole reason to
 * show examples.
 */
export interface ScoreWindow {
  /** Rolling window: this many years back from today. */
  years?: number;
  /** Custom window, YYYY-MM. Both or neither. */
  startMonth?: string;
  endMonth?: string;
}

/** The window the score covers, matching how the scorer computes it. */
export function scoreWindow(window: ScoreWindow, today: Date): { from: Date; to: Date } {
  if (typeof window.startMonth === "string" && typeof window.endMonth === "string") {
    const [sy, sm] = window.startMonth.split("-").map(Number);
    const [ey, em] = window.endMonth.split("-").map(Number);
    return {
      from: new Date(Date.UTC(sy, sm - 1, 1)),
      // Last day of the end month.
      to: new Date(Date.UTC(ey, em, 0)),
    };
  }
  const from = new Date(today.getTime());
  from.setUTCFullYear(from.getUTCFullYear() - (window.years ?? 5));
  return { from, to: today };
}

export function impactFactorExamples(
  settings: {
    impactFactorYear: "prior" | "publication" | "latest";
    impactFactorCutoff?: ImpactFactorCutoff;
  } & ScoreWindow,
  today: Date,
  /**
   * The editions actually loaded. Without them an example can name a year that
   * does not exist -- a manuscript published in January 2026 wanting "the 2026
   * impact factor", which is computed from 2026 citations and is not published
   * until mid-2027. Naming it made the screen describe a lookup that could
   * never succeed.
   */
  availableYears: readonly number[] = [],
  count = 8,
): ImpactFactorExample[] {
  const { from, to } = scoreWindow(settings, today);
  const currentYear = today.getUTCFullYear();

  const cutoff = isValidImpactFactorCutoff(settings.impactFactorCutoff)
    ? settings.impactFactorCutoff
    : DEFAULT_IMPACT_FACTOR_CUTOFF;

  const describe = (date: Date): ImpactFactorExample => {
    const usesYear = impactFactorLookupYear(date, settings, currentYear);
    const { year: resolvedYear } = availableYears.length
      ? resolveImpactFactorYear(usesYear, availableYears, settings.impactFactorYear)
      : { year: usesYear };
    return {
      publishedOn: date.toISOString().slice(0, 10),
      situation: situationOf(date, cutoff),
      usesYear,
      resolvedYear,
    };
  };

  /**
   * Dates spread evenly across the window, oldest first.
   *
   * Spread rather than clustered around one cut-off, because the question the
   * office is actually asking is "what will this setting do to the manuscripts
   * I am scoring", and those are spread across the whole period. Eight points
   * over a five-year window is roughly one every seven months, which crosses
   * every year boundary in it -- so the rollover shows up several times rather
   * than being asserted once.
   */
  const span = to.getTime() - from.getTime();
  if (span <= 0) return [describe(to)];

  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    // Spaced across the window inclusive of both ends.
    dates.push(new Date(from.getTime() + (span * i) / (count - 1)));
  }
  return dates.map(describe);
}

/** Where a date sits relative to the cut-off in its own year. */
function situationOf(date: Date, cutoff: ImpactFactorCutoff): string {
  const [day, month] = cutoff.split("-").map(Number);
  const dateMonth = date.getUTCMonth() + 1;
  const dateDay = date.getUTCDate();
  const before = dateMonth < month || (dateMonth === month && dateDay < day);
  // With a 1 January cut-off nothing is ever before it, so saying so every time
  // would be noise on the default setting.
  if (cutoff === DEFAULT_IMPACT_FACTOR_CUTOFF) return "";
  return before ? "before the cut-off" : "on or after the cut-off";
}
