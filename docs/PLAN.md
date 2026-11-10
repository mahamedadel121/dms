# DMS — Implementation Plan (source of truth)

Phase 1 = Driver Expense Claims on a generic request/approval core. Read with `docs/REQUIREMENTS.md`, `docs/DECISIONS.md` (Dn = decision n) and `packages/db/prisma/schema.prisma` (the data contract, frozen after WP0).
**Rules for every agent:** (1) edit only the paths your WP owns (§14); (2) code against the contracts in §4/§11 exactly — if a contract is wrong, fix it in your own code and add a line to `docs/CONTRACT_NOTES.md` (append-only, one line: WP, file, what changed); (3) never run `prisma generate`, `prisma migrate`, `pnpm install`/`pnpm add`, `git add -A`, `git stash/reset/checkout` during the parallel phase; (4) never weaken a test to make it pass; (5) no business rule hard-coded that the Super User should control.

## 1. Architecture

```
 Telegram ──> apps/bot (grammY) ─┐                       ┌─> LocalFs storage (STORAGE_ROOT)
 Browser ──> apps/web (Next.js) ─┼─> apps/api (NestJS) ──┤
                                 │        │              └─> PostgreSQL (Prisma)
                                 └────────┴──> packages/core  (framework-free domain services)
 apps/worker (job loop) ───────────────────────^   jobs table = queue + transactional outbox
```

- **`@dms/core` holds all domain logic** as plain async functions taking a `Db` (PrismaClient or transaction client). `apps/api` controllers, the bot and the worker are thin shells around it.
- **Bot and worker call `@dms/core` directly against the DB — there are NO internal HTTP endpoints** (D6). Why: one transactional boundary (request + outbox rows commit together), no service-token surface to secure, same invariants everywhere, and the job table already couples the processes through Postgres. The web app is the only HTTP client of the API.
- **Outbound Telegram** messages are jobs on queue `telegram`, consumed by the bot process (only it holds the token). Everything else runs on queue `default` in the worker.

### 1.1 Generic core vs `expense` module
Core (schema sections A–D) knows: departments, users/roles/permissions, **submitters** (generic external requester; a driver is `Submitter.kind='DRIVER'`), request types, **line categories** (expense type = line category), workflows, templates, requests, lines, attachments, steps, history, notifications, jobs. Core never imports from `packages/core/src/{expense,fleet,sap}`.
The expense module (schema section E; code in `core/src/expense`, `core/src/fleet`, `core/src/sap`, `api/src/expense`) owns vehicles, cost centers, GL accounts, treasuries, assignments, vehicle change requests, the 1:1 extension rows `ExpenseRequest`/`ExpenseLine`/`ExpenseTypeConfig`, and SAP posting.

A module plugs in through a registry keyed by `RequestType.moduleKey` (`registerModule(m)`; expense registers itself via `registerExpenseModule()`, called once at startup by api, bot, worker and tests). All hooks receive the open transaction, so module rows and outbox jobs commit atomically with the core change:

```ts
interface RequestModule {
  key: string;                                                        // 'expense'
  validateSubmission?(db: Db, input: SubmitRequestInput): Promise<void>;      // throw DomainError
  afterCreate?(tx: Db, req: Request, lines: RequestLine[], input: SubmitRequestInput): Promise<void>; // write extension rows + snapshots
  conditionFacts?(db: Db, requestId: string): Promise<Record<string, unknown>>;   // merged into facts.module
  onLineChanged?(tx: Db, req: Request, line: RequestLine, changed: string[]): Promise<void>; // refresh snapshot after edit/reclassify
  lineWarnings?(db: Db, line: RequestLine): Promise<LineWarning[]>;
  beforeApprove?(tx: Db, ctx: ActionCtx): Promise<void>;               // e.g. validate actionData at payment
  onPaid?(tx: Db, req: Request, ctx: ActionCtx): Promise<void>;        // expense: SapPosting + jobs
  onCompleted?(tx: Db, req: Request): Promise<void>;                   // "on final approval"
  onRejected?(tx: Db, req: Request): Promise<void>;
  detailExtras?(db: Db, requestId: string): Promise<Record<string, unknown>>;  // returned as RequestDetail.module
  templateData?(db: Db, requestId: string): Promise<TemplateModuleData>;       // header values + extra line columns for PDF
  listSummary?(db: Db, requestIds: string[]): Promise<Record<string, Record<string, unknown>>>; // e.g. vehicleNumber for queues
}
```
Line-category "additional approval roles" (`LineCategoryApprovalRole`), per-category extra fields, quantity/unit price and attachment rules are **core** concepts (HR can use them); only the GL link is expense-specific.

## 2. Monorepo, tooling, scripts

```
package.json  pnpm-workspace.yaml  tsconfig.base.json  eslint.config.mjs  .prettierrc  .env.example  .gitignore
docker-compose.yml  Dockerfile  deploy/Caddyfile  scripts/{ci.sh,ci.ps1,backup.sh,restore.sh}   CLAUDE.md  README.md
packages/shared   @dms/shared   browser-safe: constants, zod schemas, pure utils, API contract types   (deps: zod, decimal.js)
packages/db       @dms/db       prisma schema+migrations, client factory, pg scripts, base seed, test-db helper
packages/core     @dms/core     domain services; subpath exports only: @dms/core/<dir>  ("exports": {"./*": "./src/*/index.ts"})
apps/api          @dms/api      NestJS 11 REST API (port 4000, prefix /api/v1)
apps/web          @dms/web      Next.js 15 App Router + Tailwind 3.4 (port 3000)
apps/bot          @dms/bot      grammY bot + harness + telegram job consumer
apps/worker       @dms/worker   job runner + schedulers
e2e               @dms/e2e      Playwright web E2E (WP8)
```
- **TypeScript:** strict, `module: ESNext`, `moduleResolution: Bundler`, `target: ES2022`, no `.js` import suffixes, no project references, no build step for packages: every package.json points `main`/`types`/`exports` at `./src/**.ts`. `apps/api/tsconfig.json` adds `experimentalDecorators` + `emitDecoratorMetadata`.
- **Runtime (dev and prod):** bot, worker, scripts run with `tsx`. API runs with `node -r @swc-node/register src/main.ts` (SWC emits decorator metadata; D8). Web: `next dev` / `next build` with `transpilePackages: ['@dms/shared']`; web imports **only** `@dms/shared`.
- **Tests:** Vitest everywhere. `apps/api/vitest.config.ts` uses `unplugin-swc` (`swc.vite({ module: { type: 'es6' } })`) so Nest DI metadata works. If WP0 cannot get a controller-injects-service-by-type smoke test green under both vitest and the dev runner within 10 minutes: fall back to `tsx` + mandatory explicit `@Inject(Token)` on every constructor param, and record it in DECISIONS.
- **Lint:** ESLint 9 flat config at root (`@eslint/js` + `typescript-eslint` recommended, non-type-aware), `pnpm lint` = `eslint .`. Prettier for formatting only.
- **Pinned majors:** prisma/@prisma/client **6.x** (not 7), next 15, react 19, tailwindcss 3.4, @nestjs/* 11, zod 3.x, typescript ~5.9, vitest 3.x, grammy 1.x, eslint 9. Hashing: `@node-rs/argon2` (argon2id, prebuilt). pnpm 11 blocks build scripts: allow `prisma`, `@prisma/client`, `@prisma/engines`, `sharp`, `@swc/core`, `esbuild`, `@nestjs/core` in `pnpm-workspace.yaml` (`allowBuilds`; if rejected use `onlyBuiltDependencies`).
- **Dependencies WP0 installs up front (nobody adds deps later without the mutex in §14.1):** shared: zod, decimal.js · db: prisma, @prisma/client, pg, dotenv, @node-rs/argon2, sharp · core: sharp, exceljs, archiver, playwright, pdf-lib, @fontsource/cairo, decimal.js, zod, pino · api: @nestjs/{common,core,platform-express,testing}, reflect-metadata, rxjs, jsonwebtoken, helmet, multer, exceljs, @node-rs/argon2, pino, supertest, @swc/core, @swc-node/register, unplugin-swc · bot: grammy · web: next, react, react-dom, tailwindcss, postcss, autoprefixer, @tanstack/react-query, lucide-react, clsx, @dnd-kit/core, @dnd-kit/sortable, react-easy-crop, @fontsource/cairo · e2e: @playwright/test · root: typescript, tsx, vitest, eslint, typescript-eslint, @eslint/js, prettier, concurrently, + @types/*.

### 2.1 Root scripts
| Script | Does |
|---|---|
| `pnpm db:up` / `db:down` / `db:status` | `tsx packages/db/scripts/pg.ts up|down|status` (see 2.2) |
| `pnpm db:migrate` | `prisma migrate deploy` on `dms`, then rebuild `dms_template` (drop, create, migrate, base seed) |
| `pnpm db:seed` | base seed into `dms` (`@dms/db`), then `pnpm --filter @dms/core seed:demo` (demo requests, WP8) |
| `pnpm db:generate` | `prisma generate` (WP0 and orchestrator only; fails with EPERM on Windows while any node process holds the engine DLL) |
| `pnpm dev` | `concurrently`: api, web, worker, and bot only if `BOT_TOKEN` is set |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | `eslint .` · `pnpm -r typecheck` (`tsc --noEmit`) · `pnpm -r test` (`vitest run`) |
| `pnpm e2e` | Playwright (starts api+web itself) · `pnpm bot:sim` terminal driver simulator (no token needed) |

### 2.2 PostgreSQL without Docker (verified on this machine; D2)
The npm `embedded-postgres` package does **not** work here (Postgres refuses to start under an Administrator account), so it is **not** a dependency. `packages/db/scripts/pg.ts` drives real binaries from `PG_BIN` (default `C:\Program Files\PostgreSQL\17\bin` on Windows, PATH elsewhere):
- `up`: if `DATABASE_URL` points anywhere other than localhost:54329 → no-op. Else if `.pgdata/PG_VERSION` is missing → `initdb -D .pgdata -U postgres --auth=trust -E UTF8`. If `pg_isready -h localhost -p 54329` fails → `pg_ctl -D .pgdata -o "-p 54329" -l .pgdata/server.log -w start` (pg_ctl drops admin rights itself). Then `CREATE DATABASE dms` if missing. Idempotent. **All child processes are spawned with `stdio: 'ignore'`** (Git Bash hangs if it inherits pg_ctl's handles). `down` = `pg_ctl -D .pgdata -m fast stop`.
- Defaults: `DATABASE_URL=postgresql://postgres@localhost:54329/dms`. `.pgdata/` and `storage-data/` are gitignored.
- **Tests never touch `dms`.** `@dms/db/testing` exports `setupTestDb(tag): Promise<{ url, prisma, teardown }>`: `CREATE DATABASE dms_t_<tag>_<rand> TEMPLATE dms_template` (retry ×3), returns a PrismaClient bound to it, `teardown` disconnects and drops it. Called in `beforeAll` of each test file, so files and agents never share state. Nothing may stay connected to `dms_template`. `dms_template` already contains the base seed.
- The orchestrator runs `pnpm db:up` once and leaves the server running for the whole build.

### 2.3 Environment (`.env.example`, loaded from repo root by `loadEnv()` in `@dms/db`, validated by `getConfig()` in `@dms/core/config`)
`DATABASE_URL`, `PG_BIN`, `API_PORT=4000`, `WEB_PORT=3000`, `API_INTERNAL_URL=http://localhost:4000`, `WEB_PUBLIC_URL`, `JWT_SECRET`, `JWT_ACCESS_TTL_SEC=900`, `REFRESH_TTL_DAYS=30`, `FILE_URL_SECRET`, `STORAGE_DRIVER=local`, `STORAGE_ROOT=./storage-data`, `BOT_TOKEN=`, `BOT_MODE=polling|webhook`, `BOT_WEBHOOK_URL`, `BOT_WEBHOOK_SECRET`, `BOT_WEBHOOK_PORT=4100`, `SAP_ADAPTER=mock|file|s4hana`, `SAP_S4_URL`, `SAP_S4_USER`, `SAP_S4_PASSWORD`, `SAP_S4_CLIENT`, `PDF_BROWSER_CHANNEL=` (empty = bundled Chromium; `msedge` fallback), `WORKER_CONCURRENCY=2`, `LOG_LEVEL=info`, `NEXT_DIST_DIR` (see §14.1).

## 3. Data model notes (schema is authoritative)

### 3.1 Mapping of requirement terms
Driver = `Submitter(kind='DRIVER')` · Expense Type = `LineCategory` + `ExpenseTypeConfig(glAccountId)` + `LineCategoryApprovalRole` · liters = `extraValues.liters` with `LineCategory.quantityFieldKey='liters'` → `RequestLine.quantity/unitPrice` · vehicle/cost center/odometer of a request = `ExpenseRequest` · line snapshot (GL, cost center, vehicle) = `ExpenseLine`; category name snapshot on `RequestLine` · SAP settings = `Setting('sap.config')` (secrets in env) · drafts live only in `BotSession.draft` (a `Request` row and its number exist only after submit, so numbers have no gaps).

### 3.2 JSON shapes (zod in `@dms/shared`, written by WP0b)
- `FieldDefinition { key; labelAr; labelEn; type: 'text'|'number'|'date'|'select'|'lookup'; required: boolean; options?: {value; labelAr; labelEn}[]; lookup?: string; min?: number; max?: number; regex?: string; promptAr?: string; order: number }`
- `Condition` — §5.2. `ChecklistItem { key; labelAr; labelEn; required }`.
- `TemplateConfig { logoKey?; titleAr; titleEn?; companyNameAr?; headerFields: {key; labelAr; labelEn?; show}[]; lineColumns: {key: 'category'|'originalAmount'|'amount'|'quantity'|'unitPrice'|'note'|`extra.${string}`; labelAr; show}[]; categoryOrder?: string[]; showOriginalValues: boolean; showAmountInWords: boolean; footerNoteAr?; signature: { perRow: number; showDateTime: boolean; submitterLabelAr: string } }` — categories missing from `categoryOrder` are appended by `sortOrder` (new expense types appear automatically).
- `BotDraft`, `CorrectionCtx` — §6.

### 3.3 Settings keys (seeded defaults)
`workflow.lockTimeoutMinutes`=15 · `workflow.requireSignatureToApprove`=true · `workflow.slaReminderIntervalHours`=4 · `bot.draftExpiryHours`=24 · `bot.draftReminderHours`=6 · `expense.blockStoppedVehicle`=true · `expense.odometerMaxJumpKm`=3000 · `expense.vehicleChangeRoleCode`="SHIPPING_OFFICER" · `media.maxFileSizeMb`=15 · `media.nearDuplicateDistance`=6 · `files.signedUrlTtlSec`=300 · `reports.zipFolderPattern`="{expenseType}/{requestNumber}" · `reports.exportTtlHours`=72 · `company.profile`={nameAr,nameEn,logoKey} · `sap.config`={companyCode:"1000",documentType:"SA",currency:"EGP",debitPostingKey:"40",creditPostingKey:"50",aggregateSameGlCostCenter:false,documentDateMode:"PAYMENT_DATE"}. Read through `getSetting<T>(db, key)` in `@dms/core/config` (falls back to the default table in `@dms/shared`).

## 4. `@dms/core` contract (WP0 creates every `index.ts` with these exact signatures; unimplemented bodies `throw new DomainError('NOT_IMPLEMENTED', ...)`)

```ts
// common  (WP0b implements fully: config, errors, audit, rbac, jobs/enqueue)
type Db = PrismaClient | Prisma.TransactionClient;
interface Actor { type: 'USER'|'SUBMITTER'|'SYSTEM'; userId?: string; submitterId?: string; label?: string; ip?: string; userAgent?: string }
class DomainError extends Error { constructor(code: ErrorCode, message: string, httpStatus?: number, details?: unknown) }
// ErrorCode: VALIDATION 400 · UNAUTHENTICATED 401 · FORBIDDEN 403 · NOT_FOUND 404 · CONFLICT 409 · LOCKED 409 · INVALID_STATE 409 · NOT_IMPLEMENTED 501
// @dms/core/audit
audit(db, e: { actor: Actor; action: string; entityType: string; entityId?: string; before?: unknown; after?: unknown; meta?: unknown }): Promise<void>
// @dms/core/rbac
getEffectiveRoles(db, userId, at?: Date): Promise<EffectiveRole[]>   // { roleId, code, nameAr, nameEn, scopeDepartmentId, isSuperUser, viaDelegationId?, onBehalfOfUserId? }
loadAuthUser(db, userId): Promise<AuthUser | null>                  // { id, username, fullName, departmentId, isSuperUser, permissions: string[], roles: EffectiveRole[] }
// @dms/core/jobs
enqueueJob(db, j: { type: string; payload?: object; queue?: 'default'|'telegram'; runAt?: Date; dedupeKey?: string; maxAttempts?: number; priority?: number }): Promise<{ id: string; created: boolean }>
startJobRunner(o: { prisma; queues: string[]; handlers: Record<string, JobHandler>; workerId?: string; pollMs?: number; concurrency?: number }): { stop(): Promise<void> }   // WP4
runDueJobs(o: { prisma; queues: string[]; handlers }): Promise<number>   // WP4; drains due jobs once, used by tests/harness
// @dms/core/storage  (WP5)
interface StorageAdapter { put(key, data: Buffer | Readable, o?: { contentType?: string; ifNotExists?: boolean }): Promise<{ key; size; sha256 }>;
  get(key): Promise<Buffer>; stream(key): Readable; exists(key): Promise<boolean>; stat(key): Promise<{ size: number }>; delete(key): Promise<void> }
getStorage(): StorageAdapter;  createLocalStorage(root: string): StorageAdapter
signFileUrl(key, o?: { ttlSec?: number; download?: boolean; fileName?: string }): string      // "/api/v1/files/<b64url(key)>?exp=..&d=..&n=..&sig=.."
verifyFileUrl(p: { keyB64: string; exp: string; d?: string; n?: string; sig: string }): { key: string; download: boolean; fileName?: string } | null
// @dms/core/media  (WP5)
sniffMime(bytes: Buffer): 'image/jpeg'|'image/png'|'image/webp'|'application/pdf'|null
ingestAttachment(db, storage, i: { bytes: Buffer; originalName?: string; botSessionId?: string; requestId?: string; lineId?: string; correctionRequestId?: string;
  uploadedBySubmitterId?: string; uploadedByUserId?: string; telegramFileUniqueId?: string }): Promise<Attachment>
flagDuplicates(db, requestId: string): Promise<number>
// @dms/core/notifications  (WP2)
notifyUsers(db, n: { userIds: string[]; type; requestId?; titleAr; titleEn?; bodyAr; bodyEn?; data? }): Promise<void>
notifyRole(db, n: { roleId: string; departmentId?: string | null; ...same }): Promise<void>      // role holders + active delegates
notifySubmitter(db, n: { submitterId; type; requestId?; bodyAr; data? }): Promise<void>         // Notification(TELEGRAM) + job telegram.send
// @dms/core/engine  (WP2)
registerModule(m: RequestModule): void
submitRequest(prisma, input: SubmitRequestInput, actor: Actor): Promise<{ id: string; number: string }>
// SubmitRequestInput { requestTypeCode; channel; submitterId?; submittedByUserId?; clientKey?; headerValues: Record<string, unknown>;
//   lines: { categoryId; amount: string; extraValues?: Record<string,string>; attachmentIds: string[]; lineDate?: string; note?: string }[] }
getRequestDetail(db, requestId, viewer?: AuthUser): Promise<RequestDetail>
listQueue(db, user: AuthUser, f: QueueFilters): Promise<Paged<QueueItem>>;  queueCounters(db, user): Promise<QueueCounter[]>
listRequests(db, user: AuthUser, f: RequestFilters): Promise<Paged<RequestListItem>>;  canViewRequest(db, user, requestId): Promise<boolean>
listSubmitterRequests(db, submitterId, limit?: number): Promise<{ id; number; status; totalFinal: string; submittedAt: Date; currentSteps: string[] }[]>
acquireLock(prisma, requestId, user): Promise<LockInfo>;  releaseLock(prisma, requestId, user, force?: boolean): Promise<void>;  heartbeatLock(prisma, requestId, user): Promise<LockInfo>
approveStep(prisma, a: { requestId; stepInstanceId; user: AuthUser; comment?; checklist?: Record<string, boolean>; actionData?: Record<string, unknown>; actor: Actor }): Promise<void>
requestCorrection(prisma, a: { requestId; stepInstanceId; user; items: { lineId?; attachmentId?; reasonCode; fixType; comment }[]; actor }): Promise<void>
sendBack(prisma, a: { requestId; stepInstanceId; user; comment; actor }): Promise<void>
rejectRequest(prisma, a: { requestId; stepInstanceId; user; reason; actor }): Promise<void>
editLine(prisma, a: { requestId; stepInstanceId; lineId; user; amount?: string; categoryId?: string; extraValues?: Record<string,string>; reason; actor }): Promise<void>
listOpenCorrections(db, submitterId): Promise<OpenCorrection[]>
submitCorrection(prisma, a: { correctionRequestId; submitterId; newAttachmentIds?: string[]; newAmount?: string }): Promise<{ returnedToStep: boolean }>
evaluateCondition(c: Condition, facts: ConditionFacts): boolean;  simulateWorkflow(db, versionId, sample): Promise<{ stepKey; applies: boolean }[]>
createDraftVersion / saveDraftVersion / publishWorkflowVersion(prisma, ...)   // validation rules §5.1
// @dms/core/expense (WP2)   registerExpenseModule(): void
// @dms/core/fleet  (WP1)
getCurrentAssignment(db, submitterId): Promise<(DriverVehicleAssignment & { vehicle: Vehicle & { costCenter; vehicleType } }) | null>
assignVehicle(prisma, a: { submitterId; vehicleId; source?; note?; vehicleChangeRequestId?; actor }): Promise<DriverVehicleAssignment>   // closes the open row, opens a new one
createVehicleChangeRequest(prisma, a: { submitterId; toVehicleId?: string; requestedVehicleText?: string }): Promise<VehicleChangeRequest>  // notifies role
decideVehicleChangeRequest(prisma, a: { id; approve: boolean; comment?; user: AuthUser; actor }): Promise<VehicleChangeRequest>          // approve => assignVehicle + notifySubmitter
checkOdometer(db, vehicleId, reading: number): Promise<{ last: number | null; warning: 'LOWER_THAN_LAST'|'UNREALISTIC_JUMP'|null }>
// @dms/core/sap  (WP4)
buildJournalEntry(db, requestId): Promise<JournalEntryDoc>;  getSapAdapter(name?): SapPostingAdapter;  processSapPosting(prisma, postingId, o?: { trigger?: 'AUTO'|'MANUAL'; userId? }): Promise<SapPosting>
// @dms/core/pdf  (WP4)
buildDocumentModel(db, requestId, o?: { templateConfig?: TemplateConfig }): Promise<DocumentModel>;  renderDocumentHtml(model): string
htmlToPdf(html: string): Promise<Buffer>;  renderRequestPdf(db, requestId, o?): Promise<Buffer>;  finalizeRequestPdf(prisma, storage, requestId): Promise<RequestDocument>;  amountToArabicWords(amount: string): string
// @dms/core/reports  (WP5)
queryReport(db, f: ReportFilters, o: { groupBy?: GroupBy; page; pageSize }): Promise<ReportResult>;  runExport(prisma, storage, exportId): Promise<void>;  dashboardSummary(db, f): Promise<DashboardSummary>
```

## 5. Workflow engine

### 5.1 Versions and stages
A `WorkflowVersion` is an ordered list of `WorkflowStep`. A **stage** is a maximal run of consecutive steps sharing a non-null `parallelGroup`; a step with `parallelGroup=null` is its own stage. Publish validation: ≥1 step; keys unique; a parallel group is contiguous; `ROLE` steps have a role; at most one `PAYMENT` step, it is last and not in a group; conditions parse. Publishing sets the old ACTIVE version to ARCHIVED and the draft to ACTIVE in one transaction. Editing never mutates a non-DRAFT version: "edit" = `createDraftVersion(basedOn)` → save → publish. A request stores `workflowVersionId` at submit and only ever reads that version.

**Expense-type-driven steps (decided):** (a) explicit `ROLE` steps with condition `{type:'LINE_CATEGORY_REQUIRES_ROLE'}` — true iff some line's current category lists the step's role in `LineCategoryApprovalRole`. The seeded workflow has Maintenance Engineer and Shipping Officer as such steps in parallel group `extra`. (b) one optional `DYNAMIC_CATEGORY_ROLES` slot step: at instantiation it expands to one instance per required role that no explicit `LINE_CATEGORY_REQUIRES_ROLE` step of the version covers (`stepKey = "<slotKey>:<ROLE_CODE>"`, names from the role, same stage as the slot); zero roles → no instance. So adding a role to an expense type works for new requests without editing the workflow.

### 5.2 Condition JSON
```ts
type Condition =
 | { type: 'ALWAYS' }
 | { type: 'LINE_CATEGORY_REQUIRES_ROLE' }
 | { type: 'LINE_CATEGORY_IN'; categoryCodes: string[] }                         // any line has one of these categories
 | { type: 'TOTAL_AMOUNT'; op: 'gt'|'gte'|'lt'|'lte'|'eq'; value: string }        // decimal string vs current total
 | { type: 'FIELD'; field: string; op: 'eq'|'neq'|'in'|'nin'|'gt'|'gte'|'lt'|'lte'|'exists'; value?: string|number|boolean|string[] }
 | { type: 'AND' | 'OR'; conditions: Condition[] } | { type: 'NOT'; condition: Condition }
interface ConditionFacts { stepRoleId: string; totalAmount: string; lineCategoryCodes: string[]; requiredRoleIds: string[];
  header: Record<string, unknown>; department: { code: string | null }; module: Record<string, unknown> }
```
`FIELD.field` is a dot path into the facts (`header.odometer`, `department.code`, `module.vehicleTypeCode`, `module.costCenterCode`). Missing path → false (except `exists`). The expense module supplies `module = { vehicleNumber, vehicleTypeCode, costCenterCode, vehicleStatus }`.

### 5.3 Submit (one transaction, timeout 15 s)
validate (type active, channel allowed, category belongs to type and is active, amount > 0 with ≤ 2 decimals, required extra fields, attachment count within min/max, attachments belong to the submitter's draft; then `module.validateSubmission`) → idempotency: existing `clientKey` returns the existing request → number = `INSERT INTO request_number_counters ... ON CONFLICT (prefix, year) DO UPDATE SET "lastValue" = request_number_counters."lastValue" + 1 RETURNING "lastValue"` formatted `{PREFIX}-{YY}-{000000}` (YY = Cairo year) → insert `Request` (pins active workflow + default template version, submitter's active signature) and lines (`originalAmount=amount`, `originalCategoryId=categoryId`, quantity/unitPrice, `lineDate` default = Cairo submission date) → attach files (`requestId`, `lineId`, clear `botSessionId`) → `module.afterCreate` → `flagDuplicates` → instantiate steps → `advance` → events `SUBMITTED` → `notifySubmitter(REQ_SUBMITTED)`.

### 5.4 Instantiate and advance
Instantiate: create one `RequestStepInstance(PENDING)` per ROLE step and per slot expansion, with `stageIndex`, name/role snapshots. Then evaluate every condition once: false → `NOT_APPLICABLE` (event `STEP_NOT_APPLICABLE`) so the progress bar is complete from the start.
`advance(tx, request)`: if any instance in `currentStageIndex` is `ACTIVE` or `AWAITING_CORRECTION` → return. Take the next stage that has instances; re-evaluate conditions of its `PENDING`/`NOT_APPLICABLE` instances with fresh facts: true → `ACTIVE` (`activatedAt=now`, `dueAt=now+slaHours` or null), false → `NOT_APPLICABLE`. Set `currentStageIndex`. No ACTIVE instance → repeat with the following stage. No stage left → **complete**: `status = paidAt ? PAID : APPROVED`, `completedAt`, `currentStageIndex=null`, `module.onCompleted`, event `COMPLETED`. For each activated instance: `notifyRole(STEP_WAITING)` and `notifySubmitter(REQ_AT_STEP)`.
**Re-evaluation after any line change** (edit or correction): instances with `stageIndex > currentStageIndex` and status `PENDING`/`NOT_APPLICABLE` are recomputed (slot stages may gain instances). Stages at or before the current one are frozen — a request never goes back to earlier approvers because of an edit.

### 5.5 State machines
Request: `IN_REVIEW ⇄ CORRECTION_REQUESTED` (CORRECTION_REQUESTED iff ≥1 OPEN CorrectionRequest) → `APPROVED` | `PAID` | `REJECTED` (terminal). `CANCELLED` reserved.
Step instance: `PENDING → ACTIVE → APPROVED`; `PENDING ⇄ NOT_APPLICABLE` (only while not yet reached); `ACTIVE ⇄ AWAITING_CORRECTION`; `ACTIVE|AWAITING_CORRECTION|APPROVED → PENDING` and `APPROVED → ACTIVE` (send-back); `ACTIVE → REJECTED`; others → `CANCELLED` on reject. There is no separate SKIPPED status: "skipped" is `NOT_APPLICABLE`.

### 5.6 Actions (every action: one transaction; `SELECT ... FROM requests WHERE id=$1 FOR UPDATE` first; re-check state; bump `rowVersion`; write `RequestEvent` + `audit`)
Common preconditions (`assertCanAct`): request status ∈ {IN_REVIEW, CORRECTION_REQUESTED}; instance belongs to the request and is `ACTIVE`; the user holds the instance's role among effective roles and the role scope matches (`scopeDepartmentId` null or = request.departmentId); the action is in the step's `allowedActions`; user has `requests.act`; no unexpired lock held by **another** user (else `LOCKED` 409 with holder name). The acting user's lock is acquired implicitly and released by approve/sendBack/reject/requestCorrection.
- **approve** — also: no OPEN correction on this instance; every `required` checklist item true (`VALIDATION` otherwise; seeded first step requires `receipts_match`); if `workflow.requireSignatureToApprove` the user needs an active signature. Effects: `APPROVED`, `actedAt`, `actedById`, `signatureId`, `comment`, `checklist`, delegation fields (§5.7); event `STEP_APPROVED`. If `kind=PAYMENT`: `module.beforeApprove`, set `paidAt`, `paidById`, `status=PAID`, `module.onPaid`, event `PAID`, `notifySubmitter(REQ_PAID)`. Then `advance`.
- **requestCorrection** — ≥1 item, each with a non-empty comment and a line and/or attachment of this request. Effects: `CorrectionRequest(OPEN)` rows; instance → `AWAITING_CORRECTION`, `dueAt=null`, `correctionRequestedById`; request → `CORRECTION_REQUESTED`; event `CORRECTION_REQUESTED`; `notifySubmitter(REQ_CORRECTION, data.correctionRequestIds)`. Parallel siblings stay ACTIVE and may still act.
- **submitCorrection** (submitter, via bot) — correction must be OPEN and belong to the submitter's request. `REUPLOAD`/`BOTH`: needs ≥1 new attachment; attachment-targeted → that attachment gets `isCurrent=false, supersededById=<first new>`; line-targeted → all current attachments of the line are superseded; new files get `requestId/lineId/correctionRequestId`. `AMOUNT`/`BOTH`: `newAmount > 0`; `line.amount` updated, `LineEdit(source=SUBMITTER_CORRECTION)`; `originalAmount` untouched. Mark RESOLVED with `resolution`. Recompute totals, warnings, `flagDuplicates`, re-evaluate later stages. When the instance has no OPEN correction left: instance → `ACTIVE` (**same row, same step**), `returnedAt=now`, `dueAt` recomputed, request → `IN_REVIEW` if nothing else is open, `notifyUsers([correctionRequestedById], CORRECTION_RETURNED)`. Any holder of the role may act on it (absence cover); the queue marks it "returned to X".
- **sendBack** — mandatory comment. Target = greatest `stageIndex < current` that has an `APPROVED` instance; none → `INVALID_STATE` ("first step: reject or request a correction instead"). Current-stage instances that are ACTIVE/AWAITING_CORRECTION/APPROVED → `PENDING` (acted fields cleared, their OPEN corrections → CANCELLED); target-stage `APPROVED` instances → `ACTIVE` (acted fields and signature cleared, `activatedAt=returnedAt=now`, new `dueAt`); `currentStageIndex=target`; request → `IN_REVIEW`; event `STEP_SENT_BACK`; notify target role.
- **reject** — mandatory reason. Instance → `REJECTED`; all PENDING/ACTIVE/AWAITING_CORRECTION → `CANCELLED`; OPEN corrections → CANCELLED; request `REJECTED` (`rejectedAt/By/Reason`, `currentStageIndex=null`); `module.onRejected`; `notifySubmitter(REQ_REJECTED)`. Final.
- **editLine** — mandatory reason. `amount`/`extraValues` need `step.canEditAmounts` + permission `requests.edit_amounts`; `categoryId` needs `step.canReclassify` + `requests.reclassify` (new category active, same request type). Amount ≥ 0 with ≤ 2 decimals. One `LineEdit(source=APPROVER)` per changed field (`oldValue/newValue`, labels for category); update `amount`, `categoryId`, category name snapshot, `extraValues`, `quantity/unitPrice`, `isEdited=true`; **`originalAmount`, `originalCategoryId`, `originalExtraValues` are never written after submit**. `module.onLineChanged` (GL snapshot follows the new category), recompute `totalFinal` and warnings, re-evaluate later stages, event `LINE_EDITED`, `notifySubmitter(REQ_LINE_EDITED)`. The request stays at the same step and continues forward on approve. Approvers cannot add/replace images.
- **Treasury** = approve on the `PAYMENT` step with `actionData.treasuryId` (optional; default treasury). Expense `onPaid`: store `ExpenseRequest.treasuryId`, create `SapPosting(PENDING, idempotencyKey=request.id, payload=buildJournalEntry)`, `enqueueJob(sap.post, dedupeKey 'sap.post:<requestId>')`, `enqueueJob(pdf.finalize, dedupeKey 'pdf.finalize:<requestId>')`.

**Claim/lock:** `acquireLock` upserts `RequestLock` when none exists, it is expired, or it belongs to the same user (`expiresAt = now + workflow.lockTimeoutMinutes`); otherwise `LOCKED` with holder. `heartbeatLock` extends; `releaseLock` deletes own lock; `force` needs `requests.force_unlock` (event `LOCK_FORCED`). Viewing does not lock; the web locks when the user opens the action panel and heartbeats every 60 s. Expired locks are simply ignored.

### 5.7 Delegation, visibility, SLA
- `getEffectiveRoles(user, now)` = own active roles ∪ roles of every delegator with a delegation to the user where `startsAt ≤ now < endsAt`, not revoked (`roleId` null = all the delegator's roles). Effective permissions = union over effective roles; `Role.isSuperUser` grants all. When the role used for an action is only held via delegation, the instance records `delegationId` + `onBehalfOfUserId`; `actedById` and the signature are always the person who clicked. The PDF adds "عن / <delegator name>".
- Queue = instances `ACTIVE` (tab 2: `AWAITING_CORRECTION`) whose `roleId` ∈ effective roles with matching scope. Two accountants therefore see the same rows. `requests.view` = requests having any step instance for one of my effective roles; `requests.view_all` = every request in my scope. `canViewRequest` guards every `/requests/:id*` route and every signed URL issued (IDOR).
- SLA: `dueAt = activatedAt + slaHours` (wall-clock). Job `sla.scan` (every 5 min): ACTIVE instances with `dueAt < now` and (`lastReminderAt` null or older than `workflow.slaReminderIntervalHours`) → `notifyRole(SLA_REMINDER)`, bump `lastReminderAt/reminderCount`. "Delayed" everywhere = ACTIVE and `dueAt < now`.

### 5.8 `RequestEvent.type`
SUBMITTED, STEP_ACTIVATED, STEP_NOT_APPLICABLE, STEP_APPROVED, STEP_SENT_BACK, CORRECTION_REQUESTED, CORRECTION_SUBMITTED, CORRECTION_CANCELLED, LINE_EDITED, ATTACHMENT_SUPERSEDED, DUPLICATE_FLAGGED, REJECTED, PAID, COMPLETED, PDF_FINALIZED, SAP_POSTED, SAP_FAILED, LOCK_FORCED.

### 5.9 `Notification.type`
Users: STEP_WAITING, CORRECTION_RETURNED, SLA_REMINDER, VCR_PENDING, EXPORT_READY, SAP_FAILED. Submitters (Egyptian Arabic text in `core/src/notifications/messages.ts`): REQ_SUBMITTED, REQ_AT_STEP, REQ_CORRECTION, REQ_LINE_EDITED, REQ_REJECTED, REQ_PAID, VCR_DECIDED, DRAFT_REMINDER, DRAFT_EXPIRED.

## 6. Telegram bot

`createBot(deps: { prisma; storage; token: string; botInfo?: UserFromGetMe; downloadFile(fileId): Promise<{ bytes: Buffer; fileName?: string }>; now?(): Date }): Bot`. Session = `BotSession` row loaded/saved by our own middleware (no grammY session plugin). Updates of one user are processed serially (in-process per-user queue); `update_id ≤ lastUpdateId` is dropped; token-bucket rate limit (20 updates / 10 s per user). Modes: `BOT_MODE=polling` (`bot.start()`) or `webhook` (node:http + `webhookCallback`, `BOT_WEBHOOK_SECRET` checked). The same process runs `startJobRunner({ queues: ['telegram'] })` for `telegram.send`. Files are downloaded immediately and passed to `ingestAttachment` (never keep `file_id`).

| State | Input → next |
|---|---|
| `UNLINKED` | `/start` → contact button. Contact with `contact.user_id === from.id` and normalized phone matching an active Submitter → link, `IDLE`. Foreign contact → refuse + audit. Typed number → "use the button". No match → "contact the supervisor". |
| `IDLE` | "طلب جديد" → `CONFIRM_VEHICLE` (no assignment → offer change request; vehicle STOPPED and `expense.blockStoppedVehicle` → blocked message). "طلباتي" → last 10 requests. "تصحيح مطلوب (n)" → `CORR_PICK`. An unexpired draft → offer resume/discard. |
| `CONFIRM_VEHICLE` | أيوه → `ODOMETER`; لأ → `VCR_INPUT` |
| `VCR_INPUT` | vehicle number (digits normalized) → `createVehicleChangeRequest` → `VCR_PENDING` (new request blocked until decided; decision arrives as `VCR_DECIDED` → `IDLE`) |
| `ODOMETER` | integer ≥ 0 → `checkOdometer`; warning → `ODOMETER_CONFIRM` (الرقم صح / هكتب تاني); else `CHOOSE_TYPE` |
| `CHOOSE_TYPE` | category button → `AMOUNT` |
| `AMOUNT` | `parseAmount` (Arabic-Indic/Persian digits, commas, decimals; > 0) → `EXTRA_FIELD(i)` if the category has extra fields, else `PHOTOS` |
| `EXTRA_FIELD` | validate by FieldDefinition; last field → `PHOTOS` |
| `PHOTOS` | photo/document → ingest, reply with count; "خلصت صور" requires `minAttachments` → `LINE_DONE`; text → guidance |
| `LINE_DONE` | "إضافة مصروف تاني" → `CHOOSE_TYPE`; "كده خلصت" → `SUMMARY` |
| `SUMMARY` | "تأكيد وإرسال" → `submitRequest(clientKey = session.id + ':' + draft.startedAt)` → number message → `IDLE`; "تعديل" → `EDIT_PICK`; "إلغاء" → confirm → `IDLE` |
| `EDIT_PICK` / `EDIT_LINE` | pick a line → delete / change amount (`EDIT_AMOUNT`) / back → `SUMMARY` |
| `CORR_PICK` → `CORR_AMOUNT` / `CORR_PHOTOS` | by `fixType`; done → `submitCorrection` → `IDLE` |

Any state: `/start` or "القائمة" shows the menu without losing the draft; unexpected input → friendly hint for the current state; errors → apology message, state kept. Every draft change sets `draftUpdatedAt` and `draftExpiresAt = now + bot.draftExpiryHours`.
```ts
interface BotDraft { requestTypeCode: string; startedAt: string; vehicleId: string; vehicleNumber: string; costCenterCode: string; odometer?: number; odometerWarning?: string;
  lines: DraftLine[]; current?: Partial<DraftLine> & { extraIndex?: number }; editingIndex?: number }
interface DraftLine { categoryId: string; categoryCode: string; categoryName: string; amount: string; extraValues: Record<string, string>; attachmentIds: string[] }
interface CorrectionCtx { requestId: string; correctionRequestId: string; newAttachmentIds: string[]; newAmount?: string }
```
Callback data: `<verb>:<arg>` ≤ 64 bytes (`cat:<categoryId>`, `corr:<correctionRequestId>`, `yes`, `no`, …). All user-facing text in `apps/bot/src/messages.ts` (Egyptian Arabic).
**Harness** (`apps/bot/src/testing/harness.ts`): `createBotHarness({ prisma, storage })` builds the bot with a fake `botInfo`, an API transformer (`bot.api.config.use`) that records every outgoing call and returns fake results, and an in-memory `downloadFile`. API: `user(tgId)` → `{ start(), text(s), contact({ phone, userId }), photo(bytes), document(bytes, name), click(labelOrData) }`, `sent(tgId)`, `lastText(tgId)`, `flushTelegramJobs()`. `pnpm bot:sim` wraps the harness in a readline loop.

## 7. Jobs and outbox

### 7.1 Mechanics
`enqueueJob` inserts with `ON CONFLICT ("dedupeKey") DO NOTHING`; called with the business transaction's `tx`, so a job exists iff the change committed. Claim (one statement):
```sql
UPDATE jobs SET status='RUNNING', "lockedAt"=now(), "lockedBy"=$1, attempts=attempts+1, "updatedAt"=now()
WHERE id = (SELECT id FROM jobs WHERE queue = ANY($2) AND status='PENDING' AND "runAt" <= now()
            ORDER BY priority DESC, "runAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *;
```
Success → `DONE`. Error → `attempts < maxAttempts` ? `PENDING` with `runAt = now + min(30s·2^(attempts-1), 1h) ± 20%` : `FAILED`; `lastError` saved. Every 60 s: `RUNNING` rows with `lockedAt` older than 10 min → `PENDING` (crash recovery) — so **every handler is idempotent**. Poll 1 s when idle, immediately when a job was found; `WORKER_CONCURRENCY` loops. Schedules: the worker inserts recurring jobs every minute with `dedupeKey = '<type>:<floor(epoch/interval)>'` (safe with several workers).

### 7.2 Job types
`sap.post {postingId}` · `pdf.finalize {requestId}` · `report.export {exportId}` · `sla.scan {}` (5 min) · `bot.draft_sweep {}` (15 min: reminder after `bot.draftReminderHours`, expire + delete draft attachments/files after `draftExpiresAt`) · `exports.sweep {}` (hourly: expire old exports) · queue `telegram`: `telegram.send {notificationId}` (no chat id → Notification `SKIPPED`) · `email.send` (stub).

### 7.3 SAP posting idempotency (`processSapPosting`)
1. Tx: lock the `SapPosting` row `FOR UPDATE`. `POSTED` → return (no-op). Remember whether it was `POSTING` (outcome of a previous attempt unknown). Set `POSTING`, `attempts+1`, insert `SapPostingAttempt`. Commit.
2. If it was `POSTING`: `adapter.findByReference(reference, companyCode)`; found → go to 4 with that document (no second post).
3. `adapter.post(doc)`.
4. Tx: `POSTED`, doc number / fiscal year / `postedAt` on `SapPosting` and `ExpenseRequest`, attempt closed, event `SAP_POSTED`.
On error: `FAILED` + `lastError`, attempt closed, event `SAP_FAILED`, rethrow so the job retries with backoff; the request stays `PAID`. After the last automatic attempt: `notifyRole`-style notification to holders of `sap.retry`. Manual retry (`POST /sap/postings/:id/retry`) resets the same job row to `PENDING` (never a second posting row: `requestId` and `idempotencyKey` are unique).

## 8. Storage, signed URLs, images

- `LocalFsStorage(root)`: key = relative POSIX path, validated `^[A-Za-z0-9/_.\-]+$`, no `..`; writes via temp file + rename; `ifNotExists` fails if present. `STORAGE_DRIVER=s3` is a documented stub behind the same interface.
- Keys: `attachments/<yyyy>/<mm>/<cuid>.<ext>` · `thumbs/<yyyy>/<mm>/<cuid>.jpg` · `signatures/<ownerId>/<cuid>.png` · `logos/<cuid>.png` · `documents/<requestNumber>/final.pdf` · `exports/<exportId>/<fileName>` · `sap-export/<yyyy-mm-dd>/<requestNumber>.csv`.
- Signed URL: `sig = base64url(HMAC-SHA256(FILE_URL_SECRET, key + '\n' + exp + '\n' + d + '\n' + n))`, default TTL `files.signedUrlTtlSec`. `GET /api/v1/files/:keyB64` is the only public file route: verify (constant-time), check `exp`, stream with stored content type, `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=<remaining>`, `Content-Disposition` when `d=1`. URLs are minted only inside responses of permission-checked endpoints.
- `ingestAttachment`: size ≤ `media.maxFileSizeMb`; type by magic bytes only (JPEG/PNG/WebP/PDF), declared type ignored; sha256; images: `sharp(bytes).rotate()` metadata, thumbnail 320 px wide JPEG q70, **dHash** = resize 9×8 greyscale, 64 bits `left > right`, stored as signed bigint (`BigInt.asIntN(64, v)`); PDFs: no thumb/phash. Store original + thumb, insert `Attachment`.
- `flagDuplicates(requestId)` for each current attachment of the request (flag, never block):
```sql
SELECT a.id, a."requestId", CASE WHEN a.sha256 = $1 THEN 0 ELSE bit_count((a.phash # $2::bigint)::bit(64)) END AS dist
FROM attachments a WHERE a."requestId" IS NOT NULL AND a."requestId" <> $3
  AND (a.sha256 = $1 OR (a.phash IS NOT NULL AND bit_count((a.phash # $2::bigint)::bit(64)) <= $4)) ORDER BY dist LIMIT 5;
```
Upsert `AttachmentDuplicate(kind = EXACT if sha256 equal else NEAR)`, set `Request.hasDuplicateWarning`, event `DUPLICATE_FLAGGED`.

## 9. PDF

`buildDocumentModel` → `renderDocumentHtml` → `htmlToPdf`. The model is generic: title, logo, header rows (core: number, date, submitter; module `templateData`: vehicle number, vehicle type, cost center, odometer), line table (category, original amount, final amount when edited, quantity, unit price, configured extra columns), total in digits and Arabic words, **signature blocks**. Blocks = submitter block (name, `submitterSignature`, `submittedAt`) + one block per step instance with `status=APPROVED` and `showInSignatures`, ordered by `sortOrder`: role title (`roleNameAr`), `actedBy.fullName`, the signature image stored on the instance (`signatureId`), `actedAt` in Africa/Cairo; delegated → "عن <name>". `NOT_APPLICABLE` steps never appear, so the sheet always matches the workflow that ran. A preview of an unfinished request shows only the approvals so far.
HTML: `<html lang="ar" dir="rtl">`, inline CSS, **no network**: Cairo font (400/700 Arabic + Latin subsets) read from `@fontsource/cairo/files/*.woff2` and embedded as base64 `@font-face`; fallback stack `"Cairo","Segoe UI","Tahoma","Arial"`; logo and signatures as data URIs; all values through `escapeHtml`. Layout renderers are TS functions keyed by `TemplateVersion.layoutKey` (`expense-sheet`, `generic-request`).
`htmlToPdf`: one lazily launched Playwright browser per process (`chromium.launch({ channel: PDF_BROWSER_CHANNEL || undefined })`; if the bundled browser is missing, retry with `channel: 'msedge'`, then `'chrome'`), `page.setContent(html, { waitUntil: 'load' })`, `await page.evaluate(() => document.fonts.ready)`, `page.pdf({ format: 'A4', printBackground: true, margin 12mm })`.
`finalizeRequestPdf` (job `pdf.finalize`, idempotent): existing FINAL document → return; render; sha256; `storage.put('documents/<number>/final.pdf', { ifNotExists: true })`; insert `RequestDocument(FINAL, isLocked)`; event `PDF_FINALIZED`. Never overwritten; `GET /requests/:id/pdf/verify` recomputes the hash. `amountToArabicWords("1250.50")` → `"ألف ومائتان وخمسون جنيهاً مصرياً وخمسون قرشاً فقط لا غير"` (unit tests: 0, 1, 2, 11, 100, 200, 1000, 2000, 1 000 000, piastres).

## 10. SAP

```ts
interface JournalEntryDoc { idempotencyKey: string; reference: string /*XBLNR = request number*/; companyCode: string; documentType: string; currency: 'EGP';
  postingDate: string; documentDate: string; headerText: string /* driver + vehicle no., ≤ 25 chars */;
  items: { side: 'D' | 'C'; postingKey: string; glAccount: string; costCenter?: string; amount: string; assignment: string /*ZUONR = request number*/; itemText: string }[] }
interface SapPostingAdapter { name: string; post(doc: JournalEntryDoc): Promise<{ documentNumber: string; fiscalYear: string; companyCode: string; raw?: unknown }>;
  findByReference(reference: string, companyCode: string): Promise<{ documentNumber: string; fiscalYear: string } | null> }
```
`buildJournalEntry`: one debit per line with `amount > 0` using the `ExpenseLine` snapshot (GL, cost center), aggregated by GL+cost center when `sap.config.aggregateSameGlCostCenter`; one credit to the treasury `cashGlNumber` for the total; must balance (else `DomainError`); posting date = `paidAt` in Cairo; document date per `documentDateMode`.
Adapters (`SAP_ADAPTER`): **mock** (default; in-process ledger keyed by reference; `failNext(n)`, `failAfterAccept()` for crash simulation), **file** (CSV + XLSX per posting under `sap-export/`, doc number `FILE-<seq>`, `exportFileKey` saved), **s4hana** (builds the `JournalEntryBulkCreateRequest` SOAP envelope, basic auth, parses confirmation; `findByReference` TODO via journal-entry item query; unit-tested against fixtures only — no credentials exist). Cash Journal (FBCJ): interface placeholder + `docs/SAP_INTEGRATION.md`.

## 11. REST API (`/api/v1`, JSON, Bearer access token)

Conventions: errors `{ error: { code, message, details? } }`; lists `?page=1&pageSize=25&sort=field:desc&q=` → `{ items, total, page, pageSize }`; bodies validated with zod (`ZodPipe`); decimals as strings; dates ISO UTC. Every handler carries `@RequirePermission(...codes)` (any-of), `@AuthOnly()` or `@Public()` — a meta-test fails otherwise. "P:" = permission.

**Auth / platform (WP1)**
- `POST /auth/login` P:public `{username,password}` → `{accessToken, refreshToken, expiresIn, user: Me}` · `POST /auth/refresh` public `{refreshToken}` → same (rotation; reuse of an old token revokes the session) · `POST /auth/logout` auth · `GET /auth/me` auth → `Me {id, username, fullName, locale, departmentId, isSuperUser, roles: EffectiveRole[], permissions: string[], hasSignature}` · `POST /auth/change-password` auth · `GET /auth/sessions`, `DELETE /auth/sessions/:id` auth (own)
- `GET /users` P:users.view · `POST /users`, `PATCH /users/:id`, `PUT /users/:id/roles {roleIds}`, `POST /users/:id/reset-password`, `POST /users/:id/revoke-sessions` P:users.manage · `GET /users/:id` P:users.view
- `POST /users/:id/signature`, `POST /submitters/:id/signature` (multipart `file`, PNG/JPEG ≤ 2 MB, cropped client-side; stored as PNG) P:signatures.manage → `{signatureId, url}` · `GET …/signature` → `{current, history[]}` · `DELETE …/signature`
- `GET /roles` P:users.view · `POST /roles`, `PATCH /roles/:id` P:roles.manage · `GET /roles/matrix` → `{roles, permissions, grants: {roleId: code[]}}`, `PUT /roles/:id/permissions {codes}` P:roles.manage
- `GET /delegations?mine=1` auth · `POST /delegations {toUserId, roleId?, startsAt, endsAt, reason?, fromUserId?}` auth (other `fromUserId` needs delegations.manage_all) · `POST /delegations/:id/revoke`
- `GET /audit-logs?entityType&entityId&actorUserId&action&from&to&q` P:audit.view
- `GET /settings`, `PUT /settings/:key {value}` P:settings.manage · `GET /settings/public` auth
- `GET /notifications?unread=1`, `GET /notifications/unread-count`, `POST /notifications/:id/read`, `POST /notifications/read-all` auth
- `GET /lookups/:entity?q=` auth → `[{id, code, label}]` (roles, users, departments, submitters, vehicles, vehicle-types, cost-centers, gl-accounts, expense-types, treasuries, request-types)
- `GET /health`, `GET /health/ready`, `GET /metrics` public

**Master data (WP1)** — for `R` ∈ departments, submitters, vehicle-types, cost-centers, gl-accounts, vehicles, treasuries, expense-types: `GET /R`, `GET /R/:id`, `GET /R/export.xlsx` P:masterdata.view · `POST /R`, `PATCH /R/:id`, `POST /R/:id/activate|deactivate`, `POST /R/import?dryRun=1` (xlsx) → `{created, updated, errors: [{row, message}]}` P:masterdata.manage. No DELETE.
- expense-types body: `{code, nameAr, nameEn, icon, sortOrder, glAccountId, extraFields, quantityFieldKey, unitPriceMin, unitPriceMax, minAttachments, maxAttachments, maxAmountWarning, approvalRoleIds, isActive}` (writes LineCategory + ExpenseTypeConfig + approval roles)
- `POST /submitters/:id/telegram-unlink` P:submitters.telegram_link · submitters list includes `currentVehicle`
- `GET /assignments/current` (drivers ↔ vehicles now, plus stopped/unassigned vehicles), `GET /assignments?submitterId&vehicleId` P:masterdata.view · `POST /assignments {submitterId, vehicleId, note?}`, `POST /assignments/:id/close` P:assignments.manage
- `GET /vehicle-change-requests?status` P:vehicle_changes.view · `POST /vehicle-change-requests/:id/approve|reject {comment?}` P:vehicle_changes.decide

**Workflow (WP2)**
- `GET /request-types`, `GET /request-types/:id` auth · `POST`, `PATCH /request-types/:id`, `POST|PATCH /request-types/:id/line-categories[/:cid]` P:request_types.manage
- `GET /workflows`, `GET /workflows/:id` (versions), `GET /workflow-versions/:id` (steps) P:workflows.view · `POST /workflows/:id/versions {basedOnVersionId?}`, `PUT /workflow-versions/:id {note?, steps: StepInput[]}` (DRAFT only), `POST /workflow-versions/:id/publish`, `DELETE /workflow-versions/:id` (DRAFT), `POST /workflow-versions/:id/simulate {categoryIds, totalAmount, header?}` P:workflows.manage
- `GET /templates?requestTypeId`, `GET /templates/:id`, `POST /templates/:id/versions`, `PUT /template-versions/:id {config, layoutKey?}`, `POST /template-versions/:id/publish`, `POST /templates/logo` (multipart) → `{key, url}` P:templates.manage
- `GET /requests/queue?tab=active|awaiting&roleId&from&to&submitterId&vehicleId&minAmount&maxAmount&overdue` → `QueueItem {id, number, status, submitterName, summary: {vehicleNumber?…}, totalFinal, submittedAt, step: {instanceId, nameAr, nameEn, roleId, activatedAt, dueAt, overdue, returnedFor?: userName}, lock?: {userId, userName, expiresAt}, hasDuplicateWarning}` · `GET /requests/queue/counters` → `[{roleId, nameAr, nameEn, count, overdue}]` P:requests.view
- `GET /requests?status&number&requestTypeId&submitterId&vehicleId&from&to&stepRoleId` P:requests.view (scope rule §5.7)
- `GET /requests/:id` P:requests.view → `RequestDetail {id, number, status, channel, submittedAt, paidAt, totals, submitter, headerValues, module, lines: [{id, lineNo, category, originalCategory, originalAmount, amount, isEdited, extraValues, quantity, unitPrice, warnings, attachments: [{id, url, thumbUrl, mimeType, isCurrent, supersededById, createdAt, duplicates: [{otherRequestId, otherRequestNumber, kind, distance}]}], edits: LineEdit[]}], steps: [{id, stepKey, stageIndex, nameAr, nameEn, roleNameAr, status, activatedAt, dueAt, actedAt, actedByName, onBehalfOfName, comment, signatureUrl}], corrections, events, lock, myActions: null | {stepInstanceId, approve, requestCorrection, sendBack, reject, editAmounts, reclassify, checklist: ChecklistItem[], isPayment}, finalPdf: null | {url, sha256, lockedAt}}`
- `POST /requests/:id/lock`, `POST /requests/:id/lock/heartbeat`, `DELETE /requests/:id/lock` P:requests.act · `DELETE /requests/:id/lock?force=1` P:requests.force_unlock
- `POST /requests/:id/steps/:sid/approve {comment?, checklist?, actionData?}` · `…/request-correction {items}` · `…/send-back {comment}` · `…/reject {reason}` P:requests.act
- `PATCH /requests/:id/lines/:lineId {stepInstanceId, amount?, categoryId?, extraValues?, reason}` P:requests.edit_amounts | requests.reclassify
- `POST /requests/attachments` (multipart) → `{attachmentId}`, `POST /requests` (`SubmitRequestInput`, channel WEB) P:requests.create

**Documents + SAP (WP4)**
- `GET /requests/:id/pdf` → `application/pdf` (locked final if present, else live preview) · `GET /requests/:id/pdf/verify` → `{ok, sha256}` P:requests.view
- `POST /template-versions/:id/preview?format=html|pdf {config?, requestId?}` P:templates.manage (HTML for the live editor; sample data when no request)
- `GET /sap/postings?status&from&to&number`, `GET /sap/postings/:id` (payload + attempts) P:sap.view · `POST /sap/postings/:id/retry` P:sap.retry

**Files, reports, dashboard (WP5)**
- `GET /files/:keyB64?exp&d&n&sig` public (signature = authorization)
- `POST /reports/query {filters: ReportFilters, groupBy?, page, pageSize}` → `{rows: ReportRow[], groups?: [{key, label, count, originalTotal, finalTotal}], totals}` P:reports.view. `ReportFilters {dateField: 'submittedAt'|'paidAt'|'lineDate'; from?; to?; submitterIds?; vehicleIds?; vehicleTypeIds?; costCenterIds?; categoryIds?; glAccountIds?; statuses?; stepRoleIds?; number?; minAmount?; maxAmount?}`; `groupBy: 'driver'|'vehicle'|'expenseType'|'gl'|'costCenter'|'month'`; one row per request line with the columns of REQUIREMENTS §8.
- `POST /reports/exports {kind, filters, groupBy?, options?}` P:reports.export (`ZIP_IMAGES` also needs reports.export_images) → `{exportId}`; audit-logged · `GET /reports/exports` (mine), `GET /reports/exports/:id` → `{status, fileName?, downloadUrl?}`
- `GET /dashboard/summary?from&to` → `{byPeriod, byVehicle, byExpenseType, topVehicles, avgApprovalHoursByStep, delayedByRole}`, `GET /dashboard/delayed` P:dashboard.view

## 12. Permissions and seed

Codes (exact strings; `PERMISSIONS` constant in `@dms/shared`, mirrored into `permissions` by the seed): `requests.view`, `requests.view_all`, `requests.act`, `requests.edit_amounts`, `requests.reclassify`, `requests.create`, `requests.force_unlock`, `vehicle_changes.view`, `vehicle_changes.decide`, `assignments.manage`, `masterdata.view`, `masterdata.manage`, `submitters.telegram_link`, `users.view`, `users.manage`, `roles.manage`, `signatures.manage`, `delegations.manage_all`, `request_types.manage`, `workflows.view`, `workflows.manage`, `templates.manage`, `reports.view`, `reports.export`, `reports.export_images`, `dashboard.view`, `audit.view`, `sap.view`, `sap.retry`, `settings.manage`.

| Role code (seed user) | Permissions |
|---|---|
| SUPER_USER (`admin`) | `isSuperUser` → everything |
| CAMPAIGN_SUPERVISOR (`supervisor`) | requests.view, requests.act, masterdata.view, assignments.manage, vehicle_changes.view |
| CAMPAIGN_MANAGER (`manager`) | requests.view, requests.view_all, requests.act, masterdata.view, assignments.manage, vehicle_changes.view, reports.view, dashboard.view |
| MAINTENANCE_ENGINEER (`engineer`) | requests.view, requests.act |
| SHIPPING_OFFICER (`shipping`) | requests.view, requests.act, masterdata.view, assignments.manage, vehicle_changes.view, vehicle_changes.decide |
| ACCOUNTANT (`accountant1`, `accountant2`) | requests.view, requests.view_all, requests.act, requests.edit_amounts, requests.reclassify, masterdata.view, reports.view, reports.export, reports.export_images, sap.view |
| CHIEF_ACCOUNTANT (`chief`) | ACCOUNTANT + masterdata.manage, sap.retry, dashboard.view, audit.view |
| GENERAL_MANAGER (`gm`) | requests.view, requests.view_all, requests.act, reports.view, reports.export, dashboard.view, audit.view |
| TREASURY (`treasury`) | requests.view, requests.view_all, requests.act, sap.view, reports.view |

**Base seed** (`packages/db/prisma/seed.ts`, idempotent upserts by code; password of every user `Passw0rd!`): departments VEH/ACC/TRS/MGT; roles, permissions, users above with generated signature PNGs (sharp from SVG, files written under `STORAGE_ROOT`; `seedSignatureFiles(root, prisma)` exported for tests); settings; request type `DRIVER_EXPENSE` (prefix `DE`, moduleKey `expense`); 3 vehicle types; cost centers (incl. `MLF450`); GL accounts (`51501800` maintenance, `51501500` spare parts, placeholders for the rest — OPEN_QUESTIONS Q1); expense types `TOLLS, WEIGHBRIDGE, FINES, MAINTENANCE(→MAINTENANCE_ENGINEER), SPARE_PARTS(→MAINTENANCE_ENGINEER), DIESEL(extra field liters, quantityFieldKey), TIPS(→SHIPPING_OFFICER), OTHER`; 10 vehicles (`2157`/MLF450 active, one STOPPED, one UNDER_MAINTENANCE); 10 drivers `DRV001..010` phones `+2010000000NN` with open assignments; default treasury; template v1 ACTIVE; workflow v1 ACTIVE:

| # | key | role | group | condition | flags |
|---|---|---|---|---|---|
| 1 | supervisor | CAMPAIGN_SUPERVISOR | – | ALWAYS | checklist `receipts_match` required, sla 24 |
| 2 | maintenance_engineer | MAINTENANCE_ENGINEER | extra | LINE_CATEGORY_REQUIRES_ROLE | sla 24 |
| 3 | shipping_officer | SHIPPING_OFFICER | extra | LINE_CATEGORY_REQUIRES_ROLE | sla 24 |
| 4 | extra_roles | (DYNAMIC_CATEGORY_ROLES) | extra | ALWAYS | sla 24 |
| 5 | campaign_manager | CAMPAIGN_MANAGER | – | ALWAYS | sla 24 |
| 6 | accountant | ACCOUNTANT | – | ALWAYS | canEditAmounts, canReclassify, sla 48 |
| 7 | chief_accountant | CHIEF_ACCOUNTANT | – | ALWAYS | canEditAmounts, canReclassify, sla 48 |
| 8 | general_manager | GENERAL_MANAGER | – | ALWAYS | sla 48 |
| 9 | treasury | TREASURY | – | ALWAYS | kind PAYMENT, sla 24 |

**Demo seed** (`packages/core/scripts/seed-demo.ts`, WP8): ~30 requests in mixed states created through the engine functions, with generated receipt images.

## 13. Web app

Client-rendered App Router pages (`'use client'`) + TanStack Query; `next.config.mjs` rewrites `/api/v1/:path*` → `API_INTERNAL_URL` (same origin, no CORS) and sets `distDir: process.env.NEXT_DIST_DIR || '.next'`. Tokens: Bearer access + refresh in `localStorage`, auto-refresh on 401 (D11). `<html lang dir>` follows the locale (default `ar`/`rtl`); Tailwind logical utilities only (`ms-`, `pe-`, `text-start`); Cairo font; mobile-first tables collapse to cards under `md`.
- `src/lib`: `api.ts` (`api.get/post/put/patch/del/upload/download`, throws `ApiError{code,message}`), `auth.tsx` (`useAuth()`: `me`, `login`, `logout`, `can(code)`), `i18n.tsx` (`useT()`, `t('ns.key')`, dictionaries `src/i18n/{ar,en}/<ns>.ts`, merged by an index that imports the fixed namespace list: common, admin, master, requests, workflows, templates, reports, sap, dashboard), `format.ts` (Cairo dates, EGP).
- `src/components/ui`: Button, Input, Select, Textarea, Checkbox, FormField, Modal, ConfirmDialog, DataTable (columns, paging, sort, mobile cards), Pagination, Badge, Tabs, Card, PageHeader, Spinner, EmptyState, useToast, DateRange, LookupSelect (`/lookups/:entity`), FileDrop. `src/components/crud/CrudPage.tsx`: config-driven list/search/create/edit/deactivate/import/export used by every master-data screen.
- Routes: `/login` · `/inbox` · `/requests`, `/requests/[id]` · `/vehicle-changes` · `/assignments` · `/master/{drivers,vehicles,vehicle-types,cost-centers,gl-accounts,expense-types,treasuries,departments}` · `/admin/{users,roles,delegations,audit,settings}` · `/workflows`, `/workflows/[id]` · `/templates`, `/templates/[id]` · `/sap` · `/reports` · `/dashboard` · `/notifications` · `/profile`. The sidebar is a static config listing all of them with the permission that shows each.

## 14. Work packages

### 14.1 Shared-file rules (apply to all)
1. **Ownership is by path.** Never edit a path you do not own; if another WP's code blocks you, work around it in your own code and write one line in `docs/CONTRACT_NOTES.md`.
2. **Frozen after WP0** (orchestrator only): root config files, `pnpm-lock.yaml`, every `package.json`, `packages/db/**`, `packages/shared/src/**` except the contract files below, `packages/core/src/{config,errors,audit}/**`, `packages/core/src/jobs/enqueue.ts`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`.
3. **`app.module.ts`** is written once by WP0 and imports six initially empty modules; each owner fills only its own: `platform/platform.module.ts` + `expense/expense-api.module.ts` (WP1), `workflow/workflow-api.module.ts` (WP2), `integrations/integrations.module.ts` (WP4), `reports/reports.module.ts` + `files/files.module.ts` (WP5).
4. **`@dms/core`** has no root index; one directory = one owner = one subpath export, so there is no shared barrel.
5. **Contract files** `packages/shared/src/contracts/{platform,workflow,integrations,reports}.ts` (zod schemas + inferred types of §11 bodies/responses) are created empty by WP0 and re-exported from the shared index; owners WP1, WP2, WP4, WP5 fill them **in their first 15 minutes** so the web WPs can import them.
6. **Dependencies:** all are pre-installed. If one is truly missing: `mkdir .install.lock` (atomic; wait and retry if it exists) → `pnpm add --filter <your package> <dep>` → `rmdir .install.lock` → note it in `CONTRACT_NOTES.md`.
7. **Schema** is frozen; use the existing `Json` columns for anything extra. A blocking schema problem goes to the orchestrator (who alone runs migrate/generate while all agents are idle).
8. **Git:** `git add -- <owned paths>` then `git commit -m "WPn: …"`; retry on `index.lock`; never `-A`.
9. **Processes:** no agent kills another's processes or stops Postgres. API tests use supertest in-process (no port). Web: WP6 uses `NEXT_DIST_DIR=.next-wp6` port 3006, WP7 `.next-wp7` port 3007. Run only your own tests (`pnpm --filter <pkg> exec vitest run <dir>`); in a shared package fix only type errors in files you own.
10. **Test DB:** every test file calls `setupTestDb('<wp>-<name>')`; storage in tests = `createLocalStorage(<os tmp dir>)`.

### 14.2 WP0 — Foundation (sequential, first; two agents may run concurrently)
**WP0a (Sonnet)** — owns root files, `packages/db/**` except `prisma/seed.ts`, app skeletons. Deliverables: `git init`; root tooling and scripts of §2; all `package.json` with the §2 dependency lists; `pnpm install`; `pnpm exec playwright install chromium` (on failure set `PDF_BROWSER_CHANNEL=msedge` in `.env`); `prisma validate` on the provided schema (it was not machine-validated — fix syntax/relation nits **without changing names or semantics**); `pg.ts`, `pnpm db:up`; migration `0001_init` + hand-written `0002_partial_indexes` (SQL at the bottom of the schema); `migrate.ts`, `testing.ts`, client factory, `loadEnv`; `apps/api` skeleton: `main.ts` (prefix, helmet, JSON logger, error filter mapping `DomainError`), `app.module.ts`, `PrismaModule`, `/health`, six empty modules, `common/` = `JwtAuthGuard` (global; verifies HS256 `{sub, sid}`, checks Session not revoked/expired, `req.user = loadAuthUser`), `PermissionsGuard`, `@RequirePermission`, `@AuthOnly`, `@Public`, `@CurrentUser`, `ZodPipe`, `actorFromReq`, `signAccessToken`; `apps/api/test/helpers.ts` → `createTestApp(tag): { app, http, prisma, storage, auth(username): Promise<{ Authorization: string }>, close() }`; meta-test "every route has permission metadata"; `apps/web` skeleton (Next + Tailwind + RTL page + rewrite), `apps/bot`, `apps/worker`, `e2e` skeletons with vitest configs; `docker-compose.yml` (postgres, api, web, bot, worker with health checks; redis/minio as commented optional services), `Dockerfile`, `.env.example`, `scripts/ci.*`, project `CLAUDE.md`. Acceptance: `pnpm db:up && pnpm db:migrate && pnpm lint && pnpm typecheck && pnpm test` green; DI smoke test green under vitest and the dev runner; commit.
**WP0b (Sonnet)** — owns `packages/shared/**`, `packages/db/prisma/seed.ts`, `packages/core/**` skeleton. Deliverables: shared constants (`PERMISSIONS`, role codes, event/notification/job types, error codes, setting defaults), zod schemas of §3.2/§5.2, utils with tests: `normalizeDigits`, `parseAmount`, `parseInteger`, `normalizeEgyptPhone` (+20 / 0020 / 01x → `+201xxxxxxxxx`), `formatRequestNumber`, decimal helpers (`decimal.js`: sum, div 2dp, toFixed), `formatCairo`; empty contract files; base seed (§12); `@dms/core` skeleton: every directory `index.ts` with the §4 signatures, and **full implementations** of `config`, `errors`, `audit`, `rbac`, `jobs/enqueue.ts` with tests. Runs its tests once WP0a has installed.

### 14.3 Parallel work packages (7)
| WP | Model | Owns (only it edits) | Depends on / reads | Deliverables | Acceptance tests it writes and runs |
|---|---|---|---|---|---|
| **WP1 API platform** | Sonnet | `apps/api/src/{common,platform,expense}/**`, `apps/api/test/platform/**`, `packages/core/src/{rbac,fleet}/**`, `shared/contracts/platform.ts` | WP0; `storage` (WP5) for signatures | auth (login, refresh rotation, logout, sessions, lockout after 5 failures, login rate limit), users, roles, permission matrix, delegations, departments, audit log API, settings, notifications API, lookups, all master data + xlsx import/export, signatures, assignments, vehicle change requests, health/metrics | login/refresh/revoke; **authorization matrix test** (each seeded role × a table of endpoints → expected 200/403; unauthenticated → 401); role creation + permission grant takes effect; delegation grants then expires; assignment change closes old row and opens new; VCR approve updates assignment; import dry-run reports row errors; audit rows contain before/after; signature upload rejects non-image by magic bytes |
| **WP2 Engine** | Sonnet (strongest available) | `packages/core/src/{engine,notifications,expense}/**`, `apps/api/src/workflow/**`, `apps/api/test/workflow/**`, `shared/contracts/workflow.ts` | WP0; `media.flagDuplicates` (WP5; tolerate NOT_IMPLEMENTED until it lands) | everything in §5, expense module hooks, request types/workflows/templates/requests API. Order: engine + tests in core first, controllers second | the four signature scenarios (neither / maintenance / tips / both); parallel stage waits for both; dynamic slot adds an uncovered role; correction returns to the same step instance and notifies the requester; send-back; final reject; accountant edit keeps original, stays at step, continues forward; reclassify updates GL snapshot; published new version does not affect in-flight request; two accountants see the same queue; lock conflict 409 + expiry; 50 concurrent submits → 50 distinct consecutive numbers; `clientKey` idempotency; condition evaluator table tests; treasury approve → PAID + exactly one SapPosting + jobs; checklist required on first step; API-level 403 for missing role/permission |
| **WP3 Bot** | Sonnet | `apps/bot/**` | `engine.submitRequest/submitCorrection/listSubmitterRequests/listOpenCorrections`, `media.ingestAttachment`, `fleet.*`, `jobs.runDueJobs` | §6 complete, harness, `bot:sim`, polling + webhook entry, `telegram.send` handler | harness tests: happy path to a `DE-YY-NNNNNN` number; Arabic-Indic and Persian digits; invalid amount / text when photo expected; impersonation (foreign contact) and typed phone refused; unknown phone; stopped vehicle blocked; odometer lower-than-last warning; diesel liters → unit price; two lines + multi-photo line; edit/delete line in summary; resume draft after "restart" (new bot instance, same DB); my requests; vehicle change request created; correction re-upload supersedes old image and returns the step to ACTIVE; double-tap submit creates one request |
| **WP4 Worker, PDF, SAP** | Sonnet | `apps/worker/**`, `packages/core/src/{jobs,pdf,sap,sla}/**` (not `jobs/enqueue.ts`), `apps/api/src/integrations/**`, `apps/api/test/integrations/**`, `shared/contracts/integrations.ts` | WP0; engine detail types (WP2); `storage` (WP5) | job runner + schedules, §9 PDF, §10 SAP adapters + §7.3, SLA scan, draft sweep, documents/SAP/template-preview endpoints | runner: SKIP LOCKED (two runners, each job once), backoff, stale-lock recovery, dedupe; SAP: correct debit/credit lines with cost centers, reference = request number, balanced; retry after failure posts once; crash after accept (`failAfterAccept`) → `findByReference` prevents double post; failure keeps request PAID; manual retry; PDF: renders (`%PDF`, > 5 KB), text extraction or HTML assertion shows Arabic title and exactly the applicable signature blocks for the four scenarios; final PDF locked, second finalize is a no-op, hash verifies; `amountToArabicWords` table; SLA reminder created once per interval |
| **WP5 Storage, media, reports** | Sonnet | `packages/core/src/{storage,media,reports}/**`, `apps/api/src/{files,reports}/**`, `apps/api/test/{files,reports}/**`, `shared/contracts/reports.ts` | WP0. **Storage + media first (target 25 min) — WP1/3/4 wait on them** | §8, files endpoint, report query, Excel (subtotals), ZIP images + index xlsx (archiver stream), PDF bundle (pdf-lib merge; needs `pdf` from WP4 — degrade to a ZIP of final PDFs if unavailable), export job handler `runExport`, dashboard | storage path traversal rejected; signed URL valid / expired / tampered / wrong key; magic-byte sniffing rejects renamed `.exe`; oversize rejected; thumbnail + sha256 + dHash stable; near-duplicate (re-encoded/resized image) and exact duplicate flagged with link to the other request, different image not flagged; **auditor scenario**: tolls in a date range → xlsx rows/totals correct and ZIP has `Tolls/<number>/image_n.jpg` + index; export audit-logged; permission checks |
| **WP6 Web shell + admin** | Sonnet (shell, kit); Haiku-capable for CRUD pages afterwards | `apps/web/**` except WP7 paths | `shared/contracts/platform.ts`; §13. **Shell, kit, lib, sidebar, i18n index first (target 20 min) — WP7 builds on them** | login, layout, notifications bell, profile, all `/master/*`, `/assignments`, `/admin/*` (users, roles + permission matrix, delegations, audit, settings), signature upload with crop + preview | `tsc --noEmit`; `NEXT_DIST_DIR=.next-wp6 next build` passes; vitest for `format`, `i18n`, `can()`; manual smoke against the running API recorded in `CONTRACT_NOTES.md` |
| **WP7 Web workflow** | Sonnet | `apps/web/src/app/(app)/{inbox,requests,vehicle-changes,workflows,templates,sap,reports,dashboard}/**`, `apps/web/src/features/**`, `apps/web/src/i18n/{ar,en}/{requests,workflows,templates,reports,sap,dashboard}.ts` | WP6 kit/lib; contracts of WP2/4/5 | inbox with counters and filters; request detail (lines, original vs corrected, gallery with zoom/rotate/fullscreen/download, duplicate warnings, progress bar incl. not-applicable steps, timeline, action panel with lock + checklist + treasury selector, PDF preview); VCR queue; workflow builder (reorder, role, condition builder, parallel group, versions, publish); template editor with live HTML preview; SAP monitor + retry; report builder + exports; dashboard | `tsc --noEmit`; `NEXT_DIST_DIR=.next-wp7 next build` passes; vitest for the condition-builder ↔ `Condition` JSON round trip |

### 14.4 Final phase (after the parallel WPs)
- **WP8 Integration and review (Sonnet, strongest)** — owns everything. Fix cross-WP contract mismatches (`CONTRACT_NOTES.md` first); `pnpm lint && typecheck && test` green; demo seed; `e2e/full-flow.spec.ts` (bot harness submits maintenance + tips → eight approvals in the browser → PAID → final PDF downloaded → SAP posting POSTED in monitor); load script `scripts/load-data.ts` (≥ 50k requests, ≥ 200k attachment rows) with timings of queue and report queries; security pass (authz meta-test, IDOR on `/requests/:id`, upload sniffing, signed URLs); `docs/PROGRESS.md` with the requirement → status → test map and the honest final report (complete / mocked / pending / go-live steps).
- **WP9 Docs (Haiku), concurrent with WP8** — owns `README.md` and `docs/*` except PLAN/DECISIONS/OPEN_QUESTIONS/PROGRESS/CONTRACT_NOTES; `scripts/backup.sh`, `restore.sh`, `deploy/Caddyfile`. Writes README, ARCHITECTURE (mermaid diagrams), SAP_INTEGRATION, BACKUP_RESTORE, ADMIN_GUIDE_AR, DRIVER_GUIDE_AR, HOW_TO_ADD_NEW_REQUEST_TYPE **from the code as built**, not from this plan.

## 15. Priority cut (~2.5 h wall clock)

| Area | Level | Note |
|---|---|---|
| Monorepo, tooling, DB scripts, schema, base seed | MUST | |
| Auth, RBAC, permission enforcement + authorization tests | MUST | |
| Users, roles, permission matrix, master data CRUD, assignments history, signatures | MUST | Excel export MUST, import SHOULD |
| Audit log (write path MUST; search UI SHOULD) | MUST | |
| Request engine: numbering, instantiate, parallel, all actions, edits, locks, history, queues, versioning | MUST | all Phase 2 acceptance tests |
| Dynamic role slot, role department scope, delegation, workflow simulate | SHOULD | implemented, lightly tested |
| Bot: onboarding, full flow, drafts, my requests, correction, VCR, harness tests | MUST | real Telegram run pending a token |
| Webhook mode, draft reminder/expiry, `bot:sim`, rate limiting | SHOULD | |
| Storage, signed URLs, image pipeline, duplicate flagging | MUST | S3 adapter STUB |
| PDF with dynamic signature blocks, lock + sha256 | MUST | |
| Template editor (structured config + live preview), template versioning | SHOULD | free-form HTML templates STUB |
| Treasury → PAID, outbox, mock SAP adapter, idempotency tests, monitor + retry API | MUST | |
| File-export SAP adapter | SHOULD | |
| S/4HANA SOAP adapter | STUB | envelope + parser unit-tested on fixtures; never run against SAP (no credentials). Cash Journal: interface only |
| Web: login, inbox, request detail + actions, master data, users/roles matrix | MUST | |
| Web: workflow builder, template editor, VCR queue, SAP monitor, reports, dashboard, audit, settings, notifications, delegations | SHOULD | builder falls back to up/down buttons if drag fails |
| Web submission channel (`POST /requests`) | STUB | API present, no UI |
| Reports query, Excel, ZIP images (auditor scenario) | MUST | |
| PDF bundle, dashboard, background export notifications | SHOULD | |
| SLA reminders, in-app notifications | SHOULD | email STUB; business-hours calendar STUB |
| Playwright web E2E (one full flow) | SHOULD | |
| Load data script + timings, backup/restore scripts | SHOULD | restore tested against the local cluster if time allows |
| Docker Compose, Dockerfile, reverse-proxy config | STUB | files only — Docker is not available, never executed |
| English UI strings | SHOULD | Arabic complete first |
| Docs (all listed in REQUIREMENTS §11) | MUST | written last, from the code |

## 16. Timeline and orchestration

| Time | Phase |
|---|---|
| 0:00–0:30 | WP0a + WP0b. Gate: `db:migrate`, lint, typecheck, test green; commit. Orchestrator keeps `pnpm db:up` running. |
| 0:30–1:50 | WP1–WP7 in parallel. First-15-minute deliverables: contract files (WP1, 2, 4, 5), storage + media (WP5, by 0:55), web shell (WP6, by 0:50). |
| 1:50–2:30 | WP8 + WP9. Orchestrator re-runs `pnpm db:migrate` (rebuilds `dms_template`) only if the schema changed. |

If a parallel WP runs out of time it finishes its MUST items, leaves `// TODO(WPn):` markers and lists what is missing in `docs/CONTRACT_NOTES.md`; WP8 reports them honestly in `docs/PROGRESS.md`.
