import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * #7: every integer column that names another table's id is a real foreign
 * key in shared/schema.ts, not a comment. A new column that points somewhere
 * either gets .references() or is added to the two deliberate exceptions.
 */
const schema = readFileSync(new URL("./schema.ts", import.meta.url), "utf-8").replace(/\r\n/g, "\n");

// Polymorphic or informational: nothing to reference.
const EXCEPTIONS = new Set([
  "audit_log.record_id", // which table it names is in table_name
  "role_permissions.updated_by", // who last touched the matrix; kept as a plain id
]);

test("every id column points at a table through a real foreign key", () => {
  const tables = [...schema.matchAll(/export const \w+ = pgTable\("(\w+)"/g)].map((m) => ({ name: m[1], at: m.index! }));
  const missing: string[] = [];
  tables.forEach((table, i) => {
    const body = schema.slice(table.at, tables[i + 1]?.at ?? schema.length);
    for (const m of body.matchAll(/^\s+\w+:\s*integer\("(\w+)"\)(.*)$/gm)) {
      const [, column, rest] = m;
      const looksLikeReference = column.endsWith("_id") || column.endsWith("Id") || column.includes("_by");
      if (!looksLikeReference || rest.includes(".references(")) continue;
      const key = `${table.name}.${column}`;
      if (!EXCEPTIONS.has(key)) missing.push(key);
    }
  });
  assert.deepEqual(missing, [], "columns that name another table's id without a foreign key");
});

test("the migration carries the references the schema declares, one rule each", () => {
  const migration = readFileSync(new URL("../migrations/20260916_foreign_keys.sql", import.meta.url), "utf-8");
  const added = [...migration.matchAll(/ALTER TABLE (\w+) ADD CONSTRAINT "?\w+"?\s+FOREIGN KEY \("?(\w+)"?\) REFERENCES (\w+)\(id\) ON DELETE (CASCADE|SET NULL|RESTRICT)/g)]
    .map((m) => ({ key: `${m[1]}.${m[2]}`, rule: m[4] }));
  // table.column -> rule, as the schema declares it
  const declared = new Map<string, string>();
  const tables = [...schema.matchAll(/export const \w+ = pgTable\("(\w+)"/g)].map((m) => ({ name: m[1], at: m.index! }));
  tables.forEach((table, i) => {
    const body = schema.slice(table.at, tables[i + 1]?.at ?? schema.length);
    for (const m of body.matchAll(/integer\("(\w+)"\)\.references\(\(\)(?:: AnyPgColumn)? => \w+\.id, \{ onDelete: "(cascade|set null|restrict)" \}\)/g)) {
      declared.set(`${table.name}.${m[1]}`, m[2].toUpperCase());
    }
  });
  // 80 columns were added by this change; a handful of older references
  // (created_by_user_id and the like) were declared before it with their own
  // migrations, so the schema count runs ahead of this file.
  assert.equal(added.length, 80, `constraints added by the migration: ${added.length}`);
  assert.ok(declared.size >= added.length, `schema declares ${declared.size}, migration adds ${added.length}`);
  for (const { key, rule } of added) {
    assert.equal(declared.get(key), rule, `${key}: migration says ${rule}, schema says ${declared.get(key)}`);
  }
});
