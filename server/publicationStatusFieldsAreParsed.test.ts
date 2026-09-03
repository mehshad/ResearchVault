import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * The status endpoint must never hand the request body to the storage layer
 * unchanged.
 *
 * It used to. A publication date leaves an `<input type="date">` as
 * "2026-07-03", `publications.publication_date` is a timestamp, and Drizzle
 * calls `.toISOString()` on whatever it receives -- so the update threw before
 * any SQL ran and the endpoint answered "Failed to update publication status"
 * with nothing else. Published is the only stage that writes a date, so the
 * whole workflow ran fine until its final step, which no one could complete.
 *
 * Guarded by reading the source: the failure is in the wiring between the route
 * and the driver, and exercising it for real needs a live database and a
 * session. What matters is that the body is parsed through the shared schema
 * before it reaches the column.
 */
const here = dirname(fileURLToPath(import.meta.url));
const routes = readFileSync(join(here, "routes.ts"), "utf-8");

const statusRoute = (() => {
  const start = routes.indexOf("app.patch('/api/publications/:id/status'");
  assert.ok(start > -1, "the publication status route should still exist");
  const end = routes.indexOf("app.post(", start);
  assert.ok(end > start, "expected a route after the status route");
  return routes.slice(start, end);
})();

test("the status route coerces its updated fields before writing them", () => {
  assert.match(
    statusRoute,
    /parsePublicationStatusFields\(\s*req\.body\?\.updatedFields\s*\)/,
    "updatedFields must go through parsePublicationStatusFields",
  );
});

test("the status route never destructures updatedFields straight off the body", () => {
  assert.doesNotMatch(
    statusRoute,
    /const\s*\{[^}]*\bupdatedFields\b[^}]*\}\s*=\s*req\.body/,
    "taking updatedFields raw off req.body is what sent a date string to a timestamp column",
  );
});

test("unparsed fields are refused with a reason rather than a bare 500", () => {
  assert.match(
    statusRoute,
    /if\s*\(!parsedFields\.ok\)\s*\{\s*return res\.status\(400\)/,
    "a body the schema rejects should answer 400 with the reason, not fall through to the catch",
  );
});
