-- Migration: 20260831_audit_log.sql
-- Creates the audit_log table that records every important INSERT / UPDATE /
-- DELETE across all application domains.
--
-- Written by the application layer (not DB triggers) so it works identically
-- on PostgreSQL, SQLite and SQL Server, and can capture HTTP session context
-- (user, IP, route) that DB triggers cannot reach.

CREATE TABLE IF NOT EXISTS audit_log (
  id             serial PRIMARY KEY,

  -- What changed
  table_name     text    NOT NULL,
  record_id      integer,
  action         text    NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),

  -- Row snapshots (JSON)
  old_values     jsonb,          -- null on INSERT
  new_values     jsonb,          -- null on DELETE
  changed_fields jsonb,          -- string[] of keys that differ

  -- Who and when
  changed_by     integer REFERENCES users(id) ON DELETE SET NULL,
  changed_at     timestamp NOT NULL DEFAULT now(),

  -- HTTP request context (useful for security investigations)
  ip_address     text,
  user_agent     text,
  reason         text,           -- free-text rationale from the UI
  route          text            -- "PUT /api/grants/42"
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- The most common queries are:
--   1. "Show me the full history of record X in table Y"         → (table_name, record_id)
--   2. "What did user U do recently?"                            → (changed_by)
--   3. "Show all changes in the last N days"                     → (changed_at)
--   4. "Show every change that touched field F in table Y"       → GIN on changed_fields

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record
  ON audit_log (table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by
  ON audit_log (changed_by);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at
  ON audit_log (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_fields
  ON audit_log USING gin (changed_fields);

COMMENT ON TABLE audit_log IS
  'Immutable application-level audit trail. Never UPDATE or DELETE rows here.';
