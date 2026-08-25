import assert from "node:assert/strict";
import test from "node:test";

import type { Grant, Scientist } from "@shared/schema";
import { previewGrantRows } from "./grantsImportExport";

const noExistingGrants = new Map<string, Grant>();
const noScientistsByEmail = new Map<string, Scientist>();
const noScientistsByName = new Map<string, Scientist>();

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