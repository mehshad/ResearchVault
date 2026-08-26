/**
 * Focused unit tests for Sidra Score pure helpers.
 * Tests authorization helpers, normalization, and exclusion logic without
 * touching the database or Express.
 */
import assert from "node:assert/strict";
import test from "node:test";

// ── Import pure helpers ────────────────────────────────────────────────────────
import { normalizeAuthorshipType, calculateScientistScore, lookupIf } from "./sidraScoreService";
import {
  isOwnScientistProfile,
  isDemo,
  hasManagementRole,
  hasPublicationOfficerRole,
  canEditPublicationForLinkedScientists,
  canManagePublicationAuthorLink,
  canCreatePublicationForResearchActivity,
} from "./sidraScoreRoutes";
import { sidraScoreSettingsSchema, DEFAULT_SIDRA_SCORE_SETTINGS } from "@shared/sidraScore";
import { isUnambiguousAuthorMatch } from "@shared/authorMatching";

// ── Helper: build a minimal fake Request ──────────────────────────────────────
function fakeReq(role: string | null, scientistId: number | null): any {
  return {
    session: {
      user: role == null ? undefined : { id: 1, role, scientistId },
    },
  };
}

// ── authorshipType normalization ───────────────────────────────────────────────

test("normalizeAuthorshipType: legacy senior-author aliases map to Last Author", () => {
  assert.equal(normalizeAuthorshipType("Senior Author"), "Last Author");
  assert.equal(normalizeAuthorshipType("Senior/Last Author"), "Last Author");
  assert.equal(normalizeAuthorshipType("Co-Senior/Last Author"), "Last Author");
  assert.equal(normalizeAuthorshipType("Co-Last Author"), "Last Author");
});

test("normalizeAuthorshipType: Co-First Author maps to First Author", () => {
  assert.equal(normalizeAuthorshipType("Co-First Author"), "First Author");
});

test("normalizeAuthorshipType: canonical labels are unchanged", () => {
  assert.equal(normalizeAuthorshipType("First Author"), "First Author");
  assert.equal(normalizeAuthorshipType("Last Author"), "Last Author");
  assert.equal(normalizeAuthorshipType("Corresponding Author"), "Corresponding Author");
  assert.equal(normalizeAuthorshipType("Second or Second Last Author"), "Second or Second Last Author");
});

test("normalizeAuthorshipType: trims surrounding whitespace", () => {
  assert.equal(normalizeAuthorshipType("  Senior Author  "), "Last Author");
  assert.equal(normalizeAuthorshipType(" Co-First Author "), "First Author");
});

// ── isOwnScientistProfile ──────────────────────────────────────────────────────

test("isOwnScientistProfile: returns true when linked id matches", () => {
  const req = fakeReq("user", 42);
  assert.equal(isOwnScientistProfile(req, 42), true);
});

test("isOwnScientistProfile: returns false when linked id differs", () => {
  const req = fakeReq("user", 42);
  assert.equal(isOwnScientistProfile(req, 99), false);
});

test("isOwnScientistProfile: returns false when scientistId is null", () => {
  const req = fakeReq("user", null);
  assert.equal(isOwnScientistProfile(req, 42), false);
});

test("isOwnScientistProfile: returns false when no session user", () => {
  const req = { session: {} };
  assert.equal(isOwnScientistProfile(req as any, 42), false);
});

// ── hasManagementRole ──────────────────────────────────────────────────────────

test("hasManagementRole: true for Management, admin, superadmin", () => {
  assert.equal(hasManagementRole(fakeReq("Management", null)), true);
  assert.equal(hasManagementRole(fakeReq("admin", null)), true);
  assert.equal(hasManagementRole(fakeReq("superadmin", null)), true);
});

test("hasManagementRole: false for user, Outcome Officer, Contracts Officer", () => {
  assert.equal(hasManagementRole(fakeReq("user", null)), false);
  assert.equal(hasManagementRole(fakeReq("Outcome Officer", null)), false);
  assert.equal(hasManagementRole(fakeReq("Contracts Officer", null)), false);
});

// ── hasPublicationOfficerRole ──────────────────────────────────────────────────

test("hasPublicationOfficerRole: true for Outcome Officer, Management, admin, superadmin", () => {
  assert.equal(hasPublicationOfficerRole(fakeReq("Outcome Officer", null)), true);
  assert.equal(hasPublicationOfficerRole(fakeReq("Management", null)), true);
  assert.equal(hasPublicationOfficerRole(fakeReq("admin", null)), true);
  assert.equal(hasPublicationOfficerRole(fakeReq("superadmin", null)), true);
});

test("hasPublicationOfficerRole: false for user, Contracts Officer", () => {
  assert.equal(hasPublicationOfficerRole(fakeReq("user", null)), false);
  assert.equal(hasPublicationOfficerRole(fakeReq("Contracts Officer", null)), false);
});

test("publication correction authorization: researcher edits only linked publications", () => {
  const researcher = fakeReq("user", 42);
  assert.equal(
    canEditPublicationForLinkedScientists(researcher, [11, 42]),
    true
  );
  assert.equal(
    canEditPublicationForLinkedScientists(researcher, [11, 12]),
    false
  );
  assert.equal(
    canEditPublicationForLinkedScientists(fakeReq("Outcome Officer", null), []),
    true
  );
});

test("publication author-link authorization: researcher manages only their own verified link", () => {
  const researcher = fakeReq("user", 42);
  assert.equal(
    canManagePublicationAuthorLink(researcher, 42, false, true),
    true
  );
  assert.equal(
    canManagePublicationAuthorLink(researcher, 42, false, false),
    false
  );
  assert.equal(
    canManagePublicationAuthorLink(researcher, 99, true, true),
    false
  );
  assert.equal(
    canManagePublicationAuthorLink(
      fakeReq("Outcome Officer", null),
      99,
      false,
      false
    ),
    true
  );
});

test("publication creation authorization: researcher must belong to the selected SDR", () => {
  const researcher = fakeReq("user", 42);
  assert.equal(
    canCreatePublicationForResearchActivity(researcher, 42, []),
    true
  );
  assert.equal(
    canCreatePublicationForResearchActivity(researcher, 11, [12, 42]),
    true
  );
  assert.equal(
    canCreatePublicationForResearchActivity(researcher, 11, [12, 13]),
    false
  );
  assert.equal(
    canCreatePublicationForResearchActivity(
      fakeReq("Outcome Officer", null),
      null,
      []
    ),
    true
  );
});

test("author matching: abbreviated self-link is rejected when citation identity is ambiguous", () => {
  const alice = { id: 1, firstName: "Alice", lastName: "Smith" };
  const alicia = { id: 2, firstName: "Alicia", lastName: "Smith" };

  assert.equal(
    isUnambiguousAuthorMatch("Smith A, Jones B", alice, [alice, alicia]),
    false
  );
  assert.equal(
    isUnambiguousAuthorMatch("Alice Smith, Jones B", alice, [alice, alicia]),
    true
  );
  assert.equal(
    isUnambiguousAuthorMatch("Smith A, Jones B", alice, [alice]),
    true
  );
});

test("isDemo: reflects AUTH_MODE without changing authorization in real modes", () => {
  const previous = process.env.AUTH_MODE;
  try {
    process.env.AUTH_MODE = "demo";
    assert.equal(isDemo(), true);
    process.env.AUTH_MODE = "local";
    assert.equal(isDemo(), false);
  } finally {
    if (previous === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = previous;
  }
});

// ── sidraScoreSettingsSchema validation ───────────────────────────────────────

test("sidraScoreSettingsSchema: accepts default-like input", () => {
  const result = sidraScoreSettingsSchema.safeParse({});
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.years, 5);
    assert.equal(result.data.impactFactorYear, "publication");
    assert.equal(result.data.includeNonVetted, false);
  }
});

test("sidraScoreSettingsSchema: rejects invalid impactFactorYear", () => {
  const result = sidraScoreSettingsSchema.safeParse({ impactFactorYear: "random" });
  assert.equal(result.success, false);
});

test("sidraScoreSettingsSchema: rejects startMonth without endMonth", () => {
  const result = sidraScoreSettingsSchema.safeParse({
    startMonth: "2023-01",
  });
  assert.equal(result.success, false);
});

test("sidraScoreSettingsSchema: rejects startMonth after endMonth", () => {
  const result = sidraScoreSettingsSchema.safeParse({
    startMonth: "2024-06",
    endMonth: "2023-01",
  });
  assert.equal(result.success, false);
});

test("sidraScoreSettingsSchema: accepts valid custom month range", () => {
  const result = sidraScoreSettingsSchema.safeParse({
    startMonth: "2020-01",
    endMonth: "2024-12",
  });
  assert.equal(result.success, true);
});

test("sidraScoreSettingsSchema: rejects badly-formatted month", () => {
  const result = sidraScoreSettingsSchema.safeParse({
    startMonth: "2023-13", // month 13 is invalid
    endMonth: "2024-01",
  });
  assert.equal(result.success, false);
});

test("sidraScoreSettingsSchema: rejects negative years", () => {
  const result = sidraScoreSettingsSchema.safeParse({ years: -1 });
  assert.equal(result.success, false);
});

// ── lookupIf ──────────────────────────────────────────────────────────────────

test("lookupIf: returns value when present", () => {
  const map = new Map([["nature", new Map([[2022, 49.96]])]]);
  assert.equal(lookupIf(map, "Nature", 2022), 49.96);
});

test("lookupIf: returns null when journal missing", () => {
  const map = new Map<string, Map<number, number>>();
  assert.equal(lookupIf(map, "Unknown Journal", 2022), null);
});

test("lookupIf: returns null when year missing", () => {
  const map = new Map([["nature", new Map([[2021, 49.96]])]]);
  assert.equal(lookupIf(map, "Nature", 2022), null);
});

// ── calculateScientistScore exclusion reasons ─────────────────────────────────

const SCIENTIST = { id: 1, firstName: "Alice", lastName: "Smith" };
const BASE_SETTINGS = { ...DEFAULT_SIDRA_SCORE_SETTINGS };

function makeBundle(authorshipStr: string, ifYear?: number, ifValue?: number) {
  const pubMap = new Map([[99, authorshipStr]]);
  const sciMap = new Map([[1, pubMap]]);
  const ifMap = new Map<string, Map<number, number>>();
  if (ifYear != null && ifValue != null) {
    ifMap.set("nature", new Map([[ifYear, ifValue]]));
  }
  return {
    authorshipByScientist: sciMap,
    ifByJournalYear: ifMap,
    currentYear: 2024,
  };
}

function makePub(overrides: Partial<{
  id: number;
  title: string;
  authors: string | null;
  journal: string | null;
  researchActivityId: number | null;
  publicationDate: string | null;
  status: string | null;
}> = {}) {
  return {
    id: 99,
    title: "Test Publication",
    authors: "Alice Smith, Bob Jones",
    journal: "Nature",
    researchActivityId: 12,
    publicationDate: "2023-06-01",
    status: "Published *",
    ...overrides,
  };
}

test("calculateScientistScore: missing publicationDate → excluded with reason", () => {
  const bundle = makeBundle("First Author", 2023, 10);
  const pub = makePub({ publicationDate: null });
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, BASE_SETTINGS);
  assert.equal(result.publicationsCount, 0);
  assert.equal(result.excludedPublications.length, 1);
  assert.match(result.excludedPublications[0].reason, /Missing publication date/);
  assert.ok(result.excludedPublications[0].action.length > 0);
});

test("calculateScientistScore: invalid publicationDate → excluded instead of throwing", () => {
  const bundle = makeBundle("First Author", 2023, 10);
  const pub = makePub({ publicationDate: "not-a-date" });
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, BASE_SETTINGS);
  assert.equal(result.publicationsCount, 0);
  assert.match(result.excludedPublications[0].reason, /Invalid publication date/);
  assert.match(result.excludedPublications[0].action, /Outcome Office/);
});

test("calculateScientistScore: pubDate before cutoff → excluded as outside window", () => {
  const bundle = makeBundle("First Author", 2018, 10);
  const pub = makePub({ publicationDate: "2015-01-01" });
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, { ...BASE_SETTINGS, years: 5 });
  assert.equal(result.publicationsCount, 0);
  const reasons = result.excludedPublications.map(e => e.reason);
  assert.ok(reasons.some(r => /scoring window/i.test(r)));
});

test("calculateScientistScore: unsupported status → excluded", () => {
  const bundle = makeBundle("First Author", 2023, 10);
  const pub = makePub({ status: "Retracted" });
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, BASE_SETTINGS);
  assert.equal(result.publicationsCount, 0);
  assert.equal(result.excludedPublications.length, 1);
  assert.match(result.excludedPublications[0].reason, /Unsupported status/);
  assert.ok(result.excludedPublications[0].action.length > 0);
});

test("calculateScientistScore: Published - Invalid is never scored", () => {
  const bundle = makeBundle("First Author", 2023, 10);
  const pub = makePub({ status: "Published - Invalid" });
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, {
    ...BASE_SETTINGS,
    includeNonVetted: true,
  });
  assert.equal(result.publicationsCount, 0);
  assert.equal(result.calculationDetails.length, 0);
  assert.match(result.excludedPublications[0].reason, /Unsupported status/);
});

test("calculateScientistScore: empty journal → excluded with action", () => {
  const bundle = makeBundle("First Author", 2023, 10);
  const pub = makePub({ journal: "" });
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, BASE_SETTINGS);
  assert.equal(result.publicationsCount, 0);
  assert.match(result.excludedPublications[0].reason, /Missing journal name/);
  assert.ok(result.excludedPublications[0].action.length > 0);
});

test("calculateScientistScore: non-vetted (not Published *) → excluded when includeNonVetted=false", () => {
  const bundle = makeBundle("First Author", 2023, 10);
  const pub = makePub({ status: "Published" }); // no star
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, { ...BASE_SETTINGS, includeNonVetted: false });
  assert.equal(result.publicationsCount, 0);
  const exc = result.excludedPublications[0];
  assert.match(exc.reason, /Not vetted/);
  assert.ok(exc.action.includes("Published *"));
});

test("calculateScientistScore: non-vetted included when includeNonVetted=true", () => {
  const bundle = makeBundle("First Author", 2023, 10);
  const pub = makePub({ status: "Published" });
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, { ...BASE_SETTINGS, includeNonVetted: true });
  assert.equal(result.publicationsCount, 1);
  assert.equal(result.sidraScore, 20); // IF=10 × multiplier=2 (First Author)
});

test("calculateScientistScore: no IF on record → excluded with journal action", () => {
  const bundle = makeBundle("First Author"); // no IF data
  const pub = makePub();
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, BASE_SETTINGS);
  assert.equal(result.publicationsCount, 0);
  const exc = result.excludedPublications[0];
  assert.match(exc.reason, /No impact factor on record/);
  assert.ok(exc.action.includes("Outcome Office"));
});

test("calculateScientistScore: valid publication → scored correctly with Last Author multiplier", () => {
  const bundle = makeBundle("Last Author", 2023, 5.0);
  const pub = makePub();
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, BASE_SETTINGS);
  assert.equal(result.publicationsCount, 1);
  assert.equal(result.sidraScore, 10); // IF=5 × multiplier=2 (Last Author)
  assert.equal(result.excludedPublications.length, 0);
});

test("calculateScientistScore: settings are echoed back in result", () => {
  const bundle = makeBundle("First Author", 2023, 3);
  const pub = makePub();
  const settings = { ...BASE_SETTINGS };
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, settings);
  assert.deepEqual(result.settings, settings);
});

test("calculateScientistScore: unrelated publication not linked to scientist is silently skipped", () => {
  // The authorshipByScientist map has scientist 1 → pub 99.
  // Scientist 2 has no entries → 0 publications, no exclusions.
  const scientist2 = { id: 2, firstName: "Bob", lastName: "Jones" };
  const bundle = makeBundle("First Author", 2023, 10);
  const pub = makePub({ authors: "Alice Smith" });
  const result = calculateScientistScore(scientist2, [pub], bundle, BASE_SETTINGS);
  assert.equal(result.publicationsCount, 0);
  assert.equal(result.excludedPublications.length, 0);
  assert.equal(result.publicationIssues.length, 0);
});

test("calculateScientistScore: linked publication without SDR is reported for correction", () => {
  const bundle = makeBundle("First Author", 2023, 10);
  const pub = makePub({
    researchActivityId: null,
    status: "Published",
  });
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, {
    ...BASE_SETTINGS,
    includeNonVetted: true,
  });

  assert.equal(result.publicationIssues.length, 1);
  assert.equal(result.publicationIssues[0].publicationId, 99);
  assert.deepEqual(
    result.publicationIssues[0].issues.map((issue) => issue.code),
    ["missing_sdr_link"]
  );
  assert.match(result.publicationIssues[0].issues[0].action, /Open the publication/);
  assert.match(result.publicationIssues[0].issues[0].action, /final approval/);
});

test("calculateScientistScore: likely publication without scientist link is reported instead of silently disappearing", () => {
  const bundle = {
    authorshipByScientist: new Map<number, Map<number, string>>(),
    ifByJournalYear: new Map<string, Map<number, number>>(),
    currentYear: 2024,
  };
  const pub = makePub({ authors: "Smith A, Jones B" });
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, BASE_SETTINGS);

  assert.equal(result.publicationsCount, 0);
  assert.equal(result.excludedPublications.length, 0);
  assert.equal(result.publicationIssues.length, 1);
  assert.deepEqual(
    result.publicationIssues[0].issues.map((issue) => issue.code),
    ["missing_internal_author_link"]
  );
  assert.match(result.publicationIssues[0].issues[0].reason, /not linked as an internal author/);
});

test("calculateScientistScore: linked scientist missing from author text is reported as a mismatch", () => {
  const bundle = makeBundle("First Author", 2023, 10);
  const pub = makePub({ authors: "Bob Jones, Carol White" });
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, BASE_SETTINGS);

  assert.equal(result.publicationIssues.length, 1);
  assert.deepEqual(
    result.publicationIssues[0].issues.map((issue) => issue.code),
    ["author_text_mismatch"]
  );
});

test("calculateScientistScore: blank author text is treated as unverifiable, not a mismatch", () => {
  const bundle = makeBundle("First Author", 2023, 10);
  const pub = makePub({ authors: "" });
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, BASE_SETTINGS);

  assert.equal(result.publicationIssues.length, 0);
});

test("calculateScientistScore: correctly linked publication with SDR has no internal issues", () => {
  const bundle = makeBundle("First Author", 2023, 10);
  const result = calculateScientistScore(
    SCIENTIST,
    [makePub()],
    bundle,
    BASE_SETTINGS
  );

  assert.equal(result.publicationIssues.length, 0);
});

test("calculateScientistScore: unrelated similar-name publication is not reported", () => {
  const bundle = {
    authorshipByScientist: new Map<number, Map<number, string>>(),
    ifByJournalYear: new Map<string, Map<number, number>>(),
    currentYear: 2024,
  };
  const pub = makePub({
    authors: "Bob Smith, Carol White",
    researchActivityId: null,
  });
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, BASE_SETTINGS);

  assert.equal(result.publicationIssues.length, 0);
});

test("calculateScientistScore: sealed issue directs the researcher to Outcome Office", () => {
  const bundle = makeBundle("First Author", 2023, 10);
  const pub = makePub({ researchActivityId: null, status: "Published *" });
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, BASE_SETTINGS);
  const issue = result.publicationIssues[0].issues[0];

  assert.equal(result.publicationIssues[0].isSealed, true);
  assert.match(issue.action, /finally approved and sealed/);
  assert.match(issue.action, /Outcome Office/);
  assert.match(issue.action, /revert final approval/);
});

test("calculateScientistScore: prior-year IF mode selects year-1", () => {
  // IF available only for 2022 (publication year - 1 = 2022)
  const bundle = makeBundle("First Author", 2022, 8.0);
  const pub = makePub({ publicationDate: "2023-01-01" });
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, {
    ...BASE_SETTINGS,
    impactFactorYear: "prior",
  });
  assert.equal(result.publicationsCount, 1);
  assert.equal(result.sidraScore, 16); // 8 × 2
  assert.equal(result.calculationDetails[0].targetYear, 2022);
  assert.equal(result.calculationDetails[0].usedFallback, false);
});

test("calculateScientistScore: fallback IF year is used when primary missing", () => {
  // Primary year (2023) has no IF; 2022 has one.
  const bundle = makeBundle("First Author", 2022, 4.0);
  const pub = makePub({ publicationDate: "2023-06-01" });
  const result = calculateScientistScore(SCIENTIST, [pub], bundle, {
    ...BASE_SETTINGS,
    impactFactorYear: "publication", // primary=2023, fallback to 2022
  });
  assert.equal(result.publicationsCount, 1);
  assert.equal(result.calculationDetails[0].usedFallback, true);
  assert.equal(result.calculationDetails[0].actualYear, 2022);
});
