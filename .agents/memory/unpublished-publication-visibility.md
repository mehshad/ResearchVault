---
name: Unpublished publication visibility
description: Durable access and creator-attribution rules for unpublished publication records.
---

Unpublished publications are visible by default only to their creator, a linked internal author, a linked author's direct supervisor, or Management/admin/superadmin. Published and Published * remain public. Outcome Officers use an explicit authorized office view rather than inheriting broad access on the ordinary publications list.

**Why:** Creation history mixes user and scientist identifiers and cannot safely serve as permanent ownership. The ordinary list API is also shared with Outcome Office workflows, so implicit role-based broadening would either leak records on the main list or break the office queue.

**How to apply:** Every publication creation path must set an authoritative nullable creator user ID from the signed-in account. Merges preserve the survivor creator and only fall back deterministically when it is missing. Apply the shared visibility predicate before pagination/counting and to direct detail reads; keep office-wide reads explicit and server-authorized.