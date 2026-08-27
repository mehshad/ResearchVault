---
name: Outcome Office matrix access
description: Shared access-matrix policy for the Outcome dashboard and operational workflows.
---

The Outcome dashboard and Outcome Office workflows intentionally share the `outcome-office` access-matrix permission rather than having separate controls.

**Why:** The user chose one shared control and expects the matrix—not a parallel hard-coded role list—to be authoritative for both pages.

**How to apply:** `hide` denies both pages, `view` allows read-only access, and `edit` allows workflow changes. Keep the client route wrappers, sidebar visibility, dashboard reads, and workflow APIs aligned with this one cell; administrators retain their standard bypass.