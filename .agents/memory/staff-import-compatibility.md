---
name: Staff import compatibility
description: Compatibility rules for lossless staff spreadsheet round trips and reporting relationships.
---

Staff spreadsheet format changes must preserve newer fields when older files omit their columns and continue accepting renamed legacy headers. Manager references must be compared and resolved against the intended final imported identity set, including newly inserted people and changed emails.

**Why:** Comparing manager emails only to current database identities can classify a changed reporting line as unchanged, while dropping old headers can silently clear profile data.

**How to apply:** When changing staff import/export columns or matching rules, test an actual prior-format file, omitted new columns, a newly inserted manager, and a manager whose email changes in the same import.