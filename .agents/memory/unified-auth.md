---
name: Unified multi-provider auth
description: AUTH_MODE identity rules and the database-authoritative session policy
---

# Unified auth (AUTH_MODE)

One auth system selectable via `AUTH_MODE` env: `local` (default) | `demo` | `ldap` | `oidc`.
Only `demo` uses client-side role emulation. Local, LDAP, and OIDC use the real
authenticated session user.

**Demo authorization has two identities by design:** the selected demo persona
is held in the client current-user provider, while the server session remains
the fixed `Management` demo user.
**Why:** role switching is a preview feature and does not rewrite the server
session. Strict inline `admin`/`superadmin` checks therefore reject a selected
Super Admin persona.
**How to apply:** client page guards use the effective current user; protected
demo APIs use the shared demo-aware authorization middleware. Real auth modes
still require the actual server role.

**`/api/auth/config` shape is a superset on purpose:** `{ mode, ssoEnabled, provider, providerName }`.
`ssoEnabled` (= mode is ldap||oidc) is kept so existing consumers — `App.tsx`,
`useCurrentUser.tsx`, `Sidebar.tsx`, settings — keep working unchanged; `mode`/`providerName`
are the new fields the login page uses.

**`users.entra_oid` is reused as the generic external subject id** (OIDC `sub`), not just Entra.
**Why:** avoids a schema rename/migration churn; the existing migration
`migrations/20260525_add_entra_auth_columns.sql` already adds it (unique, nullable — Postgres
unique allows multiple NULLs, so LDAP users with no subject id are fine).
**How to apply:** external-user lookup order is subjectId → email → username;
new users start in the restricted `user` role until an administrator assigns
access.

OIDC provider (`server/authProviders/oidc.ts`) uses openid-client v6 with PKCE **and** state+nonce,
plus `buildEndSessionUrl` for provider logout. Callback URL is rebuilt from the configured
`OIDC_REDIRECT_URI` (not req.protocol/host) to stay correct behind the reverse proxy.
Entra is just a configured issuer: `https://login.microsoftonline.com/<tenant>/v2.0`.
