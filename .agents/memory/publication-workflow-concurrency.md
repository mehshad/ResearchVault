---
name: Publication workflow concurrency
description: Concurrency rule for publication status transitions and their audit history.
---

Publication status transitions must condition the write on the source status that was authorized, and commit related field changes, the new status, and history in one transaction.

**Why:** Validation followed by an unconditional update lets a stale request overwrite a newer officer action, such as invalidation or final approval, erasing the active reason and bypassing the dedicated workflow.

**How to apply:** Every route that changes publication status must use compare-and-swap semantics, return a conflict when the source status changed, and avoid separate field/status/history writes.