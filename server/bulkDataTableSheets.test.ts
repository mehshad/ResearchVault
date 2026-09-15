/**
 * The table-sheet engine behind the archive's newer workbooks (#14). Pure:
 * the reference index is built by hand, so no database is needed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  ARCHIVE_EXCLUSIONS,
  TABLE_SHEETS,
  TABLE_SHEET_BY_NAME,
  collectInFileRefs,
  existingRowKey,
  exportRows,
  formatCell,
  previewTableSheet,
  publicationRefKeys,
  refKindsFor,
  tableSheetsFor,
  type RefIndex,
  type RefKind,
} from "./bulkDataTableSheets";

function refIndex(entries: Partial<Record<RefKind, Array<[number, string]>>>): RefIndex {
  const kinds: RefKind[] = ["grant", "sdr", "contract", "contractExtension", "publication", "scientist", "user"];
  const idByKey = {} as RefIndex["idByKey"];
  const keyById = {} as RefIndex["keyById"];
  for (const kind of kinds) {
    idByKey[kind] = new Map((entries[kind] ?? []).map(([id, key]) => [key.toLowerCase(), id]));
    keyById[kind] = new Map(entries[kind] ?? []);
  }
  return { idByKey, keyById };
}

const links = TABLE_SHEET_BY_NAME.get("Grant SDR Links")!;
const refs = refIndex({ grant: [[10, "QNRF-2024-01"], [11, "IRF-2025-07"]], sdr: [[5, "SDR-100"], [6, "SDR-101"]], user: [[1, "whendrickx"]] });

test("every declared sheet has a business key and its columns exist once", () => {
  for (const sheet of TABLE_SHEETS) {
    assert.ok(sheet.singleton || sheet.cols.some((c) => c.keyPart), `${sheet.name} has no key column`);
    const keys = sheet.cols.map((c) => c.key);
    assert.equal(new Set(keys).size, keys.length, `${sheet.name} repeats a column key`);
    assert.ok(sheet.businessKey.length > 0);
  }
});

test("the sections the sheets join are the hub's, and Platform holds the settings tables", () => {
  assert.deepEqual(tableSheetsFor("platform").map((s) => s.name), ["System Configurations", "Team Members", "Feature Requests", "Audit Log"]);
  assert.deepEqual(tableSheetsFor("research-services", "before").map((s) => s.name), ["Institutions", "Grant Statuses", "Contract Types"]);
  assert.ok(tableSheetsFor("research-services", "after").map((s) => s.name).includes("Grant SDR Links"));
  assert.deepEqual([...refKindsFor("research-output")].sort(), ["publication", "sdr", "user"]);
});

test("the exclusions name the forms the office does not use and the files the archive cannot carry", () => {
  const areas = ARCHIVE_EXCLUSIONS.map((e) => e.area);
  assert.ok(areas.some((a) => /PMO/.test(a)));
  assert.ok(areas.some((a) => /IRB/.test(a)) && areas.some((a) => /IBC/.test(a)));
  assert.ok(areas.some((a) => /files/i.test(a)));
});

test("a new link row resolves both references to ids", () => {
  const [entry] = previewTableSheet(links, [{ grantId: "qnrf-2024-01", researchActivityId: "SDR-100" }], [], refs);
  assert.equal(entry.action, "create");
  assert.deepEqual(entry.data, { grantId: 10, researchActivityId: 5, linkedDate: null });
  assert.equal(entry.key, "qnrf-2024-01 + SDR-100");
});

test("an existing link is matched by its business key and skipped when unchanged", () => {
  const existing = [{ id: 77, grantId: 10, researchActivityId: 5, linkedDate: new Date("2026-01-01T00:00:00Z") }];
  const [same] = previewTableSheet(links, [{ grantId: "QNRF-2024-01", researchActivityId: "sdr-100", linkedDate: "" }], existing, refs);
  assert.equal(same.action, "skip");
  const [changed] = previewTableSheet(links, [{ grantId: "QNRF-2024-01", researchActivityId: "sdr-100", linkedDate: "2026-02-02T00:00:00.000Z" }], existing, refs);
  assert.equal(changed.action, "update");
  assert.deepEqual(changed.changes, ["linkedDate"]);
  assert.equal(changed.data?._existingId, 77);
});

test("a reference nobody has is an error, unless the workbook itself creates it", () => {
  const [missing] = previewTableSheet(links, [{ grantId: "NOPE-1", researchActivityId: "SDR-100" }], [], refs);
  assert.equal(missing.action, "error");
  assert.match(missing.reason ?? "", /Grant Project Number "NOPE-1" was not found/);
  const inFile = collectInFileRefs([{ name: "Grants", rows: [{ projectNumber: "NOPE-1" }] }]);
  const [deferred] = previewTableSheet(links, [{ grantId: "NOPE-1", researchActivityId: "SDR-100" }], [], refs, inFile);
  assert.equal(deferred.action, "create");
  assert.deepEqual(deferred.data?._ref_grantId, { kind: "grant", key: "NOPE-1" });
});

test("required, duplicate and malformed cells are reported together", () => {
  const reports = TABLE_SHEET_BY_NAME.get("Grant Progress Reports")!;
  const rows = [
    { grantId: "QNRF-2024-01", reportTitle: "Year 1", uploadedBy: "whendrickx", fileSize: "big", submissionDate: "01/02/2026" },
    { grantId: "QNRF-2024-01", reportTitle: "Year 1", uploadedBy: "whendrickx" },
    { grantId: "QNRF-2024-01", reportTitle: "Year 2" },
  ];
  const entries = previewTableSheet(reports, rows, [], refs);
  assert.match(entries[0].reason ?? "", /Duplicate/);
  assert.match(entries[0].reason ?? "", /File Size: expected a whole number/);
  assert.match(entries[0].reason ?? "", /Submission Date: expected YYYY-MM-DD/);
  assert.match(entries[2].reason ?? "", /Uploaded By Username is required/);
});

test("CLEAR erases an optional value and is refused on a required one", () => {
  const existing = [{ id: 3, grantId: 10, reportTitle: "Year 1", notes: "old", uploadedBy: 1, reportPeriod: "Q1" }];
  const reports = TABLE_SHEET_BY_NAME.get("Grant Progress Reports")!;
  const [ok] = previewTableSheet(reports, [{ grantId: "QNRF-2024-01", reportTitle: "Year 1", notes: "clear" }], existing, refs);
  assert.equal(ok.action, "update");
  assert.equal(ok.data?.notes, null);
  const [bad] = previewTableSheet(reports, [{ grantId: "QNRF-2024-01", reportTitle: "Year 1", uploadedBy: "CLEAR" }], existing, refs);
  assert.equal(bad.action, "error");
});

test("derived fields follow the name on create and on change", () => {
  const institutions = TABLE_SHEET_BY_NAME.get("Institutions")!;
  const [created] = previewTableSheet(institutions, [{ name: "Weill Cornell — Qatar", country: "Qatar" }], [], refs);
  assert.equal(created.data?.nameKey, "weillcornellqatar");
  const [unchanged] = previewTableSheet(institutions, [{ name: "Weill Cornell — Qatar", country: "" }], [{ id: 1, name: "Weill Cornell — Qatar", nameKey: "weillcornellqatar", country: "Qatar" }], refs);
  assert.equal(unchanged.action, "skip");
});

test("a singleton sheet updates whatever row exists", () => {
  const config = TABLE_SHEET_BY_NAME.get("Certification Configuration")!;
  const existing = [{ id: 9, emailEnabled: true, autoImportEnabled: false, institutionName: "Sidra" }];
  const [entry] = previewTableSheet(config, [{ emailEnabled: "No", autoImportEnabled: "No" }], existing, refs);
  assert.equal(entry.action, "update");
  assert.deepEqual(entry.changes, ["emailEnabled"]);
  assert.equal(existingRowKey(config, existing[0], refs), "configuration");
});

test("export writes references as their business keys and typed cells as text", () => {
  const rows = [
    { id: 2, grantId: 11, researchActivityId: 6, linkedDate: new Date("2026-03-04T05:06:07Z") },
    { id: 1, grantId: 10, researchActivityId: 5, linkedDate: null },
  ];
  assert.deepEqual(exportRows(links, rows, refs), [
    { grantId: "IRF-2025-07", researchActivityId: "SDR-101", linkedDate: "2026-03-04T05:06:07.000Z" },
    { grantId: "QNRF-2024-01", researchActivityId: "SDR-100", linkedDate: "" },
  ]);
  assert.equal(formatCell(true, "bool"), "Yes");
  assert.equal(formatCell(["a", "b"], "list"), "a; b");
  assert.equal(formatCell({ days: [30, 7] }, "json"), '{"days":[30,7]}');
  assert.equal(formatCell("2026-05-06", "date"), "2026-05-06");
});

test("a publication is named by DOI, then PMID, then title within its SDR", () => {
  assert.deepEqual(publicationRefKeys({ doi: "10.1000/ABC", pmid: "123" }), { display: "10.1000/ABC", keys: ["10.1000/abc", "pmid:123"] });
  assert.deepEqual(publicationRefKeys({ pmid: "123" }), { display: "PMID:123", keys: ["pmid:123"] });
  assert.deepEqual(publicationRefKeys({ title: "Draft Paper", sdrNumber: "SDR-7" }), { display: "Draft Paper @ SDR-7", keys: ["draft paper @ sdr-7"] });
  assert.equal(publicationRefKeys({ title: "No SDR" }).display, "");
});

test("in-file references cover the hand-written parents and the sheets that provide keys", () => {
  const inFile = collectInFileRefs([
    { name: "Publications", rows: [{ doi: "10.1/X" }, { title: "T", sdrNumber: "SDR-1" }] },
    { name: "Contract Extensions", rows: [{ contractId: "RC-1", sequenceNumber: "2" }] },
    { name: "User Accounts", rows: [{ username: "Alice" }] },
  ]);
  assert.deepEqual([...inFile.publication!], ["10.1/x", "t @ sdr-1"]);
  assert.deepEqual([...inFile.contractExtension!], ["rc-1#2"]);
  assert.deepEqual([...inFile.user!], ["alice"]);
});
