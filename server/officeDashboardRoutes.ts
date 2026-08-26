import type { Express, NextFunction, Request, Response } from "express";
import { pool } from "./db";
import {
  aggregateDatedValues,
  buildPmoTransitionEvents,
  metadata,
  parseDashboardRange,
  totalsByCurrency,
  type DashboardRange,
} from "./officeDashboardSummary";
import {
  requireAuth,
  requirePmoOfficer,
  requirePublicationOfficer,
  requireResearchOfficer,
} from "./auth";

type QueryRow = Record<string, any>;

async function rows(text: string, range?: DashboardRange): Promise<QueryRow[]> {
  const values = range ? [range.fromDate, range.endExclusive] : [];
  const result = await pool.query(text, values);
  return result.rows;
}

function countMap(input: QueryRow[]): Record<string, number> {
  return Object.fromEntries(input.map((row) => [row.category ?? "Unknown", Number(row.count)]));
}

function dashboardHandler(
  load: (range: DashboardRange) => Promise<unknown>,
) {
  return async (req: Request, res: Response) => {
    try {
      const range = parseDashboardRange(req.query as Record<string, unknown>);
      res.json(await load(range));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dashboard could not be loaded";
      const validation = /^(from|to|interval|date range)/.test(message);
      if (!validation) console.error("Office dashboard failed:", error);
      res.status(validation ? 400 : 500).json({ message });
    }
  };
}

async function loadPmo(range: DashboardRange) {
  const [intake, reviewHistory, stocks] = await Promise.all([
    rows(`
      SELECT created_at AS "eventDate", application_type AS category, COUNT(*)::int AS value
      FROM (
        SELECT created_at, 'RA-200'::text AS application_type FROM ra200_applications
        UNION ALL
        SELECT created_at, 'RA-205A'::text FROM ra205a_applications
      ) applications
      WHERE created_at >= $1 AND created_at < $2
      GROUP BY created_at, application_type
    `, range),
    rows(`
      SELECT application_type AS "applicationType", event
      FROM (
        SELECT 'RA-200'::text AS application_type, event
        FROM ra200_applications, LATERAL json_array_elements(
          CASE WHEN json_typeof(review_history) = 'array' THEN review_history ELSE '[]'::json END
        ) event
        UNION ALL
        SELECT 'RA-205A', event
        FROM ra205a_applications, LATERAL json_array_elements(
          CASE WHEN json_typeof(review_history) = 'array' THEN review_history ELSE '[]'::json END
        ) event
      ) history
    `),
    rows(`
      SELECT application_type || ': ' || status AS category, COUNT(*)::int AS count
      FROM (
        SELECT 'RA-200'::text AS application_type, status FROM ra200_applications
        UNION ALL SELECT 'RA-205A', status FROM ra205a_applications
      ) applications GROUP BY application_type, status
    `),
  ]);
  const transitions = buildPmoTransitionEvents(reviewHistory);
  return {
    metadata: metadata(range, [
      "Workflow transitions are included only when reviewHistory contains a valid recorded timestamp.",
      "Current status counts are stocks as of now and are not constrained by the selected date range.",
    ]),
    intakeByType: aggregateDatedValues(range, intake, ["RA-200", "RA-205A"]),
    transitionsByOutcome: aggregateDatedValues(range, transitions),
    currentStatusStocks: countMap(stocks),
  };
}

async function loadResearch(range: DashboardRange) {
  const startYear = range.fromDate.getUTCFullYear();
  const endYear = new Date(range.endExclusive.getTime() - 1).getUTCFullYear();
  const [grantYearsResult, contractIntake, contractStarts, contractEnds, grantStocks, contractStocks, funding] =
    await Promise.all([
      pool.query(`
        SELECT year, kind, COUNT(*)::int AS count
        FROM (
          SELECT submitted_year AS year, 'submitted'::text AS kind FROM grants WHERE submitted_year IS NOT NULL
          UNION ALL
          SELECT awarded_year, 'awarded' FROM grants WHERE awarded = true AND awarded_year IS NOT NULL
        ) events
        WHERE year BETWEEN $1 AND $2 GROUP BY year, kind ORDER BY year, kind
      `, [startYear, endYear]).then((result: any) => result.rows),
      rows(`
        SELECT COALESCE(initiation_requested_at, created_at) AS "eventDate",
          CASE WHEN initiation_requested_at IS NULL THEN 'record-intake fallback (createdAt)'
               ELSE 'initiation requested' END AS category, COUNT(*)::int AS value
        FROM research_contracts
        WHERE COALESCE(initiation_requested_at, created_at) >= $1
          AND COALESCE(initiation_requested_at, created_at) < $2
        GROUP BY "eventDate", category
      `, range),
      rows(`SELECT start_date AS "eventDate", 'contract start' AS category, COUNT(*)::int AS value
            FROM research_contracts WHERE start_date >= $1 AND start_date < $2 GROUP BY start_date`, range),
      rows(`SELECT end_date AS "eventDate", 'contract end' AS category, COUNT(*)::int AS value
            FROM research_contracts WHERE end_date >= $1 AND end_date < $2 GROUP BY end_date`, range),
      rows(`SELECT status AS category, COUNT(*)::int AS count FROM grants GROUP BY status`),
      rows(`SELECT status AS category, COUNT(*)::int AS count FROM research_contracts GROUP BY status`),
      pool.query(`
        SELECT COALESCE(NULLIF(upper(trim(currency)), ''), 'UNSPECIFIED') AS currency,
               SUM(amount) AS amount, kind
        FROM (
          SELECT currency, requested_amount AS amount, 'requested'::text AS kind FROM grants
          WHERE submitted_year BETWEEN $1 AND $2
          UNION ALL
          SELECT currency, awarded_amount, 'awarded' FROM grants
          WHERE awarded = true AND awarded_year BETWEEN $1 AND $2
        ) funding WHERE amount IS NOT NULL
        GROUP BY COALESCE(NULLIF(upper(trim(currency)), ''), 'UNSPECIFIED'), kind
      `, [startYear, endYear]).then((result: any) => result.rows),
    ]);

  const byYear: Record<string, { submitted: number; awarded: number }> = {};
  for (let year = startYear; year <= endYear; year++) byYear[year] = { submitted: 0, awarded: 0 };
  for (const row of grantYearsResult) byYear[row.year][row.kind as "submitted" | "awarded"] = Number(row.count);
  return {
    metadata: metadata(range, [
      "Grant submission and award dates have year precision only; overlapping calendar years are included and are not assigned invented day/month dates.",
      "Contract intake uses initiationRequestedAt, with createdAt clearly labeled as record-intake fallback when initiationRequestedAt is absent.",
      "Current status counts are stocks as of now and are not constrained by the selected date range.",
    ]),
    grantsByRecordedYear: Object.entries(byYear).map(([year, values]) => ({ year: Number(year), ...values })),
    fundingTotalsByCurrency: {
      requested: totalsByCurrency(funding.filter((row: QueryRow) => row.kind === "requested")),
      awarded: totalsByCurrency(funding.filter((row: QueryRow) => row.kind === "awarded")),
    },
    contractIntake: aggregateDatedValues(range, contractIntake, [
      "initiation requested", "record-intake fallback (createdAt)",
    ]),
    contractStarts: aggregateDatedValues(range, contractStarts, ["contract start"]),
    contractEnds: aggregateDatedValues(range, contractEnds, ["contract end"]),
    currentGrantStatusStocks: countMap(grantStocks),
    currentContractStatusStocks: countMap(contractStocks),
  };
}

async function loadOutcome(range: DashboardRange) {
  const [publications, transitions, ipVetting, stocks] = await Promise.all([
    rows(`
      SELECT publication_date AS "eventDate", COALESCE(publication_type, 'Unknown') AS category,
             COUNT(*)::int AS value
      FROM publications WHERE publication_date >= $1 AND publication_date < $2
      GROUP BY publication_date, publication_type
    `, range),
    rows(`
      SELECT created_at AS "eventDate", COALESCE(to_status, 'Unknown') AS category, COUNT(*)::int AS value
      FROM manuscript_history WHERE created_at >= $1 AND created_at < $2
      GROUP BY created_at, to_status
    `, range),
    rows(`
      SELECT created_at AS "eventDate", 'Vetted for submission' AS category, COUNT(*)::int AS value
      FROM manuscript_history
      WHERE created_at >= $1 AND created_at < $2
        AND lower(to_status) IN ('vetted for submission', 'vetted_for_submission')
      GROUP BY created_at
    `, range),
    rows(`SELECT COALESCE(status, 'Unknown') AS category, COUNT(*)::int AS count
          FROM publications GROUP BY status`),
  ]);
  return {
    metadata: metadata(range, [
      "IP-vetting activity includes only manuscriptHistory transitions whose recorded toStatus explicitly establishes vetting; the current boolean flag is not treated as a dated event.",
      "Current publication queues/status counts are stocks as of now and are not constrained by the selected date range.",
    ]),
    publicationVolumeByType: aggregateDatedValues(range, publications),
    manuscriptTransitions: aggregateDatedValues(range, transitions),
    ipVettingActivity: aggregateDatedValues(range, ipVetting, ["Vetted for submission"]),
    currentStatusStocks: countMap(stocks),
  };
}

export function registerOfficeDashboardRoutes(app: Express): void {
  // Literal dashboard routes must remain ahead of any parameterized /api routes.
  app.get("/api/office-dashboards/pmo", requireAuth, requirePmoOfficer, dashboardHandler(loadPmo));
  app.get("/api/office-dashboards/research", requireAuth, requireResearchOfficer, dashboardHandler(loadResearch));
  app.get("/api/office-dashboards/outcome", requireAuth, requirePublicationOfficer, dashboardHandler(loadOutcome));
}