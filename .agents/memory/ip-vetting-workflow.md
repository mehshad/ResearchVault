---
name: IP vetting workflow stage
description: Distinguishes active IP-vetting work from imported unvetted publication records.
---

The active IP Vetting queue is for unvetted publications at the `Complete Draft` stage. Unvetted records in other statuses remain reviewable in the year-based backlog, but they are not ready for the vetting action.

**Why:** ORCID imports can arrive with a `Published` status even though they never passed through the internal publication workflow. Treating that status as IP-vetting readiness floods the queue and allows imported records to appear further along than they are.

**How to apply:** Default vetting views and actions to `Complete Draft`. IP approval moves the record to `Vetted for submission`; it must never seal it as `Published *`. Keep other unvetted records discoverable by year.