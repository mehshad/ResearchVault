---
name: Grant lifecycle integrity
description: Durable rules for keeping grant status, award history, dates, and SDR links consistent.
---

Treat `awarded` as a lasting funding milestone, not as a synonym for the current
status. Awarded, Active, and Completed imply that milestone; Active and
Completed require a real start date. Cancelled can retain the milestone.

Grant lifecycle fields and the complete intended SDR-link set must be saved as
one atomic operation. Direct link and unaward paths must serialize on the grant
row, with database constraints/triggers as the final guard. Never delete SDR
links merely to make an inconsistent award change pass.

**Why:** Separate grant and link requests can partially save or race, leaving an
unawarded grant linked to SDRs. Historical links are evidence that the award
milestone was reached and must be preserved during compatibility repairs.

**How to apply:** Route create, edit, import, and direct API changes through the
shared lifecycle policy. Reject award clearing until the intended SDR set is
empty, reconcile that set transactionally, and keep database checks aligned
with the shared status vocabulary and date rules.