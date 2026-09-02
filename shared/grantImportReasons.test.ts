import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GRANT_SKIP_REASONS, summariseGrantSkips } from "./grantImportReasons";

test("counts skipped rows by category, biggest cause first", () => {
  const summary = summariseGrantSkips([
    { action: "skip", reasonCode: "no_title" },
    { action: "skip", reasonCode: "unmatched_staff" },
    { action: "skip", reasonCode: "unmatched_staff" },
    { action: "skip", reasonCode: "unmatched_staff" },
    { action: "skip", reasonCode: "no_title" },
    { action: "create" },
    { action: "update" },
  ]);
  assert.deepEqual(summary.map((r) => [r.code, r.count]), [
    ["unmatched_staff", 3],
    ["no_title", 2],
  ]);
  assert.ok(summary[0].hint.length > 0, "each line says what to do about it");
});

test("rows that were not skipped are not counted", () => {
  assert.deepEqual(summariseGrantSkips([{ action: "create" }, { action: "update" }]), []);
});

test("an untagged skip is still counted, under Other", () => {
  const [row] = summariseGrantSkips([{ action: "skip" }]);
  assert.equal(row.code, "other");
  assert.equal(row.count, 1);
});

/**
 * The summary is only honest if every skip carries a category. A new skip that
 * forgets one disappears into "Other", which is exactly the uninformative wall
 * this was built to replace.
 */
test("every skip in the importer sets a reasonCode", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, "..", "server", "grantsImportExport.ts"), "utf-8");
  const start = source.indexOf("export function previewGrantRows(");
  const body = source.slice(start);

  const pushes = body.match(/previews\.push\(\{[\s\S]{0,400}?\}\)/g) ?? [];
  const skips = pushes.filter((p) => /action:\s*"skip"/.test(p));
  assert.ok(skips.length >= 3, `expected several skip sites, found ${skips.length}`);
  for (const push of skips) {
    assert.match(push, /reasonCode/, `a skip is missing its reasonCode:\n${push.slice(0, 160)}`);
  }
});

test("every category the importer can emit has a label", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, "..", "server", "grantsImportExport.ts"), "utf-8");
  const known = new Set(GRANT_SKIP_REASONS.map((r) => r.code));
  for (const [, code] of source.matchAll(/errorCodes\.push\("([a-z_]+)"\)/g)) {
    assert.ok(known.has(code as any), `${code} is emitted but has no label`);
  }
  for (const [, code] of source.matchAll(/reasonCode:\s*"([a-z_]+)"/g)) {
    assert.ok(known.has(code as any), `${code} is emitted but has no label`);
  }
});
