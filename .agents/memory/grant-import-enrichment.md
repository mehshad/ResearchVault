---
name: Grant import enrichment
description: Defines non-destructive behavior when a more complete grant row is imported again.
---

Grant imports match records by normalized, case-insensitive project number. Blank cells on an existing grant mean “leave unchanged,” while the explicit `CLEAR` sentinel is required to remove a supported value. Collaborator and co-investigator lists merge case-insensitively, preserve existing order, append only new entries, and remain idempotent on repeated imports.

**Why:** More complete legacy masterfiles often repeat the same grant with extra people or metadata. Replacing arrays or treating blanks as null would silently discard previously captured information.

**How to apply:** Keep this behavior aligned across every grant import surface. New scalar values may enrich/update the matched record; blanks preserve it; explicit clearing remains intentional; list fields use stable case-insensitive union semantics.