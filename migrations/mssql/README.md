# SQL Server Migrations

This directory contains T-SQL migration scripts for Microsoft SQL Server deployments.

## Why separate scripts?

PostgreSQL and SQL Server differ in several key areas that prevent sharing migration files:

| Feature | PostgreSQL | SQL Server (T-SQL) |
|---|---|---|
| Auto-increment | `SERIAL` / `BIGSERIAL` | `INT IDENTITY(1,1)` |
| Text type | `TEXT` | `NVARCHAR(MAX)` |
| Boolean | `BOOLEAN` | `BIT` |
| Timestamps | `TIMESTAMP` / `TIMESTAMPTZ` | `DATETIME2` |
| JSON | `JSON` / `JSONB` | `NVARCHAR(MAX)` + JSON functions |
| Arrays | `integer[]` / `text[]` | Stored as JSON strings |
| Identifiers | `"double_quoted"` | `[bracket_quoted]` |
| Upsert | `ON CONFLICT DO UPDATE` | `MERGE` statement |
| Returning rows | `RETURNING *` | `OUTPUT INSERTED.*` |
| Pagination | `LIMIT n OFFSET m` | `OFFSET m ROWS FETCH NEXT n ROWS ONLY` |
| UUID generation | `gen_random_uuid()` | `NEWID()` |
| Current timestamp | `now()` | `GETUTCDATE()` |

## Running migrations against your SQL farm

```sh
# Using sqlcmd (standard SQL Server CLI)
sqlcmd -S your-server -d researchvault -U your-user -P your-password \
  -i migrations/mssql/0001_initial_schema.sql

# Or in Docker for the bundled container
docker compose -f docker-compose.yml -f docker-compose.mssql.yml \
  exec sqlserver \
  /opt/mssql-tools18/bin/sqlcmd -S localhost -U SA -P "$SA_PASSWORD" \
  -C -d researchvault -i /migrations/mssql/0001_initial_schema.sql
```

## Migration order

Run in this order on a fresh database:

1. `0001_initial_schema.sql`    — All core tables
2. `0002_indexes.sql`           — Performance indexes
3. `0003_views.sql`             — Computed views (optional)

For incremental updates (adding columns etc.) the standard PostgreSQL `ALTER TABLE`
syntax is largely compatible; the main difference is that `IF NOT EXISTS` is not
supported for `ALTER TABLE ADD COLUMN` in older SQL Server versions — use the
`COL_LENGTH` check pattern shown in the scripts instead.
