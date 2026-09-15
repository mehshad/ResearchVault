import * as schema from "@shared/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export const DATABASE_URL_MISSING =
  "DATABASE_URL must be set. Did you forget to provision a database?";

/**
 * Whether a database is configured at all. server/index.ts asks this at boot
 * and refuses to start without one; here the module no longer throws at
 * import time, because the route-handler unit tests import modules that
 * import this one and never issue a query. They used to fail with the
 * message above before a single assertion ran, which read as broken tests
 * rather than a missing variable. Anything that does query without a
 * database gets the same message, at the first query.
 */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

// ── Driver selection ──────────────────────────────────────────────────────────
//
//  DATABASE_URL format → driver used
//  ──────────────────────────────────────────────────────────────────────────
//  sqlite:/absolute/path.db          → better-sqlite3  (embedded, no server)
//  mssql://user:pass@host:1433/db    → mssql / tedious (SQL Server / Azure SQL)
//  Server=host;Database=db;...       → mssql / tedious (ADO.NET conn string)
//  ...neon.tech...                   → @neondatabase/serverless (WebSocket)
//  postgresql:// or postgres://       → pg (Node-postgres connection pool)
//
//  DB_TYPE=sqlite|mssql|postgres can override auto-detection.

const url = process.env.DATABASE_URL ?? "";

const isSQLite =
  process.env.DB_TYPE === "sqlite" ||
  url.startsWith("sqlite:");

const isMSSQL =
  !isSQLite && (
    process.env.DB_TYPE === "mssql" ||
    url.startsWith("mssql://") ||
    /^Server\s*=/i.test(url)   // ADO.NET connection string
  );

const isNeon = !isSQLite && !isMSSQL && url.includes("neon.tech");

let pool: any;
// Typed as the Postgres client whichever driver is behind it: the schema is
// the same, and an untyped `db` had let every caller's rows become `any`.
let db: NodePgDatabase<typeof schema>;

if (!url) {
  // No database configured: a stand-in that refuses the first use with the
  // message the import used to throw, so a unit test that never queries can
  // import freely and anything that does query is told exactly what is
  // missing. index.ts checks isDatabaseConfigured() before this is reached.
  const refuse = () => {
    throw new Error(DATABASE_URL_MISSING);
  };
  // A property a test has set on it (a stubbed insert, say) is returned;
  // anything else is refused.
  db = new Proxy(function unconfiguredDatabase() {}, {
    get: (target, prop) => (Object.prototype.hasOwnProperty.call(target, prop) ? (target as any)[prop] : refuse()),
    apply: refuse,
    construct: refuse,
  }) as unknown as NodePgDatabase<typeof schema>;
  pool = null;
} else if (isSQLite) {
  const filePath = url.startsWith("sqlite:") ? url.slice("sqlite:".length) : url;
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { readFileSync, existsSync } = await import("fs");
  const { resolve } = await import("path");

  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // Apply the generated SQLite schema on every startup.
  // All statements are CREATE TABLE IF NOT EXISTS — safe to re-run.
  const schemaFile = resolve(
    new URL(".", import.meta.url).pathname,
    "../migrations/sqlite/0001_schema.sql",
  );
  if (existsSync(schemaFile)) {
    sqlite.exec(readFileSync(schemaFile, "utf8"));
  } else {
    console.warn(
      "[db] SQLite schema file not found at", schemaFile,
      "— run: npx tsx scripts/generate-sqlite-schema.ts",
    );
  }

  db   = drizzle(sqlite, { schema }) as unknown as NodePgDatabase<typeof schema>;
  pool = null;

} else if (isMSSQL) {
  const { createMssqlDb } = await import("./db-mssql");
  const result = await createMssqlDb(url);
  db   = result.db as unknown as NodePgDatabase<typeof schema>;
  pool = result.pool;

} else if (isNeon) {
  const { Pool, neonConfig } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const { default: ws } = await import("ws");
  neonConfig.webSocketConstructor = ws;
  pool = new Pool({ connectionString: url });
  db   = drizzle({ client: pool, schema }) as unknown as NodePgDatabase<typeof schema>;

} else {
  // Standard PostgreSQL (local Docker, cloud-managed, on-prem)
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  pool = new Pool({ connectionString: url });
  db   = drizzle(pool, { schema });
}

export { pool, db };
