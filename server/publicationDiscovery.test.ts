import assert from "node:assert/strict";
import test from "node:test";

import {
  discoverCrossref,
  fetchCrossrefWork,
  fetchJsonWithTimeout,
  inferJournalFromDoi,
  normalizeDoi,
  pickMatchedAffiliation,
  stripXml,
  withinYearRange,
  workDoiIdentity,
} from "./publicationDiscovery";

// Every outside call goes through global fetch; stand it in per test.
function stubFetch(handler: (url: string) => { status: number; body?: unknown }) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const { status, body } = handler(url);
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("a DOI is compared without its resolver, prefix, case or padding", () => {
  assert.equal(normalizeDoi(" https://doi.org/10.1000/ABC "), "10.1000/abc");
  assert.equal(normalizeDoi("http://dx.doi.org/10.1000/abc"), "10.1000/abc");
  assert.equal(normalizeDoi("doi: 10.1000/abc"), "10.1000/abc");
  assert.equal(normalizeDoi(null), "");
  assert.equal(workDoiIdentity("DOI:10.1000/ABC"), "10.1000/abc");
});

test("a year window keeps undated works and drops the ones outside it", () => {
  assert.equal(withinYearRange(null, 2020, 2024), true);
  assert.equal(withinYearRange(2019, 2020, 2024), false);
  assert.equal(withinYearRange(2025, 2020, 2024), false);
  assert.equal(withinYearRange(2022, 2020, 2024), true);
  assert.equal(withinYearRange(2022), true);
});

test("the matched affiliation is the string that names the search term", () => {
  assert.equal(pickMatchedAffiliation(["Weill Cornell", "Sidra Medicine, Doha"], "sidra"), "Sidra Medicine, Doha");
  assert.equal(pickMatchedAffiliation(["Weill Cornell", null], "sidra"), "Weill Cornell");
  assert.equal(pickMatchedAffiliation([], "sidra"), null);
});

test("a preprint server is inferred from a known DOI prefix, a journal is not", () => {
  assert.equal(inferJournalFromDoi("10.1101/2024.01.01.123456"), "bioRxiv / medRxiv");
  assert.equal(inferJournalFromDoi("10.12688/f1000research.12345.1"), "F1000Research");
  assert.equal(inferJournalFromDoi("10.1016/j.cell.2024.01.001"), "");
});

test("XML text comes back without its tags", () => {
  assert.equal(stripXml("<b>Bold</b> and <i>italic</i>"), "Bold and italic");
});

test("a non-OK or failing response reads as no data, not as a throw", async () => {
  const restore = stubFetch(() => ({ status: 503 }));
  try {
    assert.equal(await fetchJsonWithTimeout("https://example.test/x"), null);
    assert.equal(await fetchCrossrefWork("10.1000/missing"), null);
  } finally {
    restore();
  }
});

test("Crossref rows become discovered papers with normalised DOIs and joined authors", async () => {
  const seen: string[] = [];
  const restore = stubFetch((url) => {
    seen.push(url);
    return {
      status: 200,
      body: {
        message: {
          items: [
            {
              DOI: "10.1000/ABC",
              title: ["Immune Landscape of Solid Tumors"],
              "container-title": ["Nature Medicine"],
              issued: { "date-parts": [[2024, 3, 1]] },
              author: [
                { given: "Wouter", family: "Hendrickx", affiliation: [{ name: "Sidra Medicine, Doha" }] },
                { given: "Davide", family: "Bedognetti" },
              ],
            },
            { title: ["No DOI, dropped"] },
          ],
        },
      },
    };
  });
  try {
    const papers = await discoverCrossref({ authorName: "Hendrickx", affiliation: "Sidra", yearFrom: 2020 });
    assert.equal(papers.length, 1);
    assert.deepEqual(papers[0], {
      doi: "10.1000/abc",
      title: "Immune Landscape of Solid Tumors",
      journal: "Nature Medicine",
      year: 2024,
      authors: "Wouter Hendrickx, Davide Bedognetti",
      source: "Crossref",
      matchedAffiliation: "Sidra Medicine, Doha",
    });
    assert.match(seen[0], /api\.crossref\.org\/works\?/);
    assert.match(seen[0], /query\.author=Hendrickx/);
    assert.match(seen[0], /from-pub-date%3A2020-01-01/);
  } finally {
    restore();
  }
});

test("Crossref is not asked when there is nothing to ask", async () => {
  const restore = stubFetch(() => {
    throw new Error("should not be called");
  });
  try {
    assert.deepEqual(await discoverCrossref({}), []);
  } finally {
    restore();
  }
});
