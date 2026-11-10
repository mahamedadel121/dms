# Progress: requirement, status, proof

Status: **Done** = implemented and exercised by the named test; **Partial** = works with a stated gap; **Stub** = interface or placeholder only.
Verified on 2026-11-10 against a fresh `dms` database (`pnpm demo`). Totals: lint clean (0 errors), typecheck clean, unit and API tests 384 passed (shared 49, web 36, core 176, worker 2, bot 29, api 92), browser/end-to-end 8 passed (`pnpm e2e`).

E2E = `e2e/tests/full-flow.spec.ts` (driver simulator + REST + worker, real stack) and `e2e/tests/web-ui.spec.ts` (real Chromium against the running web app).

## REQUIREMENTS section by section

| Section | Requirement | Status | Proof |
|---|---|---|---|
| 3.1 | Departments, users, roles, permissions matrix, delegations, signatures | Done | `apps/api/test/platform/{admin,authz-matrix,master}.test.ts`; web-ui admin crawl |
| 3.2 | Generic request types engine (module hooks) | Partial | engine + expense module: `packages/core/src/engine/engine.test.ts`. **No web screen to create or edit Request Types or to create a new template** (API exists: `apps/api` request-types/templates controllers; list and edit of workflows/templates is in the UI) |
| 3.3 | Gap-free request numbers `DE-YY-NNNNNN` | Done | `packages/core/src/engine/numbering.test.ts`; e2e full-flow |
| 3.4 | Versioned configurable workflow, parallel steps, conditions, dynamic role steps, simulate | Done | `apps/api/test/workflow/workflow.test.ts`; e2e (maintenance + tips run engineer and shipping in parallel) |
| 3.5 | Templates (layout config, signature blocks) | Done | `apps/api/test/integrations/integrations.test.ts`; e2e checks the rendered model has the Arabic title and exactly the applicable signature blocks |
| 3.6 | Global audit log | Done | `apps/api/test/platform/admin.test.ts` (before/after snapshots) |
| 4 | Master data CRUD, xlsx import/export, vehicle assignments, vehicle change requests | Done | `apps/api/test/platform/master.test.ts`; web-ui crawl of all master screens |
| 5.1 | Bot onboarding by phone contact | Done (simulator) | `apps/bot/test/onboarding.test.ts`; e2e. Real Telegram untested (no token) |
| 5.2 | New request flow, odometer warnings, photos, edit/delete lines, drafts | Done (simulator) | `apps/bot/test/{flow,session}.test.ts`; e2e |
| 5.3 | Type-specific fields (diesel liters, price per liter) | Done | `apps/bot/test/flow.test.ts`; e2e (diesel line) |
| 5.x | Corrections round trip (notification button, re-upload) | Done | `apps/bot/test/correction.test.ts`; e2e correction test |
| 6 | Web: inbox with locking, request detail, gallery, action panel, checklist, edit amount with reason, corrections, send back, reject | Done | web-ui spec (supervisor opens detail, gallery, takes the lock, ticks the receipts checkbox, approves); full-flow (accountant edit via API) |
| 6 | Workflow builder, template editor, SAP monitor, dashboard, notifications | Done | web-ui crawl (all routes render without 4xx/5xx or runtime errors, RTL) |
| 7 | Treasury pays, final PDF locked with signatures | Done | e2e: PAID, `finalPdf` sha256 present, file starts `%PDF-`; `packages/core/src/pdf/*.test.ts` |
| 7 | SAP journal entry, outbox, idempotency, retries, manual retry, monitor | Done with mock/file adapters | e2e: posting POSTED through the worker; `packages/core/src/sap/sap.test.ts` |
| 7 | S/4HANA SOAP adapter | Stub | envelope and parser tested on fixtures only; element names unverified, `findByReference` returns null (see below) |
| 7 | Cash Journal adapter option | Stub | interface only |
| 8 | Report builder, groupings, columns, dashboard | Done | `packages/core/src/reports/reports.test.ts`; web-ui reports page |
| 8 | Excel, ZIP of images, PDF bundle as background jobs, notification, audit | Done | `reports` tests; web-ui clicks Export and an export row appears via `/reports/exports` |
| 9 | Backend authorization on every endpoint, authz meta-test | Done | `apps/api/test/platform/authz-matrix.test.ts` (12 tests) |
| 9 | IDOR, upload sniffing, signed URLs | Done | WP8 manual probe, see Security below |
| 9 | Decimal money, Cairo timezone | Done | `@dms/shared` tests (49) |
| 9 | Pagination, indexes, thumbnails | Partial | implemented; **no load test with 50k requests was run** |
| 9 | S3/MinIO storage | Stub | local driver only; S3 driver is a stub |
| 9 | Backups documented and scripted | Partial | `scripts/backup.*`, `docs/BACKUP_RESTORE.md` written by WP9, not executed by WP8 |
| 9 | Structured logs, health, metrics | Partial | `/health`, `/health/ready` work; `/metrics` is a small JSON stub, not Prometheus text |
| 10 | Seed and demo data | Done | `pnpm db:seed` (base) + `packages/core/scripts/seed-demo.ts` (31 requests via the real engine: 6 submitted, 4 supervisor-approved, 2 mid-workflow, 1 at GM, 1 at treasury, 3 awaiting correction, 3 rejected, 10 paid and posted, 1 paid with SAP FAILED, plus 3 from tests) |
| 11 | Deliverables: README, ARCHITECTURE, SAP, BACKUP, guides | Done (docs by WP9) | `docs/` |
| Env | Docker compose, Dockerfile, Nginx/Caddy example | Stub | written, **never executed** (no Docker here) |
| Email notifications | SMTP | Stub | in-app and Telegram only |

## Cross-package fixes made by WP8

- `onPaid` enqueued `sap.post` with `{requestId}` but the worker requires `{postingId}`: automatic SAP posting never ran after payment. Fixed (`{postingId, trigger:'AUTO'}`, dedupe `sap.post:<requestId>`); proven by the e2e (request goes PAID then POSTED by the worker).
- `no-control-regex` lint error in `reports/exports.ts`; seed imports `@dms/shared` instead of a relative path.
- Verified without change: `pdf.finalize` payload, `correctionRequestIds` in REQ_CORRECTION notifications (the bot shows the `corr:` button), line-edit body (`stepInstanceId`, `amount`, `categoryId`, `reason`), list shapes `{items,total,page,pageSize}`, template/workflow `activeVersion`.

## Security pass (quick)

- Authorization meta-test passes. Missing token gives 401 everywhere.
- IDOR: an engineer opening a request that has no engineer step gets 403; unknown ids also give 403 (by design, no existence leak).
- Upload sniffing: a text file named `.jpg` and an `.html` file are both rejected (400 `UNSUPPORTED_TYPE`); type is decided by magic bytes.
- Signed file URLs: a tampered signature and an expired timestamp both give 403. A valid signed URL works without a token (that is what "signed URL" means; keep expiry short).
- No MUST issues found. SHOULD: add rate limiting to file URLs; `/metrics` should require auth before it carries real data.


## Phase 2 (implemented 2026-11, tests written, NOT yet run)

Only `tsc --noEmit` and `eslint` were run (both clean at the integration commit; lint has 15 `no-explicit-any` warnings). Vitest, Playwright, `next build` and every server are unverified; follow `docs/plan-v2/TESTING_GUIDE.md`.

### Section A: Majlis redesign (spec `docs/plan-v2/DESIGN_SPEC.md`)
| Item | Status | Proven by |
|---|---|---|
| Tokens, prefs, formatters, kit primitives, overlays, DataTable, DateField, FilterBar (F1, F2) | Done | `apps/web/src/lib/*.test.ts`, `features/style-guard.test.ts`, `features/i18n-keys.test.ts` |
| App shell, login, profile, notifications (W1) | Done | `e2e/tests/redesign.spec.ts`, `web-ui.spec.ts` |
| Inbox, requests list, vehicle changes, assignments (W2) | Done | `features/inbox` tests, e2e |
| Request detail, route stepper, line cards, timeline (W3) | Done | `features/requests/timelineModel.test.ts`, e2e |
| Action bar, dialogs, evidence viewer (W4) | Done | `features/requests` tests, e2e |
| Dashboard, charts, reports, SAP monitor (W5) | Done | `features/dashboard`, `features/sap` tests |
| Workflow editor, template editor and lists (W6) | Done | `features/workflows`, `features/templates` tests |
| CrudPage, import dialog, master pages (W7) | Done | `components/crud` tests, e2e |
| Admin: users, roles matrix, delegations, audit, settings, signatures (W8) | Done | `features/admin/*.test.ts` |
| Request types UI (W9) | Done | `features/request-types` tests, e2e |
| Cut (PLAN_V2 section 10): C1 command palette, C2 workflow route preview card, C3 audit diff viewer (raw JSON shown; `features/admin/diff.ts` exists unused), C4 roles matrix mobile accordion, C5 density and Arabic-Indic numerals toggle UI (formatter support stays; the numerals e2e test was dropped) | Not built | follow-up run |

### Section B: functional gaps
| Item | Status | Proven by |
|---|---|---|
| B1 request types and templates API (A1) | Done | `apps/api/test/workflow/request-types.test.ts`, `templates.test.ts` |
| B2 S/4HANA `findByReference` and force retry (A2) | Done, fixtures only | `packages/core/src/sap` tests, worker test |
| B3 Cash Journal adapter `s4hana-cj` (A2) | Done, fixtures only | `packages/core/src/sap` tests |
| B4 S3 storage driver and presigned redirect (A3) | Done | `packages/core/src/storage/s3.test.ts` |
| B5 Prometheus `/metrics` (A3) | Done | API metrics test |
| B6 e-mail transport, templates, fan-out (A4) | Done, off by default | core notification tests, worker test |
| B7 Telegram link/relink (A1, A5) | Done | `apps/api/test/platform/telegram-link.test.ts`, `packages/core/src/telegram/telegram.test.ts`, bot tests |
| B8 load tooling and perf indexes (A6, F3) | Done, not run | `pnpm load:data`, `pnpm load:timing` |
| B9 `scripts/demo.ts` fix (H1) | Done, not run | `pnpm demo` |

Integration notes: the timeline arrival event is `STEP_ACTIVATED` (the spec said `REQ_AT_STEP`; the model treats both as arrival); `/metrics` answers `UNAUTHENTICATED` without the token; build info reads the root `package.json` version.

## For the project owner

### Complete and verified (on this machine)
- The whole flow: driver (simulator) submits maintenance + tips + diesel with photos, approvals in order (supervisor with the receipts checkbox, engineer and shipping in parallel, manager, accountant edits an amount with a reason, chief, GM, treasury pays), PAID, final PDF generated and locked, SAP posting POSTED through the mock adapter, driver notifications queued, and a correction round trip.
- Real-browser check of login, inbox, request detail with gallery and action panel (approve done by clicking), every master/admin screen, workflow builder, template editor, report export, all in RTL.
- One-command demo from an empty database.

### Implemented but cannot work yet, and why
- **Telegram bot**: no bot token. Polling and webhook code exist; only the simulator (http://127.0.0.1:3010, same bot code and DB) was exercised.
- **Webhook mode**: needs a public HTTPS URL.
- **SAP**: no endpoint or credentials; only the mock and file adapters run. The S/4HANA SOAP element names are unverified. Phase 2 added `findByReference` (OData lookup, `SAP_S4_LOOKUP_MODE`), tested with fixtures only; the SAP team must confirm service and field names.
- **S3/MinIO storage** and **e-mail (SMTP)**: implemented in phase 2, never run against a real bucket or mail server.
- **Docker files**: written, never executed.
- **PostgreSQL**: the system Postgres password is unknown, so a private cluster on port 54329 (`.pgdata`) is used; `pnpm db:up` starts it.

### Known bugs and limitations
- Final-PDF text was verified from the document model (Arabic title, signature blocks) and the file header; the binary PDF text was not extracted (no PDF text tool here).
- The API returns some money totals without decimals (for example `"2090"`); the web formats them. Line amounts are `"100.00"`.
- `pnpm demo` serves a production web build (`next start`); after changing web code run `pnpm demo --rebuild`. `next build` rewrites `apps/web/tsconfig.json` and `next-env.d.ts`; revert them before committing.
- The mock SAP ledger is per process (seeded failure is a stored FAILED row; press retry in `/sap`).
- Odometer sanity warnings in the bot appear when a reading differs a lot from the last one; the driver must confirm.
- Load tooling now exists (`pnpm load:data`, `pnpm load:timing`) but has not been run; query performance at scale is unmeasured until the developer runs it.
- The queue shows a request twice when two parallel active steps are both yours.

### Go-live steps
1. Create a bot with BotFather, set `BOT_TOKEN` in `.env`. For webhook: public HTTPS URL, `BOT_MODE=webhook`, `BOT_WEBHOOK_URL`, `BOT_WEBHOOK_SECRET`. Otherwise polling needs only the token.
2. Replace seed users and passwords (all `Passw0rd!`), change `JWT_SECRET` and `FILE_URL_SECRET`, upload real signatures, load real drivers, vehicles, cost centers, GL accounts and treasuries (xlsx import in the web app).
3. SAP: get endpoint, communication user, company code, document type, cash GL from the SAP team (`docs/SAP_INTEGRATION.md`); verify the SOAP element names in the sandbox; implement `findByReference`; test the lost-response case; then set `SAP_ADAPTER=s4hana` (or `file` meanwhile).
4. Decide storage (local disk with backups, or implement the S3 driver) and run `scripts/backup.*` plus a restore test.
5. Put the app behind HTTPS (Nginx/Caddy example in `deploy/`), set `WEB_PUBLIC_URL`, run Docker for the first time on a staging server.
6. Run a pilot with 3 to 5 drivers, then run the load script on a copy of production-size data.
