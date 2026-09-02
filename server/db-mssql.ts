/**
 * server/db-mssql.ts
 *
 * SQL Server adapter for ResearchVault.
 *
 * Drizzle ORM v0.45 does not have a native MSSQL dialect.  We use
 * drizzle's `pg-proxy` adapter (which gives us the full type-safe query
 * builder) and translate the PostgreSQL-flavoured SQL it generates into
 * T-SQL before forwarding it to the `mssql` driver.
 *
 * Translation rules applied by `translatePgToMssql()`:
 *   1. Identifier quoting  "foo" → [foo]
 *   2. Parameter markers   $1 → @p1
 *   3. Boolean literals    true/false → 1/0
 *   4. INSERT RETURNING    INSERT … VALUES … RETURNING * →
 *                          INSERT … OUTPUT INSERTED.* VALUES …
 *   5. LIMIT / OFFSET      LIMIT n [OFFSET m] →
 *                          OFFSET m ROWS FETCH NEXT n ROWS ONLY
 *   6. Trailing RETURNING  (UPDATE/DELETE) → stripped (see note below)
 *
 * Known limitations
 * -----------------
 * • UPDATE … RETURNING / DELETE … RETURNING:  T-SQL uses OUTPUT before
 *   the WHERE clause which cannot be inserted by a simple regex after the
 *   fact.  These are stripped; callers that need the updated rows should
 *   perform a subsequent SELECT by primary key.
 * • PostgreSQL-specific functions (e.g. gen_random_uuid(), now()::date)
 *   may need manual migration script adjustments — see migrations/mssql/.
 * • JSON/JSONB columns are stored as NVARCHAR(MAX) in the MSSQL schema;
 *   querying inside the JSON value requires SQL Server 2016+ JSON functions.
 */

import * as mssql from "mssql";
import { drizzle } from "drizzle-orm/pg-proxy";
import * as schema from "@shared/schema";

// ── URL parsing ──────────────────────────────────────────────────────────────
// Accepts either:
//   mssql://user:password@host:1433/database
//   Server=host;Database=db;User Id=user;Password=pass;Encrypt=true
export function parseMssqlUrl(url: string): mssql.config {
  // ADO.NET / connection-string style
  if (!url.startsWith("mssql://")) {
    const parts: Record<string, string> = {};
    url.split(";").forEach((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) return;
      const k = pair.slice(0, eq).trim().toLowerCase().replace(/\s+/g, "");
      const v = pair.slice(eq + 1).trim();
      parts[k] = v;
    });
    return {
      server:   parts["server"]   || parts["datasource"] || "localhost",
      database: parts["database"] || parts["initialcatalog"],
      user:     parts["userid"]   || parts["uid"],
      password: parts["password"] || parts["pwd"],
      port:     parts["port"] ? parseInt(parts["port"], 10) : 1433,
      options: {
        encrypt:              (parts["encrypt"]            ?? "true") === "true",
        trustServerCertificate: (parts["trustservercertificate"] ?? "false") === "true",
      },
    };
  }

  // mssql:// URL
  const u = new URL(url);
  return {
    server:   u.hostname,
    port:     u.port ? parseInt(u.port, 10) : 1433,
    database: u.pathname.replace(/^\//, ""),
    user:     u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    options: {
      encrypt: u.searchParams.get("encrypt") !== "false",
      trustServerCertificate:
        u.searchParams.get("trustServerCertificate") === "true" ||
        u.searchParams.get("TrustServerCertificate") === "true",
    },
  };
}

// ── SQL dialect translation ───────────────────────────────────────────────────

/**
 * Translate PostgreSQL-dialect SQL (as produced by Drizzle's pg backend)
 * into T-SQL understood by SQL Server.
 */
export function translatePgToMssql(sqlStr: string): string {
  let s = sqlStr;

  // 1. Double-quoted identifiers  "foo"."bar" → [foo].[bar]
  //    Only replace when NOT inside a string literal.
  s = s.replace(/"([^"\\]+)"/g, "[$1]");

  // 2. $N positional parameters → @pN
  s = s.replace(/\$(\d+)/g, (_, n) => `@p${n}`);

  // 3. Boolean literals  (Drizzle may emit bare true/false for non-bound values)
  s = s.replace(/\btrue\b/gi, "1").replace(/\bfalse\b/gi, "0");

  // 4. INSERT … VALUES … RETURNING *
  //    → INSERT … OUTPUT INSERTED.* VALUES …
  //    Drizzle puts RETURNING at the end; MSSQL needs OUTPUT between the table
  //    name and VALUES.
  s = s.replace(
    /^(INSERT\s+INTO\s+\[[^\]]+\]\s*(?:\([^)]+\))?)\s+(VALUES\s*[\s\S]+?)\s+RETURNING\s+\*\s*$/im,
    "$1 OUTPUT INSERTED.* $2",
  );

  // 5. Standalone RETURNING * (UPDATE/DELETE — stripped, see limitation note)
  s = s.replace(/\s+RETURNING\s+\*\s*$/im, "");

  // 6. LIMIT / OFFSET
  //    PostgreSQL:  … LIMIT 10 OFFSET 20
  //    T-SQL:       … OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY
  //    When there is no OFFSET, emit OFFSET 0 ROWS first (required by T-SQL).
  s = s.replace(
    /\bLIMIT\s+(@p\d+|\d+)\s+OFFSET\s+(@p\d+|\d+)/gi,
    "OFFSET $2 ROWS FETCH NEXT $1 ROWS ONLY",
  );
  s = s.replace(
    /\bLIMIT\s+(@p\d+|\d+)/gi,
    "OFFSET 0 ROWS FETCH NEXT $1 ROWS ONLY",
  );

  return s;
}

// ── Pool & Drizzle instance ───────────────────────────────────────────────────

export async function createMssqlDb(url: string) {
  const config = parseMssqlUrl(url);
  const pool = await mssql.connect(config);

  const db = drizzle(
    async (sqlStr, params, _method) => {
      const translated = translatePgToMssql(sqlStr);
      const request = pool.request();

      // Bind parameters @p1, @p2, …
      (params as unknown[]).forEach((value, idx) => {
        const name = `p${idx + 1}`;
        if (value === null || value === undefined) {
          request.input(name, mssql.NVarChar, null);
        } else if (typeof value === "number" && Number.isInteger(value)) {
          request.input(name, mssql.BigInt, value);
        } else if (typeof value === "number") {
          request.input(name, mssql.Float, value);
        } else if (typeof value === "boolean") {
          request.input(name, mssql.Bit, value ? 1 : 0);
        } else if (value instanceof Date) {
          request.input(name, mssql.DateTime2, value);
        } else if (typeof value === "object") {
          // JSON columns stored as NVARCHAR(MAX)
          request.input(name, mssql.NVarChar(mssql.MAX), JSON.stringify(value));
        } else {
          request.input(name, mssql.NVarChar(mssql.MAX), String(value));
        }
      });

      const result = await request.query(translated);
      return { rows: result.recordset ?? [] };
    },
    { schema },
  );

  return { pool, db };
}
