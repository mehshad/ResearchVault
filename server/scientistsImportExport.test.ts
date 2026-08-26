import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import type { Scientist } from "@shared/schema";
import {
  EXPORT_COLUMNS,
  buildImportPreview,
  buildTemplateBuffer,
  orderScientistsForExport,
  scientistsToRows,
} from "./scientistsImportExport";

const scientist = (id: number, firstName: string, lastName: string, extra: Partial<Scientist> = {}): Scientist => ({
  id, honorificTitle: "Dr", firstName, lastName, email: `${firstName}.${lastName}@example.org`.toLowerCase(),
  jobTitle: null, isInvestigator: false, staffId: String(id), department: null, departmentId: null,
  sectionId: null, bio: null, profileImageInitials: null, supervisorId: null, staffType: "scientific",
  orcidId: null, linkedInUrl: null, googleScholarUrl: null, webOfScienceId: null,
  createdAt: null, updatedAt: null, ...extra,
});

const org = {
  branches: [{ id: 1, name: "Research", description: null, headId: null, createdAt: null, updatedAt: null }],
  departments: [{ id: 10, branchId: 1, name: "Genomics", description: null, headId: null, createdAt: null, updatedAt: null }],
  sections: [{ id: 20, departmentId: 10, name: "Lab", type: "Laboratory", description: null, headId: null, createdAt: null, updatedAt: null }],
};

test("template uses the canonical staff columns", async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildTemplateBuffer());
  const headers = workbook.getWorksheet("Staff")!.getRow(1).values as unknown[];
  assert.deepEqual(headers.slice(1), EXPORT_COLUMNS.map(c => c.header));
  assert.ok(workbook.getWorksheet("Instructions"));
});

test("export preserves current structured fields", () => {
  const rows = scientistsToRows([scientist(1, "Ada", "Lovelace", { isInvestigator: true, departmentId: 10, sectionId: 20 })]);
  assert.equal(rows[0]["Investigator"], "Yes");
  assert.equal(rows[0]["Department ID"], 10);
  assert.equal(rows[0]["Section ID"], 20);
});

test("organization order puts managers before reports within a section", () => {
  const manager = scientist(2, "Zara", "Zulu", { departmentId: 10, sectionId: 20 });
  const report = scientist(1, "Ada", "Alpha", { departmentId: 10, sectionId: 20, supervisorId: 2 });
  assert.deepEqual(orderScientistsForExport([report, manager], org).map(s => s.id), [2, 1]);
});

test("department-level managers precede reports assigned to a section", () => {
  const manager = scientist(2, "Zara", "Zulu", { departmentId: 10 });
  const report = scientist(1, "Ada", "Alpha", { departmentId: 10, sectionId: 20, supervisorId: 2 });
  assert.deepEqual(orderScientistsForExport([report, manager], org).map(s => s.id), [2, 1]);
});

test("managers precede reports across separate sections", () => {
  const expandedOrg = {
    ...org,
    sections: [...org.sections, { ...org.sections[0], id: 21, name: "Office", type: "Office" }],
  };
  const manager = scientist(2, "Zara", "Zulu", { departmentId: 10, sectionId: 21 });
  const report = scientist(1, "Ada", "Alpha", { departmentId: 10, sectionId: 20, supervisorId: 2 });
  assert.deepEqual(orderScientistsForExport([report, manager], expandedOrg).map(s => s.id), [2, 1]);
});

test("older files preserve structured fields on matched staff", () => {
  const existing = scientist(1, "Ada", "Lovelace", { isInvestigator: true, departmentId: 10, sectionId: 20 });
  const row = Object.fromEntries(EXPORT_COLUMNS
    .filter(c => !["Investigator", "Department ID", "Section ID"].includes(c.header))
    .map(c => [c.header, scientistsToRows([existing])[0][c.header]]));
  const preview = buildImportPreview([row], [existing], org);
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.unchanged, 1);
});

test("pre-change Department header preserves the legacy department value", () => {
  const existing = scientist(1, "Ada", "Lovelace", { department: "Legacy Research" });
  const row = {
    "Staff ID": "1", "Honorific Title": "Dr", "First Name": "Ada", "Last Name": "Lovelace",
    "Email": existing.email, "Job Title": "", "Staff Type": "scientific",
    "Department": "Legacy Research", "Initials": "", "Line Manager Email": "",
    "ORCID ID": "", "LinkedIn URL": "", "Google Scholar URL": "", "Web of Science ID": "", "Bio": "",
  };
  const preview = buildImportPreview([row], [existing], org);
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.unchanged, 1);
});

test("existing staff assigned to a newly inserted manager is updated", () => {
  const report = scientist(1, "Ada", "Lovelace");
  const reportRow = scientistsToRows([{ ...report, supervisorId: 2 }])[0];
  reportRow["Line Manager Email"] = "new.manager@example.org";
  const managerRow = scientistsToRows([scientist(2, "New", "Manager", { email: "new.manager@example.org" })])[0];
  const preview = buildImportPreview([reportRow, managerRow], [report], org);
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.toInsert.length, 1);
  assert.equal(preview.toUpdate.length, 1);
  assert.equal(preview.toUpdate[0].existingId, report.id);
});

test("manager email changes still resolve to the existing manager id", () => {
  const manager = scientist(2, "Grace", "Hopper");
  const report = scientist(1, "Ada", "Lovelace", { supervisorId: manager.id });
  const managerRow = scientistsToRows([{ ...manager, email: "renamed.manager@example.org" }])[0];
  const reportRow = scientistsToRows([report])[0];
  reportRow["Line Manager Email"] = "renamed.manager@example.org";
  const preview = buildImportPreview([reportRow, managerRow], [report, manager], org);
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.toUpdate.length, 1);
  assert.equal(preview.toUpdate[0].existingId, manager.id);
  assert.equal(preview.unchanged, 1);
});

test("import rejects a section from another department", () => {
  const badOrg = { ...org, departments: [...org.departments, { ...org.departments[0], id: 11, name: "Other" }] };
  const row = scientistsToRows([scientist(1, "Ada", "Lovelace", { departmentId: 11, sectionId: 20 })])[0];
  const preview = buildImportPreview([row], [], badOrg);
  assert.match(preview.errors[0].errors.join(" "), /does not belong/);
});