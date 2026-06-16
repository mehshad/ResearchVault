---
name: Publications literal routes must precede /:id
description: Why new /api/publications/<literal> endpoints must be registered before the :id param route.
---

Any new literal `GET /api/publications/<name>` route (e.g. `author-counts`, `author-map`, `needs-author-fix`) MUST be registered in `server/routes.ts` BEFORE `GET /api/publications/:id`.

**Why:** Express matches in registration order. If a literal route is added after `:id`, the param route swallows it and returns 400 "Invalid publication ID" (since the literal name isn't a number). This silently breaks the frontend (e.g. author-counts fell through and every publication showed "No internal users linked"). It has bitten this codebase more than once.

**How to apply:** When adding a new publications sub-path, place it next to the other literal publications routes (the author-counts / needs-author-fix cluster), not after the `:id` handler. Also remember a running dev server with stale code will exhibit the same 400 symptom even when the source is correct — restart the workflow before debugging further.
