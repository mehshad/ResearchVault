/**
 * scripts/sqlite-schema-generator.ts
 *
 * Introspects the shared Drizzle schema and produces a SQLite-compatible
 * CREATE TABLE IF NOT EXISTS script.  Import from generate-sqlite-schema.ts.
 *
 * Column type mapping  (PostgreSQL → SQLite storage class):
 *   PgSerial / PgBigSerial  → INTEGER PRIMARY KEY AUTOINCREMENT
 *   PgInteger / PgBigInt    → INTEGER
 *   PgText / PgVarchar      → TEXT
 *   PgBoolean               → INTEGER   (0 / 1)
 *   PgTimestamp / PgDate    → TEXT      (ISO-8601 string)
 *   PgJson / PgJsonb        → TEXT      (JSON string)
 *   PgNumeric / PgDoublePrecision / PgReal → REAL
 *   everything else         → TEXT
 */

import * as schema from "../shared/schema";

// ── Column type map ──────────────────────────────────────────────────────────

function pgTypeToSqlite(col: any): string {
  const ct: string = col.columnType ?? "";
  if (/Serial/i.test(ct))           return "INTEGER";   // PK handled separately
  if (/^PgInteger$/i.test(ct))      return "INTEGER";
  if (/^PgBigInt/i.test(ct))        return "INTEGER";
  if (/^PgSmallInt/i.test(ct))      return "INTEGER";
  if (/^PgBoolean$/i.test(ct))      return "INTEGER";
  if (/^PgText$/i.test(ct))         return "TEXT";
  if (/^PgVarchar/i.test(ct))       return "TEXT";
  if (/^PgChar/i.test(ct))          return "TEXT";
  if (/^PgTimestamp/i.test(ct))     return "TEXT";
  if (/^PgDate$/i.test(ct))         return "TEXT";
  if (/^PgTime/i.test(ct))          return "TEXT";
  if (/^PgJson/i.test(ct))          return "TEXT";   // JSON + JSONB → TEXT
  if (/^PgArray/i.test(ct))         return "TEXT";   // arrays stored as JSON
  if (/^PgNumeric/i.test(ct))       return "REAL";
  if (/^PgDouble/i.test(ct))        return "REAL";
  if (/^PgReal$/i.test(ct))         return "REAL";
  if (/^PgFloat/i.test(ct))         return "REAL";
  // Enums and anything else → TEXT
  return "TEXT";
}

function defaultExpr(col: any): string | null {
  if (!col.hasDefault) return null;

  const ct: string = col.columnType ?? "";

  // Serial columns have their default via AUTOINCREMENT — don't emit DEFAULT
  if (/Serial/i.test(ct)) return null;

  const d = col.default;
  if (d === null || d === undefined) return null;

  // Drizzle wraps sql`` expressions in a SQL object
  if (d && typeof d === "object" && "queryChunks" in d) {
    // sql`now()` / sql`CURRENT_TIMESTAMP`
    const raw: string = d.queryChunks
      ?.map((c: any) => (typeof c === "string" ? c : ""))
      .join("") ?? "";
    // Map common pg defaults to SQLite equivalents
    if (/now\s*\(\)/i.test(raw))             return "CURRENT_TIMESTAMP";
    if (/CURRENT_TIMESTAMP/i.test(raw))      return "CURRENT_TIMESTAMP";
    if (/gen_random_uuid\s*\(\)/i.test(raw)) return null; // no equivalent; omit
    return null; // unknown sql expression — skip
  }

  if (typeof d === "boolean") return d ? "1" : "0";
  if (typeof d === "number")  return String(d);
  if (typeof d === "string")  return `'${d.replace(/'/g, "''")}'`;
  return null;
}

// ── Table DDL builder ────────────────────────────────────────────────────────

const DRIZZLE_COLUMNS = Symbol.for("drizzle:Columns");

function tableToSql(tableName: string, tbl: any): string {
  const columns: string[] = [];
  const uniqueConstraints: string[] = [];

  const colMap: Record<string, any> = tbl[DRIZZLE_COLUMNS] ?? {};
  for (const [, col] of Object.entries(colMap)) {
    if (!col || typeof col !== "object" || !("columnType" in col)) continue;

    const sqliteName = col.name as string;
    const isSerial   = /Serial/i.test(col.columnType ?? "");
    const isPk       = col.primary === true;

    if (isPk && isSerial) {
      columns.push(`  "${sqliteName}" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL`);
      continue;
    }

    let def = `  "${sqliteName}" ${pgTypeToSqlite(col)}`;
    if (col.notNull) def += " NOT NULL";

    const dflt = defaultExpr(col);
    if (dflt !== null) def += ` DEFAULT ${dflt}`;

    if (col.isUnique) {
      uniqueConstraints.push(
        `  CONSTRAINT "${col.uniqueName ?? `${tableName}_${sqliteName}_unique`}" UNIQUE ("${sqliteName}")`,
      );
    }

    columns.push(def);
  }

  const allDefs = [...columns, ...uniqueConstraints];
  return (
    `CREATE TABLE IF NOT EXISTS "${tableName}" (\n` +
    allDefs.join(",\n") +
    `\n);\n`
  );
}

// ── Index DDL builder ────────────────────────────────────────────────────────

// Many pg tables declare composite unique indexes in the second pgTable arg.
// We capture these from table._.uniqueConstraints if available.
function indexSql(tableName: string, tbl: any): string[] {
  const stmts: string[] = [];
  try {
    const uniqueConstraints: any[] = tbl._.uniqueConstraints ?? [];
    for (const uc of uniqueConstraints) {
      const cols = (uc.columns ?? []).map((c: any) => `"${c.name}"`).join(", ");
      if (!cols) continue;
      const idxName = uc.name ?? `${tableName}_unique_${uc.columns.map((c: any) => c.name).join("_")}`;
      stmts.push(`CREATE UNIQUE INDEX IF NOT EXISTS "${idxName}" ON "${tableName}" (${cols});\n`);
    }
  } catch {
    // ignore — older drizzle or table with no unique constraints
  }
  return stmts;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function generateSqliteSchema(): string {
  const header = [
    "-- AUTO-GENERATED by scripts/generate-sqlite-schema.ts — do not edit manually.",
    "-- Re-generate after schema changes: npx tsx scripts/generate-sqlite-schema.ts",
    "-- All statements use IF NOT EXISTS so this file is safe to re-run on startup.",
    "",
    "PRAGMA journal_mode = WAL;",
    "PRAGMA foreign_keys = ON;",
    "",
  ].join("\n");

  const parts: string[] = [header];

  const IS_TABLE = Symbol.for("drizzle:IsDrizzleTable");

  for (const [exportName, value] of Object.entries(schema)) {
    if (!value || typeof value !== "object") continue;
    if (!(value as any)[IS_TABLE]) continue;

    const tbl = value as any;
    const sqlName: string = tbl[Symbol.for("drizzle:Name")] ?? exportName;

    parts.push(`-- ${exportName}\n${tableToSql(sqlName, tbl)}`);

    const indexes = indexSql(sqlName, tbl);
    if (indexes.length) parts.push(...indexes);
  }

  return parts.join("\n");
}
