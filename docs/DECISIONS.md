# Decisions and assumptions

Numbered so code and docs can cite them (`D7`). Add new entries at the end; never renumber.

## Environment overrides (from the project owner — take precedence over REQUIREMENTS §2)

- **D1. No Docker on the build machine.** `docker-compose.yml`, `Dockerfile` and the reverse-proxy config are written as files and never executed. The "docker compose up is healthy" acceptance of Phase 0 is replaced by: `pnpm db:up && pnpm db:migrate && pnpm lint && pnpm typecheck && pnpm test` green and `pnpm dev` serving `/health`.
- **D2. PostgreSQL = project-local cluster started from installed binaries, not Docker and not `embedded-postgres`.** Verified on this machine: the npm `embedded-postgres` package fails because Postgres refuses to start under an Administrator account. `pnpm db:up` runs `initdb` + `pg_ctl` from `PG_BIN` (default `C:\Program Files\PostgreSQL\17\bin`; PATH on Linux) against `.pgdata/` on port 54329 with trust auth; `pg_ctl` drops admin rights itself. Children are spawned with `stdio: 'ignore'` (Git Bash hangs otherwise). If `DATABASE_URL` points elsewhere, the scripts use that server and start nothing. Trust auth is for local dev/test only; production uses a password and `DATABASE_URL`.
- **D3. Tests use throwaway databases** cloned from `dms_template` (`CREATE DATABASE … TEMPLATE`), one per test file, never the dev database `dms`. This also lets several agents test in parallel on one server.
- **D4. No Redis/BullMQ.** Background work uses the `jobs` table claimed with `FOR UPDATE SKIP LOCKED`. The same table is the transactional outbox: a job row is inserted in the transaction of the business change. Retry with exponential backoff, stale-lock recovery and a unique `dedupeKey` replace BullMQ features. Bot draft state lives in `bot_sessions`, not Redis.
- **D5. No MinIO.** Files go to the local filesystem behind `StorageAdapter`; downloads use HMAC-signed, expiring URLs served by the API. An S3 adapter is a stub behind the same interface, selectable by `STORAGE_DRIVER`. Backups therefore cover the database and the `STORAGE_ROOT` directory.

## Architecture

- **D6. Bot and worker use the shared `@dms/core` package directly against the database; there are no internal HTTP endpoints.** One transactional boundary, no service-token surface, identical rules in every process. The web app is the API's only HTTP client.
- **D7. Domain logic is framework-free** (`@dms/core`, plain functions taking a Prisma client or transaction). NestJS is only the HTTP shell. This keeps the engine testable with Vitest and reusable by bot and worker.
- **D8. Tooling:** no build step for workspace packages (TypeScript sources are consumed directly). API runs through SWC (`@swc-node/register`, `unplugin-swc` in Vitest) because NestJS needs decorator metadata; everything else runs with `tsx`. Vitest is the only test runner. Fallback if SWC setup fails: `tsx` plus explicit `@Inject()` on every constructor parameter.
- **D9. Pinned versions for agent familiarity and stability:** Prisma 6 (Prisma 7's new generator and driver adapters are avoided), Next.js 15, Tailwind 3.4, zod 3, NestJS 11, TypeScript 5.9.
- **D10. Password hashing uses `@node-rs/argon2`** (argon2id, prebuilt binaries, no native compile on Windows) instead of the `argon2` package.
- **D11. Web auth:** short-lived JWT access token (15 min) + opaque rotating refresh token stored hashed in `sessions`; both kept in `localStorage` and sent as Bearer, so there is no cookie and no CSRF surface. Next.js proxies `/api/v1` to the API (same origin). Hardening for go-live: move the refresh token to an httpOnly cookie behind the reverse proxy.
- **D12. IDs are cuid strings; tables are snake_case, columns camelCase.** Money is `Decimal(14,2)` and travels as strings in JSON; arithmetic uses `decimal.js`.

## Generic core vs expense module

- **D13. Drivers are generic `Submitter` rows (`kind='DRIVER'`)**, not web users. Other departments reuse the same table for their requesters. Web users can also submit (`submittedByUserId`).
- **D14. An Expense Type is a generic `LineCategory`** plus the expense-only `ExpenseTypeConfig` (GL account). "Additional required approval roles", per-line extra fields, quantity/unit price and attachment rules are core features of line categories, so HR can use them.
- **D15. Expense-specific request data lives in 1:1 extension tables** (`ExpenseRequest`, `ExpenseLine`) written by module hooks inside the engine's transaction. Core tables carry no vehicle, GL or SAP columns.
- **D16. Liters are a configured extra field**; `LineCategory.quantityFieldKey` makes the engine compute `quantity` and `unitPrice = amount ÷ quantity` (2 decimals). The price-per-liter range warning is `unitPriceMin/Max` on the category.
- **D17. Modules plug in through a hook registry** keyed by `RequestType.moduleKey` (validate, afterCreate, onLineChanged, onPaid, onCompleted, onRejected, conditionFacts, templateData, detailExtras). A request type with `moduleKey = null` works from configuration alone.

## Workflow

- **D18. One workflow per request type, versioned.** A request pins `workflowVersionId` and `templateVersionId` at submission. Editing = new draft version → publish; published versions are immutable.
- **D19. Expense-type-driven approvals are modelled two ways:** explicit steps with condition `LINE_CATEGORY_REQUIRES_ROLE` (seeded for Maintenance Engineer and Shipping Officer, recorded as "Not applicable" when unused), and an optional `DYNAMIC_CATEGORY_ROLES` slot that creates steps for required roles no explicit step covers.
- **D20. Parallel steps = consecutive steps with the same `parallelGroup`** (a "stage"). The next stage starts when every applicable step of the stage is approved.
- **D21. "Skipped" is the status `NOT_APPLICABLE`;** there is no separate SKIPPED status and no manual skip by the Super User.
- **D22. Step applicability is frozen for the current and earlier stages; later stages are re-evaluated after every line change.** An accountant's reclassification never sends a request back to an earlier approver, but a later conditional step (e.g. a total-amount threshold) reacts to the new values.
- **D23. Step instances are reused** across send-back and correction cycles (one row per request and step). The row holds the latest state — which is what the signature blocks need — and the full history is in `request_events`.
- **D24. A correction returns to the same step.** The approver who asked is notified and shown as "returned to", but any holder of that role may act, so absence does not block the request. Parallel siblings may continue while a correction is open.
- **D25. Line-targeted re-upload supersedes all current images of that line; image-targeted re-upload supersedes that image only.** Superseded files are kept and shown in history.
- **D26. "Original value" is the value at first submission.** A driver's own amount correction and any approver edit are recorded as `line_edits`; `originalAmount`/`originalCategoryId` are never rewritten.
- **D27. Approvers may set an amount to 0** (disallowing a line); drivers must enter amounts > 0. Zero-amount lines are left out of the SAP entry.
- **D28. Send-back goes to the nearest earlier stage that has an approved step**; all its approved steps become active again and must re-approve. Send-back from the first step is not allowed (use reject or request correction).
- **D29. Permissions are checked twice:** the step must allow the action (`allowedActions`, `canEditAmounts`, `canReclassify`) and the user must hold the role of the step plus the global permission code.
- **D30. Delegation transfers queue access and permissions** for the date range. The signature and name are always those of the person who acted; the document adds "on behalf of".
- **D31. Approving requires an uploaded signature** (`workflow.requireSignatureToApprove`, default true; the Super User can switch it off).
- **D32. Claim/lock is a soft lock** with a 15-minute default timeout, acquired when the action panel opens and on any write action; viewing never locks.
- **D33. SLA hours are wall-clock hours** (no business calendar); the clock pauses while a correction is open.
- **D34. Request numbers are assigned only at submission** from a row-locked counter per prefix and year inside the submit transaction: no gaps on rollback, no duplicates under concurrency. The year is the Cairo year. Format `DE-26-000123` (12 characters).

## Bot

- **D35. Typed phone numbers are never accepted**; only a shared contact whose `user_id` equals the sender links an account. A driver can be linked to one Telegram account at a time.
- **D36. Each photo is acknowledged individually** (albums arrive as separate updates); simplicity over fewer messages.
- **D37. While a vehicle change request is pending, the driver cannot start an expense request.** If the typed vehicle number matches no vehicle, the request is still created with the typed text for the Shipping Officer to resolve.
- **D38. Odometer warnings do not block**: the driver confirms the value and the warning is shown to approvers.
- **D39. The bot is a single instance** (per-user in-process serialisation of updates). Telegram messages to drivers are delivered by the bot process from the `telegram` job queue.
- **D40. Without `BOT_TOKEN` the bot does not start**; `pnpm bot:sim` and the test harness exercise the full conversation, and Telegram jobs wait in the queue.

## Files, PDF, SAP, reports

- **D41. File type is decided by magic bytes** (JPEG, PNG, WebP, PDF); the declared type and extension are ignored. Default size limit 15 MB.
- **D42. Perceptual hash = 64-bit dHash**; near-duplicate when the Hamming distance ≤ 6 (setting). PDFs are compared by SHA-256 only. Duplicates are flagged, never blocked.
- **D43. PDF uses the Cairo font from `@fontsource/cairo`, embedded as base64** (works offline). Browser: bundled Chromium, falling back to installed Edge/Chrome via `PDF_BROWSER_CHANNEL`.
- **D44. Templates are structured configuration over built-in HTML layouts** (`layoutKey`); there is no free-form designer and no user-supplied HTML in this phase.
- **D45. The final PDF is generated by a job right after payment and never regenerated**; previews before that are rendered on demand and not stored.
- **D46. The SAP journal entry is built and stored at payment time** (`SapPosting.payload`), so later master-data changes cannot alter it. Idempotency key = request id; one posting row per request is enforced by unique constraints. When a previous attempt's outcome is unknown, the adapter is asked for an existing document with that reference before posting again.
- **D47. A posting failure never changes the request's PAID status.** Automatic retries: 8 attempts with exponential backoff; then manual retry.
- **D48. Default SAP values are placeholders** (company code `1000`, document type `SA`, posting keys 40/50, GL numbers other than the two given). Header text is truncated to 25 characters.
- **D49. "Expense date" = `RequestLine.lineDate`**, defaulting to the submission date (Cairo); the bot does not ask for it.
- **D50. PDF bundle = one merged PDF** (`pdf-lib` page copy of the stored PDFs; no text is re-rendered).
- **D51. Exports expire after 72 hours** (setting); download links are signed and valid for 5 minutes, re-issued on request.

## Scope of this build

- **D52. Email notifications, S3 storage, the real S/4HANA call, the Cash Journal adapter and web-side request submission UI are stubs** with interfaces and TODOs; see PLAN §15.
- **D53. One organisation, one currency (EGP).** No multi-tenant support.

## Phase 2 (plan-v2, 2026-11-10)

Assumptions and decisions made while planning phase 2 (`docs/plan-v2/PLAN_V2.md`, `docs/plan-v2/DESIGN_SPEC.md`). Owner-facing wording and how to change each: `docs/plan-v2/OWNER_DECISIONS.md`.

- **P2-1. One design direction, "Majlis"** (ivory, navy, brass, Naskh display type, approval seal). Light theme is the default; dark and "follow device" are user preferences stored in the browser (`dms.theme`).
- **P2-2. Western digits by default.** A per-user preference (`dms.numerals`) switches displayed amounts, counts and dates to Arabic-Indic; identifiers and inputs never convert. Pasted or typed Arabic-Indic digits are normalised to Western in amount inputs.
- **P2-3. UI dates are `dd/MM/yyyy`, 24-hour, Africa/Cairo, Gregorian**; the ISO form remains in inputs, API queries and file names. The week starts on Saturday.
- **P2-4. Fonts are self-hosted OFL families** (IBM Plex Sans Arabic, Noto Naskh Arabic, IBM Plex Serif, IBM Plex Mono) loaded from `globals.css` through fontsource packages. The PDF renderer keeps Cairo (D43 unchanged).
- **P2-5. Web dependencies added: four font packages and `radix-ui` only.** Charts are hand-written SVG; no animation, chart, form or DOM-testing library. Web unit tests stay pure-function tests in the node environment.
- **P2-6. The UI kit keeps its file names and exports** (new props are optional) and Tailwind keeps legacy colour aliases mapped to the new tokens, so un-migrated code compiles and stays on-theme. New code may use only semantic token classes (enforced by `style-guard.test.ts`).
- **P2-7. Colours are CSS variables switched by `html[data-theme]`**; components do not use Tailwind `dark:` variants.
- **P2-8. Navigation is regrouped** (Daily work, Insight, Configuration, Master data, Administration); routes and permission checks are unchanged. One new route: `/admin/request-types` (`request_types.manage`). Phones get a bottom tab bar, hidden on the request detail where the action bar replaces it.
- **P2-9. E2E tests select by `data-testid`** (convention and list in DESIGN_SPEC section 10), never by class or locale text.
- **P2-10. No new permission codes in phase 2.** Template management stays under `templates.manage`, request types under `request_types.manage`, user Telegram linking under `users.manage` (or self), driver linking under `submitters.telegram_link`.
- **P2-11. `POST /templates` creates the template and a v1 DRAFT in one transaction** (config copied from another template or the built-in default); `PATCH /templates/:id` edits names and the default/active flags. One default template per request type; the default cannot be deactivated. Templates, request types and line categories are never deleted.
- **P2-12. `allowedMimeTypes` of a line category becomes editable** (JPEG, PNG, WebP, PDF) and line categories can be reordered. Field definition keys must match `^[a-z][A-Za-z0-9_]*$`, be unique, and not collide with the header keys of the expense module.
- **P2-13. The Telegram bot stays specific to `DRIVER_EXPENSE`.** Request types created in the UI are usable through `POST /requests` only; header fields are not asked by the bot.
- **P2-14. SAP failures are classified.** A definite rejection (SAP answered with an error, or HTTP 401/403/404) is stored on the attempt; only attempts with an unknown outcome (timeout, network error, 5xx, crash while POSTING) make the next attempt look the reference up first. This narrows D46 without weakening it.
- **P2-15. S/4HANA lookup = OData read by `DocumentReferenceID` + `CompanyCode`**, with service, entity and field configurable. When the lookup cannot answer (disabled, unauthorised, down), the system does not post again by itself; a holder of `sap.retry` may force a re-send after checking SAP, and the force is audited. Recommended mode until the SAP team confirms the service: `SAP_S4_LOOKUP_MODE=none`.
- **P2-16. Cash Journal is a posting adapter (`SAP_ADAPTER=s4hana-cj`)** behind the same outbox: one cash-journal document per request, debit lines as payment items, the cash line implied by the journal. Cash journal numbers and the business transaction live in the setting `sap.config.cashJournal` (no schema change). All element names are unverified until the SAP team answers.
- **P2-17. Metrics are hand-rolled Prometheus text** (`@dms/core/metrics`); queue, posting and request gauges are read from the database at scrape time by the API, so the worker and bot expose no port. `/metrics` requires `METRICS_TOKEN` in production.
- **P2-18. E-mail uses `nodemailer` behind `EMAIL_DRIVER`** (`none` default, `smtp`, `file` for development). Outbound channels fan out from `notifyUsers` and are controlled by the settings `notifications.email` and `notifications.telegramUsers` (both off by default). A fan-out failure never fails the business transaction. D52 no longer applies to e-mail.
- **P2-19. S3 storage implements the existing `StorageAdapter`** with the AWS SDK v3 (works with MinIO). Clients still receive the application's HMAC-signed `/files` URL; the API proxies the bytes, or redirects to a short-lived S3 presigned URL when `S3_PRESIGNED_REDIRECT=true`. D52 no longer applies to S3.
- **P2-20. Telegram links for approvers and admin re-links for drivers use a stateless signed token** (`/start <token>`, 15 minutes, HMAC with `FILE_URL_SECRET`), refused when the target or the Telegram account is already linked. **D35 is amended**: besides the contact-share flow, an administrator may link a driver with such a token. Linked approvers can receive Telegram notifications (text only, no actions in chat).
- **P2-21. Load-test data is generated only in a separate database `dms_load`** cloned from `dms_template`, through typed `createMany` (no files, metadata rows only), with request numbers `LD-YY-NNNNNN`.
- **P2-22. The schema stays frozen except migration `0003_perf_indexes`** (three b-tree indexes and an optional trigram index on `requests.number`). No tables or columns are added in phase 2; new configuration lives in settings and environment variables.
- **P2-23. `scripts/demo.ts` skips `prisma generate` when the generated client matches the schema, continues with a warning when generation fails but a client exists, and reuses servers that are already running** (database steps are skipped while the API is up).
- **P2-24. Phase 2 code is written without executing tests, builds or servers** (only `tsc --noEmit` and `eslint`); verification happens on another machine with `docs/plan-v2/TESTING_GUIDE.md`. The project stays 100% local (no remote, no push).
