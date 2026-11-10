# DMS phase 2: testing guide

For the person who runs the tests on his own machine. Phase 2 was implemented without running any test, build or server (only `tsc` and `eslint` were run). Expect some failures on the first run; section 9 says how to report them.

Everything is local. Do not push this repository anywhere, do not add a git remote, do not open GitHub issues or pull requests.

## 1. What you need

| Tool | Version |
|---|---|
| Windows 10/11 (or Linux/macOS) | - |
| Node.js | 22 or 24 |
| pnpm | 11.x (`corepack enable` then `corepack prepare pnpm@11.28.4 --activate`) |
| PostgreSQL binaries | 15 or newer, with the contrib modules (for `pg_trgm`); set `PG_BIN` in `.env` if `pg_ctl` is not on the PATH |
| Chromium for Playwright | `pnpm --filter @dms/e2e exec playwright install chromium` (or set `PDF_BROWSER_CHANNEL=msedge` in `.env` to use installed Edge) |
| Free ports | 3000 (web), 4000 (API), 3010 (driver simulator), 54329 (Postgres) |

No Docker, Redis, SAP, SMTP server, S3 or Telegram token is required for the standard run.

## 2. Setup (once)

```powershell
cd <repo>
copy .env.example .env        # keep the defaults
pnpm install
pnpm db:generate              # Prisma client (run while no node process of this project is running)
pnpm db:up                    # private Postgres cluster on :54329 (idempotent)
pnpm db:migrate               # applies migrations 0001-0003 to `dms`, rebuilds `dms_template` with the base seed
```

Expected: `pnpm db:migrate` ends with `migrations applied to dms and dms_template rebuilt`. A NOTICE `pg_trgm not available, skipping requests_number_trgm_idx` is acceptable (it only means the search index was skipped); tell us if you see it.

## 3. Static checks (2-4 minutes)

```powershell
pnpm typecheck
pnpm lint
```
Expected: both end without errors (lint warnings are fine). If either fails, stop and report the output: nothing else is reliable until these pass.

## 4. Unit and API tests (5-10 minutes)

```powershell
pnpm test
```
This runs vitest in every package. Each test file clones the database `dms_template` into its own temporary database, so `dms` is never touched and Postgres must be running (`pnpm db:up`).

Expected:
- Phase 1 baseline: 384 tests (shared 49, web 36, core 176, worker 2, bot 29, api 92). All of them must still pass.
- Phase 2 adds roughly 280 tests. Approximate totals per package: shared about 68, core about 280, api about 138, bot about 41, worker about 5, web about 130, e2e unit about 6. The exact numbers do not matter; **zero failures** does.
- One block is skipped on purpose: `live round trip against MinIO` (needs `S3_TEST_ENDPOINT`, see 8.2).

To run one package or one file:
```powershell
pnpm --filter @dms/core exec vitest run src/sap
pnpm --filter @dms/api exec vitest run test/workflow/templates.test.ts
pnpm --filter @dms/web exec vitest run src/features/style-guard.test.ts
pnpm --filter @dms/e2e exec vitest run unit
```
Package names: `@dms/shared`, `@dms/db`, `@dms/core`, `@dms/api`, `@dms/web`, `@dms/bot`, `@dms/worker`, `@dms/e2e`.

Tests worth reading first when something fails:

| Area | File | What a failure means |
|---|---|---|
| Design rules | `apps/web/src/features/style-guard.test.ts` | a page still uses old colour classes, left/right classes, a native date input or a hard-coded colour; the message lists `file:line` |
| Translations | `apps/web/src/features/i18n-keys.test.ts` | a text key is missing in Arabic or English |
| Old SAP behaviour | `packages/core/src/sap/sap.test.ts` | phase 2 broke phase 1 idempotency (serious) |
| No double posting | `packages/core/src/sap/process.test.ts` | the lost-response protection is wrong (serious) |
| Authorization | `apps/api/test/platform/authz-matrix.test.ts` | a new endpoint lacks a permission decorator (serious) |

## 5. Build the web app (2-3 minutes)

```powershell
pnpm --filter @dms/web build
git checkout -- apps/web/tsconfig.json apps/web/next-env.d.ts   # `next build` rewrites these two files; restore them
```
Expected: the build finishes and lists the routes, including `/admin/request-types`, `/admin/request-types/new` and `/admin/request-types/[id]`. A build error here is a real bug (report the first error).

## 6. End-to-end tests in a real browser (10-15 minutes)

Start the whole stack in one terminal and leave it running:
```powershell
pnpm demo --rebuild
```
Wait for the banner `DMS demo is running`. It seeds demo data (31 requests), then starts the API, worker, driver simulator and web app. If the stack is already running, `pnpm demo` now says so and reuses it instead of failing.

In a second terminal:
```powershell
pnpm e2e
```
Expected: three spec files pass.

| Spec | Tests | Checks |
|---|---|---|
| `e2e/tests/full-flow.spec.ts` | phase 1 tests + 1 | driver submits through the simulator, eight approvers approve, payment, final PDF, SAP posting, correction round trip, and the Prometheus endpoint |
| `e2e/tests/web-ui.spec.ts` | 3 | every screen renders in Arabic RTL with no console error or HTTP 4xx/5xx; supervisor approves in the browser and the seal appears; workflow builder, template editor and report export |
| `e2e/tests/redesign.spec.ts` | 11 | dark theme, English LTR, Arabic-Indic numerals, mobile layout and approval, no horizontal overflow, request-type creation, template creation, roles matrix, Telegram link dialog, SAP drawer, inbox badge |

Failed tests leave screenshots and traces in `e2e/test-results/`. Run one spec with `pnpm --filter @dms/e2e exec playwright test tests/redesign.spec.ts`, add `--headed` to watch it.

Notes: the e2e tests create data (a request type `E2E...`, a template, a few requests). To start clean again: stop the stack (Ctrl+C), then `pnpm db:migrate`, then `pnpm demo --rebuild`.

## 7. Visual pass by hand (15 minutes; the tests cannot judge looks)

Open http://localhost:3000 and log in (all passwords `Passw0rd!`).

1. **Login page**: ivory form on one side, navy panel with a pattern, a headline and a brass seal on the other; a thin navy-and-brass line across the very top. Arabic text must look like two fonts used on purpose (a book-style title, a clean body). If the title looks like the same font as the body, the fonts did not load: report it.
2. `supervisor` -> **Inbox**: title, a sentence with the number of waiting requests, a table with amounts aligned in a column, overdue rows marked. Open a request.
3. **Request detail**: big total, route of approvals with the current step clearly marked, receipts in a dark viewer at the side (zoom with the mouse wheel, rotate, full screen), a floating bar at the bottom with "اعتماد". Take the request, approve it, and watch the seal stamp onto the sheet.
4. Resize the browser to phone width (or use the device toolbar, 390 px): a tab bar appears at the bottom; on a request the tab bar is replaced by the approve bar; nothing scrolls sideways.
5. Top bar: switch to English (layout mirrors, sidebar moves to the left), switch to dark theme (no white boxes, no unreadable text), switch both back.
6. `admin` -> walk the sidebar: Dashboard (four figures, charts), Reports, SAP monitor (click a row), Request types (create one), Workflows (open the builder), Templates (create one, see the preview), Drivers, Users (Telegram link in the row menu), Roles (matrix with sticky headers), Audit, Settings, Profile (appearance options).
7. Driver simulator at http://127.0.0.1:3010: same ivory/navy look, chat still works (`/start`, share contact).

Take a screenshot of anything that looks broken, misaligned, clipped, or still "old style" (grey-blue boxes, blue buttons, the Cairo font).

## 8. Optional checks

### 8.1 E-mail without a mail server
In `.env` set `EMAIL_DRIVER=file`, restart the stack, log in as `admin`, open Settings and enable `notifications.email`; give the user `supervisor` an e-mail address (Users). Submit a request from the simulator. Expected: a JSON file appears under `storage-data/outbox-email/<date>/` with an Arabic HTML body. With a real SMTP server set `EMAIL_DRIVER=smtp` and the `SMTP_*` variables instead.

### 8.2 S3 against MinIO (only if you have MinIO)
```powershell
$env:S3_TEST_ENDPOINT="http://127.0.0.1:9000"; $env:S3_BUCKET="dms-test"; $env:S3_ACCESS_KEY_ID="minioadmin"; $env:S3_SECRET_ACCESS_KEY="minioadmin"
pnpm --filter @dms/core exec vitest run src/storage/s3.test.ts
```
Expected: the `live round trip against MinIO` test runs and passes (create the bucket first).

### 8.3 Metrics
`curl http://localhost:4000/api/v1/metrics` -> plain text starting with `# HELP`, containing `dms_http_requests_total`, `dms_jobs`, `dms_sap_postings`. With `METRICS_TOKEN=abc` in `.env` (restart the API) the same call returns 401 and `curl -H "Authorization: Bearer abc" ...` returns 200.

### 8.4 Load test (20-40 minutes, separate database `dms_load`, never touches `dms`)
```powershell
pnpm load:data                 # 50,000 requests, at least 200,000 attachment rows; prints row counts
pnpm load:timing --out=docs/plan-v2/LOAD_RESULTS.md
```
Expected: `load:data` ends with a table (`requests 50000`, `attachments >= 200000`) and exit code 0. `load:timing` prints eleven rows (Q1-Q11) with min / p50 / max milliseconds and PASS or SLOW against the budget. Send us `docs/plan-v2/LOAD_RESULTS.md`; SLOW rows are expected input for more index work, not a test failure. To remove the data: connect with `psql` and `DROP DATABASE dms_load;`.

### 8.5 Telegram link (needs no real bot)
Log in as `admin`, Users -> row menu of `supervisor` -> "ربط تليجرام": a dialog shows a command starting with `/start u_`. The bot-side handling is covered by `apps/bot/test/link.test.ts`.

### 8.6 SAP
No SAP system is needed: the mock adapter is the default. The S/4HANA lookup and the cash journal adapter are covered only by fixture tests (`packages/core/src/sap/*.test.ts`); they are unverified against a real system until the SAP team answers the questions in `docs/SAP_INTEGRATION.md`.

## 9. How to report

Send back, in one message or archive:
1. The full console output of the first failing step (`pnpm typecheck`, `pnpm lint`, `pnpm test`, the build, `pnpm e2e`). For `pnpm test`, the summary lines per package plus the first error of each failing test are enough.
2. The folder `e2e/test-results/` when an e2e test fails.
3. Screenshots from the visual pass, with the page name and whether it was Arabic or English, light or dark, desktop or phone width.
4. Your Node, pnpm and PostgreSQL versions (`node -v`, `pnpm -v`, `pg_ctl --version`).

Please do not fix code yourself and do not change tests to make them pass: a failing test is the information we need.

## 10. Quick reference

| Command | Purpose |
|---|---|
| `pnpm db:up` / `pnpm db:down` / `pnpm db:status` | private Postgres on :54329 |
| `pnpm db:migrate` | migrate `dms`, rebuild the test template database |
| `pnpm typecheck` / `pnpm lint` | static checks |
| `pnpm test` | all vitest suites |
| `pnpm demo [--rebuild] [--no-seed] [--generate]` | one-command stack (logs in `.demo-logs/`) |
| `pnpm e2e` | Playwright against the running stack |
| `pnpm load:data` / `pnpm load:timing` | load test on `dms_load` |
| Logins | `admin`, `supervisor`, `manager`, `engineer`, `shipping`, `accountant1`, `accountant2`, `chief`, `gm`, `treasury`, password `Passw0rd!`; drivers `DRV001`..`DRV010` in the simulator |
