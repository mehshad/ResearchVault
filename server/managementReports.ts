import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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
} from "@shared/managementReports";
import {
  calculateSelectedScientistScores,
  loadOfficialSettings,
  SidraScopeTooLargeError,
} from "./sidraScoreService";

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
  }
  return data;
}

function safePdfText(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, "?");
}

export interface ManagementPdfPage {
  section: string;
  lines: Array<{ text: string; bold?: boolean; size?: number }>;
  footer?: string;
}

export interface ManagementPdfLayout {
  pages: ManagementPdfPage[];
  contents: Array<{ title: string; page: number }>;
}

function wrapText(text: string, width = 92): string[] {
  const words = safePdfText(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (word.length > width) {
      if (line) lines.push(line);
      for (let offset = 0; offset < word.length; offset += width) {
        lines.push(word.slice(offset, offset + width));
      }
      line = "";
    } else if (!line || line.length + word.length + 1 <= width) {
      line = line ? `${line} ${word}` : word;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Deterministic, inspectable pagination model used by the PDF renderer. */
export function buildManagementReportPdfLayout(data: ManagementReportData): ManagementPdfLayout {
  const maxLines = 47;
  const pages: ManagementPdfPage[] = [{
    section: "Contents",
    lines: [
      { text: "Management Report", bold: true, size: 18 },
      { text: `Target: ${data.targetLabel}` },
      { text: `Generated: ${data.generatedAt}` },
      { text: `Rolling lookback: ${data.config.lookbackYears} year(s)` },
      { text: "" },
      { text: "Table of Contents", bold: true, size: 14 },
    ],
  }];
  const contents: Array<{ title: string; page: number }> = [];

  const addSection = (
    title: string,
    tableHeader: string | null,
    body: Array<{ text: string; bold?: boolean; size?: number }>,
  ) => {
    const makePage = () => {
      const page: ManagementPdfPage = {
        section: title,
        lines: [
          { text: title, bold: true, size: 14 },
          ...(tableHeader ? [{ text: tableHeader, bold: true }] : []),
        ],
      };
      pages.push(page);
      return page;
    };
    contents.push({ title, page: pages.length + 1 });
    let page = makePage();
    for (const item of body) {
      const wrapped = wrapText(item.text);
      for (const text of wrapped) {
        if (page.lines.length >= maxLines) page = makePage();
        page.lines.push({ ...item, text });
      }
    }
  };

  if (data.config.domains.includes("overview") && data.overview) {
    const body: Array<{ text: string; bold?: boolean }> = [
      { text: `Scope: ${data.overview.scope.staffCount} staff member(s); ${data.overview.totalRecords} records`, bold: true },
    ];
    for (const domain of data.overview.domains) {
      const statuses = Object.entries(domain.statusCounts)
        .map(([status, count]) => `${status}: ${count}`)
        .join(", ") || "No records";
      body.push({ text: `${domain.domain.toUpperCase()} | ${domain.count} | ${statuses}` });
    }
    addSection("Overview", "Domain | Count | Current status breakdown", body);
  }
  for (const category of MANAGEMENT_REPORT_CATEGORIES.filter(
    (item) => data.config.domains.includes(item),
  )) {
    const body: Array<{ text: string }> = [];
    for (const row of data.rows[category] ?? []) {
      body.push({
        text: `${row.reference ?? "-"} | ${row.title} | ${row.status ?? "Not recorded"} | ${row.date ?? "Not recorded"}`,
      });
    }
    if (body.length === 0) body.push({ text: "No records" });
    addSection(`${category.toUpperCase()} (${data.totals[category]})`, "Reference | Title | Status | Date", body);
  }
  if (data.config.domains.includes("sidra")) {
    const body = (data.officialSidra ?? []).map((score) => {
      const person = data.staff.find((staff) => staff.id === score.scientistId);
      return {
        text: `${person?.name ?? score.scientistId} | ${score.sidraScore.toFixed(2)} | ${score.publicationsCount}`,
      };
    });
    if (body.length === 0) body.push({ text: "No eligible official SIDRA scores" });
    addSection("Official SIDRA Score", "Staff | Score | Included publications", body);
  }
  for (const entry of contents) {
    pages[0].lines.push({ text: `${entry.title} ${".".repeat(Math.max(3, 66 - entry.title.length))} ${entry.page}` });
  }
  pages.forEach((page, index) => {
    page.footer = `Page ${index + 1} of ${pages.length}`;
  });
  return { pages, contents };
}

export async function buildManagementReportPdf(data: ManagementReportData): Promise<Buffer> {
  const layout = buildManagementReportPdfLayout(data);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const [index, layoutPage] of layout.pages.entries()) {
    const page = pdf.addPage([612, 792]);
    let y = 750;
    for (const item of layoutPage.lines) {
      const size = item.size ?? 9;
      page.drawText(item.text, {
        x: 40, y, size, font: item.bold ? bold : font, color: rgb(0.1, 0.1, 0.1),
        maxWidth: 532,
      });
      y -= Math.max(14, size + 4);
    }
    const footer = layoutPage.footer ?? `Page ${index + 1} of ${layout.pages.length}`;
    page.drawText(footer, {
      x: 306 - font.widthOfTextAtSize(footer, 8) / 2,
      y: 24,
      size: 8,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
  }
  return Buffer.from(await pdf.save());
}