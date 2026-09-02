import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";

import type { Grant, Scientist } from "@shared/schema";
import { buildStaffNameIndex } from "@shared/staffNameMatching";
import {
  buildMissingGrantStaffWorkbookBuffer,
  collectMissingGrantStaff,
  previewGrantRows,
} from "./grantsImportExport";

const noExistingGrants = new Map<string, Grant>();
const noScientistsByEmail = new Map<string, Scientist>();
const noScientistsByName = buildStaffNameIndex([]);

test("grant import rejects Active rows without a start date", () => {
  const [preview] = previewGrantRows(
    [{
      "Project Number": "IMPORT-ACTIVE-NO-DATE",
      "Title": "Active grant without date",
      "Status": "active",
      "Awarded (Yes/No)": "No",
    }],
    noExistingGrants,
    noScientistsByEmail,
    noScientistsByName,
  );

  assert.equal(preview.action, "skip");
  assert.match(preview.reason ?? "", /Active grants require a start date/);
});

test("grant import synchronizes the award milestone with status", () => {
  const [preview] = previewGrantRows(
    [{
      "Project Number": "IMPORT-AWARDED",
      "Title": "Newly awarded grant",
      "Status": "pending",
      "Awarded (Yes/No)": "Yes",
    }],
    noExistingGrants,
    noScientistsByEmail,
    noScientistsByName,
  );

  assert.equal(preview.action, "create");
  assert.equal(preview.data?.status, "awarded");
  assert.equal(preview.data?.awarded, true);
});

test("grant import rejects end dates before start dates", () => {
  const [preview] = previewGrantRows(
    [{
      "Project Number": "IMPORT-BAD-DATES",
      "Title": "Chronologically invalid grant",
      "Status": "awarded",
      "Start Date": "2026-06-01",
      "End Date": "2026-05-31",
    }],
    noExistingGrants,
    noScientistsByEmail,
    noScientistsByName,
  );

  assert.equal(preview.action, "skip");
  assert.match(preview.reason ?? "", /end date cannot be before the start date/i);
});

test("grant import preserves an existing award milestone for Cancelled grants", () => {
  const existing = {
    id: 17,
    projectNumber: "IMPORT-CANCELLED",
    title: "Existing awarded grant",
    status: "active",
    awarded: true,
    startDate: "2026-01-01",
  } as Grant;
  const existingGrants = new Map<string, Grant>([
    [existing.projectNumber.toLowerCase(), existing],
  ]);

  const [preview] = previewGrantRows(
    [{
      "Project Number": existing.projectNumber,
      "Status": "cancelled",
    }],
    existingGrants,
    noScientistsByEmail,
    noScientistsByName,
  );

  assert.equal(preview.action, "update");
  assert.equal(preview.data?.status, "cancelled");
  assert.equal(preview.data?.awarded, true);
});

test("repeat grant imports append unique collaborators and co-investigators", () => {
  const existing = {
    id: 18,
    projectNumber: "IMPORT-ENRICH",
    title: "Existing grant",
    status: "submitted",
    awarded: false,
    collaborators: ["Qatar University"],
    coInvestigators: ["Dr. Existing Person"],
  } as Grant;
  const existingGrants = new Map<string, Grant>([
    [existing.projectNumber.toLowerCase(), existing],
  ]);

  const [preview] = previewGrantRows(
    [{
      "Project Number": existing.projectNumber,
      "Collaborators": "qatar university; Hamad Medical Corporation",
      "Co-Investigators": "Dr. Existing Person; Dr. New Person",
      "Submitting Institution": "Sidra Medicine",
      "Currency": "QAR",
    }],
    existingGrants,
    noScientistsByEmail,
    noScientistsByName,
  );

  assert.equal(preview.action, "update");
  assert.deepEqual(preview.data?.collaborators, [
    "Qatar University",
    "Hamad Medical Corporation",
  ]);
  assert.deepEqual(preview.data?.coInvestigators, [
    "Dr. Existing Person",
    "Dr. New Person",
  ]);
  assert.equal(preview.data?.submittingInstitution, "Sidra Medicine");
  assert.equal(preview.data?.currency, "QAR");
});

test("repeat grant imports preserve existing values when new cells are blank", () => {
  const existing = {
    id: 19,
    projectNumber: "IMPORT-BLANK-PRESERVE",
    title: "Existing grant",
    status: "submitted",
    awarded: false,
    sourceCategory: "IRF Project",
    durationMonths: 30,
    collaborators: ["Existing Institution"],
  } as Grant;
  const existingGrants = new Map<string, Grant>([
    [existing.projectNumber.toLowerCase(), existing],
  ]);

  const [preview] = previewGrantRows(
    [{
      "Project Number": existing.projectNumber,
      "Grant Source": "",
      "Duration (Months)": "",
      "Collaborators": "",
    }],
    existingGrants,
    noScientistsByEmail,
    noScientistsByName,
  );

  assert.equal(preview.action, "skip");
  assert.equal(preview.reason, "No changes");
});

test("grant import parses the additional masterfile fields", () => {
  const [preview] = previewGrantRows(
    [{
      "Project Number": "IMPORT-MASTER-FIELDS",
      "Title": "Grant with masterfile metadata",
      "Status": "submitted",
      "Grant Source": "Subaward Agreement",
      "Source Record Key": "SAA-001",
      "Submitting Institution": "Hamad Medical Corporation",
      "Co-Investigators": "Dr. One; Dr. Two",
      "Subaward Completed Year": "2025",
      "Contribution Type": "In-kind",
      "Contribution Details": "Equipment and staff time",
      "Duration (Months)": "30",
      "Currency": "QAR",
    }],
    noExistingGrants,
    noScientistsByEmail,
    noScientistsByName,
  );

  assert.equal(preview.action, "create");
  assert.equal(preview.data?.sourceCategory, "Subaward Agreement");
  assert.equal(preview.data?.sourceRecordKey, "SAA-001");
  assert.equal(preview.data?.submittingInstitution, "Hamad Medical Corporation");
  assert.deepEqual(preview.data?.coInvestigators, ["Dr. One", "Dr. Two"]);
  assert.equal(preview.data?.subawardCompletedYear, 2025);
  assert.equal(preview.data?.contributionType, "In-kind");
  assert.equal(preview.data?.contributionDetails, "Equipment and staff time");
  assert.equal(preview.data?.durationMonths, 30);
  assert.equal(preview.data?.currency, "QAR");
});

test("grant import accepts only EUR, USD, or QAR currencies", () => {
  const [accepted] = previewGrantRows(
    [{
      "Project Number": "IMPORT-VALID-CURRENCY",
      "Title": "Valid currency",
      "Status": "submitted",
      "Currency": "eur",
    }],
    noExistingGrants,
    noScientistsByEmail,
    noScientistsByName,
  );
  assert.equal(accepted.action, "create");
  assert.equal(accepted.data?.currency, "EUR");

  const [rejected] = previewGrantRows(
    [{
      "Project Number": "IMPORT-INVALID-CURRENCY",
      "Title": "Invalid currency",
      "Status": "submitted",
      "Currency": "GBP",
    }],
    noExistingGrants,
    noScientistsByEmail,
    noScientistsByName,
  );
  assert.equal(rejected.action, "skip");
  assert.match(rejected.reason ?? "", /Currency must be EUR, USD, or QAR/);
});

test("grant import exposes structured missing staff and consolidates affected grants", () => {
  const previews = previewGrantRows(
    [
      {
        "Project Number": "MISSING-STAFF-1",
        "Title": "First affected grant",
        "Status": "submitted",
        "LPI Name": "Dr. Missing Person",
        "LPI Email": "missing.person@example.org",
      },
      {
        "Project Number": "MISSING-STAFF-2",
        "Title": "Second affected grant",
        "Status": "submitted",
        "LPI Name": "dr. missing person",
      },
    ],
    noExistingGrants,
    noScientistsByEmail,
    noScientistsByName,
  );

  assert.equal(previews[0].action, "skip");
  assert.deepEqual(previews[0].unmatchedStaff, {
    lpiName: "Dr. Missing Person",
    lpiEmail: "missing.person@example.org",
    reason: 'No staff member found with email "missing.person@example.org"',
  });

  const missingStaff = collectMissingGrantStaff(previews);
  assert.equal(missingStaff.length, 1);
  assert.equal(missingStaff[0].affectedGrantCount, 2);
  assert.equal(missingStaff[0].lpiName, "Dr. Missing Person");
  assert.equal(missingStaff[0].lpiEmail, "missing.person@example.org");
  assert.deepEqual(missingStaff[0].projectNumbers, [
    "MISSING-STAFF-1",
    "MISSING-STAFF-2",
  ]);
  assert.deepEqual(missingStaff[0].grantTitles, [
    "First affected grant",
    "Second affected grant",
  ]);
});

test("missing grant staff workbook contains forwardable staff and grant details", async () => {
  const previews = previewGrantRows(
    [{
      "Project Number": "MISSING-STAFF-XLSX",
      "Title": "Workbook affected grant",
      "Status": "submitted",
      "LPI Name": "Dr. Workbook Person",
    }],
    noExistingGrants,
    noScientistsByEmail,
    noScientistsByName,
  );

  const buffer = await buildMissingGrantStaffWorkbookBuffer(previews);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("Missing Staff");
  assert.ok(sheet);
  assert.deepEqual(
    (sheet.getRow(1).values as unknown[]).slice(1),
    [
      "LPI Name",
      "LPI Email",
      "Affected Grants",
      "Project Numbers",
      "Grant Titles",
      "Reason",
    ],
  );
  assert.equal(sheet.getCell("A2").value, "Dr. Workbook Person");
  assert.equal(sheet.getCell("C2").value, 1);
  assert.equal(sheet.getCell("D2").value, "MISSING-STAFF-XLSX");
  assert.equal(sheet.getCell("E2").value, "Workbook affected grant");
});

// ── Grants somebody else submitted ──────────────────────────────────────────
// On a subaward the grant's Lead PI works at the prime institution and will
// never be in our directory, so that name goes to the Grant LPI field and the
// Sidra Lead PI is taken from the Co-Investigators column instead. lpi_id must
// never end up null: it is what portfolios, issue flags and the clean-up rule
// all count.

const subawardStaff = buildStaffNameIndex([
  { id: 27, firstName: "Ammira", lastName: "Akil" },
  { id: 35, firstName: "Khalid", lastName: "Fakhro" },
]);

const subawardRow = (overrides: Record<string, string> = {}) => ({
  "Project Number": "SUB-1",
  "Title": "A grant led elsewhere",
  "LPI Name": "Prof. Ilham Al-Qaradawi",
  "Submitting Institution": "Qatar University",
  "Co-Investigators": "Dr Ammira Akil",
  "Status": "submitted",
  ...overrides,
});

test("a subaward takes its Sidra Lead PI from the one co-investigator who is ours", () => {
  const [preview] = previewGrantRows([subawardRow()], noExistingGrants, noScientistsByEmail, subawardStaff);
  assert.equal(preview.action, "create");
  assert.equal(preview.data?.grantLpiName, "Prof. Ilham Al-Qaradawi");
  assert.equal(preview.data?.lpiId, 27);
});

test("two Sidra co-investigators on a subaward is left for a person", () => {
  // Picking one would be a guess about which of them leads our part.
  const [preview] = previewGrantRows(
    [subawardRow({ "Project Number": "SUB-2", "Co-Investigators": "Dr Ammira Akil; Dr Khalid Fakhro" })],
    noExistingGrants, noScientistsByEmail, subawardStaff,
  );
  assert.equal(preview.action, "skip");
  assert.match(preview.reason ?? "", /2 Sidra staff/);
});

test("a subaward naming nobody of ours is left for a person, not imported without an LPI", () => {
  const [preview] = previewGrantRows(
    [subawardRow({ "Project Number": "SUB-3", "Co-Investigators": "Dr Paul Ogburn" })],
    noExistingGrants, noScientistsByEmail, subawardStaff,
  );
  assert.equal(preview.action, "skip");
  assert.match(preview.reason ?? "", /nobody to record as Sidra Lead PI/);
});

test("our own grants are untouched by any of this", () => {
  const [preview] = previewGrantRows(
    [subawardRow({
      "Project Number": "OURS-1",
      "Submitting Institution": "Sidra Medicine",
      "LPI Name": "Dr Khalid Fakhro",
    })],
    noExistingGrants, noScientistsByEmail, subawardStaff,
  );
  assert.equal(preview.action, "create");
  assert.equal(preview.data?.lpiId, 35);
  assert.equal(preview.data?.grantLpiName, undefined, "no external Lead PI on a grant we submitted");
});

test("an LPI email still wins over the co-investigator fallback", () => {
  // An explicit email is the office saying who it is. The fallback exists
  // because the file has none, not because it should override one.
  const [preview] = previewGrantRows(
    [subawardRow({ "Project Number": "SUB-4", "LPI Email": "kfakhro@sidra.org" })],
    noExistingGrants,
    new Map([["kfakhro@sidra.org", { id: 35 } as Scientist]]),
    subawardStaff,
  );
  assert.equal(preview.action, "create");
  assert.equal(preview.data?.lpiId, 35);
});
