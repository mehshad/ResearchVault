# Authentication & Permissions Rework Plan

**Status:** Planning — not yet started  
**Last updated:** 2026-06-14  
**Owner:** TBD

---

## Background

The current auth system has accumulated multiple structural problems identified during a full audit in June 2026. Issues span five areas: security gaps, an incoherent user model, poor UX for local-mode users, a dual/conflicting permission system, and missing session hardening. This document organises the remediation into sequenced phases so work can be picked up incrementally without blocking other delivery.

The full audit findings are captured in `threat_model.md`. This plan covers only the auth/permission rework — not the broader threat model mitigations.

---

## Current Architecture (as-is)

### Auth modes (`AUTH_MODE` env var)
| Mode | Description |
|------|-------------|
| `local` | Username + password, SHA-256 hashed (default) |
| `ldap` | LDAP bind auth; user provisioned on first login |
| `oidc` | OIDC/OAuth2 code flow; user provisioned on first login |
| `demo` | No login; a guest user is injected on every API request |

### Key files
| File | Purpose |
|------|---------|
| `server/auth.ts` | Passport strategies (local, LDAP, OIDC), session setup |
| `server/routes.ts` | `/api/auth/*` endpoints, `requireAuth` middleware |
| `server/databaseStorage.ts` | `getUser`, `createUser`, `updateUser` storage |
| `shared/schema.ts` | `users` table definition |
| `client/src/hooks/useAuth.ts` | Session state, SSO trigger, logout |
| `client/src/hooks/useCurrentUser.ts` | Role emulator — uses `DUMMY_USERS` in non-SSO mode |
| `client/src/hooks/usePermissions.tsx` | Client-side permission context |
| `client/src/contexts/ThemeContext.tsx` | `createDefaultPermissions()` — duplicate permission source |

### Known structural problems
1. **SHA-256 password hashing** — should be bcrypt (bcrypt is already in `package.json`)
2. **`SESSION_SECRET` defaults to a hardcoded string** — no startup guard
3. **LDAP injection** — search filter not sanitised against special characters
4. **OIDC session not saved before redirect** — race condition on callback
5. **`entraOid` column name** — leftover from an Azure-specific era, should be `oidc_sub`
6. **No `auth_provider` column** — can't distinguish a local user from an OIDC-provisioned one with the same email
7. **`role` stored in `users` table** — conflates authentication identity with authorisation role; role should be separate or at least clearly separated from job title
8. **No local user creation UI** — admins can't create local accounts without direct DB access
9. **No registration → link scientist flow** — new users can't link their account to an existing scientist profile
10. **OIDC errors swallowed** — callback failures silently redirect to `/`
11. **No OIDC end-session** — logout doesn't call the provider's end-session endpoint
12. **`useCurrentUser` ignores real session** — in local mode, the sidebar role selector uses `DUMMY_USERS` and never reads the logged-in user's actual role
13. **Dual permission systems** — `role_permissions` + `role_groups` tables in the DB vs `createDefaultPermissions()` in the client; they are never reconciled
14. **No server-derived permissions** — all permission checks are client-side; the server has no `requirePermission('scientists', 'edit')` middleware
15. **`requireAdmin`** — missing on many admin-only routes

---

## Phases

### Phase 1 — Security Fixes (no schema changes)
**Goal:** Close the critical security gaps without touching the data model or UX.  
**Effort:** ~1 day  
**Risk:** Low — all changes are server-side, no migrations needed

| # | Task | File(s) | Notes |
|---|------|---------|-------|
| 1.1 | Replace SHA-256 with bcrypt for password hashing and verification | `server/auth.ts`, `server/databaseStorage.ts` | Use `bcrypt` (already in deps). Existing hashes: detect by length/prefix and rehash on next login |
| 1.2 | Guard startup if `SESSION_SECRET` is the default string in production | `server/auth.ts` or `server/index.ts` | `if (NODE_ENV==='production' && secret===DEFAULT) throw` |
| 1.3 | Sanitise LDAP search filter input | `server/auth.ts` | Escape special chars per RFC 4515 before interpolating username |
| 1.4 | Save session before OIDC redirect | `server/auth.ts` OIDC callback | Call `req.session.save()` then redirect in the callback |

---

### Phase 2 — User Model Cleanup (schema migration required)
**Goal:** Make the `users` table reflect reality — one row per authenticated identity, with a clean separation between auth provider, role, and scientist profile linkage.  
**Effort:** ~2 days  
**Risk:** Medium — requires a migration and coordinated server changes

| # | Task | File(s) | Notes |
|---|------|---------|-------|
| 2.1 | Rename `entra_oid` → `oidc_sub` in schema and storage | `shared/schema.ts`, `server/databaseStorage.ts`, migration | Keep backward compat: copy values in migration |
| 2.2 | Add `auth_provider` column (`local \| ldap \| oidc \| demo`) | `shared/schema.ts`, migration | Populate from `AUTH_MODE` on user creation |
| 2.3 | Add `scientist_id` FK on `users` (nullable) | `shared/schema.ts`, migration | Links a user account to an existing scientist profile |
| 2.4 | Separate `role` from `job_title` — confirm `role` is the authorisation role and `job_title` is the HR title | `shared/schema.ts` | They are separate columns already but docs are unclear — add a comment in schema |
| 2.5 | Update storage methods to write/read new columns | `server/databaseStorage.ts` | `createUser`, `updateUser`, `getUserByOidcSub` (renamed) |

---

### Phase 3 — Local Mode UX
**Goal:** Give admins a way to create and manage local users through the UI, and let users link their account to a scientist profile.  
**Effort:** ~3 days  
**Risk:** Low — additive only, no breaking changes

| # | Task | File(s) | Notes |
|---|------|---------|-------|
| 3.1 | Local user creation API (`POST /api/users`) with `requireAdmin` guard | `server/routes.ts` | Takes username, name, email, role, temp password |
| 3.2 | Local user creation UI in Settings > Team | `client/src/components/settings/TeamManagement.tsx` | "Invite User" modal; only shown when `authConfig.mode === 'local'` |
| 3.3 | Registration → link scientist flow | new page or modal | On first login, offer to link to an existing scientist profile; sets `scientist_id` FK |
| 3.4 | Surface OIDC callback errors | `server/auth.ts`, `client/src/pages/auth/login.tsx` | Pass error code in redirect query param; show human-readable message |
| 3.5 | OIDC end-session on logout | `server/routes.ts` `/api/auth/logout` | Read `id_token_hint` from session; redirect to `end_session_endpoint` if configured |

---

### Phase 4 — Unified Permissions
**Goal:** Make the server the single source of truth for permissions; eliminate the client-side `createDefaultPermissions()` and the broken `useCurrentUser` role-emulator in local mode.  
**Effort:** ~3–4 days  
**Risk:** Medium — touches permission checks across many components

| # | Task | File(s) | Notes |
|---|------|---------|-------|
| 4.1 | Add `GET /api/me/permissions` endpoint — returns the logged-in user's effective permission map | `server/routes.ts` | Reads from `role_permissions` + `role_groups` joined on the user's role |
| 4.2 | Replace `createDefaultPermissions()` with the API response | `client/src/contexts/ThemeContext.tsx`, `client/src/hooks/usePermissions.tsx` | Query on session load; cache in context |
| 4.3 | Fix `useCurrentUser` in local mode — return the real session user, not a dummy | `client/src/hooks/useCurrentUser.ts` | In non-SSO mode, read from `useAuth()` session; only use the role-switcher dropdown in `demo` mode |
| 4.4 | Add server-side `requirePermission(navItem, level)` middleware | `server/routes.ts` or new `server/middleware/permissions.ts` | Used to gate write endpoints; reads from `role_permissions` by session user's role |
| 4.5 | Apply `requirePermission` to key mutating routes (scientists, programs, IRB, etc.) | `server/routes.ts` | Start with the highest-risk entities |
| 4.6 | Remove or gate the standalone `/scientists/role-access-config` route | `client/src/App.tsx` | Already redirects to `/settings#access-control`; confirm redirect works end-to-end |

---

### Phase 5 — Session Hardening
**Goal:** Reduce session-related attack surface.  
**Effort:** ~1 day  
**Risk:** Low

| # | Task | File(s) | Notes |
|---|------|---------|-------|
| 5.1 | Rename session cookie from default `connect.sid` to something app-specific | `server/auth.ts` session config | `name: 'rv.sid'` |
| 5.2 | Invalidate sessions on role change | `server/routes.ts` role-update endpoint | Call `req.session.destroy()` and issue a new session |
| 5.3 | Add OIDC discovery document TTL / cache | `server/auth.ts` | Re-fetch issuer metadata on a schedule rather than only at startup |
| 5.4 | Apply `requireAdmin` to all admin-only routes | `server/routes.ts` | Audit all routes against the role matrix; tag each with its minimum required permission level |
| 5.5 | Add `SameSite=Lax` and `Secure` cookie flags in production | `server/auth.ts` session config | Conditional on `NODE_ENV === 'production'` |

---

## Sequencing Rationale

```
Phase 1 (security) → can start immediately, no dependencies
Phase 2 (schema)   → prerequisite for Phase 3 and Phase 4
Phase 3 (local UX) → depends on Phase 2 columns; independent of Phase 4
Phase 4 (perms)    → depends on Phase 2; can be parallelised with Phase 3
Phase 5 (hardening)→ can be done any time after Phase 1; some tasks need Phase 4 done
```

Recommended delivery order for a single team: **1 → 2 → 3 + 4 (parallel) → 5**

---

## Out of Scope (tracked elsewhere)

- Full audit trail / change logging
- Email notification system
- Reports module analytics
- File upload hardening (tracked in `threat_model.md`)

---

## Open Questions

| Question | Decision needed from |
|----------|---------------------|
| Should `demo` mode be completely removed from prod builds, or remain as a runtime flag? | Architecture / deployment |
| Should role assignment be per-institution (multi-tenant) or global? | Product |
| Self-registration allowed, or admin-invite only? | Product / security policy |
| Which OIDC providers need end-session support? (some don't expose `end_session_endpoint`) | Deployment team |
| Rehash-on-login for existing SHA-256 passwords: acceptable window, or force password reset? | Security policy |
