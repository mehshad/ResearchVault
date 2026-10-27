import assert from "node:assert/strict";
import test from "node:test";

import { grantFormErrors, ra200RequiredFieldErrors, stillFailing } from "./formValidation";

const grant = {
  title: "A grant",
  projectNumber: "IRF2026-001",
  status: "submitted",
  startDate: "",
  endDate: "",
  requestedAmount: "",
  awardedAmount: "",
  submittedYear: "",
  awardedYear: "",
};

test("a complete submitted grant has no errors", () => {
  assert.deepEqual(grantFormErrors(grant), {});
});

test("title and project number are required", () => {
  const errors = grantFormErrors({ ...grant, title: "  ", projectNumber: "" });
  assert.ok(errors.title);
  assert.ok(errors.projectNumber);
});

test("a status that needs a start date says so with the office's label", () => {
  const errors = grantFormErrors({ ...grant, status: "active", startDate: "" }, (s) => (s === "active" ? "Active" : s));
  assert.equal(errors.startDate, "Active grants require a start date.");
  assert.deepEqual(grantFormErrors({ ...grant, status: "active", startDate: "2026-01-01" }), {});
});

test("an end date before the start date is refused", () => {
  const errors = grantFormErrors({ ...grant, startDate: "2026-05-01", endDate: "2026-04-30" });
  assert.equal(errors.endDate, "End date cannot be before the start date.");
});

test("amounts must be numbers and years four digits, when given", () => {
  const errors = grantFormErrors({
    ...grant,
    requestedAmount: "lots",
    awardedAmount: "250,000.50",
    submittedYear: "26",
    awardedYear: "2026",
  });
  assert.ok(errors.requestedAmount);
  assert.equal(errors.awardedAmount, undefined);
  assert.ok(errors.submittedYear);
  assert.equal(errors.awardedYear, undefined);
});

test("an RA-200 submission names each required field it lacks", () => {
  const errors = ra200RequiredFieldErrors({
    title: "",
    leadScientistId: null,
    projectId: 3,
    budgetHolderId: null,
    abstract: " ",
  });
  assert.deepEqual(Object.keys(errors).sort(), ["abstract", "budgetHolderId", "leadScientistId", "title"]);
  assert.deepEqual(
    ra200RequiredFieldErrors({ title: "T", leadScientistId: 1, projectId: 3, budgetHolderId: 2, abstract: "A" }),
    {},
  );
});

test("errors clear as fields are fixed, and no new ones appear until asked", () => {
  const previous = { title: "Enter the grant's title.", projectNumber: "Enter the project number." };
  const fresh = { projectNumber: "Enter the project number.", endDate: "End date cannot be before the start date." };
  assert.deepEqual(stillFailing(previous, fresh), { projectNumber: "Enter the project number." });
});
