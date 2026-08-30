import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyResolvedPublication,
  preprintRepairEvidence,
} from "./publicationDeduplication";

test("resolved preprint classification derives DOI link and allowed server name", () => {
  const result = classifyResolvedPublication({
    id: 1,
    doi: "https://doi.org/10.48550/arXiv.2401.12345v2",
    journal: "arXiv",
  });
  assert.deepEqual(result, {
    status: "Submitted for review with pre-publication",
    publicationType: "Preprint",
    prepublicationUrl: "https://doi.org/10.48550/arxiv.2401.12345",
    prepublicationSite: "arXiv",
    doi: null,
    pmid: null,
    journal: null,
    volume: null,
    issue: null,
    publicationDate: null,
  });
});

test("resolved journal article classification remains Published", () => {
  const result = classifyResolvedPublication({
    id: 2,
    doi: "10.1000/published-article",
    journal: "Journal of Clinical Research",
    publicationType: "journal-article",
  });
  assert.deepEqual(result, {
    status: "Published",
    publicationType: "Journal Article",
    prepublicationUrl: null,
    prepublicationSite: null,
  });
});

test("resolved preprints can be recognized from server metadata when the DOI prefix is unknown", () => {
  const result = classifyResolvedPublication({
    id: 3,
    doi: "10.9999/preprint-record",
    journal: "SSRN",
    publicationType: "posted-content",
  });
  assert.equal(result.status, "Submitted for review with pre-publication");
  assert.equal(result.publicationType, "Preprint");
  assert.equal(result.prepublicationSite, "Other");
});

test("repair evidence only accepts current primary DOI or explicit type", () => {
  const base = { id: 1, status: "Published", title: "Article", doi: "10.1000/article" };
  assert.deepEqual(preprintRepairEvidence({
    ...base, prepublicationUrl: "https://doi.org/10.1101/2024.01.01.1",
    prepublicationSite: "bioRxiv",
  }), []);
  assert.deepEqual(preprintRepairEvidence({
    ...base, alternateDois: ["10.1101/2024.01.01.1"],
  }), []);
  assert.deepEqual(preprintRepairEvidence({ ...base, status: "Published *", publicationType: "Preprint" }), []);
  assert.equal(preprintRepairEvidence({ ...base, doi: "10.1101/2024.01.01.1" }).length, 1);
  assert.equal(preprintRepairEvidence({ ...base, publicationType: "Preprint manuscript" }).length, 1);
});