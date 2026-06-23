-- Migration: 20260616_align_constraint_names.sql
-- Aligns DB constraint/index names with what Drizzle (drizzle-kit push) expects,
-- so `drizzle-kit push --force` stays a non-interactive no-op and never hits the
-- "add unique constraint -> truncate?" TTY prompt.
--
-- Root cause: earlier raw-SQL migrations created unique constraints with the
-- Postgres-default `<table>_<col>_key` name and inline FKs named `<...>_fkey`,
-- while Drizzle generates `<table>_<col>_unique` and `<...>_fk`. It also expects
-- `ownership_overrides` uniqueness as an index (`unique_module_relationship`),
-- not a constraint. This migration renames/converts those objects in place.
--
-- Idempotent: every step is guarded so re-running is safe on already-aligned DBs.

-- ─── role_groups: name unique constraint ─────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_groups_name_key')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_groups_name_unique') THEN
    ALTER TABLE role_groups RENAME CONSTRAINT role_groups_name_key TO role_groups_name_unique;
  END IF;
END $$;

-- ─── user_role_assignments: composite unique + FK names ──────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_role_assignments_user_id_role_group_id_key')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_role_assignments_user_id_role_group_id_unique') THEN
    ALTER TABLE user_role_assignments
      RENAME CONSTRAINT user_role_assignments_user_id_role_group_id_key
      TO user_role_assignments_user_id_role_group_id_unique;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_role_assignments_user_id_fkey')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_role_assignments_user_id_users_id_fk') THEN
    ALTER TABLE user_role_assignments
      RENAME CONSTRAINT user_role_assignments_user_id_fkey
      TO user_role_assignments_user_id_users_id_fk;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_role_assignments_role_group_id_fkey')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_role_assignments_role_group_id_role_groups_id_fk') THEN
    ALTER TABLE user_role_assignments
      RENAME CONSTRAINT user_role_assignments_role_group_id_fkey
      TO user_role_assignments_role_group_id_role_groups_id_fk;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_role_assignments_assigned_by_fkey')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_role_assignments_assigned_by_users_id_fk') THEN
    ALTER TABLE user_role_assignments
      RENAME CONSTRAINT user_role_assignments_assigned_by_fkey
      TO user_role_assignments_assigned_by_users_id_fk;
  END IF;
END $$;

-- ─── ownership_overrides: constraint -> unique index ─────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ownership_overrides_module_relationship_key') THEN
    ALTER TABLE ownership_overrides DROP CONSTRAINT ownership_overrides_module_relationship_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS unique_module_relationship
  ON ownership_overrides (module, relationship);
