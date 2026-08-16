---
name: Demo mode bypasses auth guards in dev
description: AUTH_MODE=demo auto-injects a Management session, so anonymous curl passes role middleware
---

The dev environment runs with `AUTH_MODE=demo`. `demoBannerMiddleware` injects a session user with role "Management" (configurable via DEMO_ROLE) for every `/api` request that lacks one.

**Why:** An anonymous `curl` returning 200 on a route guarded by `requireAuth`/`requirePublicationOfficer` does NOT mean the guard is missing or broken — demo mode intentionally opens the whole app.

**How to apply:** When verifying authorization changes in dev, read the middleware chain instead of trusting anonymous-request status codes; guards only bite in local/ldap/oidc modes.
