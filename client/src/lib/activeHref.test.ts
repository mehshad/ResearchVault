import assert from "node:assert/strict";
import test from "node:test";

import { resolveActiveHref } from "./activeHref";

const hrefs = [
  "/app",
  "/scientists",
  "/pmo/programs",
  "/pmo/projects",
  "/pmo/research-activities",
  "/grants",
  "/research-portfolio/grants",
  "/research-office",
  "/research-office/configuration",
  "/settings",
];

test("the page itself is active", () => {
  assert.equal(resolveActiveHref("/grants", hrefs), "/grants");
});

test("a detail, create or edit page lights up its list entry", () => {
  assert.equal(resolveActiveHref("/scientists/12", hrefs), "/scientists");
  assert.equal(resolveActiveHref("/scientists/12/edit", hrefs), "/scientists");
  assert.equal(resolveActiveHref("/grants/7/edit", hrefs), "/grants");
});

test("the longest matching entry wins over its ancestor", () => {
  assert.equal(resolveActiveHref("/research-office/configuration", hrefs), "/research-office/configuration");
  assert.equal(resolveActiveHref("/research-office", hrefs), "/research-office");
});

test("a bare PMO path activates the /pmo/ sidebar entry, and vice versa", () => {
  assert.equal(resolveActiveHref("/research-activities/5", hrefs), "/pmo/research-activities");
  assert.equal(resolveActiveHref("/programs", hrefs), "/pmo/programs");
  assert.equal(resolveActiveHref("/pmo/projects/3/edit", hrefs), "/pmo/projects");
});

test("a prefix that is only a string prefix does not match", () => {
  // /grants must not light up for /grants-office, and /research-portfolio/grants
  // is its own entry, not a child of /grants.
  assert.equal(resolveActiveHref("/research-portfolio/grants", hrefs), "/research-portfolio/grants");
  assert.equal(resolveActiveHref("/grants-archive", hrefs), null);
});

test("a query string does not stop the match", () => {
  assert.equal(resolveActiveHref("/settings?tab=users", hrefs), "/settings");
});

test("a page with no entry lights nothing", () => {
  assert.equal(resolveActiveHref("/feature-requests", hrefs), null);
});
