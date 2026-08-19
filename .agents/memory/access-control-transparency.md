---
name: Access-control transparency
description: How non-configurable authorization rules should appear in Settings.
---

Show important server-enforced authorization rules in the Access Control section even when administrators cannot configure those rules there. Clearly separate this read-only catalogue from editable navigation and ownership permissions.

**Why:** Administrators need to understand the system's effective access behavior without searching the code, while safety-critical restrictions should remain enforced by the server rather than becoming casually configurable.

**How to apply:** Whenever a new role restriction, ownership requirement, workflow guard, or eligibility rule is added in code, add or update its plain-language entry in the read-only Access Control catalogue.