import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_IMPACT_FACTOR_CUTOFF,
  effectiveImpactFactorYear,
  impactFactorExamples,
  impactFactorLookupYear,
  isValidImpactFactorCutoff,
  resolveImpactFactorYear,
  describeImpactFactorYearUsed,
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

const TODAY = new Date("2026-09-08T00:00:00Z");

test("there are eight of them by default", () => {
  const examples = impactFactorExamples(
    { impactFactorYear: "publication", impactFactorCutoff: "30-06", years: 5 },
    TODAY,
  );
  assert.equal(examples.length, 8);
});

test("they span the scoring period rather than clustering on one date", () => {
  // The question the office is asking is what a setting does to the
  // manuscripts they are scoring, and those are spread across the period.
  const examples = impactFactorExamples(
    { impactFactorYear: "publication", impactFactorCutoff: "30-06", years: 5 },
    TODAY,
  );
  assert.equal(examples[0].publishedOn, "2021-09-08");
  assert.equal(examples[examples.length - 1].publishedOn, "2026-09-08");
  // Oldest first, and strictly increasing.
  for (let i = 1; i < examples.length; i++) {
    assert.ok(examples[i].publishedOn > examples[i - 1].publishedOn, examples[i].publishedOn);
  }
});

test("a shorter period gives closer-spaced examples", () => {
  const oneYear = impactFactorExamples(
    { impactFactorYear: "publication", impactFactorCutoff: "30-06", years: 1 },
    TODAY,
  );
  assert.equal(oneYear.length, 8);
  assert.equal(oneYear[0].publishedOn, "2025-09-08");
  assert.equal(oneYear[7].publishedOn, "2026-09-08");
});

test("a custom range is honoured", () => {
  const examples = impactFactorExamples(
    {
      impactFactorYear: "publication",
      impactFactorCutoff: "30-06",
      startMonth: "2023-01",
      endMonth: "2023-12",
    },
    TODAY,
  );
  assert.equal(examples[0].publishedOn, "2023-01-01");
  assert.equal(examples[examples.length - 1].publishedOn, "2023-12-31");
});

test("the cut-off shows up repeatedly across the period", () => {
  // Eight points over five years crosses every year boundary in it, so the
  // rollover is demonstrated several times rather than asserted once.
  const examples = impactFactorExamples(
    { impactFactorYear: "publication", impactFactorCutoff: "30-06", years: 5 },
    TODAY,
  );
  const years = new Set(examples.map((e) => e.usesYear));
  assert.ok(years.size >= 4, `expected several distinct years, saw ${[...years].join(", ")}`);
});

test("the examples are computed, not written down", () => {
  // They must move with the settings, or they will eventually describe a rule
  // the code no longer follows.
  const june = impactFactorExamples(
    { impactFactorYear: "publication", impactFactorCutoff: "30-06", years: 5 },
    TODAY,
  );
  const prior = impactFactorExamples(
    { impactFactorYear: "prior", impactFactorCutoff: "30-06", years: 5 },
    TODAY,
  );
  assert.notDeepEqual(june.map((e) => e.usesYear), prior.map((e) => e.usesYear));
});

test("with latest, every example uses the current year", () => {
  const examples = impactFactorExamples(
    { impactFactorYear: "latest", impactFactorCutoff: "30-06", years: 5 },
    TODAY,
  );
  assert.deepEqual(new Set(examples.map((e) => e.usesYear)), new Set([2026]));
});

// ── Flagging an edition that is not loaded ──────────────────────────────────

test("with no year list the examples name the year asked for", () => {
  // The settings screen is describing a rule, so with nothing to check
  // against it says what the rule asks for and claims nothing more.
  const examples = impactFactorExamples(
    { impactFactorYear: "publication", impactFactorCutoff: "01-01", years: 5 },
    TODAY,
  );
  assert.deepEqual(examples.map((e) => e.resolvedYear), examples.map((e) => e.usesYear));
});

test("an edition that is not loaded is flagged, not silently renamed", () => {
  // A manuscript published in 2026 asks for the 2026 impact factor, which is
  // computed from 2026 citations and not published until mid-2027.
  const examples = impactFactorExamples(
    { impactFactorYear: "publication", impactFactorCutoff: "01-01", years: 5 },
    TODAY,
    [2022, 2024, 2025],
  );
  const newest = examples[examples.length - 1];
  assert.equal(newest.usesYear, 2026, "still says what the settings ask for");
  assert.equal(newest.resolvedYear, 2025, "and what would actually be read");
});

test("a year that is loaded resolves to itself", () => {
  const examples = impactFactorExamples(
    { impactFactorYear: "publication", impactFactorCutoff: "01-01", years: 5 },
    TODAY,
    [2021, 2022, 2023, 2024, 2025, 2026],
  );
  for (const example of examples) {
    assert.equal(example.resolvedYear, example.usesYear, example.publishedOn);
  }
});

test("nothing close enough resolves to nothing at all", () => {
  // Better than naming a year twenty years away as though it were a match.
  assert.deepEqual(resolveImpactFactorYear(2026, [2005], "publication"), {
    year: null,
    fellBack: false,
  });
});

test("the fallback prefers a newer edition at the same distance", () => {
  // The missing year is usually the most recent one, so reaching forward
  // first lands on the edition the office actually has.
  assert.deepEqual(resolveImpactFactorYear(2024, [2023, 2025], "publication"), {
    year: 2025,
    fellBack: true,
  });
});

test("the fallback will not reach back before the earliest edition", () => {
  assert.equal(resolveImpactFactorYear(2021, [2019], "publication").year, null);
});

// ── Describing the year that was actually used ──────────────────────────────

test("the used year is described against the publication year, not the setting", () => {
  // The contradiction this replaces: a note reading "the publication year"
  // beside a highlighted "Year Before Publication" column.
  assert.equal(describeImpactFactorYearUsed(2024, 2024), "the publication year");
  assert.equal(describeImpactFactorYearUsed(2023, 2024), "the year before publication");
  assert.equal(describeImpactFactorYearUsed(2025, 2024), "the year after publication");
});

test("a bigger gap is counted rather than named", () => {
  assert.equal(describeImpactFactorYearUsed(2022, 2024), "2 years before publication");
  assert.equal(describeImpactFactorYearUsed(2026, 2024), "2 years after publication");
});

test("with no publication year there is nothing to describe it against", () => {
  assert.equal(describeImpactFactorYearUsed(2024, null), "the 2024 impact factor");
  assert.equal(describeImpactFactorYearUsed(2024, undefined), "the 2024 impact factor");
});
