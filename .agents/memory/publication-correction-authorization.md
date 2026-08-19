---
name: Publication correction authorization
description: Permission rule for publication issue links and researcher correction flows.
---

Any researcher-facing workflow that points to publication corrections must enforce the same ownership policy on the server: ordinary researchers act only on their own linked records or a verified self-link, while Outcome Office roles retain organization-wide correction authority. Name-only matches are suggestions, and ambiguous abbreviated names require office confirmation.

**Why:** Publication detail controls and sealed-record checks can make a flow look restricted while unsealed mutation endpoints remain broader than the UI. Adding actionable score links exposed this mismatch and could have turned a data-quality feature into cross-record editing access.

**How to apply:** When adding or changing publication fix actions, audit every mutation the action can reach (details, status, author links, creation, and deletion), its server authorization, and the matching UI state together. Keep `Published *` sealed until the officer-only revert action.