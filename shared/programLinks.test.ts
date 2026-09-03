/**
 * The SharePoint and website links on a program.
 *
 * Both are free text a coordinator types, and both end up in an `href` on the
 * program page and in the programs table. A `javascript:` URL saved there
 * would run in the session of whoever clicks it next, so the API is the place
 * that decides what a link may be -- not the renderer, which cannot tell a
 * stored value from a safe one.
 *
 * These pin that rule, and the emptiness rule that goes with it: a cleared box
 * has to reach the column as null, or the page shows an empty link chip and
 * the export writes a blank that reads as a value.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { insertProgramSchema } from "./schema.js";

const base = { programId: "PRM-001", name: "Cancer" };

function parseLinks(input: Record<string, unknown>) {
  return insertProgramSchema.parse({ ...base, ...input });
}

test("a full http(s) link is kept as typed", () => {
  for (const url of [
    "https://sidra.sharepoint.com/sites/cancer",
    "http://www.sidra.org/cancer",
    "HTTPS://SIDRA.SHAREPOINT.COM/sites/cancer",
    "https://sidra.sharepoint.com/sites/cancer?web=1#overview",
  ]) {
    assert.equal(parseLinks({ sharepointUrl: url }).sharepointUrl, url);
    assert.equal(parseLinks({ websiteUrl: url }).websiteUrl, url);
  }
});

test("surrounding whitespace from a paste is trimmed off", () => {
  const parsed = parseLinks({ sharepointUrl: "  https://sidra.sharepoint.com/sites/cancer  " });
  assert.equal(parsed.sharepointUrl, "https://sidra.sharepoint.com/sites/cancer");
});

test("anything that is not http(s) is refused", () => {
  for (const url of [
    "javascript:alert(document.cookie)",
    "JavaScript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///C:/Users/",
    "sidra.sharepoint.com/sites/cancer",
    "www.sidra.org",
    "https://",
  ]) {
    assert.throws(
      () => parseLinks({ sharepointUrl: url }),
      `${url} must be refused`,
    );
    assert.throws(
      () => parseLinks({ websiteUrl: url }),
      `${url} must be refused`,
    );
  }
});

test("an empty box means no link, and is stored as null", () => {
  for (const empty of ["", "   "]) {
    assert.equal(parseLinks({ sharepointUrl: empty }).sharepointUrl, null);
    assert.equal(parseLinks({ websiteUrl: empty }).websiteUrl, null);
  }
  assert.equal(parseLinks({ sharepointUrl: null }).sharepointUrl, null);
  assert.equal(parseLinks({ websiteUrl: null }).websiteUrl, null);
});

test("a program with no links at all still validates", () => {
  const parsed = insertProgramSchema.parse(base);
  assert.equal(parsed.sharepointUrl, undefined);
  assert.equal(parsed.websiteUrl, undefined);
});

test("a partial update can clear one link without touching the other", () => {
  const parsed = insertProgramSchema.partial().parse({ sharepointUrl: "" });
  assert.equal(parsed.sharepointUrl, null);
  assert.equal(parsed.websiteUrl, undefined);
});
