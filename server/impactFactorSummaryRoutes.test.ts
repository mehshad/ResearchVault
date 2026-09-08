import { test } from "node:test";
import assert from "node:assert/strict";
import { buildImpactFactorSummary, type SummaryDependencies } from "./impactFactorSummaryRoutes";

const deps = (over: Partial<SummaryDependencies> = {}): SummaryDependencies => ({
  yearRows: async () => [],
  publicationJournals: async () => [],
  knownJournals: async () => [],
  ...over,
});

test("each year reports how many journals carry a factor", async () => {
  const summary = await buildImpactFactorSummary(
    deps({
      yearRows: async () => [
        { year: 2023, factors: 21787 },
        { year: 2024, factors: 1758 },
      ],
    }),
  );
  assert.deepEqual(
    summary.years.map((y) => [y.year, y.factors]),
    [[2023, 21787], [2024, 1758]],
  );
});

test("a year counts only the journals we actually publish in", async () => {
  // The point of the column: 22,000 journals is not the same as covering ours.
  const summary = await buildImpactFactorSummary(
    deps({
      yearRows: async () => [
        { year: 2023, factors: 21787 },
        { year: 2024, factors: 1758 },
      ],
      publicationJournals: async () => [
        { journal: "NATURE", publications: 4 },
        { journal: "LANCET", publications: 2 },
      ],
      knownJournals: async () => [
        { name: "NATURE", abbreviated: null, years: [2023, 2024] },
        { name: "LANCET", abbreviated: null, years: [2023] },
      ],
    }),
  );
  assert.equal(summary.years.find((y) => y.year === 2023)!.coversPublishedIn, 2);
  assert.equal(summary.years.find((y) => y.year === 2024)!.coversPublishedIn, 1);
});

test("a journal held under the same name is covered", async () => {
  const summary = await buildImpactFactorSummary(
    deps({
      publicationJournals: async () => [{ journal: "Nature", publications: 3 }],
      knownJournals: async () => [{ name: "NATURE", abbreviated: null, years: [2024] }],
    }),
  );
  assert.equal(summary.publishedIn.covered, 1);
  assert.deepEqual(summary.publishedIn.missing, []);
});

test("an undecoded ampersand is reported, with the decoded name suggested", async () => {
  // Real: publication feeds escape the ampersand and the escape survives into
  // the stored name. Normalisation turns "&amp;" into the word "amp" rather
  // than nothing, so the scorer genuinely cannot match it -- which is why it
  // belongs on the worklist rather than being quietly counted as covered.
  const summary = await buildImpactFactorSummary(
    deps({
      publicationJournals: async () => [
        { journal: "Clinical Reviews in Allergy &amp; Immunology", publications: 2 },
      ],
      knownJournals: async () => [
        { name: "CLINICAL REVIEWS IN ALLERGY & IMMUNOLOGY", abbreviated: null, years: [2024] },
      ],
    }),
  );
  assert.equal(summary.publishedIn.covered, 0);
  assert.deepEqual(summary.publishedIn.missing, [
    {
      journal: "Clinical Reviews in Allergy &amp; Immunology",
      publications: 2,
      suggestion: "Clinical Reviews in Allergy & Immunology",
      reason: "punctuation",
    },
  ]);
});

test("an abbreviation is covered, because the scorer matches it", async () => {
  // findJournalByName tries the abbreviated name too. Reporting "Nucleic Acids
  // Res" as missing would send somebody to fix a journal that scores perfectly
  // well -- which is what this summary did before it used the scorer's rule.
  const summary = await buildImpactFactorSummary(
    deps({
      publicationJournals: async () => [{ journal: "Nucleic Acids Res", publications: 5 }],
      knownJournals: async () => [
        { name: "NUCLEIC ACIDS RESEARCH", abbreviated: "NUCLEIC ACIDS RES", years: [2024] },
      ],
    }),
  );
  assert.equal(summary.publishedIn.covered, 1);
  assert.deepEqual(summary.publishedIn.missing, []);
});

test("a leading article is covered too", async () => {
  // "The Lancet Oncology" against the dataset's "LANCET ONCOLOGY".
  const summary = await buildImpactFactorSummary(
    deps({
      publicationJournals: async () => [{ journal: "The Lancet Oncology", publications: 1 }],
      knownJournals: async () => [
        { name: "LANCET ONCOLOGY", abbreviated: null, years: [2024] },
      ],
    }),
  );
  assert.equal(summary.publishedIn.covered, 1);
  assert.deepEqual(summary.publishedIn.missing, []);
});

test("something we simply do not hold is reported with no suggestion", async () => {
  // Preprint servers and typed-in rubbish both land here, and neither should
  // be given a confident-looking guess.
  const summary = await buildImpactFactorSummary(
    deps({
      publicationJournals: async () => [
        { journal: "bioRxiv", publications: 3 },
        { journal: "science direct", publications: 1 },
      ],
      knownJournals: async () => [{ name: "NATURE", abbreviated: "NATURE", years: [2024] }],
    }),
  );
  assert.equal(summary.publishedIn.missing.length, 2);
  for (const row of summary.publishedIn.missing) {
    assert.equal(row.suggestion, null, row.journal);
    assert.equal(row.reason, null, row.journal);
  }
});

test("a journal row with no factor does not count as covered", async () => {
  // knownJournals only returns journals carrying a factor, so a bare journal
  // row cannot make a publication look scoreable when it is not.
  const summary = await buildImpactFactorSummary(
    deps({
      publicationJournals: async () => [{ journal: "GHOST JOURNAL", publications: 1 }],
      knownJournals: async () => [],
    }),
  );
  assert.equal(summary.publishedIn.covered, 0);
  assert.equal(summary.publishedIn.total, 1);
  assert.equal(summary.publishedIn.missing[0].journal, "GHOST JOURNAL");
});

test("two journals sharing an abbreviation both count that abbreviation", async () => {
  // The scorer resolves the ambiguity by taking whichever row it finds; the
  // summary only has to agree that the name is matchable, and must not report
  // it as missing.
  const summary = await buildImpactFactorSummary(
    deps({
      publicationJournals: async () => [{ journal: "J CLIN", publications: 1 }],
      knownJournals: async () => [
        { name: "JOURNAL OF CLINICAL ONE", abbreviated: "J CLIN", years: [2023] },
        { name: "JOURNAL OF CLINICAL TWO", abbreviated: "J CLIN", years: [2024] },
      ],
    }),
  );
  assert.equal(summary.publishedIn.covered, 1);
  assert.deepEqual(summary.publishedIn.missing, []);
});

test("nothing published means nothing missing", async () => {
  const summary = await buildImpactFactorSummary(deps());
  assert.deepEqual(summary.publishedIn, { total: 0, covered: 0, missing: [] });
  assert.deepEqual(summary.years, []);
});
