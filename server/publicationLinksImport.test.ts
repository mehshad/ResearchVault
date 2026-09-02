// Unit tests for pure helpers in publicationLinksImport.ts.
// previewLinkImport (requires scientist + publication data) is tested via
// route-level integration tests; only the stateless helpers are covered here.

import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";

process.env.DATABASE_URL ||= "postgresql://ci:ci@localhost:5432/ci_test";

import { scientistDisplayName, buildLinkImportTemplate } from "./publicationLinksImport";
import type { Scientist } from "@shared/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scientist(overrides: Partial<Scientist> = {}): Scientist {
  return {
    id: 1,
    name: null,
    honorificTitle: null,
    firstName: null,
    lastName: null,
    email: "test@example.com",
    department: null,
    departmentId: null,
    sectionId: null,
    bio: null,
    profileImageInitials: null,
    supervisorId: null,
    staffId: null,
    staffType: null,
    jobTitle: null,
    orcidId: null,
    linkedinUrl: null,
    googleScholarUrl: null,
    webOfScienceId: null,
    isInvestigator: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Scientist;
}

// ---------------------------------------------------------------------------
// scientistDisplayName
// ---------------------------------------------------------------------------

test("scientistDisplayName with honorificTitle, firstName, lastName", () => {
  const s = scientist({ honorificTitle: "Dr", firstName: "Jane", lastName: "Smith" });
  assert.equal(scientistDisplayName(s), "Dr Jane Smith");
});

test("scientistDisplayName without honorificTitle", () => {
  const s = scientist({ honorificTitle: null, firstName: "Jane", lastName: "Smith" });
  assert.equal(scientistDisplayName(s), "Jane Smith");
});

test("scientistDisplayName with only lastName", () => {
  const s = scientist({ honorificTitle: null, firstName: null, lastName: "Smith" });
  assert.equal(scientistDisplayName(s), "Smith");
});

test("scientistDisplayName with all fields null returns empty string", () => {
  const s = scientist({ honorificTitle: null, firstName: null, lastName: null });
  assert.equal(scientistDisplayName(s), "");
});

test("scientistDisplayName with empty strings filters them out", () => {
  const s = scientist({ honorificTitle: "", firstName: "Jane", lastName: "" });
  assert.equal(scientistDisplayName(s), "Jane");
});

test("scientistDisplayName trims result", () => {
  const s = scientist({ honorificTitle: null, firstName: "  Jane  ", lastName: "Smith  " });
  // The function joins with space and trims the full result
  const result = scientistDisplayName(s);
  assert.equal(result, result.trim());
});

// ---------------------------------------------------------------------------
// buildLinkImportTemplate
// ---------------------------------------------------------------------------

test("buildLinkImportTemplate returns a Buffer", async () => {
  const buf = await buildLinkImportTemplate();
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.byteLength > 0);
});

test("buildLinkImportTemplate produces a valid XLSX workbook", async () => {
  const buf = await buildLinkImportTemplate();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet("Links");
  assert.ok(ws, "workbook must contain a 'Links' sheet");
});

test("buildLinkImportTemplate header row is bold", async () => {
  const buf = await buildLinkImportTemplate();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet("Links")!;
  const headerRow = ws.getRow(1);
  assert.equal((headerRow.font as any)?.bold, true);
});

test("buildLinkImportTemplate has at least the expected header columns", async () => {
  const buf = await buildLinkImportTemplate();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet("Links")!;
  const headers: string[] = [];
  ws.getRow(1).eachCell((cell) => { headers.push(String(cell.value ?? "")); });
  // Expected columns per TEMPLATE_HEADERS in publicationLinksImport.ts
  assert.ok(headers.some((h) => h.toLowerCase().includes("id")), "must have an ID column");
  assert.ok(headers.some((h) => h.toLowerCase().includes("type")), "must have a Type column");
  assert.ok(headers.length >= 4, `expected at least 4 header columns, got ${headers.length}`);
});

test("buildLinkImportTemplate includes example data rows", async () => {
  const buf = await buildLinkImportTemplate();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet("Links")!;
  let rowCount = 0;
  ws.eachRow((_row, rowNum) => { if (rowNum > 1) rowCount++; });
  assert.ok(rowCount >= 1, "template should include at least one example row");
});
