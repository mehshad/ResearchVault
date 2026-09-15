# ResearchVault

A research management platform for tracking IRB/IBC applications, publications, patents, grants, contracts, and research activities.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Configuration Reference](#configuration-reference)
4. [Authentication Modes](#authentication-modes)
   - [Demo (no login)](#demo-mode)
   - [Local accounts](#local-mode)
   - [LDAP / Active Directory](#ldap-mode)
   - [OpenID Connect (Azure AD, Okta, Google…)](#oidc-mode)
5. [Data Storage](#data-storage)
6. [Managing Users](#managing-users)
7. [Updating](#updating)
8. [Development Setup](#development-setup)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Requirement | Minimum version | Notes |
|-------------|----------------|-------|
| Docker Engine | 24+ | [Install guide](https://docs.docker.com/get-docker/) |
| Docker Compose | v2 (plugin) | Bundled with Docker Desktop; `docker compose version` to verify |
| Git | any | To clone the repository |

> **No other software is required.** PostgreSQL runs inside Docker.

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/mehshad/ResearchVault.git
cd ResearchVault

# 2. Run the setup script
#    First run: creates .env from the template and exits so you can edit it.
./setup.sh

# 3. Open .env and set at minimum:
#      POSTGRES_PASSWORD   — database password
#      SESSION_SECRET      — long random string (e.g. openssl rand -hex 32)
#      APP_URL             — public URL users will access (e.g. https://rv.hospital.org)
#      AUTH_MODE           — local | ldap | oidc (see below; DEMO_LOGIN=1 adds demo sign-in)
nano .env

# 4. Re-run to build and start
./setup.sh
```

The app will be available at the `APP_URL` you configured (default `http://localhost:5000`).

---

## Configuration Reference

All settings live in a single `.env` file. Copy `.env.example` to get started:

```bash
cp .env.example .env
```

### Core settings

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_URL` | `http://localhost:5000` | Public URL of the app. Used for OIDC redirect URIs and file upload links. |
| `APP_PORT` | `5000` | Host port the app is exposed on. |
| `POSTGRES_PASSWORD` | `postgres` | **Change this in production.** |
| `SESSION_SECRET` | *(placeholder)* | Secret used to sign session cookies. Use a long random string. |

### Storage paths

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_DATA_DIR` | `./data/postgres` | Host directory for PostgreSQL data files. |
| `UPLOADS_DATA_DIR` | `./data/uploads` | Host directory for uploaded documents and attachments. |

Both directories are created automatically by `setup.sh`. Point them at any path on the host — a dedicated disk, NAS mount, or backup-managed location.

```bash
# Example: store data on a dedicated volume mounted at /mnt/data
POSTGRES_DATA_DIR=/mnt/data/researchvault/postgres
UPLOADS_DATA_DIR=/mnt/data/researchvault/uploads
```

---

## Authentication Modes

Set `AUTH_MODE` in `.env` to one of: `demo`, `local`, `ldap`, `oidc`.

### Demo sign-in (any mode)

There is no demo *mode* any more: every request goes through the same authentication and the same guards. For demonstrations, seed the demo accounts (see *Seeding demo data* below) and turn on password-less sign-in for them:

```bash
DEMO_LOGIN=1
```

The login page then offers an account picker — one account per access role, from `demo.investigator` to `demo.superadmin` — and the sidebar lets you switch between them. Only accounts marked `auth_provider = 'demo'` can be entered this way; real accounts still sign in normally. Leave `DEMO_LOGIN` unset in production.

---

### Local mode

```bash
AUTH_MODE=local
```

Users log in with a username and password stored in the application database. Accounts are managed through the admin UI or directly in the database.

**Create the first admin account** after the app starts:

```bash
# Connect to the running database
docker compose exec postgres psql -U postgres researchvault

-- Insert an admin user (password is SHA-256 of your chosen password)
INSERT INTO users (username, password, name, email, role)
VALUES (
  'admin',
  encode(sha256('your-password'::bytea), 'hex'),
  'Administrator',
  'admin@hospital.org',
  'Management'
);
\q
```

---

### LDAP mode

```bash
AUTH_MODE=ldap
```

Authenticates users against an LDAP server or Active Directory. On first login, a local user record is created automatically.

```bash
LDAP_URL=ldap://ad.hospital.org:389
LDAP_BIND_DN=cn=svc-researchvault,ou=service-accounts,dc=hospital,dc=org
LDAP_BIND_PASSWORD=service-account-password
LDAP_SEARCH_BASE=dc=hospital,dc=org
LDAP_SEARCH_FILTER=(sAMAccountName={{username}})

# Field mappings (Active Directory defaults shown)
LDAP_USER_FIELD_USERNAME=sAMAccountName
LDAP_USER_FIELD_NAME=displayName
LDAP_USER_FIELD_EMAIL=mail

# TLS (set to true for ldaps:// or STARTTLS)
LDAP_TLS=false
LDAP_TLS_REJECT_UNAUTHORIZED=true
```

**OpenLDAP example:**

```bash
LDAP_URL=ldap://ldap.hospital.org:389
LDAP_BIND_DN=cn=admin,dc=hospital,dc=org
LDAP_SEARCH_FILTER=(uid={{username}})
LDAP_USER_FIELD_USERNAME=uid
LDAP_USER_FIELD_NAME=cn
LDAP_USER_FIELD_EMAIL=mail
```

---

### OIDC mode

```bash
AUTH_MODE=oidc
```

Single sign-on via any OpenID Connect provider. Users see a single "Sign in with [Provider]" button.

#### Azure Active Directory

```bash
AUTH_MODE=oidc
OIDC_ISSUER_URL=https://login.microsoftonline.com/<tenant-id>/v2.0
OIDC_CLIENT_ID=<application-client-id>
OIDC_CLIENT_SECRET=<client-secret>
OIDC_REDIRECT_URI=https://rv.hospital.org/api/auth/callback
OIDC_PROVIDER_NAME=Hospital SSO
```

Register a **Web** app in Azure AD, set the redirect URI to `https://rv.hospital.org/api/auth/callback`, and grant `openid`, `profile`, `email` permissions.

#### Okta

```bash
OIDC_ISSUER_URL=https://<domain>.okta.com/oauth2/default
OIDC_CLIENT_ID=<client-id>
OIDC_CLIENT_SECRET=<client-secret>
OIDC_REDIRECT_URI=https://rv.hospital.org/api/auth/callback
OIDC_PROVIDER_NAME=Okta
```

#### Google Workspace

```bash
OIDC_ISSUER_URL=https://accounts.google.com
OIDC_CLIENT_ID=<client-id>.apps.googleusercontent.com
OIDC_CLIENT_SECRET=<client-secret>
OIDC_REDIRECT_URI=https://rv.hospital.org/api/auth/callback
OIDC_PROVIDER_NAME=Google
```

#### Keycloak

```bash
OIDC_ISSUER_URL=https://keycloak.hospital.org/realms/<realm>
OIDC_CLIENT_ID=researchvault
OIDC_CLIENT_SECRET=<client-secret>
OIDC_REDIRECT_URI=https://rv.hospital.org/api/auth/callback
OIDC_PROVIDER_NAME=Hospital SSO
```

#### Custom claim mappings

If your provider uses non-standard claim names:

```bash
OIDC_CLAIM_USERNAME=preferred_username   # default
OIDC_CLAIM_NAME=name                     # default
OIDC_CLAIM_EMAIL=email                   # default
```

---

## Data Storage

All persistent data lives in two host directories:

| What | Variable | Default location |
|------|----------|-----------------|
| Database files | `POSTGRES_DATA_DIR` | `./data/postgres` |
| Uploaded files | `UPLOADS_DATA_DIR` | `./data/uploads` |

### Backup

There are two layers, and they are not interchangeable.

**The database dump is the backup.** It holds everything the application stores, including the parts the workbooks below leave out. `pg_dump` takes a consistent snapshot on its own, so the app can keep running. Uploaded files live outside the database in `UPLOADS_DATA_DIR`; back them up alongside.

```bash
# Database
docker compose exec postgres pg_dump -U postgres researchvault > backup-$(date +%Y%m%d).sql

# Uploaded files (this directory also holds the daily bulk-data archives)
tar -czf uploads-$(date +%Y%m%d).tar.gz -C $UPLOADS_DATA_DIR .
```

**The bulk-data archive is a second, readable copy.** Every day at 02:00 (Asia/Riyadh) the app writes a ZIP of seven Excel workbooks — one per section — to `UPLOADS_DATA_DIR/bulk-data-archives/` and keeps the newest 30. An administrator can also generate or download one at any time under **Settings → Data Import & Export → Export all**. It covers every table the application uses and restores through the interface, section by section, with a preview before anything is written — so it is the right tool for moving data between environments, repairing one section, or reading the data without the app. It is not a substitute for the dump:

- It does not carry the PMO application forms (RA-200 / RA-205A), the IRB and IBC working records (submissions, documents, comments, rooms, board members), the PDF import log, uploaded files themselves, or any credential (passwords, sessions, the CITI API key). The same list is shown next to the workbooks in the interface.
- The scheduler runs inside the `app` container. While `app` is stopped no archive is written, and an archive is only as fresh as the last 02:00 at which the app was running.

The demo stack (`postgres-demo`, `app-demo`) uses its own volumes (`pg-demo-data`, `demo-uploads`). Nothing above touches them and they need no backup.

### Restore

**From a database dump** — the normal path. Stop the app first so nothing writes during the restore; the migrations that run at the next start are idempotent.

```bash
docker compose stop app
cat backup-20240101.sql | docker compose exec -T postgres psql -U postgres researchvault
tar -xzf uploads-20240101.tar.gz -C $UPLOADS_DATA_DIR
docker compose start app
```

**From the bulk-data archive** — a new environment, or one section of an existing one. This sequence has been run end to end; the order and the account step are the two things that are not obvious.

1. Start the stack on an empty database. The entrypoint creates the schema by running the migration list.
2. Get one account that can sign in. The User Accounts sheet carries no credentials, so a database restored from workbooks alone has **nobody who can log in**.
   - Local mode: create the first administrator as shown under *Local mode* above, or — after restoring Access Control — set a password on one of the restored accounts: `UPDATE users SET password = encode(sha256('your-password'::bytea), 'hex') WHERE username = '…';`
   - LDAP / OIDC: sign in as `SUPER_ADMIN_EMAIL`; that account is promoted on login.
3. Restore the sections in this order under **Settings → Data Import & Export → Bulk data workbook** (choose the section, upload its workbook from the ZIP, review the preview, apply): **Research Management → Access Control → PMO Office → Research Office → Research Output → Research Compliance → Platform**. Each later section refers to staff, accounts, programmes or SDRs created by an earlier one. A preview must show no errors before it can be applied; a row that fails at write time is reported by sheet and row number, and ticking "Skip the rows that failed validation" imports the rest.
4. Link the restoring account to its staff profile (`users.scientist_id`, or Settings → Users) once Research Management is in: publications and certifications are only created on behalf of an account with a profile. If Research Management was applied before that link existed, apply it once more to pick up the certifications it had to skip.

---

## Managing Users

After the first login (for LDAP/OIDC), users are assigned the `Investigator` role by default. Administrators can update roles through **Settings → Role & Access Configuration** in the application UI.

Available roles: `Management`, `Investigator`, `Staff Scientist`, `Physician`, `Lab Manager`, `Postdoctoral Researcher`, `PhD Student`, `IRB Officer`, `IBC Officer`, `PMO Officer`, `Outcome Officer`, `Contracts Officer`, `Grant Officer`, `IRB Board Member`, `IBC Board Member`.

---

## Updating

```bash
# Pull the latest code
git pull

# Rebuild and restart (database migrations run automatically)
docker compose build app
docker compose up -d
```

Database schema changes are applied at container start by `docker-entrypoint.sh`, which runs the SQL files it lists under `migrations/` with `psql`. `drizzle-kit push` is never run in the image; it is a development convenience only (see below). A new table or column therefore needs a migration file **and** a line in the entrypoint's list, or it will exist in development and not in production.

Each file is run in full, and the container stops on any error other than "already exists" or a duplicate-key clash, which is what a migration reports when it has run before. So a start that fails right after `docker compose up` is usually a migration: `docker compose logs app` shows the file and the statement. Before adding a migration, replay the whole list twice against a scratch database — once empty, once again — and expect no errors on the first pass and only those two kinds on the second.

---

## Development Setup

To run the app locally without Docker:

### Requirements

- Node.js 20+
- PostgreSQL 14+ running locally (the Docker Compose file provides one on port 5432)

```bash
# Install dependencies
npm install

# Create a local .env (or set env vars directly)
cp .env.example .env
# Edit .env: set DATABASE_URL, AUTH_MODE=local and DEMO_LOGIN=1 for the easiest local dev

# Start development server (hot-reload)
npm run dev
```

The dev server runs on `http://localhost:5000`.

### Available scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot-reload |
| `npm run build` | Build for production |
| `npm start` | Run the production build |
| `npm run db:push` | Push `shared/schema.ts` to your **development** database; production uses the migration files instead |
| `npm test` | Unit tests (server, shared, client) with no database, then the component tests |
| `npm run test:integration` | The database-backed tests, against `DATABASE_URL`, with `RUN_INTEGRATION_TESTS=1` set for you |
| `npm run check` | TypeScript type-check |
| `npm run seed:demo` | Seed demo accounts and sample data (see below) |

### Seeding demo data

`npm run seed:demo` fills an empty database with one sign-in account per access role (`demo.investigator`, `demo.management`, `demo.superadmin`, ...), the default permission matrix, and a small coherent set of sample data -- organisation, staff, programs, SDRs, grants, publications, ethics and biosafety applications, contracts, facilities and certifications -- so every page has something to show. It runs against `DATABASE_URL` after the migrations.

The accounts are marked `auth_provider = 'demo'` and every one of them signs in with the password `demo`; with `DEMO_LOGIN=1` in local mode the login page also offers them as a password-less "sign in as" list.

The seed is idempotent: if any demo account already exists it prints the accounts and exits without writing. To start over, pass `--reset` with the confirmation variable set:

```bash
SEED_RESET_CONFIRM=yes npm run seed:demo -- --reset
```

`--reset` empties every table the seed writes, **including all user accounts**, before seeding again; it refuses without `SEED_RESET_CONFIRM=yes`. It never touches the `session` table or the reference lists the migrations maintain (grant statuses, agreement types, institutions).

---

## Troubleshooting

### App won't start — database not ready

The entrypoint waits for PostgreSQL automatically. If it times out, check:

```bash
docker compose logs postgres
```

### LDAP: "User not found"

Verify the search filter returns results using `ldapsearch`:

```bash
ldapsearch -H ldap://ad.hospital.org -D "cn=svc-rv,dc=hospital,dc=org" \
  -w password -b "dc=hospital,dc=org" "(sAMAccountName=testuser)"
```

### OIDC: Redirect URI mismatch

The `OIDC_REDIRECT_URI` in `.env` must exactly match the URI registered in your identity provider (including `https://` vs `http://` and trailing slashes).

### View live application logs

```bash
docker compose logs -f app
```

### Reset everything (⚠ deletes all data)

```bash
docker compose down
rm -rf ./data   # or your custom POSTGRES_DATA_DIR / UPLOADS_DATA_DIR
./setup.sh
```
