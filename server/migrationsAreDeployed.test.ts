import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Every migration must be in docker-entrypoint.sh's list, or deliberately
 * excluded here.
 *
 * The entrypoint applies an explicit ordered list and never runs
 * `drizzle-kit push`, so a migration file that nobody adds to that list is
 * simply never applied in production -- while the code that depends on it
 * ships anyway. That is not hypothetical: 20260831_audit_log.sql was written,
 * committed and merged without being added, so production ran the audit
 * logging against a table that did not exist. Every staff update, delete and
 * role change wrote its row and then returned a 500, for two days, and the
 * cause was invisible because the failing statement was never in the response.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

/** Migrations that are deliberately not applied on deploy, and why. */
const NOT_DEPLOYED: Record<string, string> = {
  "demo_seed_data.sql": "Applied separately, and only when AUTH_MODE=demo.",
};

test("every migration is applied by docker-entrypoint.sh", () => {
  const entrypoint = readFileSync(join(repo, "docker-entrypoint.sh"), "utf-8");
  const listed = new Set(
    [...entrypoint.matchAll(/migrations\/([0-9A-Za-z_.-]+\.sql)/g)].map((m) => m[1]),
  );

  // Only the top level: subdirectories hold other engines' schemas (sqlite,
  // mssql), which this entrypoint does not apply.
  const onDisk = readdirSync(join(repo, "migrations"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name);

  assert.ok(onDisk.length > 10, "expected to find the migration files");

  const missing = onDisk.filter((name) => !listed.has(name) && !(name in NOT_DEPLOYED));
  assert.deepEqual(
    missing,
    [],
    `these migrations exist but are never applied on deploy:\n  ${missing.join("\n  ")}\n` +
      `Add them to the list in docker-entrypoint.sh, or record why not in NOT_DEPLOYED.`,
  );
});

test("the entrypoint does not list a migration that no longer exists", () => {
  const entrypoint = readFileSync(join(repo, "docker-entrypoint.sh"), "utf-8");
  const listed = [...entrypoint.matchAll(/migrations\/([0-9A-Za-z_.-]+\.sql)/g)].map((m) => m[1]);
  const onDisk = new Set(
    readdirSync(join(repo, "migrations"), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name),
  );
  for (const name of new Set(listed)) {
    assert.ok(onDisk.has(name), `docker-entrypoint.sh applies ${name}, which is not in migrations/`);
  }
});

test("audit_log is applied, and strictly", () => {
  // Named specifically because its absence does not fail loudly: the app starts,
  // serves, saves records, and only then reports each save as a 500.
  const entrypoint = readFileSync(join(repo, "docker-entrypoint.sh"), "utf-8");
  assert.match(entrypoint, /migrations\/20260831_audit_log\.sql/);
  const strictBlock = entrypoint.slice(entrypoint.indexOf("ON_ERROR_STOP=1") - 2000, entrypoint.indexOf("ON_ERROR_STOP=1"));
  assert.match(
    strictBlock,
    /20260831_audit_log\.sql/,
    "audit_log must be in the strict set: without the table every audited write fails after committing",
  );
});
