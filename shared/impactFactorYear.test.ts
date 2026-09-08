import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_IMPACT_FACTOR_CUTOFF,
  effectiveImpactFactorYear,
  impactFactorExamples,
  impactFactorLookupYear,
  isValidImpactFactorCutoff,
} from "./impactFactorYear";

const on = (iso: string) => new Date(`${iso}T00:00:00Z`);

// ── The default must change nothing ─────────────────────────────────────────

test("with the default cut-off a year turns over when the calendar does", () => {
  // Anyone who never touches this setting must score exactly as before.
  for (const date of ["2026-01-01", "2026-06-30", "2026-12-31"]) {
    assert.equal(effectiveImpactFactorYear(on(date), DEFAULT_IMPACT_FACTOR_CUTOFF), 2026, date);
  }
});

test("an absent or malformed cut-off falls back to the calendar year", () => {
  // A bad stored value must not silently shift everybody's score by a year.
  assert.equal(effectiveImpactFactorYear(on("2026-03-01"), undefined), 2026);
  assert.equal(effectiveImpactFactorYear(on("2026-03-01"), "nonsense"), 2026);
  assert.equal(effectiveImpactFactorYear(on("2026-03-01"), "01-13"), 2026);
  assert.equal(effectiveImpactFactorYear(on("2026-03-01"), "32-06"), 2026);
  // A day that does not exist is refused rather than quietly meaning 1 March.
  assert.equal(effectiveImpactFactorYear(on("2026-03-01"), "31-02"), 2026);
});

// ── A mid-year cut-off ──────────────────────────────────────────────────────

test("before a 30 June cut-off a manuscript counts as the previous year", () => {
  // The case the setting exists for: in March, the current year's factors have
  // not been published yet.
  assert.equal(effectiveImpactFactorYear(on("2026-03-15"), "30-06"), 2025);
  assert.equal(effectiveImpactFactorYear(on("2026-06-29"), "30-06"), 2025);
});

test("on and after the cut-off it counts as its own year", () => {
  assert.equal(effectiveImpactFactorYear(on("2026-06-30"), "30-06"), 2026);
  assert.equal(effectiveImpactFactorYear(on("2026-12-31"), "30-06"), 2026);
});

test("a day either side of the cut-off gives different years", () => {
  // Two manuscripts a day apart scoring against different years is the
  // surprising consequence, and the reason the screen shows examples.
  assert.equal(effectiveImpactFactorYear(on("2026-06-29"), "30-06"), 2025);
  assert.equal(effectiveImpactFactorYear(on("2026-06-30"), "30-06"), 2026);
});

// ── Combined with which year to use ─────────────────────────────────────────

test("publication year means the effective year, cut-off included", () => {
  const settings = { impactFactorYear: "publication" as const, impactFactorCutoff: "30-06" };
  assert.equal(impactFactorLookupYear(on("2026-03-15"), settings, 2026), 2025);
  assert.equal(impactFactorLookupYear(on("2026-08-15"), settings, 2026), 2026);
});

test("prior year steps back from the effective year, not the calendar one", () => {
  const settings = { impactFactorYear: "prior" as const, impactFactorCutoff: "30-06" };
  // March 2026 is effectively 2025, so the prior year is 2024.
  assert.equal(impactFactorLookupYear(on("2026-03-15"), settings, 2026), 2024);
  assert.equal(impactFactorLookupYear(on("2026-08-15"), settings, 2026), 2025);
});

test("latest ignores the cut-off entirely", () => {
  // It does not ask when the manuscript was published, so nothing about the
  // publication date can change the answer.
  const settings = { impactFactorYear: "latest" as const, impactFactorCutoff: "30-06" };
  assert.equal(impactFactorLookupYear(on("2026-03-15"), settings, 2026), 2026);
  assert.equal(impactFactorLookupYear(on("2019-01-01"), settings, 2026), 2026);
});

// ── Validation ──────────────────────────────────────────────────────────────

test("a cut-off must be a real day of a real month, written DD-MM", () => {
  // 31 December and 29 February, day first. Under the old month-first reading
  // these same strings meant month 31 and month 29, which is the confusion the
  // format change exists to remove.
  for (const good of ["01-01", "30-06", "31-12", "29-02"]) {
    assert.equal(isValidImpactFactorCutoff(good), true, good);
  }
  for (const bad of ["1-1", "00-10", "01-13", "32-06", "00-06", "31-02", "31-04", "june", "", null, 630]) {
    assert.equal(isValidImpactFactorCutoff(bad), false, String(bad));
  }
});

// ── The worked examples ─────────────────────────────────────────────────────

test("the examples straddle the cut-off and show the jump", () => {
  const examples = impactFactorExamples(
    { impactFactorYear: "publication", impactFactorCutoff: "30-06" },
    2026,
  );
  assert.equal(examples.length, 3);
  assert.deepEqual(
    examples.map((e) => e.publishedOn),
    ["2026-04-30", "2026-06-29", "2026-06-30"],
  );
  // The point of showing them: the last two are a day apart and differ.
  assert.deepEqual(examples.map((e) => e.usesYear), [2025, 2025, 2026]);
});

test("with the default cut-off every example uses the same year", () => {
  // Nothing surprising to show, which is itself the right thing to show.
  const examples = impactFactorExamples(
    { impactFactorYear: "publication", impactFactorCutoff: "01-01" },
    2026,
  );
  assert.deepEqual(examples.map((e) => e.usesYear), [2025, 2025, 2026]);
});

test("the examples follow the prior-year setting too", () => {
  const examples = impactFactorExamples(
    { impactFactorYear: "prior", impactFactorCutoff: "30-06" },
    2026,
  );
  assert.deepEqual(examples.map((e) => e.usesYear), [2024, 2024, 2025]);
});

test("with latest, every example uses the current year", () => {
  const examples = impactFactorExamples(
    { impactFactorYear: "latest", impactFactorCutoff: "30-06" },
    2026,
  );
  assert.deepEqual(examples.map((e) => e.usesYear), [2026, 2026, 2026]);
});

test("the examples are computed, not written down", () => {
  // They must move with the settings, or they will eventually describe a rule
  // the code no longer follows.
  const june = impactFactorExamples({ impactFactorYear: "publication", impactFactorCutoff: "30-06" }, 2026);
  const march = impactFactorExamples({ impactFactorYear: "publication", impactFactorCutoff: "01-03" }, 2026);
  assert.notDeepEqual(june.map((e) => e.publishedOn), march.map((e) => e.publishedOn));
});
