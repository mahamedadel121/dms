# DMS (Dooo)

Document Management System, phase 1: **driver expense claims**. Drivers send expense receipts through a Telegram bot. The receipts go through a configurable approval workflow (parallel steps, conditions, corrections, signatures), end with a treasury payment, produce a signed PDF, and post a journal entry to SAP. Staff work in a web app; reports, a dashboard and an audit log are included.

The project is **100% local**. There is no GitHub, no git remote, no push and no hosted CI. `pnpm ci` runs everything on this machine.

## What is in the box

| Part | Path | Port |
|---|---|---|
| Web app (Next.js 15, Arabic RTL first) | `apps/web` | 3000 |
| REST API (NestJS 11, prefix `/api/v1`) | `apps/api` | 4000 |
| Telegram bot (grammY) and driver simulator | `apps/bot` | simulator 3010, webhook 4100 (only in webhook mode) |
| Worker (jobs, PDF, SAP posting, schedules) | `apps/worker` | none |
| PostgreSQL 17 (local cluster) | `.pgdata/` | 54329 |
| Storage (receipts, PDFs, signatures) | `storage-data/` | none |

Shared logic lives in `packages/core` (domain services, no HTTP), `packages/db` (Prisma schema, migrations, seed), and `packages/shared` (constants, schemas, helpers).

Documentation:

- `docs/ARCHITECTURE.md`: components, request lifecycle, jobs, data model.
- `docs/SAP_INTEGRATION.md`: journal entry mapping, adapters, idempotency, checklist for the SAP team.
- `docs/BACKUP_RESTORE.md`: backup and restore scripts and schedules.
- `docs/ADMIN_GUIDE_AR.md`: admin guide (Arabic).
- `docs/DRIVER_GUIDE_AR.md`: driver guide (Arabic).
- `docs/HOW_TO_ADD_NEW_REQUEST_TYPE.md`: adding a request type.
- `docs/PLAN.md`, `docs/DECISIONS.md`, `docs/REQUIREMENTS.md`: design sources.

## Prerequisites

- **Windows 10 or later** (the project was built on Windows; the scripts are written for PowerShell and Git Bash).
- **Node.js 24**.
- **pnpm 11** (the repository pins `pnpm@11.28.4`). With Node's Corepack: `corepack enable`, or install with `npm install -g pnpm@11.28.4`.
- **PostgreSQL 17 binaries** (server and client tools, no installer service needed). The default folder is `C:\Program Files\PostgreSQL\17\bin`. If it is somewhere else, set `PG_BIN` in `.env`. The project starts its own cluster in `.pgdata/` on port 54329, so a PostgreSQL service is not needed.
- **Chromium for PDFs.** PDFs are rendered with Playwright. If the bundled Chromium is missing, run `pnpm exec playwright install chromium`, or set `PDF_BROWSER_CHANNEL=msedge` in `.env` to use an installed Microsoft Edge.

**Not needed locally:** Docker, Redis, MinIO. `docker-compose.yml` and `Dockerfile` are files for a future server only. They have never been run.

## Setup

From the repository root:

```powershell
copy .env.example .env          # then review the values (see below)
pnpm install
pnpm db:up                      # starts the local PostgreSQL cluster on port 54329
pnpm db:migrate                 # applies migrations and rebuilds the test template database
pnpm db:seed                    # base seed (users, roles, master data) + demo requests
```

`pnpm db:seed` creates the demo logins and the master data, then the demo requests (about 30 requests in mixed states, created through the real workflow engine).

Check the database with `pnpm db:status`. Stop it with `pnpm db:down`.

### Environment (`.env`)

`.env.example` documents every variable. The important ones:

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres@localhost:54329/dms` | Local cluster, no password (trust auth) |
| `PG_BIN` | empty (uses `C:\Program Files\PostgreSQL\17\bin`) | Folder with `pg_ctl`, `initdb`, `pg_dump`, `pg_restore` |
| `API_PORT` / `WEB_PORT` | `4000` / `3000` | |
| `JWT_SECRET`, `FILE_URL_SECRET` | dev values | Change both for any real use. With `NODE_ENV=production` the API refuses values shorter than 32 characters or starting with `dev-only`. |
| `STORAGE_ROOT` | `./storage-data` | Relative paths are relative to the repository root |
| `BOT_TOKEN` | empty | Telegram token (section below). Without it the bot does not start. |
| `BOT_MODE` | `polling` | `polling` or `webhook` |
| `SAP_ADAPTER` | `mock` | `mock`, `file` or `s4hana` (see below) |
| `PDF_BROWSER_CHANNEL` | empty | Empty = bundled Chromium; or `msedge` / `chrome` |
| `LOG_LEVEL` | `info` | |
| `SAP_S4_LOOKUP_MODE` | `odata` | `odata` or `none` (safe mode): duplicate check before re-posting |
| `SAP_S4_ODATA_URL`, `SAP_S4_CJ_URL` | empty | S/4HANA lookup and Cash Journal endpoints (`SAP_ADAPTER=s4hana` or `s4hana-cj`) |
| `STORAGE_DRIVER`, `S3_*` | `local` | `s3` needs `S3_BUCKET` (plus endpoint and keys); `S3_PRESIGNED_REDIRECT=true` redirects downloads |
| `EMAIL_DRIVER`, `SMTP_*` | `none` | `none`, `smtp` (needs `SMTP_HOST`) or `file` |
| `METRICS_TOKEN` | empty | Bearer token for `GET /metrics` (Prometheus) |
| `BOT_USERNAME`, `TELEGRAM_LINK_TTL_SEC` | empty / `900` | Telegram link command and its validity |

## Run

Everything together:

```powershell
pnpm dev
```

This starts the API, the web app and the worker. It also starts the bot if `BOT_TOKEN` is set.

Or one app at a time:

```powershell
pnpm --filter @dms/api dev       # API on http://localhost:4000 (health: /api/v1/health)
pnpm --filter @dms/web dev       # web on http://localhost:3000
pnpm --filter @dms/worker dev    # worker (no port)
pnpm --filter @dms/bot start     # bot (needs BOT_TOKEN, or use the simulator below)
```

Open **http://localhost:3000** and sign in with a demo login.

## Demo logins

Password for every account: **`Passw0rd!`**

| Username | Role | Department |
|---|---|---|
| `admin` | Super User (all permissions) | Management |
| `supervisor` | Campaign Supervisor | Fleet & Campaigns |
| `manager` | Campaign Manager | Fleet & Campaigns |
| `engineer` | Maintenance Engineer | Fleet & Campaigns |
| `shipping` | Shipping Officer | Fleet & Campaigns |
| `accountant1` | Accountant | Accounting |
| `accountant2` | Accountant | Accounting |
| `chief` | Chief Accountant | Accounting |
| `gm` | General Manager | Management |
| `treasury` | Treasury (payment step) | Treasury |

These logins exist only for development and demos. Change the passwords, or do not seed the database, on any shared machine.

Drivers `DRV001` to `DRV010` exist as submitters with phone numbers `+2010000000NN` (NN = 01 to 10). Drivers have no web login.

## Driver simulator (no Telegram needed)

```powershell
pnpm db:up
pnpm bot:sim
```

Open **http://127.0.0.1:3010**. The page is a phone-style chat that talks to the same bot code and the same database as the real bot. A request sent from the simulator is a real request: it appears in the approvers' inbox in the web app within seconds.

- Pick a driver (`DRV001` to `DRV010`), press `/start`, share the contact with the button, then use the buttons and text as a driver would. Attach photos or PDFs with the paperclip.
- Useful drivers: `DRV001` (vehicle 2157), `DRV007` (stopped vehicle, requests are blocked), `DRV008` (vehicle under maintenance).
- `إعادة ضبط` (reset) unlinks the simulated account so onboarding can be replayed. `تجربة انتحال` (impersonation) shares someone else's contact to show the refusal.
- The port is 3010 by default. Override it with `BOT_SIMULATOR_PORT`. The page listens on 127.0.0.1 only.

## Phase 2 redesign

The web app was redesigned in one direction, "Majlis": ivory paper, navy ink, brass rule, Naskh display type and an approval seal, with light and dark themes, Arabic RTL first, English, desktop and mobile. Phase 2 also added request-type and template management screens, S/4HANA duplicate lookup and a Cash Journal adapter, an S3 storage driver, Prometheus `/metrics`, SMTP e-mail, Telegram link/relink and load tooling. Staff with `requests.create` can also submit a request of any WEB-enabled type from the web app at `/requests/new` (header fields, lines and attachments; types without lines, such as an HR leave request, are submitted with header fields only). It was implemented without running any test: follow `docs/plan-v2/TESTING_GUIDE.md` for the first run.

## Tests and CI

```powershell
pnpm test          # all packages (Vitest); each test file uses its own copy of the database
pnpm lint          # ESLint
pnpm typecheck     # tsc in every package
pnpm ci            # local CI: db:up, db:migrate, lint, typecheck, test (scripts/ci.ps1)
pnpm e2e           # Playwright browser test (starts the API and the web app itself)
pnpm load:data     # synthetic large data set (see docs/plan-v2/TESTING_GUIDE.md)
pnpm load:timing   # time the key queries on that data set
```

Run one package's tests with `pnpm --filter <package> exec vitest run <path>`, for example `pnpm --filter @dms/bot exec vitest run`.

Notes:

- Tests never touch the `dms` database. Each test file clones `dms_template` into its own database. `pnpm db:migrate` rebuilds that template, so run it after schema changes.
- `pnpm db:generate` (Prisma client) fails with a permission error while a Node process holds the engine file. Stop `pnpm dev` first.

## Connect a real Telegram bot

1. In Telegram, talk to **@BotFather**, create a bot, and copy the token.
2. Put the token in `.env`:
   ```
   BOT_TOKEN=123456:ABC...
   BOT_MODE=polling
   ```
3. Start the bot with `pnpm dev` (it starts automatically when `BOT_TOKEN` is set) or with `pnpm --filter @dms/bot start`.
4. Make sure each driver exists in **Master data > Drivers** with the same phone number as the driver's Telegram account. The driver then sends `/start` and shares the contact.

**Polling** (default) needs no public address. The bot asks Telegram for updates. It removes any webhook when it starts.

**Webhook** needs a public HTTPS address:

```
BOT_MODE=webhook
BOT_WEBHOOK_URL=https://your-domain.example/telegram/webhook
BOT_WEBHOOK_SECRET=<a long random string>
BOT_WEBHOOK_PORT=4100
```

The bot listens on port 4100 and checks the secret header that Telegram sends. Your reverse proxy must send that path to port 4100. Examples are in `deploy/Caddyfile` and `deploy/nginx.conf`.

Status: the real Telegram connection has **not been tested** (no token on the build machine). The bot's flow is covered by harness tests and the simulator, which use the same code.

## SAP posting

`SAP_ADAPTER` selects how a paid request is posted:

| Value | What happens |
|---|---|
| `mock` (default) | Posts to an in-memory ledger. Good for development. Nothing is kept after a restart. |
| `file` | Writes a CSV and an XLSX journal entry per request under `storage-data/sap-export/`, for an accountant to upload to SAP. |
| `s4hana` | Sends a SOAP journal entry to SAP S/4HANA. Needs `SAP_S4_URL`, `SAP_S4_USER`, `SAP_S4_PASSWORD`, and optionally `SAP_S4_CLIENT`. **Not tested against a real system.** |

Change the value, then restart `pnpm dev`. The full mapping, the idempotency rules and the checklist for the SAP team are in `docs/SAP_INTEGRATION.md`.

Known issue: after a payment, the automatic SAP posting job does not run (its payload does not match the worker). The posting then waits in the SAP monitor until someone presses retry there. See `docs/SAP_INTEGRATION.md`, section 1.

## Backup and restore

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\restore.ps1 -Dump <file> -Storage <file>
```

Each backup is a `pg_dump` file plus an archive of `storage-data/`. Schedules, the restore procedure and the Bash versions are in `docs/BACKUP_RESTORE.md`.

## Deployment (not done yet)

- `docker-compose.yml`, `Dockerfile`: written for a future server. **Never built or run** (Docker is not installed on the build machine).
- `deploy/Caddyfile`, `deploy/nginx.conf`: HTTPS reverse-proxy examples for the web app, `/api/v1`, and the bot webhook. They use `dms.example.com` as a placeholder.

## Status and known limits

- **Built and tested locally:** database and migrations, authentication and permissions, the request engine (parallel steps, conditions, corrections, send back, reject, locks), the expense module, the Telegram bot flow (in tests and in the simulator), the worker and jobs, signed PDFs, storage with duplicate detection, reports and exports, the web app.
- **Not tested or not built:**
  - real Telegram (no token), and webhook mode in a live setting;
  - S/4HANA posting (no SAP system or credentials; element names unverified);
  - Cash Journal (FBCJ) posting (adapter written against fixtures only);
  - web submission of requests (the API exists; there is no submission screen);
  - e-mail notifications and S3 storage (implemented in phase 2, never run against real servers);
  - Docker files and reverse-proxy files (never run).
- **Placeholders in the seed:** most GL account numbers, the treasury cash account and the SAP company code are placeholders until the SAP team confirms them (see `docs/SAP_INTEGRATION.md`).
