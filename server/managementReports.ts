import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  PAGE,
  CONTENT_WIDTH,
  PALETTE,
  type Fonts,
  type Kpi,
  type TableColumn,
  type Bar,
  fit,
  wrap,
  tableHeight,
  drawPageFrame,
  drawSectionHeading,
  drawKpiRow,
  drawTable,
  drawColumnChart,
  drawHorizontalBars,
  drawHistogram,
  drawPercentileBand,
  drawStackedBar,
  drawLegend,
  drawCallout,
} from "./reportGraphics";
import { pool } from "./db";
import {
  MANAGEMENT_REPORT_CATEGORIES,
  MANAGEMENT_REPORT_FILTER_DEFINITIONS,
  MANAGEMENT_REPORT_LIMITS,
  type ManagementReportCategory,
  type ManagementReportConfig,
  type ManagementReportData,
  type ManagementReportRow,
  type ManagementReportStaff,
  type ManagementReportPeerComparison,
} from "@shared/managementReports";
import {
  calculateAllScientistScores,
  calculateSelectedScientistScores,
  loadOfficialSettings,
  SidraScopeTooLargeError,
} from "./sidraScoreService";
import type { SidraScoreResult } from "@shared/sidraScore";

export class ManagementReportTooLargeError extends Error {
  constructor(message = "The requested report is too large. Narrow the date range, statuses, or target.") {
    super(message);
    this.name = "ManagementReportTooLargeError";
  }
}

export class ManagementReportTargetNotFoundError extends Error {
  constructor(target: "staff" | "section") {
    super(`Report ${target} target not found.`);
    this.name = "ManagementReportTargetNotFoundError";
  }
}

type Query = (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;

const categorySql: Record<ManagementReportCategory, string> = {
  sdrs: `SELECT DISTINCT r.id, r.sdr_number AS reference, r.title, r.status,
           r.start_date AS date, array_agg(DISTINCT pm.scientist_id) AS "scientistIds"
         FROM research_activities r
         JOIN project_members pm ON pm.research_activity_id = r.id
         WHERE pm.scientist_id = ANY($1::int[])`,
  publications: `SELECT DISTINCT p.id, p.doi AS reference, p.title, p.status,
           p.publication_date AS date, array_agg(DISTINCT pa.scientist_id) AS "scientistIds"
         FROM publications p
         JOIN publication_authors pa ON pa.publication_id = p.id
         WHERE pa.scientist_id = ANY($1::int[])`,
  grants: `SELECT DISTINCT g.id, g.project_number AS reference, g.title, g.status,
           g.start_date AS date, array_agg(DISTINCT selected.id) AS "scientistIds"
         FROM grants g
         CROSS JOIN unnest($1::int[]) selected(id)
         WHERE (g.lpi_id = selected.id OR EXISTS (
           SELECT 1 FROM grant_research_activities gra
           JOIN project_members pm ON pm.research_activity_id = gra.research_activity_id
           WHERE gra.grant_id = g.id AND pm.scientist_id = selected.id))`,
  contracts: `SELECT DISTINCT c.id, c.contract_number AS reference, c.title, c.status,
           c.start_date AS date, array_agg(DISTINCT selected.id) AS "scientistIds"
         FROM research_contracts c
         CROSS JOIN unnest($1::int[]) selected(id)
         WHERE (c.lead_pi_id = selected.id OR EXISTS (
           SELECT 1 FROM project_members pm
           WHERE pm.research_activity_id = c.research_activity_id
             AND pm.scientist_id = selected.id))`,
  patents: `SELECT DISTINCT p.id, p.patent_number AS reference, p.title, p.status,
           p.filing_date AS date, array_agg(DISTINCT pm.scientist_id) AS "scientistIds"
         FROM patents p
         JOIN project_members pm ON pm.research_activity_id = p.research_activity_id
         WHERE pm.scientist_id = ANY($1::int[])`,
};

const categoryFilterColumns: Record<ManagementReportCategory, { date: string; status: string }> = {
  sdrs: { date: "r.start_date", status: "r.status" },
  publications: { date: "p.publication_date", status: "p.status" },
  grants: { date: "g.start_date", status: "g.status" },
  contracts: { date: "c.start_date", status: "c.status" },
  patents: { date: "p.filing_date", status: "p.status" },
};

const categoryGroupColumns: Record<ManagementReportCategory, string> = {
  sdrs: "r.id",
  publications: "p.id",
  grants: "g.id",
  contracts: "c.id",
  patents: "p.id",
};

function dateText(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export async function assembleManagementReport(
  config: ManagementReportConfig,
  query: Query = (text, values) => pool.query(text, values),
): Promise<ManagementReportData> {
  let targetLabel: string;
  let targetRows: any[];
  if (config.targetType === "staff") {
    const result = await query(
      `SELECT id, first_name, last_name, staff_id, section_id
       FROM scientists WHERE id = $1`,
      [config.targetId],
    );
    if (result.rows.length === 0) throw new ManagementReportTargetNotFoundError("staff");
    targetRows = result.rows;
    targetLabel = `${result.rows[0].first_name} ${result.rows[0].last_name}`.trim();
  } else {
    // Establish section existence and its hierarchy independently from
    // membership. A valid newly-created section may contain no scientists.
    const sectionResult = await query(
      `SELECT sec.id, sec.name AS section_name, sec.department_id,
              dep.name AS department_name, dep.branch_id,
              branch.name AS branch_name
       FROM sections sec
       JOIN departments dep ON dep.id = sec.department_id
       JOIN branches branch ON branch.id = dep.branch_id
       WHERE sec.id = $1`,
      [config.targetId],
    );
    if (sectionResult.rows.length === 0) {
      throw new ManagementReportTargetNotFoundError("section");
    }
    const section = sectionResult.rows[0];
    targetLabel = [section.branch_name, section.department_name, section.section_name]
      .filter(Boolean).join(" / ");
    const staffResult = await query(
      `SELECT id, first_name, last_name, staff_id, section_id
       FROM scientists WHERE section_id = $1
       ORDER BY last_name, first_name LIMIT $2`,
      [config.targetId, MANAGEMENT_REPORT_LIMITS.maxStaffInSection + 1],
    );
    targetRows = staffResult.rows;
  }
  if (targetRows.length > MANAGEMENT_REPORT_LIMITS.maxStaffInSection) {
    throw new ManagementReportTooLargeError("The selected section contains too many staff members.");
  }
  const staff: ManagementReportStaff[] = targetRows.map((row) => ({
    id: Number(row.id),
    name: `${row.first_name} ${row.last_name}`.trim(),
    staffId: row.staff_id ?? null,
    sectionId: row.section_id == null ? null : Number(row.section_id),
  }));
  const scientistIds = staff.map((person) => person.id);
  const rows: ManagementReportData["rows"] = {};
  let total = 0;
  const requestedCategories = config.domains.filter(
    (domain): domain is ManagementReportCategory =>
      (MANAGEMENT_REPORT_CATEGORIES as readonly string[]).includes(domain),
  );
  const categories = config.domains.includes("overview")
    ? [...MANAGEMENT_REPORT_CATEGORIES]
    : requestedCategories;
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - config.lookbackYears);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  for (const category of categories) {
    if (scientistIds.length === 0) {
      rows[category] = [];
      continue;
    }
    const values: unknown[] = [scientistIds];
    let sql = categorySql[category];
    values.push(cutoffDate);
    const column = categoryFilterColumns[category].date;
    sql += ` AND ${column} >= $2::date`;
    let statuses: string[] = [];
    if (category === "publications") statuses = config.publicationStatuses;
    if (category === "contracts") statuses = config.contractStatuses;
    if (category === "patents") statuses = config.patentStatuses;
    if (category === "sdrs" && config.activeSdrOnly) statuses = ["active"];
    if (category === "grants" && config.awardedGrantsOnly) {
      sql += " AND g.awarded = true";
    }
    if (statuses.length) {
      values.push(statuses.map((status) => status.toLowerCase()));
      sql += ` AND lower(${categoryFilterColumns[category].status}) = ANY($${values.length}::text[])`;
    }
    // Aggregate selected people before LIMIT so the envelope counts records,
    // not record-person relationship rows. This also retains every relevant
    // selected scientist for a shared record.
    sql += ` GROUP BY ${categoryGroupColumns[category]}`;
    values.push(MANAGEMENT_REPORT_LIMITS.maxRowsPerCategory);
    sql += ` ORDER BY title, id LIMIT $${values.length}`;
    const result = await query(sql, values);
    if (result.rows.length >= MANAGEMENT_REPORT_LIMITS.maxRowsPerCategory) {
      throw new ManagementReportTooLargeError(`${category} exceeds the per-category report limit.`);
    }
    const grouped = new Map<number, ManagementReportRow>();
    for (const item of result.rows) {
      const id = Number(item.id);
      const relatedScientistIds: number[] = Array.isArray(item.scientistIds)
        ? item.scientistIds.map(Number)
        : [Number(item.scientistId)];
      const existing = grouped.get(id);
      if (existing) {
        for (const scientistId of relatedScientistIds) {
          if (!existing.scientistIds.includes(scientistId)) existing.scientistIds.push(scientistId);
        }
      } else {
        grouped.set(id, {
          id,
          reference: item.reference ?? null,
          title: item.title,
          status: item.status ?? null,
          date: dateText(item.date),
          scientistIds: relatedScientistIds,
        });
      }
    }
    rows[category] = [...grouped.values()];
    total += grouped.size;
    if (total > MANAGEMENT_REPORT_LIMITS.maxTotalRows) throw new ManagementReportTooLargeError();
  }
  const serializedBytes = Buffer.byteLength(JSON.stringify({ staff, rows }), "utf8");
  if (serializedBytes > MANAGEMENT_REPORT_LIMITS.maxTextBytes) throw new ManagementReportTooLargeError();

  const totals = Object.fromEntries(
    MANAGEMENT_REPORT_CATEGORIES.map((key) => [key, rows[key]?.length ?? 0]),
  ) as Record<ManagementReportCategory, number>;
  const data: ManagementReportData = {
    generatedAt: new Date().toISOString(),
    config,
    filterDefinitions: MANAGEMENT_REPORT_FILTER_DEFINITIONS,
    targetLabel,
    staff,
    rows,
    totals,
    counts: totals,
    total,
  };
  if (config.domains.includes("overview")) {
    data.overview = {
      scope: {
        targetType: config.targetType,
        targetId: config.targetId,
        staffCount: staff.length,
      },
      totalRecords: total,
      domains: MANAGEMENT_REPORT_CATEGORIES.map((domain) => {
        const statusCounts: Record<string, number> = {};
        for (const row of rows[domain] ?? []) {
          const status = row.status ?? "Not recorded";
          statusCounts[status] = (statusCounts[status] ?? 0) + 1;
        }
        return { domain, count: totals[domain], statusCounts };
      }),
    };
  }
  if (config.domains.includes("sidra")) {
    if (scientistIds.length === 0) {
      data.officialSidra = [];
      return data;
    }
    const settings = await loadOfficialSettings();
    try {
      data.officialSidra = (await calculateSelectedScientistScores(scientistIds, settings))
        .map((score) => ({
        scientistId: score.id,
        publicationsCount: score.publicationsCount,
        sidraScore: score.sidraScore,
      }));
    } catch (error) {
      if (error instanceof SidraScopeTooLargeError) {
        throw new ManagementReportTooLargeError(error.message);
      }
      throw error;
    }

    // Benchmarking only makes sense for one person at a time; a section-wide
    // report has no single subject to place on the distribution.
    if (scientistIds.length === 1) {
      try {
        const cohort = await calculateAllScientistScores(settings);
        const comparison = buildPeerComparison(scientistIds[0], data.targetLabel, cohort);
        if (comparison) data.peerComparison = comparison;
      } catch (error) {
        // Benchmarking is additive. If the cohort calculation overruns its
        // envelope the core report must still be produced.
        if (!(error instanceof SidraScopeTooLargeError)) throw error;
      }
    }
  }
  return data;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export function buildPeerComparison(
  subjectId: number,
  targetLabel: string,
  cohort: SidraScoreResult[],
): ManagementReportPeerComparison | undefined {
  const subject = cohort.find((entry) => entry.id === subjectId);
  if (!subject || cohort.length === 0) return undefined;

  const ranked = [...cohort].sort((a, b) => b.sidraScore - a.sidraScore);
  const rank = ranked.findIndex((entry) => entry.id === subjectId) + 1;
  const scores = ranked.map((entry) => entry.sidraScore);
  const ascending = [...scores].sort((a, b) => a - b);
  const size = ranked.length;
  // Percentile of peers scoring at or below the subject.
  const below = ascending.filter((value) => value < subject.sidraScore).length;
  const percentile = size > 1 ? (below / (size - 1)) * 100 : 100;

  const max = ascending[ascending.length - 1] ?? 0;
  const binCount = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(size))));
  const upper = Math.max(max, subject.sidraScore, 1);
  const binSize = upper / binCount;
  const distribution = Array.from({ length: binCount }, (_, index) => {
    const from = binSize * index;
    const to = binSize * (index + 1);
    const isLast = index === binCount - 1;
    const inBin = (value: number) => (isLast ? value >= from && value <= to : value >= from && value < to);
    return {
      label: `${Math.round(from)}–${Math.round(to)}`,
      count: scores.filter(inBin).length,
      containsSubject: inBin(subject.sidraScore),
    };
  });

  // Anonymised ladder: a window around the subject rather than a leaderboard.
  const start = Math.max(0, Math.min(rank - 3, size - 5));
  const ladder = ranked.slice(start, start + 5).map((entry, offset) => ({
    label: entry.id === subjectId ? targetLabel : `Peer (rank ${start + offset + 1})`,
    score: entry.sidraScore,
    publications: entry.publicationsCount,
    isSubject: entry.id === subjectId,
  }));

  // Yearly output for the subject, with a cohort median for the same years.
  const yearsCovered = new Set<number>();
  for (const detail of subject.calculationDetails) yearsCovered.add(detail.actualYear);
  const years = [...yearsCovered].filter((year) => Number.isFinite(year)).sort((a, b) => a - b).slice(-6);
  const yearly = years.map((year) => {
    const mine = subject.calculationDetails.filter((detail) => detail.actualYear === year);
    const peerCounts = ranked
      .filter((entry) => entry.id !== subjectId)
      .map((entry) => entry.calculationDetails.filter((detail) => detail.actualYear === year).length)
      .sort((a, b) => a - b);
    return {
      year,
      publications: mine.length,
      score: Number(mine.reduce((sum, detail) => sum + detail.publicationScore, 0).toFixed(2)),
      cohortMedianPublications: Number(quantile(peerCounts, 0.5).toFixed(1)),
    };
  });

  const authorshipCounts = new Map<string, number>();
  for (const detail of subject.calculationDetails) {
    for (const role of detail.authorshipTypes.length ? detail.authorshipTypes : ["Unspecified"]) {
      authorshipCounts.set(role, (authorshipCounts.get(role) ?? 0) + 1);
    }
  }
  const authorship = [...authorshipCounts.entries()]
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count);

  const topPublications = [...subject.calculationDetails]
    .sort((a, b) => b.publicationScore - a.publicationScore)
    .slice(0, 8)
    .map((detail) => ({
      title: detail.title,
      journal: detail.journal,
      year: detail.actualYear,
      impactFactor: detail.impactFactor,
      roles: detail.authorshipTypes,
      score: detail.publicationScore,
    }));

  let departmentCohort: ManagementReportPeerComparison["departmentCohort"];
  if (subject.department) {
    const peers = ranked.filter((entry) => entry.department === subject.department);
    if (peers.length > 1) {
      const deptScores = peers.map((entry) => entry.sidraScore).sort((a, b) => a - b);
      departmentCohort = {
        label: subject.department,
        size: peers.length,
        median: Number(quantile(deptScores, 0.5).toFixed(2)),
        rank: peers.findIndex((entry) => entry.id === subjectId) + 1,
      };
    }
  }

  return {
    subject: {
      scientistId: subject.id,
      name: targetLabel,
      sidraScore: subject.sidraScore,
      publicationsCount: subject.publicationsCount,
    },
    cohort: {
      label: "All scientific staff",
      size,
      scored: scores.filter((value) => value > 0).length,
      mean: Number((scores.reduce((sum, value) => sum + value, 0) / size).toFixed(2)),
      median: Number(quantile(ascending, 0.5).toFixed(2)),
      p25: Number(quantile(ascending, 0.25).toFixed(2)),
      p75: Number(quantile(ascending, 0.75).toFixed(2)),
      max: Number(max.toFixed(2)),
    },
    rank,
    percentile: Number(percentile.toFixed(1)),
    distribution,
    ladder,
    yearly,
    authorship,
    topPublications,
    departmentCohort,
  };
}

// ---------------------------------------------------------------------------
// Report composition
//
// The report is described as an ordered list of measurable blocks. A single
// paginator flows them onto pages, so the inspectable layout model and the
// rendered PDF can never disagree about page count or section starts.
// ---------------------------------------------------------------------------

function safePdfText(value: string): string {
  // WinAnsi cannot encode smart quotes, dashes or accented characters that
  // arrive from journal titles; fold them rather than throwing at draw time.
  return value
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e]/g, "?");
}

type ReportBlock =
  | { kind: "heading"; title: string; note?: string }
  | { kind: "kpis"; kpis: Kpi[] }
  | { kind: "table"; columns: TableColumn[]; rows: string[][]; highlight?: number[]; fontSize?: number }
  | { kind: "histogram"; bins: Array<{ label: string; count: number; containsSubject: boolean }>; caption?: string }
  | { kind: "columns"; bars: Bar[]; valueLabel?: (v: number) => string }
  | { kind: "hbars"; bars: Bar[]; labelWidth?: number; valueLabel?: (v: number) => string }
  | { kind: "percentile"; percentile: number; markerLabel: string; leftLabel: string; rightLabel: string }
  | { kind: "rolemix"; slices: Array<{ label: string; value: number; tone: number }>; total: number }
  | { kind: "callout"; title: string; lines: string[] }
  | { kind: "spacer"; height: number };

function blockHeight(block: ReportBlock): number {
  switch (block.kind) {
    case "heading": return 26;
    case "kpis": return 74;
    case "table": return tableHeight(block.rows.length);
    case "histogram": return 96 + 22 + (block.caption ? 12 : 0);
    case "columns": return 110 + 24;
    case "hbars": return block.bars.length * 16 + 12;
    case "percentile": return 50;
    case "rolemix": return 34 + block.slices.length * 15 + 8;
    case "callout": return 16 + block.lines.length * 11 + 14;
    case "spacer": return block.height;
  }
}

/** A block that starts a titled section, used to build the contents list. */
interface PlannedSection {
  title: string;
  blocks: ReportBlock[];
  /** Force a page break before this section (used for the record appendix). */
  breakBefore?: boolean;
}

const TONES = [
  PALETTE.accent,
  rgb(0.20, 0.45, 0.62),
  rgb(0.55, 0.63, 0.70),
  rgb(0.80, 0.55, 0.25),
  rgb(0.42, 0.36, 0.58),
  rgb(0.72, 0.76, 0.80),
];

function statusSummary(statusCounts: Record<string, number>): string {
  const parts = Object.entries(statusCounts).map(([status, count]) => `${status}: ${count}`);
  return parts.length ? parts.join(", ") : "No records";
}

function planReport(data: ManagementReportData): PlannedSection[] {
  const sections: PlannedSection[] = [];
  const peer = data.peerComparison;

  // ── Executive summary ────────────────────────────────────────────────────
  const summaryBlocks: ReportBlock[] = [];
  const headlineKpis: Kpi[] = [];
  if (peer) {
    headlineKpis.push({
      label: "SIDRA score", value: peer.subject.sidraScore.toFixed(1),
      caption: `Cohort median ${peer.cohort.median.toFixed(1)}`, emphasis: true,
    });
    headlineKpis.push({
      label: "Percentile", value: `P${Math.round(peer.percentile)}`,
      caption: `Rank ${peer.rank} of ${peer.cohort.size}`,
    });
    const totalIf = peer.topPublications.length
      ? peer.topPublications.reduce((sum, p) => sum + p.impactFactor, 0) / peer.topPublications.length
      : 0;
    headlineKpis.push({
      // Deliberately distinct from the overview count: SIDRA scores over its
      // own multi-year window, which is wider than the report lookback.
      label: "Scored pubs", value: String(peer.subject.publicationsCount),
      caption: totalIf ? `SIDRA window, top-8 mean IF ${totalIf.toFixed(1)}` : "In SIDRA scoring window",
    });
    const senior = peer.authorship
      .filter((a) => /first|last|correspond/i.test(a.role))
      .reduce((sum, a) => sum + a.count, 0);
    headlineKpis.push({
      label: "Senior-author roles", value: String(senior),
      caption: "First / last / corresponding",
    });
  } else {
    headlineKpis.push({ label: "Records in scope", value: String(data.total) });
    for (const domain of (data.overview?.domains ?? []).slice(0, 3)) {
      headlineKpis.push({ label: domain.domain, value: String(domain.count) });
    }
  }
  summaryBlocks.push({ kind: "kpis", kpis: headlineKpis });

  if (peer) {
    summaryBlocks.push({
      kind: "percentile",
      percentile: peer.percentile,
      markerLabel: `${peer.subject.name} — ${peer.subject.sidraScore.toFixed(1)}`,
      leftLabel: `Cohort minimum`,
      rightLabel: `Cohort maximum ${peer.cohort.max.toFixed(1)}`,
    });
    const aboveMedian = peer.subject.sidraScore >= peer.cohort.median;
    const ratio = peer.cohort.median > 0
      ? (peer.subject.sidraScore / peer.cohort.median).toFixed(2)
      : "n/a";
    const lines = [
      `Benchmarked against ${peer.cohort.size} scientific staff, of whom ${peer.cohort.scored} have a non-zero score.`,
      `Score is ${ratio}x the cohort median and sits ${aboveMedian ? "above" : "below"} it; interquartile range is ${peer.cohort.p25.toFixed(1)} to ${peer.cohort.p75.toFixed(1)}.`,
    ];
    if (peer.departmentCohort) {
      lines.push(`Within ${peer.departmentCohort.label}: rank ${peer.departmentCohort.rank} of ${peer.departmentCohort.size} (department median ${peer.departmentCohort.median.toFixed(1)}).`);
    }
    summaryBlocks.push({ kind: "callout", title: "Interpretation", lines });
  }

  if (data.overview) {
    summaryBlocks.push({
      kind: "table",
      columns: [
        { header: "Domain", width: 0.22, bold: true },
        { header: "Records", width: 0.12, align: "right" },
        { header: "Current status breakdown", width: 0.66 },
      ],
      rows: data.overview.domains.map((domain) => [
        domain.domain.replace(/^\w/, (c) => c.toUpperCase()),
        String(domain.count),
        statusSummary(domain.statusCounts),
      ]),
    });
  }
  sections.push({ title: "Executive Summary", blocks: summaryBlocks });

  // ── Peer benchmarking ────────────────────────────────────────────────────
  if (peer) {
    const blocks: ReportBlock[] = [
      {
        kind: "histogram",
        bins: peer.distribution,
        caption: `Distribution of SIDRA scores across ${peer.cohort.size} scientific staff. Bars show how many peers fall in each score band.`,
      },
      {
        kind: "kpis",
        kpis: [
          { label: "Cohort median", value: peer.cohort.median.toFixed(1) },
          { label: "Upper quartile", value: peer.cohort.p75.toFixed(1) },
          { label: "Cohort mean", value: peer.cohort.mean.toFixed(1) },
          { label: "Cohort maximum", value: peer.cohort.max.toFixed(1) },
        ],
      },
      {
        kind: "hbars",
        bars: peer.ladder.map((entry) => ({
          label: entry.label,
          value: entry.score,
          highlight: entry.isSubject,
          caption: `${entry.publications} pubs`,
        })),
        labelWidth: 190,
        valueLabel: (v) => v.toFixed(1),
      },
      {
        kind: "callout",
        title: "How to read this",
        lines: [
          "Peers are anonymised by design: this report positions one researcher without",
          "circulating named performance data about colleagues. Ranks shown are cohort-wide.",
        ],
      },
    ];
    sections.push({ title: "Peer Benchmarking", blocks, breakBefore: true });

    // ── Output profile ─────────────────────────────────────────────────────
    const profile: ReportBlock[] = [];
    if (peer.yearly.length) {
      profile.push({
        kind: "columns",
        bars: peer.yearly.map((entry) => ({
          label: String(entry.year),
          value: entry.publications,
          highlight: true,
        })),
      });
      profile.push({
        kind: "table",
        columns: [
          { header: "Year", width: 0.16, bold: true },
          { header: "Publications", width: 0.22, align: "right" },
          { header: "Cohort median", width: 0.24, align: "right" },
          { header: "Score contribution", width: 0.38, align: "right" },
        ],
        rows: peer.yearly.map((entry) => [
          String(entry.year),
          String(entry.publications),
          entry.cohortMedianPublications.toFixed(1),
          entry.score.toFixed(2),
        ]),
      });
    }
    if (peer.authorship.length) {
      profile.push({
        kind: "rolemix",
        slices: peer.authorship.slice(0, 6).map((entry, index) => ({
          label: entry.role, value: entry.count, tone: index,
        })),
        total: peer.authorship.reduce((sum, a) => sum + a.count, 0),
      });
    }
    sections.push({ title: "Output Profile", blocks: profile, breakBefore: true });

    if (peer.topPublications.length) {
      sections.push({
        title: "Highest-Scoring Publications",
        blocks: [{
          kind: "table",
          columns: [
            { header: "Title", width: 0.46 },
            { header: "Journal", width: 0.22 },
            { header: "Year", width: 0.08, align: "right" },
            { header: "IF", width: 0.09, align: "right" },
            { header: "Role", width: 0.15, align: "right" },
          ],
          rows: peer.topPublications.map((pub) => [
            safePdfText(pub.title),
            safePdfText(pub.journal ?? "-"),
            String(pub.year),
            pub.impactFactor ? pub.impactFactor.toFixed(1) : "-",
            safePdfText(pub.roles[0] ?? "-"),
          ]),
          fontSize: 7.5,
        }],
      });
    }
  }

  // ── Record appendix ──────────────────────────────────────────────────────
  for (const category of MANAGEMENT_REPORT_CATEGORIES.filter(
    (item) => data.config.domains.includes(item),
  )) {
    const rows = (data.rows[category] ?? []).map((row) => [
      safePdfText(row.reference ?? "-"),
      safePdfText(row.title),
      safePdfText(row.status ?? "Not recorded"),
      row.date ?? "Not recorded",
    ]);
    sections.push({
      title: `${category.replace(/^\w/, (c) => c.toUpperCase())} (${data.totals[category]})`,
      blocks: rows.length
        ? [{
            kind: "table",
            columns: [
              { header: "Reference", width: 0.24 },
              { header: "Title", width: 0.48 },
              { header: "Status", width: 0.14 },
              { header: "Date", width: 0.14, align: "right" },
            ],
            rows,
            fontSize: 7.5,
          }]
        : [{ kind: "callout", title: "No records", lines: ["No records match the selected filters for this domain."] }],
      breakBefore: category === MANAGEMENT_REPORT_CATEGORIES.find((item) => data.config.domains.includes(item)),
    });
  }

  if (data.config.domains.includes("sidra") && !peer) {
    const rows = (data.officialSidra ?? []).map((score) => {
      const person = data.staff.find((staff) => staff.id === score.scientistId);
      return [safePdfText(person?.name ?? String(score.scientistId)), score.sidraScore.toFixed(2), String(score.publicationsCount)];
    });
    sections.push({
      title: "Official SIDRA Score",
      blocks: rows.length
        ? [{
            kind: "table",
            columns: [
              { header: "Staff", width: 0.5 },
              { header: "Score", width: 0.25, align: "right" },
              { header: "Included publications", width: 0.25, align: "right" },
            ],
            rows,
          }]
        : [{ kind: "callout", title: "No eligible scores", lines: ["No eligible official SIDRA scores in scope."] }],
    });
  }

  return sections;
}

export interface ManagementPdfPage {
  section: string;
  lines: Array<{ text: string; bold?: boolean; size?: number }>;
  blocks?: ReportBlock[];
  footer?: string;
}

export interface ManagementPdfLayout {
  pages: ManagementPdfPage[];
  contents: Array<{ title: string; page: number }>;
}

const USABLE_TOP = PAGE.height - 66;
const USABLE_BOTTOM = 54;

/**
 * Flow planned sections onto pages. A section may span pages; a table is split
 * across pages rather than pushed wholesale onto a new one, which is what made
 * the previous report mostly blank.
 */
function paginate(sections: PlannedSection[]): ManagementPdfPage[] {
  const pages: ManagementPdfPage[] = [];
  let current: ManagementPdfPage | null = null;
  let y = USABLE_TOP;

  const newPage = (section: string) => {
    current = { section, lines: [], blocks: [] };
    pages.push(current);
    y = USABLE_TOP;
  };

  for (const section of sections) {
    if (!current || section.breakBefore) newPage(section.title);
    // A heading plus its first block must fit, otherwise start fresh.
    const firstHeight = section.blocks.length ? blockHeight(section.blocks[0]) : 0;
    if (y - 26 - Math.min(firstHeight, 120) < USABLE_BOTTOM) newPage(section.title);

    current!.blocks!.push({ kind: "heading", title: section.title });
    y -= 26;

    for (const block of section.blocks) {
      if (block.kind === "table") {
        let remaining = block.rows;
        let first = true;
        while (remaining.length) {
          const available = y - USABLE_BOTTOM - 22;
          const capacity = Math.max(0, Math.floor(available / 15));
          if (capacity < 3) {
            newPage(section.title);
            current!.blocks!.push({ kind: "heading", title: `${section.title} (continued)` });
            y -= 26;
            continue;
          }
          const slice = remaining.slice(0, capacity);
          remaining = remaining.slice(capacity);
          const part: ReportBlock = { ...block, rows: slice };
          current!.blocks!.push(part);
          y -= blockHeight(part);
          first = false;
        }
        void first;
        continue;
      }
      const height = blockHeight(block);
      if (y - height < USABLE_BOTTOM) {
        newPage(section.title);
        current!.blocks!.push({ kind: "heading", title: `${section.title} (continued)` });
        y -= 26;
      }
      current!.blocks!.push(block);
      y -= height;
    }
  }
  if (pages.length === 0) pages.push({ section: "Report", lines: [], blocks: [] });
  return pages;
}

/** Deterministic, inspectable pagination model used by the PDF renderer. */
export function buildManagementReportPdfLayout(data: ManagementReportData): ManagementPdfLayout {
  const sections = planReport(data);
  const pages = paginate(sections);
  const contents: Array<{ title: string; page: number }> = [];
  pages.forEach((page, index) => {
    const heading = page.blocks?.find((b) => b.kind === "heading") as { title: string } | undefined;
    if (heading && !heading.title.endsWith("(continued)") && !contents.some((c) => c.title === heading.title)) {
      contents.push({ title: heading.title, page: index + 1 });
    }
    // Text mirror of each page, so callers that only need a textual model
    // (previews, tests, accessibility exports) still get one.
    const lines: Array<{ text: string; bold?: boolean; size?: number }> = [];
    for (const block of page.blocks ?? []) {
      switch (block.kind) {
        case "heading": lines.push({ text: block.title, bold: true, size: 12 }); break;
        case "kpis": for (const kpi of block.kpis) lines.push({ text: `${kpi.label}: ${kpi.value}` }); break;
        case "table":
          lines.push({ text: block.columns.map((c) => c.header).join(" | "), bold: true });
          for (const row of block.rows) lines.push({ text: row.join(" | ") });
          break;
        case "callout":
          lines.push({ text: block.title, bold: true });
          for (const line of block.lines) lines.push({ text: line });
          break;
        case "histogram":
          for (const bin of block.bins) lines.push({ text: `${bin.label}: ${bin.count}${bin.containsSubject ? " (subject)" : ""}` });
          break;
        case "columns":
        case "hbars":
          for (const bar of block.bars) lines.push({ text: `${bar.label}: ${bar.value}` });
          break;
        case "percentile": lines.push({ text: `Percentile ${block.percentile}` }); break;
        case "rolemix": for (const slice of block.slices) lines.push({ text: `${slice.label}: ${slice.value}` }); break;
        case "spacer": break;
      }
    }
    page.lines = lines;
    page.footer = `Page ${index + 1} of ${pages.length}`;
  });
  return { pages, contents };
}

export async function buildManagementReportPdf(data: ManagementReportData): Promise<Buffer> {
  const layout = buildManagementReportPdfLayout(data);
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  const subtitle = safePdfText(data.targetLabel);
  const generated = data.generatedAt?.slice(0, 10) ?? "";

  layout.pages.forEach((layoutPage, index) => {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    let y = drawPageFrame(page, fonts, {
      title: index === 0 ? "ACADEMIC EVALUATION REPORT" : `ACADEMIC EVALUATION REPORT — ${subtitle}`,
      subtitle: index === 0 ? generated : undefined,
      pageNumber: index + 1,
      pageCount: layout.pages.length,
    });

    if (index === 0) {
      // A section target arrives as a path ("Research / Translational Medicine
      // / Tumor Biology"). Lead with the section itself and demote its parents
      // to a breadcrumb underneath, so the subject reads immediately and a deep
      // hierarchy cannot push the heading off the page.
      const parts = subtitle.split("/").map((part) => part.trim()).filter(Boolean);
      const leaf = parts.length ? parts[parts.length - 1] : subtitle;
      const parentPath = parts.length > 1 ? parts.slice(0, -1).join(" / ") : "";

      let titleSize = 24;
      let titleLines = [leaf];
      for (const candidate of [24, 21, 18, 16]) {
        titleSize = candidate;
        titleLines = wrap(leaf, fonts.bold, candidate, CONTENT_WIDTH, 2);
        const longest = Math.max(...titleLines.map((line) => fonts.bold.widthOfTextAtSize(line, candidate)));
        if (titleLines.length === 1 && longest <= CONTENT_WIDTH) break;
        if (candidate === 16) break;
      }
      const lineHeight = titleSize + 4;
      titleLines.forEach((line, lineIndex) => {
        page.drawText(line, {
          x: PAGE.margin, y: y - 22 - lineIndex * lineHeight,
          size: titleSize, font: fonts.bold, color: PALETTE.ink,
        });
      });
      let cursor = y - 22 - (titleLines.length - 1) * lineHeight;

      if (parentPath) {
        cursor -= 15;
        page.drawText(fit(parentPath, fonts.regular, 10.5, CONTENT_WIDTH), {
          x: PAGE.margin, y: cursor, size: 10.5, font: fonts.regular, color: PALETTE.body,
        });
      }

      cursor -= 16;
      const meta = `Rolling lookback ${data.config.lookbackYears ?? "-"} year(s)  |  Generated ${generated}  |  ${data.total} records in scope`;
      page.drawText(fit(safePdfText(meta), fonts.regular, 9, CONTENT_WIDTH), {
        x: PAGE.margin, y: cursor, size: 9, font: fonts.regular, color: PALETTE.muted,
      });
      y = cursor - 22;
    }

    for (const block of layoutPage.blocks ?? []) {
      switch (block.kind) {
        case "heading":
          y = drawSectionHeading(page, fonts, y, safePdfText(block.title), block.note);
          break;
        case "kpis":
          y = drawKpiRow(page, fonts, y, block.kpis.map((k) => ({
            ...k, label: safePdfText(k.label), value: safePdfText(k.value),
            caption: k.caption ? safePdfText(k.caption) : undefined,
          })));
          break;
        case "table":
          y = drawTable(page, fonts, y, block.columns, block.rows.map((r) => r.map(safePdfText)), {
            highlightRow: block.highlight ? (i) => block.highlight!.includes(i) : undefined,
            fontSize: block.fontSize,
          });
          break;
        case "histogram":
          y = drawHistogram(page, fonts, y, block.bins, { caption: block.caption ? safePdfText(block.caption) : undefined });
          break;
        case "columns":
          y = drawColumnChart(page, fonts, y, block.bars, { valueLabel: block.valueLabel });
          break;
        case "hbars":
          y = drawHorizontalBars(page, fonts, y, block.bars.map((b) => ({ ...b, label: safePdfText(b.label) })), {
            labelWidth: block.labelWidth, valueLabel: block.valueLabel,
          });
          break;
        case "percentile":
          y = drawPercentileBand(page, fonts, y, block.percentile, {
            markerLabel: safePdfText(block.markerLabel),
            leftLabel: safePdfText(block.leftLabel),
            rightLabel: safePdfText(block.rightLabel),
          });
          break;
        case "rolemix": {
          y = drawStackedBar(page, fonts, y, block.slices.map((s) => ({
            label: s.label, value: s.value, color: TONES[s.tone % TONES.length],
          })));
          y = drawLegend(page, fonts, PAGE.margin, y, block.slices.map((s) => ({
            label: safePdfText(s.label), color: TONES[s.tone % TONES.length],
            value: `${s.value} (${Math.round((s.value / Math.max(1, block.total)) * 100)}%)`,
          })), 260) - 6;
          break;
        }
        case "callout":
          y = drawCallout(page, fonts, y, safePdfText(block.title), block.lines.map(safePdfText));
          break;
        case "spacer":
          y -= block.height;
          break;
      }
    }
  });

  return Buffer.from(await pdf.save());
}
