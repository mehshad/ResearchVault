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