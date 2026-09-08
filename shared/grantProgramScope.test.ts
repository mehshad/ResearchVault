import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterSdrsByProgram,
  isSdrInGrantProgram,
  programChangeBlockedMessage,
  sdrsBlockingProgramChange,
} from "./grantProgramScope";

const GENOMICS = 1;
const IMMUNOLOGY = 2;

const sdrs = [
  { id: 10, sdrNumber: "SDR-010", programId: GENOMICS },
  { id: 11, sdrNumber: "SDR-011", programId: IMMUNOLOGY },
  { id: 12, sdrNumber: "SDR-012", programId: null }, // no project, so no programme
];

// ── What the programme admits ───────────────────────────────────────────────

test("a grant in a programme admits SDRs in the same one", () => {
  assert.equal(isSdrInGrantProgram(GENOMICS, GENOMICS), true);
});

test("a grant in a programme excludes SDRs in another", () => {
  assert.equal(isSdrInGrantProgram(GENOMICS, IMMUNOLOGY), false);
});

test("a grant naming no programme admits everything", () => {
  // What keeps the 272 grants that predate the field working.
  for (const sdrProgram of [GENOMICS, IMMUNOLOGY, null, undefined]) {
    assert.equal(isSdrInGrantProgram(null, sdrProgram), true, String(sdrProgram));
    assert.equal(isSdrInGrantProgram(undefined, sdrProgram), true, String(sdrProgram));
  }
});

test("an SDR reaching no programme is admitted anywhere", () => {
  // Deliberately permissive: incomplete PMO data must not block an office from
  // recording work that really happened. The cost is that an SDR left without
  // a project is not limited at all.
  assert.equal(isSdrInGrantProgram(GENOMICS, null), true);
  assert.equal(isSdrInGrantProgram(GENOMICS, undefined), true);
});

// ── The picker ──────────────────────────────────────────────────────────────

test("the picker shows the grant's programme and the unplaced", () => {
  const shown = filterSdrsByProgram(sdrs, GENOMICS, []);
  assert.deepEqual(shown.map((s) => s.id), [10, 12]);
});

test("a grant with no programme sees every candidate", () => {
  assert.deepEqual(filterSdrsByProgram(sdrs, null, []).map((s) => s.id), [10, 11, 12]);
});

test("an SDR already linked stays visible even from another programme", () => {
  // Hiding it would show a shorter list than the record holds, and unlinking
  // is how a blocked programme change gets resolved.
  const shown = filterSdrsByProgram(sdrs, GENOMICS, [11]);
  assert.deepEqual(shown.map((s) => s.id), [10, 11, 12]);
});

test("filtering does not mutate the list it is given", () => {
  const original = [...sdrs];
  filterSdrsByProgram(sdrs, GENOMICS, []);
  assert.deepEqual(sdrs, original);
});

// ── Blocking a programme change ─────────────────────────────────────────────

test("changing to a programme the linked SDRs are not in is blocked", () => {
  const linked = [sdrs[0], sdrs[1]];
  const blocking = sdrsBlockingProgramChange(linked, GENOMICS);
  assert.deepEqual(blocking.map((s) => s.id), [11]);
});

test("nothing blocks when every linked SDR is already in the new programme", () => {
  assert.deepEqual(sdrsBlockingProgramChange([sdrs[0]], GENOMICS), []);
});

test("an unplaced SDR does not block a change", () => {
  // Same rule as the picker: it is not excluded by a programme it cannot be
  // compared against.
  assert.deepEqual(sdrsBlockingProgramChange([sdrs[2]], GENOMICS), []);
});

test("clearing the programme is always allowed", () => {
  // Removing the limit cannot orphan anything, so there is nothing to refuse.
  assert.deepEqual(sdrsBlockingProgramChange(sdrs, null), []);
  assert.deepEqual(sdrsBlockingProgramChange(sdrs, undefined), []);
});

test("a grant with no linked SDRs can move freely", () => {
  assert.deepEqual(sdrsBlockingProgramChange([], IMMUNOLOGY), []);
});

// ── What the refusal says ───────────────────────────────────────────────────

test("the refusal names the SDRs and says what to do", () => {
  const message = programChangeBlockedMessage([sdrs[1]]);
  assert.match(message, /SDR-011/);
  assert.match(message, /unlink/i);
  // Singular, because one SDR is in the way.
  assert.match(message, /an SDR that belongs/);
});

test("the refusal reads correctly for several SDRs", () => {
  const message = programChangeBlockedMessage([sdrs[0], sdrs[1]]);
  assert.match(message, /SDR-010, SDR-011/);
  assert.match(message, /SDRs that belong/);
  assert.match(message, /them/);
});

test("an SDR with no number is still identifiable in the refusal", () => {
  const message = programChangeBlockedMessage([{ id: 47, sdrNumber: "  " }]);
  assert.match(message, /SDR 47/);
});
