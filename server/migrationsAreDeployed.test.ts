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

test("audit_log is applied, and a failure to apply it stops the container", () => {
  // Named specifically because its absence does not fail loudly: the app starts,
  // serves, saves records, and only then reports each save as a 500. There is
  // no longer a "strict subset" of migrations -- every file's output is
  // checked and any ERROR that is not the benign chatter of an idempotent
  // re-run exits the entrypoint. audit_log is covered by that like the rest.
  const entrypoint = readFileSync(join(repo, "docker-entrypoint.sh"), "utf-8");
  assert.match(entrypoint, /migrations\/20260831_audit_log\.sql/);
  assert.match(entrypoint, /_MIGRATION_BENIGN='[^']+'/, "the benign-error allowlist must be defined");
  assert.match(
    entrypoint,
    /grep -E 'ERROR:' \| grep -vE "\$_MIGRATION_BENIGN" \| grep -q \.; then[\s\S]{0,400}exit 1/,
    "a non-benign ERROR in any migration must exit the entrypoint",
  );
});

test("the benign-error allowlist does not swallow 'does not exist'", () => {
  // That is exactly the message a real failure carries -- a column a data
  // migration references -- and it used to be filtered out with the noise.
  const entrypoint = readFileSync(join(repo, "docker-entrypoint.sh"), "utf-8");
  const allow = /_MIGRATION_BENIGN='([^']+)'/.exec(entrypoint)?.[1] ?? "";
  assert.ok(allow.length > 0);
  assert.ok(!/does not exist/.test(allow), `benign list must not include "does not exist": ${allow}`);
  assert.ok(!entrypoint.includes("|| true\n  fi\ndone"), "no migration may end in '|| true' any more");
});
