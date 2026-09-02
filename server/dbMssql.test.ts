// Unit tests for the pg→T-SQL translation helpers in db-mssql.ts.
// parseMssqlUrl and translatePgToMssql are pure functions — no live DB needed.

import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://ci:ci@localhost:5432/ci_test";

import { parseMssqlUrl, translatePgToMssql } from "./db-mssql";

// ---------------------------------------------------------------------------
// parseMssqlUrl — mssql:// URL
// ---------------------------------------------------------------------------

test("parseMssqlUrl parses a standard mssql:// URL", () => {
  const cfg = parseMssqlUrl("mssql://sa:StrongP%40ss@sqlserver:1433/researchvault");
  assert.equal(cfg.server,   "sqlserver");
  assert.equal(cfg.port,     1433);
  assert.equal(cfg.database, "researchvault");
  assert.equal(cfg.user,     "sa");
  assert.equal(cfg.password, "StrongP@ss");   // percent-decoded
});

test("parseMssqlUrl defaults port to 1433 when omitted", () => {
  const cfg = parseMssqlUrl("mssql://sa:pass@myhost/mydb");
  assert.equal(cfg.port, 1433);
});

test("parseMssqlUrl sets encrypt=true by default", () => {
  const cfg = parseMssqlUrl("mssql://sa:pass@host/db");
  assert.equal((cfg.options as any).encrypt, true);
});

test("parseMssqlUrl respects encrypt=false query param", () => {
  const cfg = parseMssqlUrl("mssql://sa:pass@host/db?encrypt=false");
  assert.equal((cfg.options as any).encrypt, false);
});

test("parseMssqlUrl respects TrustServerCertificate param", () => {
  const cfg = parseMssqlUrl("mssql://sa:pass@host/db?TrustServerCertificate=true");
  assert.equal((cfg.options as any).trustServerCertificate, true);
});

// ---------------------------------------------------------------------------
// parseMssqlUrl — ADO.NET connection string
// ---------------------------------------------------------------------------

test("parseMssqlUrl parses an ADO.NET connection string", () => {
  const connStr =
    "Server=sqlserver.hospital.org;Database=researchvault;" +
    "User Id=svc;Password=s3cr3t;Encrypt=true;TrustServerCertificate=false";
  const cfg = parseMssqlUrl(connStr);
  assert.equal(cfg.server,   "sqlserver.hospital.org");
  assert.equal(cfg.database, "researchvault");
  assert.equal(cfg.user,     "svc");
  assert.equal(cfg.password, "s3cr3t");
  assert.equal((cfg.options as any).encrypt, true);
  assert.equal((cfg.options as any).trustServerCertificate, false);
});

test("parseMssqlUrl accepts semicolons with trailing semicolon", () => {
  const connStr = "Server=host;Database=db;User Id=u;Password=p;";
  const cfg = parseMssqlUrl(connStr);
  assert.equal(cfg.server, "host");
  assert.equal(cfg.user,   "u");
});

// ---------------------------------------------------------------------------
// translatePgToMssql — identifier quoting
// ---------------------------------------------------------------------------

test("translatePgToMssql converts double-quoted identifiers to brackets", () => {
  const result = translatePgToMssql(`SELECT "id", "name" FROM "users"`);
  assert.equal(result, "SELECT [id], [name] FROM [users]");
});

test("translatePgToMssql converts schema-qualified identifiers", () => {
  const result = translatePgToMssql(`SELECT "users"."email" FROM "users"`);
  assert.equal(result, "SELECT [users].[email] FROM [users]");
});

// ---------------------------------------------------------------------------
// translatePgToMssql — parameter placeholders
// ---------------------------------------------------------------------------

test("translatePgToMssql replaces $N with @pN", () => {
  const result = translatePgToMssql(
    `SELECT * FROM [users] WHERE [id] = $1 AND [role] = $2`,
  );
  assert.ok(result.includes("@p1"), "should contain @p1");
  assert.ok(result.includes("@p2"), "should contain @p2");
  assert.ok(!result.includes("$1"), "should not contain $1");
});

test("translatePgToMssql handles multi-digit parameter numbers", () => {
  const result = translatePgToMssql(`WHERE x = $10 AND y = $11`);
  assert.ok(result.includes("@p10"));
  assert.ok(result.includes("@p11"));
});

// ---------------------------------------------------------------------------
// translatePgToMssql — boolean literals
// ---------------------------------------------------------------------------

test("translatePgToMssql replaces bare true with 1", () => {
  const result = translatePgToMssql(`WHERE [active] = true`);
  assert.ok(result.includes("= 1"), `got: ${result}`);
  assert.ok(!result.includes("true"), `should not contain 'true': ${result}`);
});

test("translatePgToMssql replaces bare false with 0", () => {
  const result = translatePgToMssql(`WHERE [active] = false`);
  assert.ok(result.includes("= 0"));
});

// ---------------------------------------------------------------------------
// translatePgToMssql — RETURNING clause (INSERT)
// ---------------------------------------------------------------------------

test("translatePgToMssql converts INSERT … RETURNING * to OUTPUT INSERTED.*", () => {
  const sql =
    `INSERT INTO [users] ([username], [email]) VALUES (@p1, @p2) RETURNING *`;
  const result = translatePgToMssql(sql);
  assert.ok(
    result.includes("OUTPUT INSERTED.*"),
    `expected OUTPUT INSERTED.*, got: ${result}`,
  );
  assert.ok(!result.includes("RETURNING"), `should not contain RETURNING: ${result}`);
  assert.ok(result.includes("VALUES"), `should still contain VALUES: ${result}`);
});

test("translatePgToMssql strips RETURNING * from UPDATE", () => {
  const sql = `UPDATE [users] SET [name] = @p1 WHERE [id] = @p2 RETURNING *`;
  const result = translatePgToMssql(sql);
  assert.ok(!result.includes("RETURNING"), `should strip RETURNING: ${result}`);
});

// ---------------------------------------------------------------------------
// translatePgToMssql — LIMIT / OFFSET
// ---------------------------------------------------------------------------

test("translatePgToMssql converts LIMIT n to FETCH NEXT syntax", () => {
  const result = translatePgToMssql(`SELECT * FROM [users] LIMIT 10`);
  assert.ok(result.includes("FETCH NEXT 10 ROWS ONLY"), `got: ${result}`);
  assert.ok(!result.includes("LIMIT"),  `should not contain LIMIT: ${result}`);
});

test("translatePgToMssql converts LIMIT n OFFSET m to OFFSET…FETCH syntax", () => {
  const result = translatePgToMssql(`SELECT * FROM [users] LIMIT 10 OFFSET 20`);
  assert.ok(result.includes("OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY"), `got: ${result}`);
  assert.ok(!result.includes("LIMIT"),  "should not contain LIMIT");
});

test("translatePgToMssql converts LIMIT @p1 OFFSET @p2 (parameterised)", () => {
  const result = translatePgToMssql(`SELECT * FROM [t] LIMIT @p1 OFFSET @p2`);
  assert.ok(result.includes("OFFSET @p2 ROWS FETCH NEXT @p1 ROWS ONLY"), `got: ${result}`);
});

// ---------------------------------------------------------------------------
// translatePgToMssql — passthrough (no changes needed)
// ---------------------------------------------------------------------------

test("translatePgToMssql passes through plain SELECT unchanged (after bracket conversion)", () => {
  const sql = `SELECT [id] FROM [users] WHERE [id] = @p1`;
  const result = translatePgToMssql(sql);
  // No further mutations expected
  assert.equal(result, sql);
});
