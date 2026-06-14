# Threat Model

## Project Overview

Q-BRIDGE is a full-stack research governance portal for IRB, IBC, grants, contracts, publications, scientists, and related institutional records. The production application is a React/Vite frontend served by an Express/TypeScript backend with PostgreSQL-backed sessions and data storage, plus object storage for uploaded documents and optional LDAP/OIDC authentication.

This scan treats the publicly deployed Replit app as production-relevant because the live deployment is public. Repository documentation still describes Replit deployments as using demo auth, but the current public deployment reports `{"mode":"local","ssoEnabled":false}` from `/api/auth/config`, so the threat model cannot rely on demo-only assumptions. In practice, the public internet can still reach most sensitive routes because server-side authorization is sparse.

## Assets

- **Research governance records** — IRB/IBC applications, grants, contracts, projects, publications, scientist profiles, and workflow comments. These contain sensitive institutional and personnel information and drive compliance decisions.
- **User accounts and sessions** — local passwords, session cookies, LDAP/OIDC-linked accounts, and role assignments. Compromise enables impersonation and unauthorized changes.
- **Uploaded documents** — certificates, protocol files, contract attachments, and other stored objects. These may contain PII, regulated research content, or internal documents.
- **Administrative configuration** — system configuration records such as OCR provider settings and API keys, role-permission mappings, and user-role management endpoints.
- **Application secrets and external-service privileges** — database credentials, session secret, object-storage access, LDAP bind credentials, OIDC client secret, OCR provider key, and outbound fetch capability.

## Trust Boundaries

- **Browser to Express API** — every client request crosses from an untrusted browser into the backend. The server must not trust client-side role selection, hidden UI, or local storage state.
- **Express API to PostgreSQL** — the backend has broad read/write access to sensitive records and session state.
- **Express API to object storage** — the backend can mint upload URLs, read private objects, and proxy file downloads.
- **Express API to external services** — the backend can contact OCR.space, PubMed, Crossref, LDAP, and OIDC providers. User-controlled inputs that influence those requests are high risk.
- **Unauthenticated to authenticated/admin surfaces** — the app has routes that should be public, staff-only, reviewer-only, or admin-only. Those boundaries must be enforced server-side.
- **Deployment-mode boundary** — the code supports `local`, `ldap`, `oidc`, and documented `demo` modes; the real runtime mode may differ from repo documentation, so scans must verify live behavior instead of trusting comments alone.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/auth.ts`, `server/routes.ts`
- **Highest-risk code areas:** auth/session handling in `server/auth.ts`; broad route surface in `server/routes.ts`; upload/download logic in `server/objectStorage.ts`, `server/localObjectStorage.ts`, and `/objects/*`; OCR and import flows in `server/routes.ts`
- **Public vs authenticated vs admin surfaces:** most `/api/*` handlers live in `server/routes.ts`; auth helpers exist but are only sparsely applied; client-side role emulation exists and is not authoritative
- **Usually dev-only / lower-priority areas:** `scripts/`, Vite/dev-banner behavior, TypeScript suppression comments, and local tooling unless invoked from production routes

## Threat Categories

### Spoofing

The app supports `demo`, `local`, `ldap`, and `oidc` auth modes. The backend must ensure production deployments do not silently bypass authentication for sensitive routes, session users cannot be forged, and privileged role changes are restricted to true administrators. Client-side role switching and UI-only permissions must never be treated as proof of identity or privilege.

### Tampering

Attackers must not be able to create, edit, delete, or transition research, compliance, contract, settings, or permission records without server-side authorization. File uploads and workflow actions must be tied to an authorized user and validated on the server rather than relying on frontend checks.

### Information Disclosure

Sensitive personnel records, regulatory submissions, uploaded documents, internal comments, and system configuration data must not be readable by unauthenticated users or by users outside the allowed role. Private object URLs, signed upload flows, and OCR/import helpers must not become alternate read channels for restricted data.

### Denial of Service

Public endpoints that trigger OCR, large imports, bulk exports, or expensive searches must not be abusable without bounds. Authentication endpoints should resist password spraying and brute force. File and request-size handling must avoid unbounded resource consumption.

### Elevation of Privilege

The highest-risk failure mode in this project is broken server-side authorization: a low-privilege or anonymous user gaining access to admin/configuration/document workflows through missing middleware, exposed object paths, upload/download flaws, or file-processing helpers. Database writes, object access, role changes, external-account binding, and configuration updates must all be enforced on the server, not inferred from the UI.