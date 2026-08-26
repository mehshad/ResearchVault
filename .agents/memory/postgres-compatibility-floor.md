---
name: PostgreSQL compatibility floor
description: Keep runtime SQL compatible with the project’s documented PostgreSQL 14 minimum.
---

Do not use PostgreSQL functions introduced after version 14 in application queries unless the project’s supported database version is deliberately raised first. For untrusted JSON date strings, validate and bucket them in application code instead of relying on newer SQL input-validation helpers.

**Why:** Supported installations may run PostgreSQL 14 or 15 even when development happens against a newer server, so a newer helper can pass locally and fail in production.

**How to apply:** Before introducing an unfamiliar PostgreSQL helper, verify its first supported version against the project’s documented database floor. Prefer long-supported SQL primitives or safe application-side parsing when compatibility is uncertain.