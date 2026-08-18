---
name: Sealed publications (Published *)
description: Invariant for the Published * sealed state — every publication-mutating route must enforce it
---
Publications with status `Published *` are sealed/final.

**Rule:** any new server route that mutates a publication or its author links must reject (403) or skip sealed records; only `POST /api/publications/:id/revert-final` (officer-only) unseals. Setting `Published *` is officer-only and requires the no-issues checklist (journal, date, DOI/PMID, authors, abstract, linked SDR, ≥1 internal author) — mirrored client-side in `getPubIssues`.

**Why:** review found the seal was bypassable via author-link, bulk, link-import, and merge routes; guarding only the generic PATCH is insufficient.

**How to apply:** when adding publication-mutating endpoints, load the record and check `status === 'Published *'` first. Batch operations should skip-and-report rather than fail the whole batch. Demo user id is 0 — use `== null` checks, not truthiness.
