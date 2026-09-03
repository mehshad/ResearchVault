import { test } from "node:test";
import assert from "node:assert/strict";
import { previewSdrRows, SDR_COLUMNS } from "./sdrImportExport";
import { buildStaffNameIndex } from "@shared/staffNameMatching";
import { summariseSdrSkips } from "@shared/sdrImportReasons";

const PI = { id: 7, honorificTitle: "Dr", firstName: "Ada", lastName: "Lovelace" };
const NOT_PI = { id: 9, honorificTitle: "Dr", firstName: "Grace", lastName: "Hopper" };

const inputs = (overrides: Partial<Parameters<typeof previewSdrRows>[1]> = {}) => ({
  existingBySdrNumber: new Map(),
  projectsByNumber: new Map([["prj-001", { id: 1, projectId: "PRJ-001", name: "Existing" } as any]]),
  scientistByEmail: new Map([["ada@sidra.org", PI as any]]),
  staffNameIndex: buildStaffNameIndex([PI, NOT_PI] as any),
  eligiblePiIds: new Set([7]),
  programsByKey: new Map([
    ["neuroscience", { id: 4, name: "Neuroscience" }],
    ["prm-004", { id: 4, name: "Neuroscience" }],
  ]),
  ...overrides,
});

const row = (over: Record<string, string> = {}) => ({
  "SDR Number": "SDR-1", "SDR Name": "A study", "PI Name": "Dr Ada Lovelace",
  "Project Number": "PRJ-001", "Project Name": "Existing", "Program": "Neuroscience", ...over,
});

test("a complete row on an existing project is created and linked", () => {
  const [p] = previewSdrRows([row()], inputs());
  assert.equal(p.action, "create");
  assert.equal(p.data?.projectId, 1);
  assert.equal(p.data?.budgetHolderId, 7);
  assert.equal(p.data?.status, "planning", "defaults rather than being left unset");
  assert.equal(p.createsProject, undefined);
});

test("an unknown project number is created from the name given alongside it", () => {
  // Which is the whole reason both columns are asked for.
  const [p] = previewSdrRows([row({ "Project Number": "PRJ-NEW", "Project Name": "Fresh" })], inputs());
  assert.equal(p.action, "create");
  assert.deepEqual(p.createsProject, {
    projectNumber: "PRJ-NEW", projectName: "Fresh", programId: 4, programName: "Neuroscience",
  });
});

test("a new project needs a program, or it would be orphaned", () => {
  const [p] = previewSdrRows(
    [row({ "Project Number": "PRJ-NEW", "Project Name": "Fresh", "Program": "" })],
    inputs(),
  );
  assert.equal(p.action, "skip");
  assert.equal(p.reasonCode, "no_program");
});

test("a program that matches nothing is refused rather than dropped", () => {
  const [p] = previewSdrRows(
    [row({ "Project Number": "PRJ-NEW", "Project Name": "Fresh", "Program": "Astrology" })],
    inputs(),
  );
  assert.equal(p.action, "skip");
  assert.equal(p.reasonCode, "no_program");
  assert.match(p.reason ?? "", /Astrology/);
});

test("a program can be given by its PRM number instead of its name", () => {
  const [p] = previewSdrRows(
    [row({ "Project Number": "PRJ-NEW", "Project Name": "Fresh", "Program": "PRM-004" })],
    inputs(),
  );
  assert.equal(p.action, "create");
  assert.equal(p.createsProject?.programId, 4);
});

test("an existing project ignores the Program column entirely", () => {
  // The project already sits under a program; the column only exists to create
  // one, and second-guessing an existing project's program is not this
  // import's business.
  const [p] = previewSdrRows([row({ "Program": "" })], inputs());
  assert.equal(p.action, "create");
  assert.equal(p.data?.projectId, 1);
});

test("an unknown project with no name is refused rather than guessed at", () => {
  const [p] = previewSdrRows([row({ "Project Number": "PRJ-NEW", "Project Name": "" })], inputs());
  assert.equal(p.action, "skip");
  assert.equal(p.reasonCode, "no_project");
});

test("a PI without the Investigator access role is refused, with the rule stated", () => {
  // The API enforces this too; catching it in the preview means the file says
  // so up front instead of failing halfway through an apply.
  const [p] = previewSdrRows([row({ "PI Name": "Dr Grace Hopper" })], inputs());
  assert.equal(p.action, "skip");
  assert.equal(p.reasonCode, "pi_not_investigator");
  assert.match(p.reason ?? "", /Investigator access role/);
});

test("the PI is matched by email in preference to name", () => {
  const [p] = previewSdrRows([row({ "PI Email": "ada@sidra.org", "PI Name": "Dr Grace Hopper" })], inputs());
  assert.equal(p.data?.budgetHolderId, 7);
});

test("a PI name carrying a title or middle name still matches", () => {
  const [p] = previewSdrRows([row({ "PI Name": "Prof. Ada Byron Lovelace" })], inputs());
  assert.equal(p.action, "create");
  assert.equal(p.data?.budgetHolderId, 7);
});

test("the same SDR number twice in one file keeps the first", () => {
  const previews = previewSdrRows([row(), row({ "SDR Name": "Second go" })], inputs());
  assert.equal(previews[0].action, "create");
  assert.equal(previews[1].action, "skip");
  assert.equal(previews[1].reasonCode, "duplicate_sdr_number");
});

test("an unchanged row against an existing SDR is a no-op", () => {
  const existing = new Map([["sdr-1", {
    id: 5, sdrNumber: "SDR-1", title: "A study", projectId: 1, budgetHolderId: 7, status: "planning",
  } as any]]);
  const [p] = previewSdrRows([row()], inputs({ existingBySdrNumber: existing }));
  assert.equal(p.action, "skip");
  assert.equal(p.reasonCode, "unchanged");
});

test("a changed row against an existing SDR lists what would change", () => {
  const existing = new Map([["sdr-1", {
    id: 5, sdrNumber: "SDR-1", title: "Old name", projectId: 1, budgetHolderId: 7, status: "planning",
  } as any]]);
  const [p] = previewSdrRows([row()], inputs({ existingBySdrNumber: existing }));
  assert.equal(p.action, "update");
  assert.deepEqual(p.changes, ["title"]);
});

test("an unreadable status is refused rather than silently dropped", () => {
  const [p] = previewSdrRows([row({ "Status": "whenever" })], inputs());
  assert.equal(p.action, "skip");
  assert.equal(p.reasonCode, "bad_value");
});

test("a status written with a space or a dash still reads", () => {
  const [p] = previewSdrRows([row({ "Status": "On Hold" })], inputs());
  assert.equal(p.action, "create");
  assert.equal(p.data?.status, "on_hold");
});

test("skips group into a summary rather than a wall of sentences", () => {
  const previews = previewSdrRows(
    [row({ "SDR Number": "" }), row({ "SDR Number": "A", "PI Name": "Dr Nobody" }), row({ "SDR Number": "B", "PI Name": "Dr Nobody" })],
    inputs(),
  );
  const summary = summariseSdrSkips(previews);
  assert.deepEqual(summary.map((s) => [s.code, s.count]), [["unmatched_pi", 2], ["no_sdr_number", 1]]);
});

test("the five minimum columns the office asked for are all marked required", () => {
  const required = SDR_COLUMNS.filter((c) => c.required).map((c) => c.header);
  assert.deepEqual(required, ["SDR Number", "SDR Name", "PI Name", "Project Number", "Project Name", "Program"]);
});
