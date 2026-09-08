/**
 * GET /api/journal-impact-factors/summary
 *
 * What is loaded per year, and which journals we publish in have no factor at
 * all. See shared/impactFactorSummary.ts for why the second half is a worklist
 * rather than a count.
 *
 * Read-only and cheap enough to run on every visit to the screen: the whole
 * thing is three aggregate queries over tables of tens of thousands of rows,
 * and it is only reached from the Impact Factors tab.
 */
import type { Express, Request, RequestHandler, Response } from "express";
import { sql } from "drizzle-orm";

import { db } from "./db";
import { requireAuth } from "./auth";
import {
  decodeJournalName,
  journalMatchKeys,
  normalizeJournalName,
  type ImpactFactorSummary,
  type ImpactFactorYearSummary,
  type MissingImpactFactorJournal,
} from "@shared/impactFactorSummary";

export interface SummaryDependencies {
  yearRows: () => Promise<Array<{ year: number; factors: number }>>;
  publicationJournals: () => Promise<Array<{ journal: string; publications: number }>>;
  knownJournals: () => Promise<Array<{ name: string; abbreviated: string | null; years: number[] }>>;
}

const defaultDependencies: SummaryDependencies = {
  async yearRows() {
    const result = await db.execute(sql`
      SELECT year,
             count(*) FILTER (WHERE impact_factor IS NOT NULL)::int AS factors
      FROM journal_impact_factor_metrics
      GROUP BY year
      ORDER BY year
    `);
    return (result.rows as any[]).map((r) => ({
      year: Number(r.year),
      factors: Number(r.factors),
    }));
  },
  async publicationJournals() {
    const result = await db.execute(sql`
      SELECT btrim(journal) AS journal, count(*)::int AS publications
      FROM publications
      WHERE journal IS NOT NULL AND btrim(journal) <> ''
      GROUP BY btrim(journal)
      ORDER BY count(*) DESC, btrim(journal)
    `);
    return (result.rows as any[]).map((r) => ({
      journal: String(r.journal),
      publications: Number(r.publications),
    }));
  },
  async knownJournals() {
    // Only journals that actually carry a factor somewhere: a journal row with
    // no metric would otherwise count as "covered" while scoring nothing.
    const result = await db.execute(sql`
      SELECT j.journal_name AS name,
             j.abbreviated_journal AS abbreviated,
             array_agg(DISTINCT m.year ORDER BY m.year) AS years
      FROM journals j
      JOIN journal_impact_factor_metrics m
        ON m.journal_id = j.id AND m.impact_factor IS NOT NULL
      GROUP BY j.id, j.journal_name, j.abbreviated_journal
    `);
    return (result.rows as any[]).map((r) => ({
      name: String(r.name),
      abbreviated: r.abbreviated == null ? null : String(r.abbreviated),
      years: (r.years as unknown[]).map(Number),
    }));
  },
};

export async function buildImpactFactorSummary(
  dependencies: SummaryDependencies = defaultDependencies,
): Promise<ImpactFactorSummary> {
  const [yearRows, publicationJournals, knownJournals] = await Promise.all([
    dependencies.yearRows(),
    dependencies.publicationJournals(),
    dependencies.knownJournals(),
  ]);

  // Every spelling the scorer will accept, mapped to the years it holds.
  // findJournalByName tries the full name, the abbreviated name, and both
  // normalised, so a summary that checked only the full name would report
  // journals as missing that score perfectly well.
  const yearsByKey = new Map<string, Set<number>>();
  for (const journal of knownJournals) {
    for (const key of journalMatchKeys(journal)) {
      const existing = yearsByKey.get(key);
      if (existing) for (const year of journal.years) existing.add(year);
      else yearsByKey.set(key, new Set(journal.years));
    }
  }

  const missing: MissingImpactFactorJournal[] = [];
  const coveredYears = new Map<number, number>();
  let covered = 0;

  for (const { journal, publications } of publicationJournals) {
    const match = yearsByKey.get(normalizeJournalName(journal));
    if (match) {
      covered += 1;
      for (const year of match) {
        coveredYears.set(year, (coveredYears.get(year) ?? 0) + 1);
      }
      continue;
    }
    // Genuinely unmatched. An HTML escape is the one cause we can name with
    // confidence: normalisation turns "&amp;" into the word "amp" rather than
    // nothing, so decoding first is what fixes it.
    const decoded = decodeJournalName(journal);
    const decodedMatch =
      decoded !== journal ? yearsByKey.get(normalizeJournalName(decoded)) : undefined;
    missing.push({
      journal,
      publications,
      suggestion: decodedMatch ? decoded : null,
      reason: decodedMatch ? "punctuation" : null,
    });
  }

  const years: ImpactFactorYearSummary[] = yearRows.map((row) => ({
    ...row,
    coversPublishedIn: coveredYears.get(row.year) ?? 0,
  }));

  return {
    years,
    publishedIn: { total: publicationJournals.length, covered, missing },
  };
}

export function createImpactFactorSummaryHandler(
  dependencies: SummaryDependencies = defaultDependencies,
): RequestHandler {
  return async (_req: Request, res: Response) => {
    try {
      res.json(await buildImpactFactorSummary(dependencies));
    } catch (error) {
      console.error("Error building impact factor summary:", error);
      res.status(500).json({ message: "Failed to build impact factor summary" });
    }
  };
}

export function registerImpactFactorSummaryRoutes(app: Express): void {
  // Registered before /api/journal-impact-factors/:id, or "summary" is read as
  // an id and the route never runs.
  app.get(
    "/api/journal-impact-factors/summary",
    requireAuth,
    createImpactFactorSummaryHandler(),
  );
}
