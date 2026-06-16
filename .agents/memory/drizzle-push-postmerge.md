---
name: drizzle-kit push + post-merge setup
description: Why post-merge `drizzle-kit push --force` hangs/times out on this repo and how to keep it non-interactive.
---

# drizzle-kit push must stay non-interactive for post-merge setup

The post-merge setup script (`scripts/post-merge.sh`) runs `npx drizzle-kit push --force`.
Two independent things make it fail; both must hold for merges to succeed.

## 1. DB object names must match Drizzle's generated names (or push prompts)
`--force` does NOT suppress the "about to add `<x>_unique` constraint to a table
with N rows — truncate?" prompt. With stdin closed (post-merge), that prompt
throws "Interactive prompts require a TTY" and the merge fails.

**Why:** raw-SQL migrations created unique constraints as the Postgres default
`<table>_<col>_key` and inline FKs as `<...>_fkey`, but Drizzle expects
`<table>_<col>_unique` and `<...>_<reftable>_<refcol>_fk`. Drizzle also models
some uniqueness as a *unique index* (e.g. `ownership_overrides` →
`unique_module_relationship`), not a constraint. Any mismatch makes push think
the object is missing and try to (re)create it → prompt.

**How to apply:** keep DB names aligned to the Drizzle schema. The idempotent
fixups live in `migrations/20260616_align_constraint_names.sql` (rename `_key`→
`_unique`, rename `_fkey`→`_fk`, convert the ownership_overrides constraint to a
unique index). Any table referenced by server code but missing from
`shared/schema.ts` (e.g. `user_role_assignments`, used by SSO authz) must be
ADDED to the schema, or push will try to DROP it.

## 2. Post-merge timeout must be generous
A clean push against Neon takes ~78s (the "Pulling schema from database" step is
slow). The default post-merge `timeoutMs` of 20000 is far too short. It is set to
180000 via `setPostMergeConfig`. Don't lower it.

**Quirk:** even a fully-aligned DB reports "Changes applied" (not "No changes
detected") on every push — drizzle-kit re-emits a few cosmetic statements. That
is harmless: it exits 0 and never prompts. Don't chase it.
