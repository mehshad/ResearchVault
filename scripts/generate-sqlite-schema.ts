/**
 * scripts/generate-sqlite-schema.ts
 *
 * Generates migrations/sqlite/0001_schema.sql from the shared Drizzle schema.
 * Run once whenever the schema changes:
 *
 *   npx tsx scripts/generate-sqlite-schema.ts
 *
 * The output is a single idempotent SQL file using CREATE TABLE IF NOT EXISTS,
 * safe to execute on every container start.
 */

import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { generateSqliteSchema } from "./sqlite-schema-generator";

const outDir  = resolve(import.meta.dirname, "../migrations/sqlite");
const outFile = resolve(outDir, "0001_schema.sql");

mkdirSync(outDir, { recursive: true });

const sql = generateSqliteSchema();
writeFileSync(outFile, sql, "utf8");

console.log(`✓ Written ${outFile} (${sql.length} bytes)`);
