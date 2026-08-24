---
name: Bulk import preview integrity
description: The consistency contract for preview-confirm-apply workbook imports.
---

Bulk import apply must rebuild and verify the signed preview inside the same database transaction that performs the writes, after locking every table read or changed by that section. Business-key matching must use the same case-insensitive semantics during preview and apply.

**Why:** A pre-transaction fingerprint check leaves a verification-to-write race, and case-insensitive preview matching paired with exact-case updates can report success without changing the intended row.

**How to apply:** Preserve the locked, single-transaction verification boundary when adding sheets or relationships. Add every newly read table to the section lock set and use consistent normalized matching for previews, duplicate checks, and writes.