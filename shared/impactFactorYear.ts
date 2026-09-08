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

/** MM-DD. Validated at the edges; assumed well-formed here. */
export type ImpactFactorCutoff = string;

export const DEFAULT_IMPACT_FACTOR_CUTOFF: ImpactFactorCutoff = "01-01";

export const IMPACT_FACTOR_CUTOFF_PATTERN = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isValidImpactFactorCutoff(value: unknown): value is ImpactFactorCutoff {
  return typeof value === "string" && IMPACT_FACTOR_CUTOFF_PATTERN.test(value);
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

  const [month, day] = cutoff.split("-").map(Number);
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

export interface ImpactFactorExample {
  /** ISO date of the imaginary manuscript. */
  publishedOn: string;
  /** Human description of where it falls relative to the cut-off. */
  situation: string;
  /** The year whose impact factor would be used. */
  usesYear: number;
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
export function impactFactorExamples(
  settings: {
    impactFactorYear: "prior" | "publication" | "latest";
    impactFactorCutoff?: ImpactFactorCutoff;
  },
  referenceYear: number,
): ImpactFactorExample[] {
  const cutoff = isValidImpactFactorCutoff(settings.impactFactorCutoff)
    ? settings.impactFactorCutoff
    : DEFAULT_IMPACT_FACTOR_CUTOFF;
  const [month, day] = cutoff.split("-").map(Number);

  const onCutoff = new Date(Date.UTC(referenceYear, month - 1, day));
  const dayBefore = new Date(onCutoff.getTime() - 24 * 60 * 60 * 1000);
  // Comfortably before: two months earlier, which for a 1 January cut-off
  // lands in the previous year and still reads correctly.
  const wellBefore = new Date(Date.UTC(referenceYear, month - 1, day));
  wellBefore.setUTCMonth(wellBefore.getUTCMonth() - 2);

  const describe = (date: Date, situation: string): ImpactFactorExample => ({
    publishedOn: date.toISOString().slice(0, 10),
    situation,
    usesYear: impactFactorLookupYear(date, settings, referenceYear),
  });

  return [
    describe(wellBefore, "Two months before the cut-off"),
    describe(dayBefore, "The day before the cut-off"),
    describe(onCutoff, "On the cut-off"),
  ];
}
