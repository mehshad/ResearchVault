import assert from "node:assert/strict";
import test from "node:test";
import { managementReportConfigSchema } from "../shared/managementReports.js";
import { createRequireManagement } from "./auth.js";
import {
  assembleManagementReport,
  buildManagementReportPdf,
  buildManagementReportPdfLayout,
  buildPeerComparison,
  ManagementReportTargetNotFoundError,
  ManagementReportTooLargeError,
} from "./managementReports.js";
import {
  createManagementReportHandlers,
  sendManagementReportError,
} from "./managementReportRoutes.js";
import { PDFDocument } from "pdf-lib";

const config = managementReportConfigSchema.parse({
  targetType: "staff",
  targetId: 7,
  domains: ["sdrs", "publications"],
  lookbackYears: 5,
  activeSdrOnly: true,
  awardedGrantsOnly: false,
  publicationStatuses: ["Published *"],
  contractStatuses: [],
  patentStatuses: [],
});

test("management authorization resolves the matrix, not a list of role names", async () => {
  // The guard used to admit the literal strings "Management", "admin" and
  // "superadmin". It now reads the "management" area, so granting that area to
  // any role admits it and revoking it shuts the role out -- which is what
  // making the matrix configurable was supposed to mean.
  const guard = createRequireManagement(async (role) =>
    role === "Management" ? "edit" : null);

  for (const user of [
    { username: "m", role: "Management" },
    { username: "a", role: "admin" },
    { username: "s", role: "superadmin" },
    { username: "x", role: "Investigator", secondaryRoles: ["Management"] },
  ]) {
    let next = false;
    await guard(
      { method: "GET", path: "/", session: { user } } as any,
      {} as any,
      () => { next = true; },
    );
    assert.equal(next, true, `${user.username} should reach the management hub`);
  }

  let status = 0;
  let body: unknown;
  await guard(
    { method: "GET", path: "/", session: { user: { username: "scientist", role: "Researcher" } } } as any,
    { status(code: number) { status = code; return this; }, json(value: unknown) { body = value; } } as any,
    () => assert.fail("must reject"),
  );
  assert.equal(status, 403);
  assert.deepEqual(body, { message: "Forbidden. Management access required." });
});

test("report config rejects invalid targets, empty domains, and lookback", () => {
  assert.equal(managementReportConfigSchema.safeParse({ ...config, targetId: 0 }).success, false);
  assert.equal(managementReportConfigSchema.safeParse({ ...config, domains: [] }).success, false);
  assert.equal(managementReportConfigSchema.safeParse({ ...config, lookbackYears: 21 }).success, false);
  assert.equal(managementReportConfigSchema.safeParse({ ...config, domains: ["compliance"] }).success, false);
});

test("staff assembly uses canonical joins and applies date/status filters", async () => {
  const queries: string[] = [];
  const report = await assembleManagementReport(config, async (sql) => {
    queries.push(sql);
    if (sql.includes("FROM scientists WHERE")) {
      return { rows: [{ id: 7, first_name: "Ada", last_name: "Lovelace", staff_id: "7", section_id: 2 }] };
    }
    if (sql.includes("FROM research_activities")) {
      return { rows: [{ id: 10, reference: "SDR-10", title: "Study", status: "active", date: "2024-01-01", scientistId: 7 }] };
    }
    return { rows: [{ id: 20, reference: "10/x", title: "Paper", status: "Published *", date: "2024-02-01", scientistId: 7 }] };
  });
  assert.equal(report.total, 2);
  assert.equal(report.counts.sdrs, 1);
  assert.match(queries.find((sql) => sql.includes("research_activities"))!, /JOIN project_members/);
  assert.match(queries.find((sql) => sql.includes("publications"))!, /JOIN publication_authors/);
  assert.match(queries.find((sql) => sql.includes("publications"))!, /publication_date >= \$2/);
  assert.match(queries.find((sql) => sql.includes("publications"))!, /lower\(p.status\)/);
});

test("section assembly deduplicates records and preserves structured membership", async () => {
  const sectionConfig = { ...config, targetType: "section" as const, targetId: 3, domains: ["patents" as const] };
  const report = await assembleManagementReport(sectionConfig, async (sql) => {
    if (sql.includes("FROM sections sec")) return { rows: [{
      id: 3, section_name: "Lab", department_name: "Research", branch_name: "Science",
    }] };
    if (sql.includes("FROM scientists WHERE section_id")) return { rows: [
      { id: 7, first_name: "Ada", last_name: "Lovelace", section_id: 3, section_name: "Lab" },
      { id: 8, first_name: "Grace", last_name: "Hopper", section_id: 3, section_name: "Lab" },
    ] };
    return { rows: [
      { id: 30, reference: "P-1", title: "Patent", status: "Filed", date: "2024-01-01", scientistId: 7 },
      { id: 30, reference: "P-1", title: "Patent", status: "Filed", date: "2024-01-01", scientistId: 8 },
    ] };
  });
  assert.equal(report.counts.patents, 1);
  assert.deepEqual(report.rows.patents?.[0].scientistIds, [7, 8]);
});

test("shared section records are limited after aggregation, not by raw relationship rows", async () => {
  const scientistIds = Array.from({ length: 250 }, (_, index) => index + 1);
  const sectionConfig = {
    ...config,
    targetType: "section" as const,
    targetId: 3,
    domains: ["overview" as const],
    activeSdrOnly: false,
  };
  const categoryQueries: string[] = [];
  const report = await assembleManagementReport(sectionConfig, async (sql) => {
    if (sql.includes("FROM sections sec")) return { rows: [{
      id: 3, section_name: "Shared Lab", department_name: "Research", branch_name: "Science",
    }] };
    if (sql.includes("FROM scientists WHERE section_id")) {
      return { rows: scientistIds.map((id) => ({
        id,
        first_name: `Staff${id}`,
        last_name: "Member",
        section_id: 3,
        section_name: "Shared Lab",
      })) };
    }
    categoryQueries.push(sql);
    // Five records x 250 people represents 1,250 raw relationship rows per
    // domain. SQL aggregation returns five distinct records and all people.
    return { rows: Array.from({ length: 5 }, (_, id) => ({
      id,
      title: `Shared record ${id}`,
      status: "active",
      date: "2024-01-01",
      scientistIds,
    })) };
  });
  assert.equal(report.total, 25);
  assert.equal(report.rows.sdrs?.[0].scientistIds.length, 250);
  assert.equal(report.rows.publications?.[0].scientistIds.length, 250);
  assert.equal(report.rows.grants?.[0].scientistIds.length, 250);
  assert.equal(report.rows.contracts?.[0].scientistIds.length, 250);
  assert.equal(report.rows.patents?.[0].scientistIds.length, 250);
  assert.equal(categoryQueries.length, 5);
  for (const sql of categoryQueries) {
    assert.match(sql, /array_agg\(DISTINCT/);
    assert.match(sql, /GROUP BY [rpcg]\.id ORDER BY title, id LIMIT/);
  }
});

test("existing empty section produces empty overview, categories, SIDRA, and a valid PDF", async () => {
  const emptyConfig = {
    ...config,
    targetType: "section" as const,
    targetId: 44,
    domains: ["overview" as const, "sdrs" as const, "publications" as const, "grants" as const,
      "contracts" as const, "patents" as const, "sidra" as const],
  };
  let categoryQueries = 0;
  const report = await assembleManagementReport(emptyConfig, async (sql) => {
    if (sql.includes("FROM sections sec")) return { rows: [{
      id: 44,
      section_name: "New Lab",
      department_name: "Discovery",
      branch_name: "Research",
    }] };
    if (sql.includes("FROM scientists WHERE section_id")) return { rows: [] };
    categoryQueries++;
    return { rows: [] };
  });
  assert.equal(report.targetLabel, "Research / Discovery / New Lab");
  assert.deepEqual(report.staff, []);
  assert.equal(report.total, 0);
  assert.equal(report.overview?.scope.staffCount, 0);
  assert.ok(report.overview?.domains.every((domain) => domain.count === 0));
  assert.deepEqual(report.officialSidra, []);
  assert.equal(categoryQueries, 0, "empty membership must not issue domain ANY(empty) queries");
  const pdf = await buildManagementReportPdf(report);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok((await PDFDocument.load(pdf)).getPageCount() >= 2);

  const handlers = createManagementReportHandlers({
    assemble: async () => report,
    buildPdf: buildManagementReportPdf,
  });
  let previewBody: any;
  await handlers.preview(
    { body: emptyConfig } as any,
    { json(value: unknown) { previewBody = value; return this; } } as any,
  );
  assert.equal(previewBody.overview.scope.staffCount, 0);
  let routePdf: Buffer | undefined;
  const headers: Record<string, string> = {};
  await handlers.pdf(
    { body: emptyConfig } as any,
    {
      setHeader(name: string, value: string) { headers[name] = value; },
      send(value: Buffer) { routePdf = value; return this; },
    } as any,
  );
  assert.equal(headers["Content-Type"], "application/pdf");
  assert.equal(routePdf?.subarray(0, 5).toString(), "%PDF-");
});

test("missing section remains a typed 404 at service and route error boundary", async () => {
  const missingConfig = {
    ...config,
    targetType: "section" as const,
    targetId: 999,
    domains: ["overview" as const],
  };
  await assert.rejects(
    assembleManagementReport(missingConfig, async () => ({ rows: [] })),
    ManagementReportTargetNotFoundError,
  );
  let status = 0;
  let body: any;
  sendManagementReportError(
    new ManagementReportTargetNotFoundError("section"),
    {
      status(code: number) { status = code; return this; },
      json(value: unknown) { body = value; return this; },
    } as any,
  );
  assert.equal(status, 404);
  assert.equal(body.message, "Report section target not found.");

  const handlers = createManagementReportHandlers({
    assemble: async () => { throw new ManagementReportTargetNotFoundError("section"); },
    buildPdf: buildManagementReportPdf,
  });
  status = 0;
  body = undefined;
  await handlers.preview(
    { body: missingConfig } as any,
    {
      status(code: number) { status = code; return this; },
      json(value: unknown) { body = value; return this; },
    } as any,
  );
  assert.equal(status, 404);
  assert.equal(body.message, "Report section target not found.");
});

test("more than 1000 distinct records fails gracefully before rendering", async () => {
  await assert.rejects(
    assembleManagementReport({ ...config, domains: ["sdrs"] }, async (sql) => {
      if (sql.includes("FROM scientists WHERE")) {
        return { rows: [{ id: 7, first_name: "Ada", last_name: "Lovelace", section_id: 2 }] };
      }
      return { rows: Array.from({ length: 1001 }, (_, id) => ({
        id, title: `Study ${id}`, status: "active", date: "2024-01-01", scientistId: 7,
      })) };
    }),
    ManagementReportTooLargeError,
  );
});

test("generated report is a valid PDF", async () => {
  const report = await assembleManagementReport(config, async (sql) => {
    if (sql.includes("FROM scientists WHERE")) {
      return { rows: [{ id: 7, first_name: "Ada", last_name: "Lovelace", section_id: 2 }] };
    }
    return { rows: [] };
  });
  const pdf = await buildManagementReportPdf(report);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 500);
});

test("overview has a real scoped cross-domain model and status counts", async () => {
  const overviewConfig = { ...config, domains: ["overview" as const] };
  const report = await assembleManagementReport(overviewConfig, async (sql) => {
    if (sql.includes("FROM scientists WHERE")) {
      return { rows: [{ id: 7, first_name: "Ada", last_name: "Lovelace", section_id: 2 }] };
    }
    if (sql.includes("FROM research_activities")) {
      return { rows: [{ id: 1, title: "SDR", status: "active", date: "2024-01-01", scientistId: 7 }] };
    }
    if (sql.includes("FROM publications")) {
      return { rows: [
        { id: 2, title: "Paper A", status: "Published *", date: "2024-01-01", scientistId: 7 },
        { id: 3, title: "Paper B", status: "Published *", date: "2024-01-01", scientistId: 7 },
      ] };
    }
    return { rows: [] };
  });
  assert.deepEqual(report.overview?.scope, { targetType: "staff", targetId: 7, staffCount: 1 });
  assert.equal(report.overview?.totalRecords, 3);
  assert.deepEqual(
    report.overview?.domains.find((domain) => domain.domain === "publications"),
    { domain: "publications", count: 2, statusCounts: { "Published *": 2 } },
  );
});

test("multipage PDF layout paginates tables, repeats section headings, and numbers pages", async () => {
  const longTitle = "A deliberately long publication title ".repeat(8);
  const manyRows = Array.from({ length: 110 }, (_, id) => ({
    id,
    reference: `DOI-${id}`,
    title: `${longTitle}${id}`,
    status: "Published *",
    date: "2024-01-01",
    scientistIds: [7],
  }));
  const report = {
    generatedAt: "2025-01-01T00:00:00.000Z",
    config: { ...config, domains: ["publications" as const] },
    filterDefinitions: {
      dateRange: "date",
      statuses: "status",
      relationships: "relationships",
    },
    targetLabel: "Ada Lovelace",
    staff: [{ id: 7, name: "Ada Lovelace", staffId: "7", sectionId: 2 }],
    rows: { publications: manyRows },
    totals: { sdrs: 0, publications: manyRows.length, grants: 0, contracts: 0, patents: 0 },
    counts: { sdrs: 0, publications: manyRows.length, grants: 0, contracts: 0, patents: 0 },
    total: manyRows.length,
  };
  const layout = buildManagementReportPdfLayout(report);

  // 110 rows must flow across pages rather than being dropped or forced onto one.
  assert.ok(layout.pages.length > 2, "long tables should span multiple pages");
  const publicationEntry = layout.contents.find((entry) => entry.title.startsWith("Publications"));
  assert.ok(publicationEntry, "section must appear in the contents list");

  // Every page carries a heading, and continuations are marked as such.
  for (const page of layout.pages) {
    const heading = page.blocks?.find((block) => block.kind === "heading");
    assert.ok(heading, "each page starts with a section heading");
  }
  const continued = layout.pages.filter((page) =>
    page.blocks?.some((block) => block.kind === "heading" && block.title.endsWith("(continued)")),
  );
  assert.ok(continued.length >= 1, "spilled tables repeat the heading as a continuation");

  // Every data row survives pagination exactly once.
  const renderedRows = layout.pages.flatMap((page) =>
    (page.blocks ?? []).filter((block) => block.kind === "table").flatMap((block: any) => block.rows),
  );
  assert.equal(renderedRows.length, manyRows.length, "no rows lost or duplicated across pages");

  assert.equal(layout.pages.at(-1)?.footer, `Page ${layout.pages.length} of ${layout.pages.length}`);

  const bytes = await buildManagementReportPdf(report);
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), layout.pages.length);
});

function scoreStub(id: number, score: number, pubs: number, department: string | null = "Lab A") {
  return {
    id, honorificTitle: null, firstName: `S${id}`, lastName: "X",
    jobTitle: null, department,
    publicationsCount: pubs,
    sidraScore: score,
    missingImpactFactorPublications: [],
    publicationIssues: [],
    excludedPublications: [],
    calculationDetails: Array.from({ length: pubs }, (_, i) => ({
      publicationId: id * 100 + i,
      title: `Pub ${id}-${i}`,
      journal: "J",
      publicationDate: "2024-05-01",
      impactFactor: 10,
      targetYear: 2024,
      actualYear: 2024,
      usedFallback: false,
      authorshipTypes: i === 0 ? ["First Author"] : ["Contributing Author"],
      appliedMultipliers: [],
      multiplier: 1,
      publicationScore: score / Math.max(1, pubs),
    })),
    settings: {} as any,
  } as any;
}

test("peer comparison ranks the subject and anonymises the cohort", () => {
  const cohort = [
    scoreStub(1, 100, 4),
    scoreStub(2, 300, 6),
    scoreStub(3, 200, 5),
    scoreStub(4, 50, 2),
    scoreStub(5, 400, 8, "Lab B"),
  ];
  const result = buildPeerComparison(3, "Subject Name", cohort)!;

  assert.ok(result, "comparison is produced for a member of the cohort");
  assert.equal(result.rank, 3, "200 is the third highest of five");
  assert.equal(result.cohort.size, 5);
  assert.equal(result.cohort.median, 200);
  assert.equal(result.cohort.max, 400);
  // Two of four peers score below the subject.
  assert.equal(Math.round(result.percentile), 50);

  // The subject is named; every peer is not.
  const named = result.ladder.filter((entry) => entry.label === "Subject Name");
  assert.equal(named.length, 1, "subject appears exactly once, by name");
  assert.ok(
    result.ladder.filter((e) => !e.isSubject).every((e) => e.label.startsWith("Peer (rank ")),
    "peers must never be identifiable in an individual evaluation report",
  );

  // Exactly one distribution bin contains the subject.
  assert.equal(result.distribution.filter((bin) => bin.containsSubject).length, 1);
  assert.equal(
    result.distribution.reduce((sum, bin) => sum + bin.count, 0),
    cohort.length,
    "every cohort member falls in exactly one bin",
  );

  // Department cohort excludes the member in a different department.
  assert.equal(result.departmentCohort?.size, 4);
});

test("peer comparison returns nothing when the subject is outside the cohort", () => {
  assert.equal(buildPeerComparison(99, "Ghost", [scoreStub(1, 10, 1)]), undefined);
});
