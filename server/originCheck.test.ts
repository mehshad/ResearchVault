import { test } from "node:test";
import assert from "node:assert/strict";
import { originAllowed } from "./originCheck";

/**
 * The Origin check is the second CSRF layer beside SameSite=Lax (#47). It must
 * refuse a browser request from another site and must not get in the way of
 * the app's own pages, non-browser clients, or reads.
 */
const SITE = { host: "qbridge.sidra.org", appUrl: "https://qbridge.sidra.org" };

test("a POST from another origin is refused", () => {
  assert.equal(originAllowed({ method: "POST", origin: "https://evil.example", ...SITE }), false);
});

test("the app's own pages pass, by APP_URL or by the host the request arrived on", () => {
  assert.equal(originAllowed({ method: "POST", origin: "https://qbridge.sidra.org", ...SITE }), true);
  assert.equal(originAllowed({ method: "PUT", origin: "http://localhost:5000", host: "localhost:5000" }), true);
});

test("a different port on the same host is another origin", () => {
  assert.equal(originAllowed({ method: "DELETE", origin: "http://localhost:3000", host: "localhost:5000" }), false);
});

test("reads are never refused", () => {
  assert.equal(originAllowed({ method: "GET", origin: "https://evil.example", ...SITE }), true);
  assert.equal(originAllowed({ method: "HEAD", origin: "https://evil.example", ...SITE }), true);
});

test("a request with no Origin and no Referer is not from a browser page and passes", () => {
  assert.equal(originAllowed({ method: "POST", ...SITE }), true);
});

test("the Referer is consulted only when there is no Origin", () => {
  assert.equal(originAllowed({ method: "POST", referer: "https://qbridge.sidra.org/grants/1", ...SITE }), true);
  assert.equal(originAllowed({ method: "POST", referer: "https://evil.example/", ...SITE }), false);
  assert.equal(originAllowed({ method: "POST", origin: "https://evil.example", referer: "https://qbridge.sidra.org/", ...SITE }), false);
});

test("'Origin: null' and an unparsable origin cannot be verified and are refused", () => {
  assert.equal(originAllowed({ method: "POST", origin: "null", ...SITE }), false);
  assert.equal(originAllowed({ method: "POST", origin: "not a url", ...SITE }), false);
});

test("host comparison ignores case", () => {
  assert.equal(originAllowed({ method: "POST", origin: "https://QBridge.Sidra.org", ...SITE }), true);
});
