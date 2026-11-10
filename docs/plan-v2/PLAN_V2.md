# DMS phase 2 plan (PLAN_V2)

Planning document only. It is written for implementing agents (Sonnet, Haiku) that start with zero context, and for the orchestrator that launches them. Companion files: `DESIGN_SPEC.md` (design system and screens), `TESTING_GUIDE.md` (how the tests are run on another machine), `OWNER_DECISIONS.md` (choices the owner may change), `CODEBASE_FACTS.md` (verified facts about the current code).

Contents: 1 overview, 2 ground rules, 3 decisions, 4 dependencies and install step, 5 shared foundation (contracts, settings, env, migration), 6 functional gap designs (B1-B9), 7 test plan, 8 execution plan and work-package briefs, 9 integration, 10 risks and cut list.

---

## 1. Overview

Phase 1 delivered a working system (384 unit/API tests, 8 e2e). Phase 2 has three parts:

- **A. Full redesign of the web app** in one direction, "Majlis" (ivory paper, navy ink, brass rule, Naskh display type, the approval seal). Light and dark themes, Arabic RTL first, English, desktop and mobile. It is a re-skin plus UX improvement: every API call, permission rule and i18n key stays. Specified in `DESIGN_SPEC.md`.
- **B. Nine functional gaps**: request-type and template management (UI + missing API), S/4HANA `findByReference`, Cash Journal adapter, load-test tooling and indexes, Prometheus `/metrics`, SMTP e-mail, S3 storage, Telegram link/relink for users and drivers, and the `scripts/demo.ts` fix. Specified in section 6.
- **C. Tests are written but not run here.** Agents may run only `tsc --noEmit` and `eslint` for their package. The owner's friend runs vitest and Playwright on another machine using `TESTING_GUIDE.md`.

Wall-clock plan: phase 0 (foundation, 3 agents, about 15 min) -> gate -> phase 1 (17 agents in parallel, about 40 min) -> phase 2 (1 integration agent, about 20 min). See section 10 for the honest timing and the cut list.

---

## 2. Ground rules (apply to every agent; repeated in every brief)

1. **100% LOCAL.** No GitHub, no git remote, no `git push`, no `gh`, no PRs/issues/Actions, no uploading code anywhere. Local `git commit` only.
2. **No test runs, no servers.** Do not run `vitest`, `playwright`, `pnpm test`, `pnpm e2e`, `pnpm dev`, `pnpm demo`, `next build`, `next dev`, or start the API/worker/bot. Do not run `pnpm db:*`. Allowed checks: `pnpm --filter <pkg> typecheck` (= `tsc --noEmit`) and `pnpm exec eslint <owned paths>`.
3. **No installs.** All dependencies are installed in the install step (section 4). If something is missing, stop and report it; do not run `pnpm add`.
4. **Ownership is by path.** Edit only the paths listed for your work package. If you need a change elsewhere, add one line to `docs/CONTRACT_NOTES.md` (`P2-<WP>, <path>: <what is needed>`) and continue; the integration agent resolves it. `docs/CONTRACT_NOTES.md` is append-only for everyone.
5. **Typecheck noise.** Other agents are editing the same package at the same time. Fix only errors in files you own; list other errors in your final report.
6. **Git.** `git add -- <owned paths>` then `git commit -m "P2-<WP>: <summary>"`. Never `git add -A`, never stash/reset/checkout/rebase. Retry on `index.lock`. Never push.
7. **Write tests, do not weaken tests.** Write the test files listed for your package exactly at the given paths with the given case names. Never delete or loosen an existing assertion; if a contract change makes an old assertion wrong, update it to the new contract and say so in your report.
8. **Conventions** (from `CLAUDE.md`): strict TS, no `.js` import suffixes; `@dms/core` subpath imports only; every API handler has `@RequirePermission(...)`, `@AuthOnly()` or `@Public()`; bodies through `new ZodPipe(schema)`; errors are `DomainError`; money is decimal strings; raw SQL quotes camelCase columns; never hard-delete referenced rows; every test file calls `setupTestDb('<tag>')` or `createTestApp('<tag>')` with its own tag (prefix `p2-`).
9. **Web conventions**: follow `DESIGN_SPEC.md`. Semantic token classes only, logical utilities only, kit components only, `data-testid`s exactly as listed, every string through `t()` with keys in both `ar` and `en`. Do not add `eslint-disable` for `@next/next/*` or `react-hooks/*`.
10. Code, comments and docs in English. UI strings in Arabic and English.

---

## 3. Decisions (summary; recorded in `docs/DECISIONS.md` as P2-1..P2-24)

| # | Decision |
|---|---|
| 1 | One design direction: Majlis. Light theme default, dark theme available, `system` optional. |
| 2 | Western digits by default; a per-user Arabic-Indic toggle (identifiers and inputs never convert). |
| 3 | UI dates `dd/MM/yyyy`, 24h time, Cairo; ISO only in inputs, queries and file names. |
| 4 | Fonts: IBM Plex Sans Arabic (UI), Noto Naskh Arabic (Arabic display), IBM Plex Serif (Latin display), IBM Plex Mono (identifiers); self-hosted via fontsource. PDF keeps Cairo. |
| 5 | New web deps: four font packages and `radix-ui` (dialogs, menus, popovers, tooltips, direction). No animation, chart, form or test library. Charts are hand-written SVG. |
| 6 | Kit files keep their names and exports (superset props) so un-migrated code compiles; Tailwind legacy colour aliases keep un-migrated classes on-theme. |
| 7 | Navigation regrouped into Daily work / Insight / Configuration / Master data / Administration; routes and permissions unchanged; one new route `/admin/request-types`. |
| 8 | Templates: `POST /templates` creates the template plus a v1 DRAFT (optionally copied from another template); `PATCH /templates/:id` edits names, default and active flags. Versioning model unchanged. |
| 9 | Line categories gain `allowedMimeTypes` in the API and a reorder endpoint; request types list gains optional stats; modules are listed by `GET /request-types/modules`. No new permission codes. |
| 10 | S/4HANA lookup = OData query by `DocumentReferenceID` + `CompanyCode`, fully config-driven; lookup mode `none` never re-posts after an unknown outcome without an explicit human `force`. |
| 11 | SAP failures are classified definite vs unknown; only unknown outcomes trigger the lookup. |
| 12 | Cash Journal = a second posting adapter `s4hana-cj` (SOAP RFC `BAPI_CASHJOURNALDOC_CREATE` or a Z wrapper), same outbox and idempotency flow. |
| 13 | Metrics are hand-rolled Prometheus text (no library); `/metrics` requires `METRICS_TOKEN` in production. |
| 14 | E-mail = `nodemailer` behind `EMAIL_DRIVER` (`none` default, `smtp`, `file`); fan-out inside `notifyUsers`, controlled by the setting `notifications.email`. |
| 15 | S3 = AWS SDK v3 driver behind `STORAGE_DRIVER=s3`; files are still served through the signed `/files` route (proxy), with an optional redirect to an S3 presigned URL. |
| 16 | Telegram linking for users and admin relink for drivers use a stateless signed one-time-window token sent as `/start <token>`; approvers can then receive Telegram notifications (setting `notifications.telegramUsers`). |
| 17 | Load tooling writes only to a separate database `dms_load`; one new migration `0003_perf_indexes`. |
| 18 | `scripts/demo.ts` skips Prisma generation when the generated client matches the schema, tolerates a locked client, and reuses servers that are already running. |

---

## 4. Dependencies and the install step

New dependencies (exact versions, all published at least 12 days before 2026-11-10):

| Package | Version | Workspace | Why |
|---|---|---|---|
| `@fontsource/ibm-plex-sans-arabic` | 5.3.0 | `@dms/web` | UI font (OFL) |
| `@fontsource-variable/noto-naskh-arabic` | 5.3.0 | `@dms/web` | Arabic display font (OFL) |
| `@fontsource/ibm-plex-serif` | 5.3.0 | `@dms/web` | Latin display font (OFL) |
| `@fontsource/ibm-plex-mono` | 5.3.0 | `@dms/web` | identifiers (OFL) |
| `radix-ui` | 1.8.1 | `@dms/web` | accessible dialog, dropdown menu, popover, tooltip, direction provider (MIT; peer React 19 ok) |
| `nodemailer` | 10.3.1 | `@dms/core` | SMTP (ships its own types; MIT-0) |
| `@aws-sdk/client-s3` | 3.1150.0 | `@dms/core` | S3 driver (Apache-2.0) |
| `@aws-sdk/s3-request-presigner` | 3.1150.0 | `@dms/core` | presigned GET URLs |
| `@aws-sdk/lib-storage` | 3.1150.0 | `@dms/core` | streaming multipart upload |

Not added (decided against): framer-motion, chart libraries, cmdk, react-hook-form, jsdom / testing-library, prom-client, tailwind plugins.

### 4.1 Install step (the orchestrator runs this itself, before launching any agent)

Stop every running node process of this project first (Ctrl+C in the `pnpm demo` window); Postgres may stay up.

```powershell
cd "c:\Users\Administrator\Downloads\new project\Dooo"
mkdir .install.lock
pnpm add --filter @dms/web --save-exact @fontsource/ibm-plex-sans-arabic@5.3.0 @fontsource-variable/noto-naskh-arabic@5.3.0 @fontsource/ibm-plex-serif@5.3.0 @fontsource/ibm-plex-mono@5.3.0 radix-ui@1.8.1
pnpm add --filter @dms/core --save-exact nodemailer@10.3.1 @aws-sdk/client-s3@3.1150.0 @aws-sdk/s3-request-presigner@3.1150.0 @aws-sdk/lib-storage@3.1150.0
rmdir .install.lock
```

Then edit the root `package.json` `scripts` (add two lines, keep the rest):

```json
"load:data": "tsx scripts/load-data.ts",
"load:timing": "tsx scripts/load-timing.ts",
```

Then commit: `git add -- package.json pnpm-lock.yaml apps/web/package.json packages/core/package.json` and `git commit -m "P2-install: phase 2 dependencies"`.

If `pnpm add` fails on a version (registry policy), take the nearest lower patch version, and record the version actually installed in `docs/CONTRACT_NOTES.md`.

---

## 5. Shared foundation (work package F3)

F3 lands first so every other agent compiles against the final contracts. Everything in this section is exact.

### 5.1 `packages/shared/src/contracts/workflow.ts` (append; do not change existing exports except where stated)

```ts
// ---------------------------------------------------------------- phase 2 additions
export const ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export type AttachmentMimeType = (typeof ATTACHMENT_MIME_TYPES)[number];

export const lineCategoryOrderSchema = z.object({ ids: z.array(z.string().min(1)).min(1) });
export type LineCategoryOrderBody = z.infer<typeof lineCategoryOrderSchema>;

export const TEMPLATE_LAYOUT_KEYS = ['expense-sheet', 'generic-request'] as const;
export type TemplateLayoutKey = (typeof TEMPLATE_LAYOUT_KEYS)[number];

export const templateCreateSchema = z.object({
  requestTypeId: z.string().min(1),
  code: z.string().min(1).max(40).regex(/^[A-Z0-9_]+$/),
  nameAr: z.string().trim().min(1),
  nameEn: z.string().trim().min(1),
  layoutKey: z.enum(TEMPLATE_LAYOUT_KEYS).default('generic-request'),
  isDefault: z.boolean().default(false),
  /** copy the config of this template's ACTIVE (else latest) version into the new v1 draft */
  copyFromTemplateId: z.string().min(1).optional(),
});
export type TemplateCreateBody = z.infer<typeof templateCreateSchema>;

export const templateUpdateSchema = z
  .object({ nameAr: z.string().trim().min(1), nameEn: z.string().trim().min(1), isDefault: z.boolean(), isActive: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type TemplateUpdateBody = z.infer<typeof templateUpdateSchema>;

export interface RequestTypeStatsDto {
  categoryCount: number;
  requestCount: number;
  templateCount: number;
  activeWorkflowVersion: number | null;
}
export interface RequestModuleDto {
  key: string;
}

export const EXPENSE_RESERVED_HEADER_KEYS = ['vehicleId', 'vehicleNumber', 'odometer', 'odometerWarning'] as const;

export interface FieldIssue {
  index: number;
  key: string;
  code: 'KEY_FORMAT' | 'KEY_DUPLICATE' | 'KEY_RESERVED' | 'OPTIONS_REQUIRED' | 'LOOKUP_REQUIRED' | 'MIN_GT_MAX' | 'REGEX_INVALID';
}
/** Structural checks shared by the API and the web editor. Keys: /^[a-z][A-Za-z0-9_]*$/, unique, not reserved. */
export function fieldDefinitionIssues(fields: FieldDefinition[], reservedKeys: readonly string[] = []): FieldIssue[] {
  const out: FieldIssue[] = [];
  const seen = new Set<string>();
  fields.forEach((f, index) => {
    const push = (code: FieldIssue['code']) => out.push({ index, key: f.key, code });
    if (!/^[a-z][A-Za-z0-9_]*$/.test(f.key)) push('KEY_FORMAT');
    if (seen.has(f.key)) push('KEY_DUPLICATE');
    seen.add(f.key);
    if (reservedKeys.includes(f.key)) push('KEY_RESERVED');
    if (f.type === 'select' && !(f.options && f.options.length > 0)) push('OPTIONS_REQUIRED');
    if (f.type === 'lookup' && !f.lookup) push('LOOKUP_REQUIRED');
    if (f.min !== undefined && f.max !== undefined && f.min > f.max) push('MIN_GT_MAX');
    if (f.regex) {
      try {
        new RegExp(f.regex);
      } catch {
        push('REGEX_INVALID');
      }
    }
  });
  return out;
}
```

Edits to existing declarations in the same file:
- `lineCategoryInputSchema`: add `allowedMimeTypes: z.array(z.enum(ATTACHMENT_MIME_TYPES)).min(1).optional(),` (move the `ATTACHMENT_MIME_TYPES` constant above the schema).
- `LineCategoryDto`: add `allowedMimeTypes: string[];`.
- `RequestTypeDto`: add `stats?: RequestTypeStatsDto;`.

### 5.2 `packages/shared/src/contracts/platform.ts` (append)

```ts
export interface TelegramLinkDto {
  /** text to send to the bot, e.g. "/start u_ckx..._lq2m3k_9f2c..." */
  command: string;
  /** https://t.me/<BOT_USERNAME>?start=<token>, or null when BOT_USERNAME is not configured */
  deepLink: string | null;
  expiresAt: string;
}
```
The `/auth/me` response type in this file (the interface that describes the current user) gains `telegramLinked: boolean`. In `apps/web/src/lib/types.ts` F1 adds `telegramLinked?: boolean` to `Me`.

### 5.3 `packages/shared/src/contracts/integrations.ts` (append)

```ts
export const sapRetryBodySchema = z.object({ force: z.boolean().optional() }).default({});
export type SapRetryBody = z.infer<typeof sapRetryBodySchema>;
```
(Add `import { z } from 'zod';` if the file does not import it yet.)

### 5.4 `packages/shared/src/constants/settings.ts` (edit)

```ts
export interface SapCashJournalConfig {
  /** cash journal number (CAJO_NUMBER) used when a treasury has no mapping */
  defaultNumber: string;
  /** Treasury.code -> cash journal number */
  numberByTreasuryCode: Record<string, string>;
  /** FBCJ business transaction for expense payments (TRANSACT_NUMBER) */
  businessTransaction: string;
}
export interface NotificationChannelConfig {
  enabled: boolean;
  /** notification `type` values to deliver on this channel; '*' = all */
  types: string[];
}
export const DEFAULT_OUTBOUND_NOTIFICATION_TYPES = ['REQ_AT_STEP', 'SLA_REMINDER', 'CORRECTION_RETURNED', 'STEP_SENT_BACK', 'SAP_FAILED', 'VEHICLE_CHANGE_REQUESTED'];
```
- `SapConfig`: add `cashJournal: SapCashJournalConfig;`; default `cashJournal: { defaultNumber: '0001', numberByTreasuryCode: {}, businessTransaction: '' }`.
- `SettingTypes`: add `'notifications.email': NotificationChannelConfig;` and `'notifications.telegramUsers': NotificationChannelConfig;`; defaults for both: `{ enabled: false, types: [...DEFAULT_OUTBOUND_NOTIFICATION_TYPES] }`.
- Then run `grep -rn "sap.config\|SETTING_KEYS\|settingSchemas" packages apps --include=*.ts` and, if a per-key zod schema for settings exists (API settings controller or `contracts/platform.ts`), extend it for the new fields and keys so `PUT /settings/:key` accepts them.

### 5.5 `packages/core/src/config/index.ts` (edit `envSchema`)

Add this helper next to `int` and `optStr`:
```ts
const bool = (def: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : v === true || v === 'true' || v === '1'));
```
Change `SAP_ADAPTER` to `z.enum(['mock', 'file', 's4hana', 's4hana-cj']).default('mock')` and add:
```ts
  SAP_S4_TIMEOUT_MS: int(30000),
  SAP_S4_LOGICAL_SYSTEM: optStr,
  SAP_S4_LOOKUP_MODE: z.enum(['odata', 'none']).default('odata'),
  SAP_S4_ODATA_URL: optStr,
  SAP_S4_LOOKUP_SERVICE: z.string().default('API_JOURNALENTRYITEMBASIC_SRV'),
  SAP_S4_LOOKUP_ENTITY: z.string().default('A_JournalEntryItemBasic'),
  SAP_S4_LOOKUP_REF_FIELD: z.string().default('DocumentReferenceID'),
  SAP_S4_DUPLICATE_PATTERN: z.string().default('already (been )?posted|duplicate'),
  SAP_S4_CJ_URL: optStr,
  SAP_S4_CJ_FUNCTION: z.string().default('BAPI_CASHJOURNALDOC_CREATE'),
  S3_ENDPOINT: optStr,
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: optStr,
  S3_ACCESS_KEY_ID: optStr,
  S3_SECRET_ACCESS_KEY: optStr,
  S3_FORCE_PATH_STYLE: bool(true),
  S3_PREFIX: optStr,
  S3_PRESIGNED_REDIRECT: bool(false),
  EMAIL_DRIVER: z.enum(['none', 'smtp', 'file']).default('none'),
  SMTP_HOST: optStr,
  SMTP_PORT: int(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: optStr,
  SMTP_PASSWORD: optStr,
  SMTP_FROM: z.string().default('DMS <no-reply@localhost>'),
  SMTP_TLS_REJECT_UNAUTHORIZED: bool(true),
  METRICS_TOKEN: optStr,
  BOT_USERNAME: optStr,
  TELEGRAM_LINK_TTL_SEC: int(900),
```
In `getConfig`, after the existing production checks, add: `STORAGE_DRIVER === 's3'` requires `S3_BUCKET`; `EMAIL_DRIVER === 'smtp'` requires `SMTP_HOST` (both throw `DomainError('VALIDATION', ...)` in every `NODE_ENV`).

### 5.6 `.env.example` (append, commented defaults)

One block per feature with a comment line each: SAP lookup and cash journal, S3, e-mail, metrics, Telegram link. Use exactly the variable names of 5.5 with their defaults (empty for secrets).

### 5.7 Migration `packages/db/prisma/migrations/0003_perf_indexes/migration.sql` (new, exact)

```sql
-- Phase 2 performance indexes (load test: 50k requests / 200k attachments).
-- Queue: WHERE "roleId" IN (...) AND status = 'ACTIVE' ORDER BY "activatedAt".
CREATE INDEX "request_step_instances_roleId_status_activatedAt_idx" ON "request_step_instances"("roleId", "status", "activatedAt");
-- Detail and exports: current attachments of a request.
CREATE INDEX "attachments_requestId_isCurrent_idx" ON "attachments"("requestId", "isCurrent");
-- Visibility rule "requests I submitted from the web".
CREATE INDEX "requests_submittedByUserId_idx" ON "requests"("submittedByUserId") WHERE "submittedByUserId" IS NOT NULL;
-- Substring search on the request number (ILIKE '%...%'). Skipped silently when pg_trgm is not installed.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS "requests_number_trgm_idx" ON "requests" USING gin ("number" gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm not available, skipping requests_number_trgm_idx: %', SQLERRM;
END $$;
```

`packages/db/prisma/schema.prisma`: add `@@index([roleId, status, activatedAt])` to `model RequestStepInstance` and `@@index([requestId, isCurrent])` to `model Attachment` (the two plain indexes; the partial and trigram indexes stay SQL-only like `0002_partial_indexes`). No model or column changes, so the Prisma client does not need regenerating.

### 5.8 Test written by F3
`packages/shared/src/contracts/workflow.test.ts` (cases in section 7.2).

---

## 6. Functional gap designs

### B1. Request types and templates (API: A1; web: W9, W6)

**Endpoints** (`apps/api/src/workflow/config.controller.ts`; all errors are `DomainError`):

| Method and path | Auth | Body / query | Behaviour |
|---|---|---|---|
| `GET /request-types?withStats=1` | `@AuthOnly` (unchanged) | `withStats` optional | Without the flag: unchanged. With it: each row adds `stats` (`RequestTypeStatsDto`) from three `groupBy` counts (line categories, requests, templates) and the ACTIVE workflow version number. |
| `GET /request-types/modules` | `@AuthOnly` | - | `RequestModuleDto[]` from `listModules()`. **Declare this handler before `@Get(':id')`.** |
| `POST /request-types` | `request_types.manage` | `requestTypeInputSchema` (unchanged) | Existing behaviour plus: `fieldDefinitionIssues(b.headerFields, b.moduleKey === 'expense' ? EXPENSE_RESERVED_HEADER_KEYS : [])` must be empty, else `VALIDATION` with `details = issues`; `moduleKey`, when given, must be in `listModules()` else `VALIDATION`. |
| `PATCH /request-types/:id` | `request_types.manage` | `requestTypeUpdateSchema` | Same two validations when `headerFields` / `moduleKey` are present (use the stored `moduleKey` when only `headerFields` is sent). |
| `POST /request-types/:id/line-categories`, `PATCH .../:cid` | `request_types.manage` | existing schemas (now with `allowedMimeTypes`) | Persist `allowedMimeTypes` when given; validate `extraFields` with `fieldDefinitionIssues`; `quantityFieldKey`, when set, must be the key of a `number` field in `extraFields`; `minAttachments <= maxAttachments`. `catDto` returns `allowedMimeTypes`. |
| `PUT /request-types/:id/line-categories/order` | `request_types.manage` | `lineCategoryOrderSchema` | `ids` must be exactly the set of this type's category ids (else `VALIDATION`); in one transaction set `sortOrder = index * 10`; audit `line_category.reorder` (`meta: { ids }`); returns the updated `RequestTypeDto` with categories. HTTP 200. |
| `POST /templates` | `templates.manage` | `templateCreateSchema` | 404 `NOT_FOUND` when the request type (or `copyFromTemplateId`) does not exist; 409 `CONFLICT` when `(requestTypeId, code)` exists. One transaction: create `Template` (`isActive: true`); when `isDefault`, set `isDefault = false` on the type's other templates; create `TemplateVersion` v1 `DRAFT` with `layoutKey` from the body and `config` = the source template's ACTIVE (else latest) version config, or `DEFAULT_TEMPLATE_CONFIG` from `@dms/core/pdf` with `titleAr = nameAr` and `titleEn = nameEn`; `createdById = user.id`; audit `template.create` (`entityType: 'Template'`, `after: { code, requestTypeId, layoutKey }`). Returns the same shape as `GET /templates/:id` with HTTP 201. |
| `PATCH /templates/:id` | `templates.manage` | `templateUpdateSchema` | 404 when missing. `isDefault: true` clears the flag on the type's other templates (same transaction). `isActive: false` on the default template -> 409 `INVALID_STATE` ("deactivate after choosing another default"). `isDefault: false` is allowed. Audit `template.update` with before/after of the four fields. Returns the `GET /templates/:id` shape. |

`packages/core/src/engine/registry.ts`: add `export function listModules(): string[]` (sorted keys of the module map) and export it from `packages/core/src/engine/index.ts` (A1 owns exactly these two edits in `core/engine`).

**Web**: `DESIGN_SPEC.md` 9.14 (request types, W9) and 9.11 (templates, W6).

**Known limits (documented, not fixed)**: the Telegram bot stays hard-wired to `DRIVER_EXPENSE` and does not ask header fields; a request type created here is usable through `POST /requests` only. Deleting request types, categories and templates is not offered (deactivate only).

### B2. S/4HANA `findByReference` (A2)

**Problem.** `processSapPosting` treats any earlier attempt as "outcome unknown" and asks the adapter for the reference. The S/4HANA adapter answers `null`, so a retry after a lost response posts again.

**Mechanism.** A config-driven OData read of journal entry items by reference:

```
GET {SAP_S4_ODATA_URL}/{SAP_S4_LOOKUP_SERVICE}/{SAP_S4_LOOKUP_ENTITY}
    ?$filter=CompanyCode eq '{companyCode}' and {SAP_S4_LOOKUP_REF_FIELD} eq '{reference}'
    &$select=CompanyCode,FiscalYear,AccountingDocument&$top=5&$format=json
Headers: Authorization: Basic ..., sap-client: {SAP_S4_CLIENT} (when set), Accept: application/json
```
Defaults: service `API_JOURNALENTRYITEMBASIC_SRV`, entity `A_JournalEntryItemBasic`, field `DocumentReferenceID` (XBLNR; our reference is the request number, 12 characters, within the 16-character limit).

**New file `packages/core/src/sap/errors.ts`**
```ts
import { DomainError } from '../errors';
/** SAP answered and refused the document: it was definitely NOT posted. */
export class SapRejectedError extends DomainError {
  readonly definiteFailure = true;
  constructor(message: string) { super('INVALID_STATE', message); }
}
/** We cannot find out whether an earlier attempt was posted. `permanent` = configuration (lookup mode none), not a transient outage. */
export class SapLookupUnavailableError extends DomainError {
  constructor(message: string, readonly permanent = false) { super('INVALID_STATE', `UNKNOWN_OUTCOME: ${message}`); }
}
export const isDefiniteFailure = (e: unknown): boolean => e instanceof SapRejectedError;
```

**New file `packages/core/src/sap/s4lookup.ts`**
```ts
export interface S4LookupConfig { mode: 'odata' | 'none'; odataUrl?: string; service: string; entity: string; refField: string; user?: string; password?: string; client?: string; timeoutMs: number }
export function buildLookupUrl(cfg: S4LookupConfig, reference: string, companyCode: string): string;      // values: single quotes doubled, then encodeURIComponent on the whole $filter
export function parseLookupResponse(json: unknown): { documentNumber: string; fiscalYear: string } | null; // OData V2 { d: { results: [] } } and V4 { value: [] }; first row with a non-empty AccountingDocument; null when no rows
export class S4Lookup {
  constructor(cfg: S4LookupConfig, fetchImpl?: typeof fetch);
  find(reference: string, companyCode: string): Promise<{ documentNumber: string; fiscalYear: string } | null>;
}
export function lookupConfigFromEnv(): S4LookupConfig; // from getConfig()
```
`find` rules: mode `none` -> throw `SapLookupUnavailableError('SAP lookup is disabled (SAP_S4_LOOKUP_MODE=none)', true)`; missing `odataUrl`/`user`/`password` -> the same error with `permanent = true` and a message naming the variable; HTTP 200 -> `parseLookupResponse`; HTTP 401/403/404 -> `SapLookupUnavailableError('lookup HTTP <status>', true)`; any other status, network error or timeout (`AbortController`, `timeoutMs`) -> `SapLookupUnavailableError('lookup failed: <reason>', false)`; unparsable JSON -> non-permanent error. It never returns `null` unless SAP answered 200 with zero rows.

**`s4hana.ts` changes**
- `S4Config` gains `timeoutMs?: number`, `logicalSystem?: string`, `duplicatePattern?: string`; the constructor gains a third optional argument `lookup?: S4Lookup` (default `new S4Lookup(lookupConfigFromEnv(), fetchImpl)`).
- `buildSoapEnvelope`: when `o.logicalSystem` is set, emit `<OriginalReferenceDocument>{reference}</OriginalReferenceDocument>` and `<OriginalReferenceDocumentLogicalSystem>{logicalSystem}</OriginalReferenceDocumentLogicalSystem>` directly after `<OriginalReferenceDocumentType>`. Without it the envelope stays byte-identical to today (existing tests keep passing).
- `post`: request with `AbortController` timeout. Classification:
  - HTTP 401, 403, 404 -> `SapRejectedError('S/4HANA HTTP <status>')` (the request never reached posting).
  - Parsed response `ok: false` and the error text matches `duplicatePattern` (case-insensitive) -> run `this.lookup.find(reference, companyCode)`; found -> return it as the result with `raw: { reusedAfterDuplicate: true }`; not found -> throw a plain `DomainError('INVALID_STATE', 'UNKNOWN_OUTCOME: SAP reported a duplicate but the lookup found no document')`.
  - Parsed response `ok: false` otherwise (SOAP fault or error log items) -> `SapRejectedError('S/4HANA rejected the posting: <text>')`.
  - HTTP >= 500 without a parsable confirmation, network error, timeout -> plain `DomainError('INVALID_STATE', ...)` (unknown outcome).
- `findByReference(reference, companyCode)` -> `this.lookup.find(...)`.
- `adapters.ts`: pass `timeoutMs`, `logicalSystem`, `duplicatePattern` from the env; add the `'s4hana-cj'` case (B3).

**`process.ts` changes** (signature: `processSapPosting(prisma, postingId, o?: { trigger?: 'AUTO' | 'MANUAL'; userId?: string; force?: boolean })`)
1. In the first transaction, replace `unknownOutcome: p.status === 'POSTING' || p.attempts > 0` with:
   ```ts
   const prior = await tx.sapPostingAttempt.findMany({ where: { postingId }, select: { success: true, response: true } });
   const ambiguous = prior.some((a) => a.success !== true && (a.response as { definiteFailure?: boolean } | null)?.definiteFailure !== true);
   const unknownOutcome = p.status === 'POSTING' || ambiguous;
   ```
   (run before the new attempt row is created).
2. Step 2 becomes:
   ```ts
   if (unknownOutcome) {
     try {
       const found = await adapter.findByReference(doc.reference, doc.companyCode);
       if (found) { result = { ...found, companyCode: doc.companyCode }; reused = true; }
     } catch (e) {
       if (!(e instanceof SapLookupUnavailableError) || o?.force !== true) throw e;
       forced = true; // an authorised user confirmed in SAP that no document exists
     }
   }
   ```
3. In the failure branch store definiteness on the attempt: `data: { finishedAt: now, success: false, error: msg, response: { definiteFailure: isDefiniteFailure(e) } }`. When `e instanceof SapLookupUnavailableError && e.permanent`: set `(e as { fatal?: boolean }).fatal = true` before rethrowing (the job runner stops retrying fatal errors, as with the existing `fatal` flag in `apps/worker/src/handlers.ts`) and call `notifySapFailure` immediately.
4. In the success branch add `forced` to the attempt `response` and to the `SAP_POSTED` event `data`.
5. `notifySapFailure`: replace the direct `createMany` with `notifyUsers(prisma, {...same texts..., userIds})` so e-mail/Telegram fan-out applies (B6).
6. `retrySapPosting(prisma, postingId, userId, o?: { force?: boolean })`: job payload becomes `{ postingId, trigger: 'MANUAL', userId, force: o?.force === true }`.

Mock and file adapters keep their behaviour (their errors are plain, so the lookup still runs and is reliable for them): all existing SAP tests must pass unchanged.

**API** (`apps/api/src/integrations/sap.controller.ts`): `POST /sap/postings/:id/retry` takes `@Body(new ZodPipe(sapRetryBodySchema)) b: SapRetryBody`, calls `retrySapPosting(prisma, id, user.id, { force: b.force })`, and when `b.force` writes an audit row `sap.posting.force_retry` (`entityType: 'SapPosting'`). Permission unchanged (`sap.retry`). `GET /sap/postings/:id` must include `attempts` (number, trigger, startedAt, finishedAt, success, error) and `payload` if it does not already (the drawer needs them).

**Web**: `DESIGN_SPEC.md` 9.9 (force dialog when `lastError` starts with `UNKNOWN_OUTCOME`).

**Questions for the SAP team** (A2 appends them to `docs/SAP_INTEGRATION.md` under "Phase 2: idempotency lookup"):
1. Is the OData service `API_JOURNALENTRYITEMBASIC_SRV` (entity `A_JournalEntryItemBasic`) activated, and may the communication user read it? If not, which read API returns FI documents by reference (`API_OPLACCTGDOCITEMCUBE_SRV`, a CDS view, a custom service)?
2. Does `DocumentReferenceID` hold the value we send in the SOAP field `DocumentReferenceID` (XBLNR)? Is it filterable? Case-sensitive?
3. Base URL of the OData gateway and whether it is OData V2 or V4.
4. How long after posting is the document visible to this read (is posting synchronous)?
5. When the same `OriginalReferenceDocument` + logical system is posted twice, does SAP reject it? What exact message text or number is returned (to set `SAP_S4_DUPLICATE_PATTERN`)? Which logical system name should we send (`SAP_S4_LOGICAL_SYSTEM`)?
6. Should reversed documents count as "already posted"? (Today any document with the reference blocks re-posting.)
7. Until 1-3 are confirmed, run with `SAP_S4_LOOKUP_MODE=none`: a retry after an unknown outcome then stops with `UNKNOWN_OUTCOME` and needs a person to check FB03 and press "re-send" with the confirmation box.

### B3. Cash Journal (FBCJ) adapter (A2)

A real adapter selected with `SAP_ADAPTER=s4hana-cj`. It implements `SapPostingAdapter`, so the outbox, attempts, idempotency, retry and monitor work unchanged.

**Payload.** `JournalEntryDoc` (`types.ts`) gains an optional block, filled by `buildJournalEntry` (`journal.ts`) from the treasury and `sap.config.cashJournal`:
```ts
cashJournal?: { number: string; treasuryCode: string; businessTransaction: string };
```
`number = cfg.cashJournal.numberByTreasuryCode[treasury.code] ?? cfg.cashJournal.defaultNumber`. Always filled (harmless for the other adapters). The old placeholder interface `CashJournalAdapter` in `types.ts` is deleted (nothing implements or imports it; check with grep).

**New file `packages/core/src/sap/cashjournal.ts`**
```ts
export interface CashJournalDoc {
  reference: string; companyCode: string; cashJournal: string; businessTransaction: string; currency: 'EGP';
  postingDate: string; documentDate: string; headerText: string;
  items: { position: number; glAccount: string; costCenter?: string; amount: string; text: string; assignment: string }[];
  total: string;
}
/** Debit lines become cash-journal payment items; the credit (cash GL) line is implied by the cash journal itself. Throws INVALID_STATE when doc.cashJournal is missing or the debits do not equal the credit. */
export function toCashJournalDoc(doc: JournalEntryDoc): CashJournalDoc;
export const CJ_ELEMENTS: { /* one constant with every XML element name used below */ };
export function buildCashJournalEnvelope(cj: CashJournalDoc, o?: { functionName?: string }): string;
export type CashJournalParse = { ok: true; documentNumber: string; fiscalYear: string; companyCode: string } | { ok: false; error: string };
export function parseCashJournalResponse(xml: string): CashJournalParse;
export class S4CashJournalAdapter implements SapPostingAdapter {
  name = 's4hana-cj';
  constructor(cfg: { url?: string; user?: string; password?: string; client?: string; functionName: string; timeoutMs: number; duplicatePattern?: string }, fetchImpl?: typeof fetch, lookup?: S4Lookup);
  post(doc: JournalEntryDoc): Promise<SapPostResult>;
  findByReference(reference: string, companyCode: string): Promise<{ documentNumber: string; fiscalYear: string } | null>; // delegates to S4Lookup
}
```
Envelope (SOAP 1.1, RFC namespace; function name from `SAP_S4_CJ_FUNCTION`, default `BAPI_CASHJOURNALDOC_CREATE`):
```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:sap-com:document:sap:rfc:functions">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:BAPI_CASHJOURNALDOC_CREATE>
      <HEADER>
        <COMP_CODE>1000</COMP_CODE><CAJO_NUMBER>0001</CAJO_NUMBER><CURRENCY>EGP</CURRENCY>
        <DOC_DATE>2026-11-10</DOC_DATE><PSTNG_DATE>2026-11-10</PSTNG_DATE>
        <REF_DOC_NO>DE-26-000123</REF_DOC_NO><BP_NAME>header text</BP_NAME>
      </HEADER>
      <TESTRUN></TESTRUN>
      <ITEMS>
        <item><POSITION_NUMBER>001</POSITION_NUMBER><TRANSACT_NUMBER>{businessTransaction}</TRANSACT_NUMBER><P_PAYMENTS>1500.00</P_PAYMENTS><GL_ACCOUNT>…</GL_ACCOUNT><COSTCENTER>…</COSTCENTER><POSITION_TEXT>…</POSITION_TEXT><ALLOC_NMBR>DE-26-000123</ALLOC_NMBR></item>
      </ITEMS>
      <RETURN/>
    </urn:BAPI_CASHJOURNALDOC_CREATE>
  </soapenv:Body>
</soapenv:Envelope>
```
Response parsing: a SOAP `Fault` -> error; any `RETURN` `item` with `TYPE` `E` or `A` -> error (join the `MESSAGE` texts); otherwise require `CASH_JOURNAL_DOC_NO` (not empty, not all zeros), `FISCAL_YEAR`, `COMPANY_CODE` -> success with `documentNumber = CASH_JOURNAL_DOC_NO`. Reuse `xmlEscape` and the tag helpers of `s4hana.ts` (export `tag`, `tags`, `unescapeXml` from there). Error classification in `post` is identical to B2. Configuration check: missing `SAP_S4_CJ_URL`, `SAP_S4_USER` or `SAP_S4_PASSWORD` -> `DomainError('INVALID_STATE', 'Cash journal adapter is not configured (...)')`. Every element name is marked UNVERIFIED in a comment.

**Settings UI**: `/master/sap-settings` shows the `cashJournal` block (W7, `DESIGN_SPEC.md` 9.12).

**Questions for the SAP team** (appended to `docs/SAP_INTEGRATION.md` under "Phase 2: cash journal"):
1. Which interface is available: `BAPI_CASHJOURNALDOC_CREATE` exposed as a web service (SOAMANAGER), a Z wrapper, CPI, or none? Endpoint URL?
2. Does the exposed service commit (`BAPI_TRANSACTION_COMMIT`) in the same call? If not, a Z wrapper `Z_DMS_CASHJOURNAL_POST` that creates, posts and commits is required; give its name and parameters.
3. Does CREATE only save the cash document, or also post it to FI? If it only saves, which call posts it?
4. Exact parameter and field names of `HEADER` and `ITEMS` in your release, and the response fields carrying the cash journal document number and the FI document number.
5. Cash journal number per treasury, and the business transaction (number/name) for expense payments with a G/L account per item.
6. Is `REF_DOC_NO` copied to the FI document reference (XBLNR), so the B2 lookup finds cash journal postings?
7. Tax code and other mandatory item fields in your configuration.

### B4. S3 storage driver (A3)

**Interface** (`packages/core/src/storage/index.ts`): `StorageAdapter` gains one optional method:
```ts
presignGet?(key: string, o: { ttlSec: number; download?: boolean; fileName?: string; contentType?: string }): Promise<string>;
```
`getStorage()`: for `STORAGE_DRIVER === 's3'` return a cached `createS3Storage(s3ConfigFromEnv())` (cache key = bucket + endpoint + prefix; `resetConfigCache()` users in tests still get a fresh instance because the key is recomputed). The local driver is untouched.

**New file `packages/core/src/storage/s3.ts`**
```ts
export interface S3Config { bucket: string; region: string; endpoint?: string; accessKeyId?: string; secretAccessKey?: string; forcePathStyle: boolean; prefix?: string }
/** The subset of S3Client we use; tests pass a fake. */
export interface S3Like { send(command: unknown): Promise<any> }
export function s3ConfigFromEnv(): S3Config;                              // throws VALIDATION when S3_BUCKET is missing
export function objectKey(cfg: S3Config, key: string): string;            // assertValidKey(key); prefix without leading/trailing slashes + '/' + key
export function createS3Storage(cfg: S3Config, deps?: { client?: S3Like; presign?: (key: string, o: { ttlSec: number; disposition?: string; contentType?: string }) => Promise<string>; upload?: (p: { Key: string; Body: Readable; ContentType?: string }) => Promise<void> }): StorageAdapter & { presignGet: NonNullable<StorageAdapter['presignGet']> };
```
Behaviour:
- Client: `new S3Client({ region, endpoint, forcePathStyle, credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined })`.
- `put(key, data, o)`: Buffer -> `PutObjectCommand({ Bucket, Key, Body, ContentType, IfNoneMatch: o?.ifNotExists ? '*' : undefined })`, sha256 and size computed locally; a 412 / `PreconditionFailed` error -> `DomainError('CONFLICT', 'File already exists: <key>')`. Readable -> when `ifNotExists`, `HeadObjectCommand` first (exists -> `CONFLICT`); then pipe through a hashing/counting `Transform` into `new Upload({ client, params: { Bucket, Key, Body, ContentType } }).done()` from `@aws-sdk/lib-storage` (or `deps.upload` in tests). Returns `{ key, size, sha256 }` (the caller's key, not the prefixed one).
- `get(key)`: `GetObjectCommand`, `Buffer.from(await res.Body.transformToByteArray())`; `NoSuchKey` / 404 -> `DomainError('NOT_FOUND', 'File not found: <key>')`.
- `stream(key)`: returns a `PassThrough` immediately; asynchronously sends `GetObjectCommand` and pipes `res.Body` (a Node `Readable`) into it; errors are emitted on the returned stream (404 mapped to the `NOT_FOUND` DomainError).
- `exists(key)`: `HeadObjectCommand`; 404 / `NotFound` -> `false`; other errors rethrown. `stat(key)`: `HeadObjectCommand` -> `{ size: ContentLength }`; 404 -> `NOT_FOUND`. `delete(key)`: `DeleteObjectCommand` (idempotent).
- `presignGet(key, o)`: `getSignedUrl(client, new GetObjectCommand({ Bucket, Key, ResponseContentDisposition, ResponseContentType }), { expiresIn: ttlSec })` from `@aws-sdk/s3-request-presigner`; disposition built with the same rules as `contentDisposition()` in the files controller when `download` is true.
- Every key passes `assertValidKey`.

**Files controller** (`apps/api/src/files/files.controller.ts`): after the HMAC check and `stat`, when `getConfig().S3_PRESIGNED_REDIRECT && storage.presignGet`: `res.redirect(302, await storage.presignGet(v.key, { ttlSec: Math.max(1, Math.min(remaining, 300)), download: v.download, fileName: v.fileName, contentType: contentTypeOf(v.key) }))` with `Cache-Control: no-store`. Otherwise the existing proxy streaming is used (works for both drivers). The application's signed URL (`signFileUrl`) stays the only URL handed to clients.

**Env**: `STORAGE_DRIVER=s3`, `S3_ENDPOINT` (MinIO or empty for AWS), `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `S3_PREFIX`, `S3_PRESIGNED_REDIRECT`.

**Docs**: A3 adds a section "S3 / MinIO storage" to `docs/BACKUP_RESTORE.md` (bucket versioning, what to back up, how to migrate existing local files: `aws s3 sync storage-data s3://bucket/prefix`).

### B5. Prometheus `/metrics` (A3)

Hand-rolled, no library. **New file `packages/core/src/metrics/index.ts`** (subpath `@dms/core/metrics`):
```ts
export type Labels = Record<string, string>;
export class Counter { inc(labels?: Labels, by?: number): void }
export class Gauge { set(value: number, labels?: Labels): void; reset(): void }
export class Histogram { observe(value: number, labels?: Labels): void }
export class Registry {
  counter(name: string, help: string, labelNames?: string[]): Counter;   // returns the existing metric when the name is already registered
  gauge(name: string, help: string, labelNames?: string[]): Gauge;
  histogram(name: string, help: string, buckets: number[], labelNames?: string[]): Histogram;
  render(): string;                                                      // Prometheus text exposition 0.0.4, metrics sorted by name, ends with '\n'
  clear(): void;                                                         // tests
}
export const registry: Registry;                                         // process-wide
export function escapeLabelValue(v: string): string;                     // \ -> \\, " -> \", newline -> \n
export function collectProcessMetrics(reg?: Registry): void;             // gauges below, set at call time
export function collectDbMetrics(db: Db, reg?: Registry): Promise<void>; // gauges below, from grouped counts; sets dms_db_up 0 and returns when a query fails
```
Text format rules: `# HELP name help` and `# TYPE name counter|gauge|histogram` once per metric; samples `name{a="x",b="y"} value`; label order = `labelNames` order; histograms emit `name_bucket{...,le="0.1"}` cumulative counts for each bucket plus `le="+Inf"`, then `name_sum` and `name_count`; numbers printed with `String(value)`.

Metrics:

| Name | Type | Labels | Source |
|---|---|---|---|
| `dms_http_requests_total` | counter | `method`, `route`, `status` | interceptor |
| `dms_http_request_duration_seconds` | histogram (0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) | `method`, `route` | interceptor |
| `dms_process_uptime_seconds`, `dms_process_resident_memory_bytes`, `dms_process_heap_used_bytes` | gauge | - | `collectProcessMetrics` |
| `dms_db_up` | gauge | - | 1 when `SELECT 1` works |
| `dms_jobs` | gauge | `queue`, `status` | `jobs` grouped by queue and status |
| `dms_jobs_oldest_pending_age_seconds` | gauge | `queue` | now - min(`runAt`) of PENDING jobs with `runAt <= now` |
| `dms_sap_postings` | gauge | `status` | `sap_postings` grouped by status |
| `dms_notifications` | gauge | `channel`, `status` | `notifications` grouped by channel and status, only status PENDING and FAILED |
| `dms_requests` | gauge | `status` | `requests` grouped by status |
| `dms_steps_overdue` | gauge | - | ACTIVE step instances with `dueAt < now` |
| `dms_build_info` | gauge (value 1) | `version` | `version` = root `package.json` version read once (fallback `'0.0.0'`) |

**API**
- `apps/api/src/health/metrics.interceptor.ts`: `@Injectable() class MetricsInterceptor implements NestInterceptor`; on each HTTP request record start time and, on `res.on('finish')`, increment the counter and observe the duration with `route = req.route?.path ?? 'unmatched'` (the templated path, so ids do not explode cardinality), `method = req.method`, `status = String(res.statusCode)`. Skip the `/metrics` route itself.
- `apps/api/src/health/health.module.ts`: register `{ provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }`.
- `health.controller.ts` `GET /metrics` (stays `@Public()`; the check is inside): token = `getConfig().METRICS_TOKEN`. When set: require `Authorization: Bearer <token>` (constant-time compare) else `DomainError('UNAUTHORIZED', ...)` (401). When not set and `NODE_ENV === 'production'`: `DomainError('NOT_FOUND', ...)` (404). Otherwise open. Response: `Content-Type: text/plain; version=0.0.4; charset=utf-8`, body = `collectProcessMetrics(); await collectDbMetrics(prisma); registry.render()`. Use `@Res()` or `@Header` so Nest does not JSON-encode the string. Check the error code names in `packages/shared/src/constants/errors.ts` and use the existing codes for 401 and 404.
- The old JSON body (`{ uptimeSec, memoryRss }`) is removed (nothing uses it).

**Docs**: A3 adds a "Monitoring" section to `docs/ARCHITECTURE.md` with a sample Prometheus scrape config (bearer token) and the metric table.

### B6. E-mail notifications (A4)

**New folder `packages/core/src/email/`** (subpath `@dms/core/email`): `index.ts`, `templates.ts`, `transport.ts`.
```ts
// transport.ts
export interface EmailMessage { to: string; subject: string; html: string; text: string }
export interface EmailTransport { name: string; send(msg: EmailMessage): Promise<{ messageId: string }> }
export function createSmtpTransport(cfg: { host: string; port: number; secure: boolean; user?: string; password?: string; from: string; rejectUnauthorized: boolean }): EmailTransport; // nodemailer.createTransport; `from` applied to every message
export function createFileTransport(storage: StorageAdapter, from: string): EmailTransport;   // writes JSON { from, to, subject, html, text, at } to `outbox-email/<yyyy-mm-dd>/<random hex>.json`, returns that key as messageId
export function getEmailTransport(): EmailTransport | null;                                   // by EMAIL_DRIVER; null for 'none'; cached
export function registerEmailTransport(t: EmailTransport | null): void;                       // test hook, overrides the cache
/** true when the SMTP server refused permanently (nodemailer `responseCode` 500-599, or codes EENVELOPE / EAUTH). */
export function isPermanentEmailError(e: unknown): boolean;

// templates.ts
export interface EmailNotificationView { type: string; titleAr: string | null; titleEn: string | null; bodyAr: string; bodyEn: string | null; link: string | null; requestNumber: string | null }
export function renderEmail(n: EmailNotificationView, o: { locale: 'ar' | 'en'; webUrl: string; appNameAr?: string; appNameEn?: string }): { subject: string; html: string; text: string };

// index.ts
export function sendEmailNotification(prisma: PrismaClient, notificationId: string, transport?: EmailTransport | null): Promise<{ sent?: true; skipped?: string; failed?: string }>;
```
`renderEmail`: subject = `[<request number>] <title>` (title = `titleAr` in Arabic, else `titleEn ?? titleAr`; when there is no number just the title; when there is no title use the first 80 characters of the body). HTML: a single self-contained table layout with inline styles, `dir="rtl" lang="ar"` for Arabic: 600px card on `#FAF7F2`, a `#14284B` header band with the app name in white (`نظام إدارة المستندات` / `DMS`), a 2px `#C9A45C` rule, the title (20px, `#16202F`), the body (15px, line-height 1.8, newlines to `<br>`), a button "فتح الطلب" / "Open request" (`#14284B`, white text, 6px radius) linking to `webUrl + link` when `link` starts with `/`, and a footer line "رسالة آلية من نظام إدارة المستندات، لا ترد عليها." / "Automated message from DMS; do not reply." Font stack `Tahoma, 'Segoe UI', Arial, sans-serif`. Every dynamic value is HTML-escaped. `text` = title, blank line, body, blank line, absolute link.

`sendEmailNotification`: load the notification with its recipient user; not found -> `{ skipped: 'not found' }`; `channel !== 'EMAIL'` -> `{ skipped: 'not email' }`; status `SENT` / `SKIPPED` -> skipped (idempotent); transport null -> mark `SKIPPED` with error `email disabled`; user missing, inactive or without `email` -> `SKIPPED` `no email`; else render with `locale = user.locale === 'en' ? 'en' : 'ar'`, `webUrl = getConfig().WEB_PUBLIC_URL`, `link = data.link`, `requestNumber = data.requestNumber`, and send. Success -> `SENT`, `sentAt`. `isPermanentEmailError` -> `FAILED` with the message, return `{ failed }` (no retry). Any other error -> rethrow (the job runner retries with backoff).

**Fan-out** (`packages/core/src/notifications/index.ts`): after the in-app `createMany` in `notifyUsers`, call a new exported `fanOutUserChannels(db, n, ids)` inside `try/catch` (a fan-out error is logged with `console.warn` and never fails the caller):
```ts
export async function fanOutUserChannels(db: Db, n: NotifyBase, userIds: string[]): Promise<{ email: number; telegram: number }>;
```
- E-mail: skip unless `getConfig().EMAIL_DRIVER !== 'none'` and the setting `notifications.email` is enabled and its `types` include `n.type` or `'*'`. For each active user in `userIds` with a non-empty `email`: create `Notification { channel: 'EMAIL', recipientUserId, type, requestId, titleAr, titleEn, bodyAr, bodyEn, data, status: 'PENDING' }` and `enqueueJob(db, { type: 'email.send', payload: { notificationId }, dedupeKey: 'email.send:' + id })` (default queue).
- Telegram for users (B7): skip unless the setting `notifications.telegramUsers` is enabled and its `types` include the type. For each active user with a `telegramChatId`: create `Notification { channel: 'TELEGRAM', recipientUserId, ..., status: 'PENDING' }` and `enqueueJob(db, { type: 'telegram.send', queue: 'telegram', payload: { notificationId }, dedupeKey: 'telegram.send:' + id })`.
- Returns the two counts. Uses the same `db` handle (works inside a transaction).

**Worker** (`apps/worker/src/handlers.ts`): replace the stub with
```ts
[JOB_TYPES.EMAIL_SEND]: async (job: Job, { prisma }: Ctx) => {
  const p = (job.payload ?? {}) as { notificationId?: string };
  if (!p.notificationId) throw Object.assign(new DomainError('VALIDATION', 'email.send needs notificationId'), { fatal: true });
  return sendEmailNotification(prisma, p.notificationId);
},
```
and pass `force` through in the `sap.post` handler: payload type gains `force?: boolean`, call `processSapPosting(prisma, p.postingId, { trigger: p.trigger ?? 'AUTO', userId: p.userId, force: p.force === true })`.

**Settings**: `notifications.email` (`{ enabled, types }`), edited in `/admin/settings` (W8). **Env**: `EMAIL_DRIVER`, `SMTP_*` (5.5). Users need an e-mail address (`/admin/users` form).

### B7. Telegram link and relink for users and drivers (core + API: A1; bot: A5; web: W7, W8, W1)

**Token** (stateless, no schema change). **New file `packages/core/src/telegram/index.ts`** (subpath `@dms/core/telegram`):
```ts
export type LinkKind = 'u' | 'd';                       // user (approver) | driver (submitter)
/** `<kind>_<id>_<expBase36>_<sig>`; sig = first 20 hex chars of HMAC-SHA256(FILE_URL_SECRET, 'tg-link\n' + kind + '\n' + id + '\n' + expBase36). Only [A-Za-z0-9_], at most 64 chars (Telegram deep-link limit). */
export function createLinkToken(p: { kind: LinkKind; id: string; ttlSec?: number; now?: Date }): { token: string; expiresAt: Date };
export function verifyLinkToken(token: string, now?: Date): { kind: LinkKind; id: string } | null;   // constant-time signature compare; null when malformed, tampered or expired
export function buildLinkInfo(p: { kind: LinkKind; id: string; now?: Date }): { command: string; deepLink: string | null; expiresAt: string }; // command = '/start ' + token; deepLink uses BOT_USERNAME; ttl = TELEGRAM_LINK_TTL_SEC
```
`createLinkToken` throws `DomainError('VALIDATION')` when `id` does not match `/^[A-Za-z0-9]+$/` or the token would exceed 64 characters. Replay within the TTL is harmless: linking is refused when the target is already linked or the Telegram account is linked elsewhere.

**API**
| Method and path | Auth | Behaviour |
|---|---|---|
| `POST /users/:id/telegram-link` (`users.controller.ts`) | `@AuthOnly()`; inside: caller is the same user, or holds `users.manage` (else `FORBIDDEN`) | 404 when the user is missing or inactive; 409 `INVALID_STATE` when already linked; returns `TelegramLinkDto` from `buildLinkInfo({ kind: 'u', id })`; HTTP 200; audit `user.telegram_link_issued`. |
| `POST /users/:id/telegram-unlink` | same rule | 409 `INVALID_STATE` when not linked; clears `telegramUserId` and `telegramChatId`; audit `user.telegram_unlink` (before: the id as string); returns `{ ok: true }`; HTTP 200. |
| `POST /submitters/:id/telegram-link` (`SubmitterExtrasController` in `master.controller.ts`) | `submitters.telegram_link` | 404 when missing or inactive; 409 when already linked (the web calls unlink first for "relink"); returns `TelegramLinkDto` with `kind: 'd'`; audit `submitter.telegram_link_issued`. |
| `GET /auth/me` | unchanged | adds `telegramLinked: boolean`. |

Follow the existing self-or-permission pattern of `signatures.controller.ts`. Update the authz matrix test data if the meta-test requires each handler to be listed (read `apps/api/test/platform/authz-matrix.test.ts` first).

**Bot** (`apps/bot/src/flow.ts`, `messages.ts`, `jobs.ts`; A5)
- In `handleInput`, immediately after the callback acknowledgement and before the link-status block: if `input.kind === 'text'` and the trimmed text matches `/^\/start\s+([ud]_[A-Za-z0-9_]{10,62})$/`, call `handleLinkToken(deps, s, from, token, out)` and return.
- `handleLinkToken`: `verifyLinkToken(token, deps.now())`; null -> `M.linkInvalid`.
  - Kind `u`: load the user; missing or inactive -> `M.linkInvalid`. Linked to a different Telegram id -> `M.linkTaken`. Another user already has this Telegram id -> `M.linkTaken`. Otherwise set `telegramUserId = BigInt(from.id)`, `telegramChatId = BigInt(from.id)`; audit `user.telegram_link` (`actor: { type: 'SYSTEM', label: 'telegram:' + from.id }`, `entityType: 'User'`, `after: { telegramUserId: String(from.id) }`); reply `M.userLinked(fullName)` with the reply keyboard removed. The session is not changed.
  - Kind `d`: load the submitter; missing or inactive -> `M.linkInvalid`. Linked to another id, or this Telegram id is linked to another submitter (unique violation caught) -> `M.alreadyLinked`. Otherwise update the four Telegram fields exactly as the contact flow does, audit `bot.linked` with `meta: { via: 'admin_link' }`, set `s.submitterId`, `s.state = 'IDLE'`, reply `M.linked(fullName)` with the menu keyboard (same as the contact flow).
- In `handleUnlinked`, before the `/start` welcome: if a `User` has `telegramUserId = BigInt(from.id)` and the input is not a contact, reply `M.approverOnly` (no contact keyboard) and return.
- New messages (`messages.ts`, Egyptian Arabic like the rest): `userLinked: (name) => 'تمام يا ' + name + '، حسابك اتربط. هتوصلك إشعارات الاعتماد هنا.'`, `linkInvalid: 'الرابط ده مش صالح أو انتهت مدته. اطلب رابط جديد من مدير النظام.'`, `linkTaken: 'حساب تليجرام ده أو المستخدم مربوط قبل كده. فك الربط الأول من النظام.'`, `approverOnly: 'الحساب ده مربوط كمستخدم اعتماد. الإشعارات بتوصلك هنا، والاعتماد من الموقع.'`.
- `createTelegramSendHandler` (`jobs.ts`): when `n.recipientUserId` is set (and `recipientSubmitterId` is null) resolve the chat from the user (`telegramChatId ?? telegramUserId`; none -> `SKIPPED` `no telegram chat id`), text = `[titleAr, bodyAr, link].filter(Boolean).join('\n')` where `link = WEB_PUBLIC_URL + data.link` when `data.link` starts with `/`; no reply markup; the `VCR_DECIDED` session update is skipped for users. Submitter behaviour is unchanged.

**Decision D35 is amended**: a driver can also be linked through an admin-issued link (the admin has verified the person); the contact-share flow is unchanged.

**Web**: `DESIGN_SPEC.md` 9.12 (drivers), 9.13 (users), 9.15 (profile), `TelegramLinkDialog`.

### B8. Load-test tooling (A6)

Files: `packages/core/scripts/load-data.ts`, `packages/core/scripts/load-timing.ts` (the real scripts; `@dms/core` has `@dms/db`, Prisma and the query functions), and thin launchers `scripts/load-data.ts`, `scripts/load-timing.ts` at the repo root that run `pnpm --filter @dms/core exec tsx scripts/<name>.ts <args>` with `spawnSync(..., { stdio: 'inherit', shell: true })` and exit with its status. Root scripts `pnpm load:data`, `pnpm load:timing` (added in the install step).

**Safety**: both scripts work on the database `dms_load` only. `load-data` refuses to run when the target database name is `dms` or `dms_template` or starts with `dms_t_`. Connection: `DATABASE_URL` with the database name replaced (use `pgUrl()` / `adminUrl()` from `packages/db/src/pgconfig` the same way `packages/db/scripts/migrate.ts` does).

**`load-data.ts`**
- Args: `--requests=50000` (default), `--attachments=200000` (minimum total, default), `--seed=42`, `--fresh` (drop and recreate `dms_load`; default when it does not exist), `--db=dms_load`.
- Steps: (1) with `--fresh` or when missing: terminate connections, `DROP DATABASE IF EXISTS`, `CREATE DATABASE "dms_load" TEMPLATE "dms_template"` (the template already has migrations and the base seed; print "run pnpm db:migrate first" when the template is missing). (2) Read reference data with Prisma: request type `DRIVER_EXPENSE` with active line categories, the ACTIVE workflow version with steps (ordered), roles, the default treasury, expense type configs (GL), cost centers, vehicles with types; create 200 extra submitters (`LD0001`..`LD0200`, phones `+2010900XXXXX`) and 150 vehicles (`LD-1001`..) with `createMany`. (3) Generate requests with a deterministic PRNG (mulberry32 from `--seed`) in chunks of 2,000 requests; per chunk build arrays and insert with `createMany` in dependency order: `Request`, `ExpenseRequest`, `RequestLine`, `ExpenseLine` (accounting snapshot), `Attachment`, `RequestStepInstance`, `RequestEvent`, `SapPosting` (for PAID). Ids are generated in the script (`'ld' + base36 counter` padded to 24 characters) so children can reference parents without round trips.
- Distribution: `submittedAt` uniform over the last 540 days; status mix 70% `PAID`, 15% `IN_REVIEW`, 5% `CORRECTION_REQUESTED`, 8% `REJECTED`, 2% `APPROVED`; 1-4 lines per request (weights 30/35/25/10); amounts 20.00-5000.00 with two decimals; attachments per line 1-3 (weights 50/35/15), topped up on the last chunk until the total reaches `--attachments`; attachment rows are metadata only (`storageKey` `attachments/load/<id>.jpg`, `mimeType` `image/jpeg`, `sizeBytes` 80,000-400,000, random 64-hex `sha256`, `phash` null); no files are written.
- Step instances: one per workflow step using the step's role and names; for `PAID` all `APPROVED` with ascending `actedAt`; for `IN_REVIEW` a random prefix `APPROVED`, the next `ACTIVE` (`activatedAt` within the last 10 days, `dueAt = activatedAt + slaHours` so some are overdue), the rest `PENDING`; `CORRECTION_REQUESTED` like `IN_REVIEW` with the current step `AWAITING_CORRECTION`; `REJECTED` with the current step `REJECTED`. `stageIndex` follows the step order (steps sharing a `parallelGroup` share an index). Conditional steps are treated as applicable (simplification).
- Numbers: `LD-<yy>-<6 digits>` (prefix `LD`, never collides with real numbers); `clientKey` `load:<n>`; `channel` `TELEGRAM`; `totalOriginal` = `totalFinal` = sum of lines; `rowVersion` 1.
- Because every row goes through typed `createMany`, **the compiler lists every required column**: read `packages/db/prisma/schema.prisma` for the models above and fill all required fields; do not use raw SQL inserts.
- Ends with `ANALYZE` and prints a table of row counts per table and the elapsed time. Exit code 1 when requests < `--requests` or attachments < `--attachments`.

**`load-timing.ts`**
- Args: `--db=dms_load`, `--runs=5`, `--explain` (also print `EXPLAIN (ANALYZE, BUFFERS)` for the two raw-SQL report queries), `--out=docs/plan-v2/LOAD_RESULTS.md` (optional; writes the table as Markdown).
- Loads `AuthUser`s with `loadAuthUser` from `@dms/core/rbac` for the seed users `supervisor`, `accountant1`, `admin`; calls `registerExpenseModule()` first.
- Measures (each `--runs` times after one warm-up; reports min / p50 / max ms):

| Id | Call | Budget (p50) |
|---|---|---|
| Q1 | `listQueue(db, supervisor, { tab: 'active', page: 1, pageSize: 25 })` | 150 ms |
| Q2 | `queueCounters(db, supervisor)` | 150 ms |
| Q3 | `listQueue` page 20 | 250 ms |
| Q4 | `listRequests(db, admin, { page: 1, pageSize: 25 })` | 200 ms |
| Q5 | `listRequests(db, admin, { number: '00042' })` (substring) | 300 ms |
| Q6 | `listRequests(db, accountant1, { status: 'IN_REVIEW', page: 1 })` (role visibility) | 400 ms |
| Q7 | `getRequestDetail(db, <a PAID request id>, admin)` | 150 ms |
| Q8 | `queryReport` last 30 days, page size 50, no grouping | 800 ms |
| Q9 | `queryReport` whole range grouped by `expenseType` | 2000 ms |
| Q10 | `dashboardSummary` for the last 90 days | 2000 ms |
| Q11 | `listDelayed` | 400 ms |

  (take the exact function signatures from `packages/core/src/engine/queries.ts`, `reports/query.ts`, `reports/dashboard.ts`.)
- Prints a table with a PASS / SLOW column, the database size and row counts. Exit code 0 always (it is a measurement tool); SLOW rows are the input for further index work.
- Indexes implied so far are in migration `0003_perf_indexes` (5.7). Any further index found by the friend's run is added later as `0004_*`; not part of this phase.

### B9. `scripts/demo.ts` fix (H1)

**New file `scripts/demo-lib.ts`** (pure helpers, tested from `e2e/unit/demo-lib.test.ts`):
```ts
/** Directory of the generated Prisma client (…/.prisma/client) as resolved from packages/db, or null. */
export function prismaClientDir(root: string): string | null;
/** 'fresh' = generated and its schema.prisma copy equals the repo schema; 'stale' = generated but different; 'missing' = not generated. */
export function prismaClientState(root: string): 'fresh' | 'stale' | 'missing';
export function shouldGenerate(state: 'fresh' | 'stale' | 'missing', force: boolean): boolean;        // true unless state === 'fresh' && !force
/** What to do when `prisma generate` failed. */
export function onGenerateFailure(state: 'fresh' | 'stale' | 'missing'): 'abort' | 'continue-with-warning'; // 'missing' -> abort, otherwise continue
/** Compare schema texts ignoring line endings and trailing whitespace. */
export function sameSchema(a: string, b: string): boolean;
```
`prismaClientDir`: `require.resolve('@prisma/client/package.json', { paths: [join(root, 'packages', 'db')] })`, then `join(dirname(resolved), '..', '..', '.prisma', 'client')`; return it when `index.js` exists there, else null (wrap in try/catch). `prismaClientState`: compare `<dir>/schema.prisma` with `packages/db/prisma/schema.prisma` using `sameSchema`.

**`scripts/demo.ts` changes**
1. Replace the unconditional `step('Generating Prisma client', 'pnpm db:generate')` with:
   ```ts
   const state = prismaClientState(root);
   if (shouldGenerate(state, process.argv.includes('--generate'))) {
     console.log('\n==> Generating Prisma client');
     const r = spawnSync('pnpm db:generate', { cwd: root, stdio: 'inherit', shell: true });
     if (r.status !== 0) {
       if (onGenerateFailure(state) === 'abort') {
         console.error('\nPrisma client is not generated and generation failed. Stop every running node process of this project, then run: pnpm db:generate');
         process.exit(r.status ?? 1);
       }
       console.warn('\nWARNING: could not regenerate the Prisma client (files are locked by a running process). Continuing with the existing client. If the schema changed, stop all node processes and run: pnpm db:generate');
     }
   } else {
     console.log('\n==> Prisma client is up to date (skipping generate)');
   }
   ```
2. Reuse running servers: add `async function isUp(url: string): Promise<boolean>` (one `fetch` with a 1.5s timeout, true when status < 500). Before starting: `apiUp = await isUp('http://localhost:4000/api/v1/health')`, `webUp = await isUp('http://localhost:3000/login')`, `simUp = await isUp('http://127.0.0.1:3010/')`. Start `api` and `worker` only when `!apiUp` (the worker has no port; it is assumed to run with the API), `sim` only when `!simUp`, `web` only when `!webUp`. Print one line per reused server: `[api] already running, reusing it`. When `--rebuild` is given and the web is already up, print a warning that the running web server still serves the old build until it is restarted.
3. When nothing was started (everything already up), print the banner and exit 0 instead of waiting forever.
4. Skip `db:migrate` and `db:seed` when `apiUp` (a running API holds connections that make the template rebuild fail) and print `Database steps skipped because the API is already running; stop it to migrate or reseed.`
5. New flags documented in the header comment: `--generate` (force generation), existing `--rebuild`, `--no-seed`.

---

## 7. Test plan (tests are WRITTEN in this phase and RUN later on another machine)

### 7.1 Conventions
- Runner: vitest (`describe` / `it` / `expect` imported from `vitest`, `globals: false`). API tests start with `import 'reflect-metadata';` and use `createTestApp('<tag>')` from `apps/api/test/helpers.ts`. Database tests in packages use `setupTestDb('<tag>')` from `@dms/db/testing`. Every file has its own tag, prefixed `p2-`. Tests never touch the `dms` database.
- No network: HTTP is faked by passing a `fetchImpl` (`async (url, init) => new Response(body, { status })`), S3 by passing a fake `S3Like`, SMTP by `registerEmailTransport`, SAP by `registerSapAdapter`.
- Env-dependent tests set `process.env.X`, call `resetConfigCache()` (from `@dms/core/config`), and restore both in `afterEach`.
- Web tests are pure-function tests (vitest `environment: 'node'`, no DOM, relative imports, no `@/` alias). Nothing renders React.
- Fixtures: `packages/core/src/sap/fixtures/` (files listed in 7.2). Read with `readFileSync(join(__dirname, 'fixtures', name), 'utf8')`.
- Test ids for Playwright: `DESIGN_SPEC.md` section 10. Select with `page.getByTestId(...)` first, roles second, never CSS classes or Arabic text (except where a role name is the only handle).
- Case names below are the `it(...)` titles. Assertions are given in brief; write them fully.

### 7.2 Packages

**`packages/shared/src/contracts/workflow.test.ts`** (F3)
1. `templateCreateSchema applies defaults` - minimal body parses; `layoutKey === 'generic-request'`, `isDefault === false`.
2. `templateCreateSchema rejects a lowercase code` / 3. `rejects an unknown layoutKey`.
4. `templateUpdateSchema rejects an empty object` / 5. `accepts a single flag`.
6. `lineCategoryInputSchema accepts a subset of mime types` / 7. `rejects an unknown mime type` / 8. `rejects an empty mime list`.
9. `lineCategoryOrderSchema rejects an empty id list`.
10. `sapRetryBodySchema defaults to an empty object` (parse `undefined` -> `{}`) / 11. `keeps force`.
12-19. `fieldDefinitionIssues`: `returns nothing for a clean list`; `flags a bad key format` (`'Bad-Key'`); `flags duplicates`; `flags reserved keys` (with `EXPENSE_RESERVED_HEADER_KEYS`); `requires options for select`; `requires a lookup entity`; `flags min greater than max`; `flags an invalid regex` (`'('`).

**SAP** (A2). Fixtures: `lookup-v2-found.json` (`{ "d": { "results": [{ "CompanyCode": "1000", "FiscalYear": "2026", "AccountingDocument": "0100000123" }] } }`), `lookup-v2-empty.json`, `lookup-v4-found.json` (`{ "value": [...] }`), `je-duplicate.xml` (a confirmation whose log item has severity 3 and note "Document DE-26-000123 was already posted"), `cj-success.xml`, `cj-error.xml` (RETURN item `TYPE` E), `cj-fault.xml`.

`packages/core/src/sap/s4lookup.test.ts`
1. `builds the default lookup URL` - contains service, entity, `CompanyCode eq '1000'`, `DocumentReferenceID eq 'DE-26-000123'`, `$top=5`, `$format=json`.
2. `doubles single quotes in values`.
3. `parses an OData V2 hit` / 4. `returns null for an empty V2 result` / 5. `parses an OData V4 hit`.
6. `mode none throws a permanent SapLookupUnavailableError` (message starts `UNKNOWN_OUTCOME:`).
7. `missing OData URL throws a permanent error`.
8. `sends Basic auth and sap-client and returns the document` (fake fetch captures headers).
9. `HTTP 401 is a permanent lookup error` / 10. `HTTP 500 is a transient lookup error` / 11. `a timeout is a transient lookup error` (fetch never resolves, `timeoutMs: 20`) / 12. `invalid JSON is a transient lookup error`.

`packages/core/src/sap/s4hana.test.ts`
1. `envelope has no OriginalReferenceDocument without a logical system`.
2. `envelope carries OriginalReferenceDocument and the logical system when configured`.
3. `HTTP 401 is a definite rejection` (`isDefiniteFailure`).
4. `an error log item is a definite rejection`.
5. `a duplicate message reuses the document found by the lookup` (fetch returns `je-duplicate.xml`, lookup fake returns a document).
6. `a duplicate message with no document found is an unknown outcome` (message starts `UNKNOWN_OUTCOME`, not definite).
7. `HTTP 502 is not a definite failure` / 8. `a timeout is not a definite failure`.
9. `findByReference delegates to the lookup`.

`packages/core/src/sap/cashjournal.test.ts`
1. `maps debit lines to payment items and drops the credit line` (positions 1..n, total).
2. `throws when the document has no cashJournal block` / 3. `throws when debits and credit differ`.
4. `envelope contains the function name, header and items` / 5. `escapes XML in texts` / 6. `uses a custom function name`.
7. `parses a success response` / 8. `parses RETURN errors` / 9. `parses a SOAP fault` / 10. `fails when the document number is missing or zero`.
11. `adapter posts and returns the cash journal document` (fake fetch, checks URL, Basic auth, body).
12. `adapter refuses to post when not configured`.
13. `a RETURN error is a definite rejection`.
14. `findByReference delegates to the lookup`.

`packages/core/src/sap/process.test.ts` (`setupTestDb('p2-sap-process')`, requests from `createRequestFixture` of `@dms/core/pdf`, adapters through `registerSapAdapter`)
1. `a definite failure is retried without a lookup` (adapter stub: first `post` throws `SapRejectedError`; second run posts; `findByReference` call count 0).
2. `an ambiguous failure triggers the lookup and reuses the document` (first `post` throws `new Error('socket hang up')`; lookup returns a doc; `post` called once in total; row POSTED with that number; attempt `response.reusedExisting === true`).
3. `stores definiteFailure on the failed attempt`.
4. `a permanent lookup failure stops with UNKNOWN_OUTCOME and marks the error fatal` (`lastError` starts `UNKNOWN_OUTCOME`, thrown error has `fatal === true`, `post` not called again).
5. `force lets an operator post after an unavailable lookup` (`{ trigger: 'MANUAL', userId, force: true }` -> POSTED, attempt `response.forced === true`).
6. `force is ignored when the lookup works` (lookup returns a doc -> reused, not posted).
7. `retrySapPosting stores force in the job payload`.
8. `buildJournalEntry fills the cashJournal block from sap.config` (mapping by treasury code, fallback to the default number).
9. `the s4hana-cj adapter posts through the outbox` (registered `S4CashJournalAdapter` with a fake fetch -> POSTED, `sapDocNumber` = cash journal document).
The existing `packages/core/src/sap/sap.test.ts` must pass unchanged.

**Storage** `packages/core/src/storage/s3.test.ts` (A3; fake `S3Like` recording commands; identify commands by `command.constructor.name` and `command.input`)
1. `prefixes object keys` / 2. `rejects invalid keys`.
3. `put(Buffer) sends PutObject and returns size and sha256` / 4. `ifNotExists sends IfNoneMatch *` / 5. `a 412 becomes CONFLICT`.
6. `put(Readable) hashes the stream and uploads` (through `deps.upload`) / 7. `put(Readable, ifNotExists) refuses an existing object`.
8. `get returns a Buffer` / 9. `get maps NoSuchKey to NOT_FOUND`.
10. `stream pipes the body` / 11. `stream emits NOT_FOUND on a missing object`.
12. `exists is true and false` / 13. `stat returns the size` / 14. `delete sends DeleteObject`.
15. `presignGet passes the disposition for downloads` (through `deps.presign`).
16. `getStorage returns the S3 driver when STORAGE_DRIVER=s3` / 17. `s3ConfigFromEnv throws without a bucket`.
18. `live round trip against MinIO` in `describe.skipIf(!process.env.S3_TEST_ENDPOINT)`: put, exists, get, stat, presignGet + fetch, delete.

**Metrics** `packages/core/src/metrics/metrics.test.ts` (A3)
1. `renders HELP, TYPE and a sample for a counter` / 2. `renders labels in declared order and escapes values` / 3. `returns the same metric for the same name`.
4. `gauge set and reset` / 5. `histogram renders cumulative buckets, +Inf, sum and count` / 6. `render sorts metrics and ends with a newline`.
7. `collectProcessMetrics sets uptime and memory`.
8. `collectDbMetrics reports db up and job counts` (`setupTestDb('p2-metrics')`, insert one PENDING job).
9. `collectDbMetrics reports db down when a query fails` (pass a `db` whose `$queryRaw` throws).

**E-mail** `packages/core/src/email/email.test.ts` (A4; `setupTestDb('p2-email')`)
1. `renders an Arabic RTL message with the request number in the subject` / 2. `renders English LTR` / 3. `escapes HTML in title and body` / 4. `omits the button without a link` / 5. `builds the text part`.
6. `classifies permanent SMTP errors` (`{ responseCode: 550 }` true, `{ code: 'ETIMEDOUT' }` false).
7. `file transport writes a JSON message` (local storage in a temp dir).
8. `sends and marks SENT` / 9. `is idempotent` / 10. `skips a user without e-mail` / 11. `skips an inactive user` / 12. `skips when e-mail is disabled` (transport null).
13. `a permanent error marks FAILED and does not throw` / 14. `a transient error rethrows and leaves PENDING`.

**Fan-out** `packages/core/src/notifications/fanout.test.ts` (A4; `setupTestDb('p2-fanout')`)
1. `creates only in-app rows by default`.
2. `creates EMAIL rows and email.send jobs for users with an address` (`EMAIL_DRIVER=file`, setting enabled).
3. `skips types that are not listed` / 4. `'*' matches every type`.
5. `creates TELEGRAM rows for linked users on the telegram queue`.
6. `a fan-out failure does not fail notifyUsers` (setting row with a broken value).
7. `works inside a transaction`.

**Telegram token** `packages/core/src/telegram/telegram.test.ts` (A1)
1. `round-trips a user token` / 2. `round-trips a driver token` / 3. `stays within 64 characters for a 25-character id` / 4. `uses only letters, digits and underscore`.
5. `rejects an expired token` / 6. `rejects a tampered signature` / 7. `rejects a changed id` / 8. `rejects malformed input` (`''`, `'x'`, `'u_abc'`).
9. `throws for an id with other characters`.
10. `buildLinkInfo has no deep link without BOT_USERNAME` / 11. `builds the t.me deep link`.

### 7.3 API (`apps/api/test`)

`workflow/request-types.test.ts` (A1, `p2-request-types`)
1. `401 without a token` / 2. `lists stats when asked` / 3. `lists registered modules` (contains `expense`).
4. `rejects a badly formatted header field key` (400, `error.details` has `KEY_FORMAT`) / 5. `rejects a reserved key for the expense module` / 6. `rejects an unknown module key`.
7. `stores and returns allowedMimeTypes` / 8. `rejects a quantity field that is not a number field` / 9. `rejects min attachments above max`.
10. `reorders line categories` / 11. `rejects an order that is not the exact id set` / 12. `403 for a user without request_types.manage`.

`workflow/templates.test.ts` (A1, `p2-templates`)
1. `creates a template with a v1 draft` (201; one version, DRAFT, `layoutKey`, config titles = names).
2. `copies the config of another template` / 3. `409 on a duplicate code` / 4. `404 for an unknown request type`.
5. `a new default clears the previous default` / 6. `403 without templates.manage`.
7. `patches the names` / 8. `moves the default flag` / 9. `refuses to deactivate the default template` (409) / 10. `400 on an empty patch`.
11. `writes audit rows for create and update`.
12. `the created draft can be saved, previewed and published` (existing endpoints; preview 200).

`platform/telegram-link.test.ts` (A1, `p2-tg-link`)
1. `a user issues a link for himself` (`command` matches `/^\/start u_/`, token verifies with `verifyLinkToken` to the user id).
2. `403 for another user without users.manage` / 3. `an admin issues a link for another user` / 4. `409 when already linked`.
5. `unlink clears the fields and audits` / 6. `409 when not linked`.
7. `the driver link needs submitters.telegram_link` (403 for a seed user without it; read the seed to pick one) / 8. `the driver link returns a d_ token` / 9. `409 for a linked driver`.
10. `/auth/me reports telegramLinked`.

`health/metrics.test.ts` (A3, `p2-api-metrics`)
1. `serves Prometheus text when open` (content type starts `text/plain`, body contains `dms_process_uptime_seconds` and `dms_db_up 1`).
2. `counts HTTP requests by route` (call `/api/v1/health` twice, then metrics contains a `dms_http_requests_total{method="GET",route=` line for the health route with status 200).
3. `requires the bearer token when METRICS_TOKEN is set` (none 401, wrong 401, right 200).
4. `is hidden in production without a token` (404).
5. `health still returns JSON`.

`integrations/sap-retry.test.ts` (A2, `p2-sap-retry`)
1. `retry without a body behaves as before` / 2. `retry with force stores force on the job and audits` / 3. `403 without sap.retry` / 4. `posting detail includes attempts and the payload`.

`files/files-redirect.test.ts` (A3, `p2-files-redirect`; uses the test hook `setStorageForTests` added to `packages/core/src/storage/index.ts`: `export function setStorageForTests(s: StorageAdapter | null): void` which overrides `getStorage()` until reset)
1. `streams the file when the redirect is off` / 2. `redirects to the presigned URL when enabled` (302, `Location` = fake URL) / 3. `still rejects a bad signature`.

### 7.4 Bot and worker

`apps/bot/test/link.test.ts` (A5; reuse `apps/bot/test/helpers.ts`)
1. `a user token links the approver` (user row has the Telegram ids; reply = `M.userLinked`).
2. `an expired token is refused` / 3. `a tampered token is refused` (reply `M.linkInvalid`).
4. `refuses when the user is linked to another Telegram account` / 5. `refuses when the Telegram account belongs to another user` (`M.linkTaken`).
6. `a driver token links the driver and shows the menu` (session `IDLE`, audit `bot.linked` with `via: 'admin_link'`).
7. `a driver token is refused when the driver is linked elsewhere` (`M.alreadyLinked`).
8. `a linked approver gets the approver-only message`.
9. `plain /start still shows the welcome with the contact button`.

`apps/bot/test/jobs.test.ts` (A5)
1. `sends title, body and link to a linked user and marks SENT` / 2. `skips a user without a chat id` / 3. `driver notifications keep the correction buttons`.

`apps/worker/test/email.test.ts` (A4; `p2-worker-email`)
1. `email.send delivers through the registered transport` / 2. `email.send without notificationId is fatal` / 3. `sap.post passes force to processSapPosting` (register an adapter whose lookup throws a permanent `SapLookupUnavailableError`; with `force: true` the posting ends POSTED).

### 7.5 Web (vitest, node, pure functions)

| File | Owner | Cases |
|---|---|---|
| `src/lib/format.test.ts` | F1 | `formatDay short`, `formatDay long Arabic` (`5 مارس 2026`), `formatDay long English`, `formatDayTime`, `formatTime`, `formatRelative now / minutes / hours / yesterday / days / falls back to a date after a week` (pass `now`), `formatCount`, `formatPercent`, `arab numerals change amounts and dates`, `latn output equals the legacy output`, `identifiers are untouched by ltrIsolate` (wraps with U+2066/U+2069). Always reset with `setNumeralSystem('latn')` in `afterEach`. |
| `src/lib/prefs-core.test.ts` | F1 | `resolveTheme`, `parseTheme defaults to light`, `parseNumerals defaults to latn`, `parseDensity defaults to default`. |
| `src/components/ui/status.test.ts` | F1 | one case per kind checking two statuses, `unknown status falls back to gray`. |
| `src/components/ui/calendar.test.ts` | F2 | `monthGrid has 42 cells`, `starts on Saturday` (March 2026 grid starts `2026-02-28`), `marks days outside the month`, `addMonths crosses years`, `toDisplay`, `isValidDay rejects 2026-02-30`, one case per `DatePreset` with today = `2026-11-10`. |
| `src/lib/nav.test.ts` | W1 | `navSlug`, `findNavItem picks the longest match` (`/admin/request-types/x`), `hrefs are unique`, `request types needs request_types.manage`, `groups are work, insight, config, data, admin`. |
| `src/features/common/groupByDay.test.ts` | W1 | `groups by Cairo day newest first`, `keeps item order inside a day`. |
| `src/features/inbox/model.test.ts` | W2 | `maps dates to Cairo day bounds`, `sends overdue as 1`, `drops empty filters`, `counts active filters`. |
| `src/features/requests/timelineModel.test.ts` | W3 | `merges consecutive not-applicable events`, `keeps a single one as a group of one`, `drops a repeated arrival within the same second`, `groupByDay orders days ascending`. |
| `src/features/requests/routeModel.test.ts` | W3 | (`routeModel.ts`: `currentPosition(stages): { i: number; n: number } \| null`, `isStageDone(stage): boolean`) `counts stages excluding fully skipped ones`, `position of a parallel stage`, `null when nothing is active`, `a stage is done when all applicable steps are approved`. |
| `src/features/requests/evidence.test.ts` | W4 | `orders by line then time`, `excludes superseded attachments`, `clampZoom`, `nextIndex wraps both ways`. |
| `src/components/charts/chartModel.test.ts` | W5 | `barWidths scales to the max`, `gives a minimum width to small values`, `niceMax`, `topWithOther splits and sums`. |
| `src/features/workflows/describe.test.ts` | W6 | `ALWAYS is empty`, `total amount comparison`, `category list uses names`, `AND joins with و`, `OR and nested groups use parentheses`, `NOT`. |
| `src/features/workflows/preview.test.ts` | W6 | `builds pending steps in order`, `parallel groups share a stage`, `simulation marks non-applicable steps`. |
| `src/features/admin/matrixModel.test.ts` | W8 | `diffMatrix lists added and removed`, `no diff when equal`, `groupState all / some / none`, `toggleGroup on and off`, `filterPermissions by name and code`. |
| `src/features/admin/diff.test.ts` | W8 | `added, removed and changed keys`, `equal objects give nothing`, `handles null before or after`. |
| `src/features/admin/delegation.test.ts` | W8 | `ACTIVE`, `UPCOMING`, `ENDED`, `REVOKED wins`. |
| `src/features/request-types/model.test.ts` | W9 | `blankField gives a unique key`, `validateFields maps issues to rows`, `normalizeOrder rewrites order`, `toTypeInput trims and uppercases`, `toTypeUpdate sends only changed keys`, `toCategoryInput converts empty strings to null`, `validateType requires names, code, prefix and a channel`. |
| `src/features/style-guard.test.ts` | T1 | `no physical direction classes` (regex over `src/**/*.tsx`: `(?<![\w-])(ml|mr|pl|pr)-\d`, `(?<![\w-])(left|right)-\d`, `text-(left|right)`), `no legacy palette classes` (`(bg|text|border|ring|divide|from|to)-(slate|brand|emerald|sky|violet|purple|red|amber)-\d`), `no native date inputs` (`type="date"`), `no hex colours in tsx` (`#[0-9a-fA-F]{6}` outside `components/ui/Seal.tsx`, `BrandMark.tsx`, `components/charts`). Each lists offending `file:line` in the failure message. |
| `src/features/i18n-keys.test.ts` (extend, do not remove cases) | T1 | add `every namespace has the same keys in ar and en` and `new namespaces are registered` (`ui`, `shell`, `inbox`, `rt`). |
| `e2e/unit/demo-lib.test.ts` | H1 | `sameSchema ignores line endings`, `shouldGenerate` (fresh/no force false; stale true; missing true; fresh+force true), `onGenerateFailure` (missing abort; stale and fresh continue), `prismaClientState is missing for an empty folder` (temp dir). |

The existing web tests (`lib.test.ts`, `condition.test.ts`, `stepModel.test.ts`) stay untouched and must still pass.

### 7.6 Playwright (`e2e`, owner T1)

- `e2e/support/ui.ts` (new): `login(page, username)` (fills `login-username`, `login-password`, clicks `login-submit`, waits until the URL leaves `/login`), `watch(page, label)` (moved from `web-ui.spec.ts`, same filters), `openPage(page, path)` (goto + `networkidle` + expects the matching `page-*` root visible), `ADMIN_PAGES` (the existing list plus `/admin/request-types`) with their page test ids.
- `e2e/tests/web-ui.spec.ts` (rewrite with test ids, same three scenarios):
  1. `admin: every screen renders in RTL without runtime errors or 4xx/5xx` - for each page: root test id visible, `page-title` not empty, no error boundary text, `bad` stays empty.
  2. `supervisor: inbox -> request detail -> approve in the browser` - submit a request through the API helper; inbox shows at least one `inbox-row`; open the request; `request-number` has the number; `evidence-viewer` contains an `img`; click `action-claim`, `action-approve`; in `approve-dialog` check the first `approve-check-*`, click `approve-confirm`; `seal` becomes visible; poll the API until the supervisor step is `APPROVED`.
  3. `admin: workflow builder, template editor and report export` - `wf-step` count > 0; `tpl-preview-frame` visible; on reports click `report-export` then `report-export-EXCEL`; an `export-row` appears.
- `e2e/tests/redesign.spec.ts` (new):
  1. `theme toggle switches to dark and survives a reload` (`html[data-theme=dark]`).
  2. `language toggle switches to LTR English and survives a reload` (`dir=ltr`, `lang=en`); switch back at the end.
  3. `Arabic-Indic numerals change amounts but not request numbers` (profile -> `pref-numerals-arab`; on a request `request-total` matches `/[٠-٩]/`, `request-number` matches `/^[A-Z]+-\d{2}-\d{6}$/`); reset to `latn`.
  4. `mobile: tab bar on the inbox, action bar on the request` (viewport 390x844: `mobile-tabbar` visible on `/inbox`; hidden on the request; `action-bar` visible; approve through the sheet works).
  5. `mobile: no horizontal overflow` on `/inbox`, `/requests`, `/dashboard`, a request detail, `/admin/roles` (`document.documentElement.scrollWidth <= window.innerWidth + 1`).
  6. `request type: create, add a field and a category` (unique code `E2E` + timestamp digits, prefix 2 random letters; row appears in the list with `data-code`).
  7. `template: create from the dialog and open the editor`.
  8. `roles matrix: a change shows the unsaved bar and discard clears it`.
  9. `user Telegram link dialog shows a /start command` (`tg-link-command` text matches `/^\/start u_/`).
  10. `SAP monitor: the drawer opens for a posting` and, for the seeded FAILED posting, `sap-retry` is visible.
  11. `sidebar shows the inbox badge for the supervisor` (`nav-badge-inbox` number > 0).
- `e2e/tests/full-flow.spec.ts`: unchanged logic. Add one final test `metrics endpoint exposes posting counts` (`GET /api/v1/metrics` text contains `dms_sap_postings`).
- `e2e/playwright.config.ts`: unchanged (single default project); the mobile tests set the viewport with `test.use({ viewport: { width: 390, height: 844 } })` inside their `describe`.

---

## 8. Execution plan

### 8.1 Phases

| Phase | Wall-clock | What |
|---|---|---|
| Install | 0:00-0:03 | Orchestrator: section 4.1. |
| 0 | 0:03-0:18 | F1, F2, F3 in parallel. |
| Gate G0 | 0:18-0:21 | Orchestrator: `pnpm -r typecheck` and `pnpm lint` must be clean (existing pages compile against the new kit). Fix through the owning agent before continuing. |
| 1 | 0:21-1:00 | W1-W9, A1-A6, T1, H1 in parallel (17 agents). |
| 2 | 1:00-1:20 | Z: integration. |

### 8.2 Work packages

| WP | Model | Scope | Depends on |
|---|---|---|---|
| F1 | Sonnet | Web foundation: tokens, fonts, Tailwind, layout, prefs, formatting, i18n registration, kit primitives | install |
| F2 | Sonnet | Kit overlays and data: Modal/Drawer, Menu/Popover/Tooltip, Toast, DataTable, DateField, Inputs2, FilterBar | install (parallel with F1) |
| F3 | Sonnet | Shared contracts, settings, env schema, migration, `.env.example` | install |
| W1 | Sonnet | App shell, navigation, login, profile, notifications | G0 |
| W2 | Sonnet | Inbox, requests list, vehicle changes, assignments | G0 |
| W3 | Sonnet | Request detail page, route stepper, line cards, timeline | G0 |
| W4 | Sonnet | Request action bar, dialogs, evidence viewer | G0 |
| W5 | Sonnet | Dashboard, charts, reports, SAP monitor | G0 |
| W6 | Sonnet | Workflow builder, templates list/editor, create-template dialog | G0 |
| W7 | Sonnet | CrudPage, master-data pages, SAP settings, Telegram link dialog | G0 |
| W8 | Sonnet | Users, roles matrix, delegations, audit, settings, signature manager | G0 |
| W9 | Sonnet | Request types list and editor (new) | G0 |
| A1 | Sonnet | API: request types, templates, Telegram link endpoints, link token | G0 |
| A2 | Sonnet | SAP: lookup, failure classification, force retry, cash journal adapter | G0 |
| A3 | Sonnet | S3 storage driver, files redirect, Prometheus metrics | G0 |
| A4 | Sonnet | E-mail, notification fan-out, worker handlers | G0 |
| A5 | Sonnet | Bot: link tokens, approver notifications | G0 |
| A6 | Sonnet | Load-data and load-timing scripts | G0 |
| T1 | Sonnet | Playwright rewrite, style guard, i18n parity test | G0 (writes against the test ids of DESIGN_SPEC 10) |
| H1 | Haiku | `scripts/demo.ts` fix, `demo-lib`, simulator restyle | G0 |
| Z | Sonnet | Integration: reconcile, typecheck, lint, docs, final commit | all |

### 8.3 Ownership matrix (no path appears twice)

| WP | Owned paths |
|---|---|
| F1 | `apps/web/tailwind.config.ts`; `apps/web/src/app/{globals.css,layout.tsx}`; `apps/web/src/lib/{format.ts,format.test.ts,prefs.tsx,prefs-core.ts,prefs-core.test.ts,providers.tsx,useMediaQuery.ts,useCountUp.ts,types.ts}`; `apps/web/src/i18n/index.ts`; `apps/web/src/i18n/{ar,en}/{ui,shell,inbox,rt}.ts` (creation only; later owners below); `apps/web/src/components/ui/{Icon,Num,Button,Fields,Display,StatusChip,Skeleton,Rule,Avatar,Stat,Seal}.tsx`; `apps/web/src/components/ui/{status.ts,status.test.ts,index.ts}`; `apps/web/src/components/brand/**`; `apps/web/src/components/README.md` |
| F2 | `apps/web/src/components/ui/{Modal,Overlay,Toast,DataTable,DateField,Inputs2,FilterBar}.tsx`; `apps/web/src/components/ui/{calendar.ts,calendar.test.ts}` |
| F3 | `packages/shared/src/contracts/{workflow.ts,workflow.test.ts,platform.ts,integrations.ts}`; `packages/shared/src/constants/settings.ts`; `packages/core/src/config/index.ts`; `packages/db/prisma/schema.prisma`; `packages/db/prisma/migrations/0003_perf_indexes/**`; `.env.example` |
| W1 | `apps/web/src/components/layout/**`; `apps/web/src/lib/{nav.ts,nav.test.ts}`; `apps/web/src/app/login/**`; `apps/web/src/app/page.tsx`; `apps/web/src/app/(app)/{layout.tsx,notifications/**,profile/**}`; `apps/web/src/features/common/{groupByDay.ts,groupByDay.test.ts}`; `apps/web/src/i18n/{ar,en}/shell.ts` |
| W2 | `apps/web/src/features/inbox/**`; `apps/web/src/features/requests/RequestsListPage.tsx`; `apps/web/src/features/vehicle-changes/**`; `apps/web/src/app/(app)/assignments/**`; `apps/web/src/features/common/Pager.tsx`; `apps/web/src/i18n/{ar,en}/inbox.ts` |
| W3 | `apps/web/src/features/requests/{RequestDetailPage,RouteStepper,ProgressBar,LineCard,Timeline}.tsx`; `apps/web/src/features/requests/{helpers.ts,timelineModel.ts,timelineModel.test.ts,routeModel.ts,routeModel.test.ts}`; `apps/web/src/i18n/{ar,en}/requests.ts` |
| W4 | `apps/web/src/features/requests/{ActionPanel,CorrectionModal,EditLineModal,ImageGallery,EvidenceViewer}.tsx`; `apps/web/src/features/requests/{evidence.ts,evidence.test.ts}`. W4 owns no dictionary file: the `requests.viewer.*` and `requests.action.more` keys of DESIGN_SPEC 11.3 are added to the dictionaries by W3; W4 uses only those and existing keys |
| W5 | `apps/web/src/features/{dashboard,reports,sap}/**`; `apps/web/src/components/charts/**`; `apps/web/src/i18n/{ar,en}/{dashboard,reports,sap}.ts` |
| W6 | `apps/web/src/features/{workflows,templates}/**`; `apps/web/src/i18n/{ar,en}/{workflows,templates}.ts` |
| W7 | `apps/web/src/components/crud/**`; `apps/web/src/components/TelegramLinkDialog.tsx`; `apps/web/src/app/(app)/master/**`; `apps/web/src/app/(app)/admin/departments/**`; `apps/web/src/i18n/{ar,en}/master.ts` |
| W8 | `apps/web/src/app/(app)/admin/{users,roles,delegations,audit,settings}/**`; `apps/web/src/features/admin/**`; `apps/web/src/components/SignatureManager.tsx`; `apps/web/src/i18n/{ar,en}/admin.ts` |
| W9 | `apps/web/src/app/(app)/admin/request-types/**`; `apps/web/src/features/request-types/**`; `apps/web/src/i18n/{ar,en}/rt.ts` |
| A1 | `apps/api/src/workflow/config.controller.ts`; `apps/api/src/platform/{users.controller.ts,master.controller.ts,auth.service.ts,auth.controller.ts}`; `packages/core/src/engine/{registry.ts,index.ts}` (only `listModules`); `packages/core/src/telegram/**`; `apps/api/test/workflow/{request-types,templates}.test.ts`; `apps/api/test/platform/{telegram-link,authz-matrix}.test.ts` |
| A2 | `packages/core/src/sap/**`; `apps/api/src/integrations/sap.controller.ts`; `apps/api/test/integrations/sap-retry.test.ts`; `docs/SAP_INTEGRATION.md` |
| A3 | `packages/core/src/storage/**`; `packages/core/src/metrics/**`; `apps/api/src/files/**`; `apps/api/src/health/**`; `apps/api/test/health/**`; `apps/api/test/files/files-redirect.test.ts`; `docs/BACKUP_RESTORE.md`; `docs/ARCHITECTURE.md` |
| A4 | `packages/core/src/email/**`; `packages/core/src/notifications/**`; `apps/worker/src/**`; `apps/worker/test/email.test.ts` |
| A5 | `apps/bot/src/{flow.ts,messages.ts,jobs.ts}`; `apps/bot/test/{link,jobs}.test.ts` |
| A6 | `packages/core/scripts/{load-data.ts,load-timing.ts}`; `scripts/{load-data.ts,load-timing.ts}` |
| T1 | `e2e/tests/**`; `e2e/support/**`; `e2e/playwright.config.ts`; `apps/web/src/features/{style-guard.test.ts,i18n-keys.test.ts}` |
| H1 | `scripts/{demo.ts,demo-lib.ts}`; `e2e/unit/demo-lib.test.ts`; `apps/bot/src/simulator/page.html` |
| Z | everything, after all others have committed; plus `docs/PROGRESS.md`, `README.md`, `docs/HOW_TO_ADD_NEW_REQUEST_TYPE.md`, `docs/CONTRACT_NOTES.md` |

Cross-package imports that are allowed and fixed by this plan: W3 imports `ActionPanel`, `CorrectionModal`, `EditLineModal`, `EvidenceViewer`, `buildEvidence` from W4's files; W6 imports `RouteStepper` from W3's file; W9 imports `CreateTemplateDialog` from W6's file; W1 and W8 import `TelegramLinkDialog` from W7's file; A5 imports `verifyLinkToken` from A1's `@dms/core/telegram`; A4's worker handler uses A2's `force` option. Signatures are in section 6 and `DESIGN_SPEC.md`; code against them even if the other file does not exist yet.

### 8.4 Brief preamble (prepend to every brief below)

```
You are implementing one work package of DMS phase 2 in the repo
c:\Users\Administrator\Downloads\new project\Dooo (Windows, pnpm monorepo). You have no other context.

Read first, in this order: CLAUDE.md; docs/plan-v2/PLAN_V2.md section 2 (ground rules) and the sections
named in your brief; docs/plan-v2/DESIGN_SPEC.md sections named in your brief; docs/plan-v2/CODEBASE_FACTS.md
for the area you touch; then the current source files you are going to change.

Hard rules:
- 100% LOCAL: no GitHub, no git remote, no git push, no gh, no uploads. Local git commit only.
- Do NOT run vitest, playwright, pnpm test, pnpm e2e, pnpm dev, pnpm demo, next build, any server, or any
  pnpm db:* command. Do NOT install packages. Allowed: `pnpm --filter <pkg> typecheck` and
  `pnpm exec eslint <your paths>`.
- Edit ONLY your owned paths. For anything else append one line to docs/CONTRACT_NOTES.md
  ("P2-<WP>, <path>: <need>") and continue.
- Other agents edit the same package right now: fix type errors only in your files; report the rest.
- Write the test files listed for you (they are not run here). Never weaken an existing test.
- Do not guess: tokens, component APIs, test ids, strings, endpoints and signatures are in the two plan
  documents. If something is truly missing, choose the closest documented rule and note it in CONTRACT_NOTES.
- Finish with: git add -- <your owned paths>; git commit -m "P2-<WP>: <summary>". Never git add -A.
- Final report (max 15 lines): what you built, files, typecheck/lint result, anything left open.
```

### 8.5 Briefs

**F1 - web foundation (Sonnet).** Read `DESIGN_SPEC.md` sections 1-7.2, 7.4, 11.1, 11.2, 12 and PLAN 7.5 (your rows). Do: (1) replace `globals.css`, `tailwind.config.ts`, `app/layout.tsx` with the exact content given; (2) extend `lib/format.ts` (4.1, plus `ltrIsolate`), add `prefs-core.ts`, `prefs.tsx`, `useMediaQuery.ts`, `useCountUp.ts`, update `providers.tsx` (import `DirectionRoot` from `@/components/ui/Overlay`, written by F2 in parallel) and add `telegramLinked?: boolean` to `Me` in `lib/types.ts`; (3) register namespaces `ui`, `shell`, `inbox`, `rt` in `i18n/index.ts` exactly like the existing ones, write `ui.ts` and `shell.ts` in both languages from the tables (month and weekday keys expanded to one key each), and create `inbox.ts` and `rt.ts` as empty dictionaries (`const dict: Dict = {}; export default dict;` following the existing file pattern); (4) write every F1 component of 7.1 with the exact props and classes of 7.2, keeping all existing export names and props working; (5) write `ui/index.ts` exactly as given; (6) rewrite `components/README.md` as a short guide to the new kit (tokens, components, rules); (7) write your three test files. Acceptance: `pnpm --filter @dms/web typecheck` has no errors in your files (errors about `./Modal` etc. disappear when F2 lands); `pnpm exec eslint apps/web/src/components/ui apps/web/src/lib` clean. Existing pages must still compile: do not remove or rename any existing export or prop.

**F2 - kit overlays and data (Sonnet).** Read `DESIGN_SPEC.md` sections 2, 4.2, 5, 6, 7.1, 7.3, 11.1 and the current `Modal.tsx`, `Toast.tsx`, `DataTable.tsx`, `Inputs2.tsx`. Do: write every F2 file of 7.1 with the exact APIs of 7.3; import primitives written by F1 from their files (`./Button`, `./Fields`, `./Display`, `./Icon`, `./Skeleton`), assuming the APIs of 7.2; keep every existing export and prop of the four rewritten files; verify the `radix-ui` export names in `node_modules/radix-ui/dist/index.d.ts`. Write `calendar.test.ts`. Use `t('ui.*')` keys of 11.1 only. Acceptance: typecheck clean for your files; eslint clean on your paths.

**F3 - contracts, settings, env, migration (Sonnet).** Read PLAN section 5 (all exact). Do every edit of 5.1-5.8. After editing, run `pnpm --filter @dms/shared typecheck`, `pnpm --filter @dms/core typecheck`, `pnpm --filter @dms/api typecheck` and fix fallout in your files only (for example a `SapConfig` literal elsewhere that now lacks `cashJournal`: note it in CONTRACT_NOTES for the owner, but if it is in `packages/db/prisma/seed.ts` or a test fixture that builds a full `SapConfig`, report it to the orchestrator because it blocks the gate). Acceptance: the three typechecks clean; eslint clean on your paths.

**W1 - shell, login, profile, notifications (Sonnet).** Read `DESIGN_SPEC.md` sections 1-8, 9.1, 9.15, 10, 11.2 and the current files in `components/layout`, `lib/nav.ts`, `app/login/page.tsx`, `app/(app)/profile/page.tsx`, `app/(app)/notifications/page.tsx`. Do: nav regrouping with `navSlug` and `findNavItem` (8.1); AppShell, Sidebar, TopBar, UserMenu, MobileTabBar (hidden on `/requests/[id]`), NotificationsBell (keep all exports), CommandPalette (cut-first: if you are past 30 minutes, ship the top-bar trigger without the palette and say so); login page; profile with the appearance and Telegram sections (import `TelegramLinkDialog` and `TelegramLinkInfo` from `@/components/TelegramLinkDialog`; endpoints in PLAN B7); notifications page with `groupByDay`. Keep `app/(app)/layout.tsx` wrapping pages in `AppShell`. Tests: `lib/nav.test.ts`, `features/common/groupByDay.test.ts`. Acceptance: typecheck clean for your files; eslint clean.

**W2 - inbox, requests list, vehicle changes, assignments (Sonnet).** Read `DESIGN_SPEC.md` sections 2, 4-7, 9.2, 9.3, 9.5, 9.6, 10, 11.3 (inbox rows) and the current files. Do the four screens as specified; move the inbox query mapping into `features/inbox/model.ts` (`toQueueQuery`, `activeFilterCount`); `features/common/Pager.tsx` becomes a thin wrapper over the kit `Pagination` (same props). Put new strings in the `inbox` namespace. Tests: `features/inbox/model.test.ts`. Acceptance: typecheck clean for your files; eslint clean.

**W3 - request detail page (Sonnet).** Read `DESIGN_SPEC.md` sections 2, 4-7, 9.4 (all), 10, 11.3 (requests rows) and every file in `features/requests`. Do: `RequestDetailPage`, the summary sheet with the seal, `RouteStepper` (+ `ProgressBar` re-export), `LineCard`, `Timeline`, `timelineModel.ts`, `routeModel.ts`, keep `helpers.ts` exports. Add **all** `requests.*` keys of 11.3 (including the `viewer.*` and `action.*` keys that W4 uses) to both dictionaries. Use W4's components through their documented props (`ActionPanel` with `onSealed`, `EvidenceViewer`, `buildEvidence`). Tests: `timelineModel.test.ts`, `routeModel.test.ts`. Acceptance: typecheck clean for your files; eslint clean.

**W4 - action bar, dialogs, evidence viewer (Sonnet).** Read `DESIGN_SPEC.md` sections 2, 4-7, 9.4 (EvidenceViewer, ActionPanel, dialogs), 10 and the current `ActionPanel.tsx`, `CorrectionModal.tsx`, `EditLineModal.tsx`, `ImageGallery.tsx`. Do: keep every mutation, lock rule, heartbeat and key; change only presentation and add `onSealed`; write `evidence.ts` and `EvidenceViewer.tsx`; keep `ImageGallery` as the documented wrapper. Use only existing `requests.*` keys and the `requests.viewer.*` / `requests.action.more` keys of 11.3 (W3 adds them to the dictionaries). The existing accessible names must survive: the approve button's name still matches `/اعتماد|موافقة|Approve/`, the claim button's name is still the `requests.lock.claim` text. Tests: `evidence.test.ts`. Acceptance: typecheck clean for your files; eslint clean.

**W5 - dashboard, reports, SAP monitor (Sonnet).** Read `DESIGN_SPEC.md` sections 2, 4-7, 9.7-9.9, 10, 11.3 and PLAN B2 (web part). Do the three screens, `components/charts/{chartModel.ts,BarList.tsx,ColumnChart.tsx}`, the SAP drawer and force dialog. Tests: `components/charts/chartModel.test.ts`. Acceptance: typecheck clean for your files; eslint clean.

**W6 - workflows and templates (Sonnet).** Read `DESIGN_SPEC.md` sections 2, 4-7, 9.10, 9.11, 10, 11.3 and PLAN B1 (template endpoints). Do: workflow list cards; editor layout with the step route, parallel containers, `describe.ts`, `preview.ts` and the side column (cut-first: if you are past 30 minutes drop the route preview card, keep the simulator); templates list with `CreateTemplateDialog` (export exactly as specified, W9 imports it); template editor layout with the sticky scaled preview, layout picker and `PATCH /templates/:id` meta. `condition.ts` and `stepModel.ts` and their tests stay untouched. Tests: `describe.test.ts`, `preview.test.ts`. Acceptance: typecheck clean for your files; eslint clean.

**W7 - master data (Sonnet).** Read `DESIGN_SPEC.md` sections 2, 4-7, 9.12, 10, 11.1 (`tg.*`) and PLAN B3 (settings block), B7 (driver endpoints). Do: rewrite `CrudPage.tsx` and `ImportDialog.tsx` keeping the `CrudConfig` API; update every page under `app/(app)/master` and `admin/departments`; drivers Telegram column and relink flow; `components/TelegramLinkDialog.tsx` exactly as specified; SAP settings page with the cash journal block. Acceptance: typecheck clean for your files; eslint clean.

**W8 - administration (Sonnet).** Read `DESIGN_SPEC.md` sections 2, 4-7, 9.13, 10, 11.3 and PLAN B6 (settings keys), B7 (user endpoints). Do: users page with the Telegram actions (import `TelegramLinkDialog`); roles matrix with `matrixModel.ts`, sticky headers, dirty bar and the mobile accordion; delegations with `delegation.ts`; audit with `diff.ts` (cut-first: raw JSON only); settings grouped with the structured notification editors; restyle `SignatureManager.tsx`. Tests: `features/admin/{matrixModel,diff,delegation}.test.ts`. Acceptance: typecheck clean for your files; eslint clean.

**W9 - request types (Sonnet).** Read `DESIGN_SPEC.md` sections 2, 4-7, 9.14, 10, 11.3 (rt rows), PLAN 5.1 and B1, and `packages/shared/src/schemas/index.ts` (`fieldDefinitionSchema`). Do: the three route files, `RequestTypesListPage`, `RequestTypeEditorPage` (five tabs), `FieldListEditor`, `CategoryDrawer`, `model.ts`; use `fieldDefinitionIssues` from `@dms/shared` inside `validateFields`; import `CreateTemplateDialog` from `@/features/templates/CreateTemplateDialog`. Put all strings in the `rt` namespace (start from the table in 11.3 and add what the forms need: field labels, validation messages for each `FieldIssue` code, toasts). Tests: `features/request-types/model.test.ts`. Acceptance: typecheck clean for your files; eslint clean.

**A1 - API: request types, templates, Telegram link (Sonnet).** Read PLAN 5.1, 5.2, B1, B7 (token and API parts), 7.2 (Telegram token), 7.3 (your three files); read `config.controller.ts`, `users.controller.ts`, `master.controller.ts`, `signatures.controller.ts`, `auth.service.ts`, `apps/api/test/helpers.ts`, `apps/api/test/platform/authz-matrix.test.ts`. Do every endpoint of B1 and B7, `listModules`, `packages/core/src/telegram/index.ts`, `telegramLinked` in `/auth/me`. Tests: `packages/core/src/telegram/telegram.test.ts`, `apps/api/test/workflow/{request-types,templates}.test.ts`, `apps/api/test/platform/telegram-link.test.ts`, and update the authz matrix data if it lists handlers. Acceptance: `pnpm --filter @dms/api typecheck` and `pnpm --filter @dms/core typecheck` clean for your files; eslint clean.

**A2 - SAP (Sonnet).** Read PLAN 5.3-5.5, B2, B3, 7.2 (SAP), 7.3 (`sap-retry`); read every file in `packages/core/src/sap`, `apps/api/src/integrations/sap.controller.ts`, `docs/SAP_INTEGRATION.md`. Do: `errors.ts`, `s4lookup.ts`, the `s4hana.ts` changes, `cashjournal.ts`, `adapters.ts` (`s4hana-cj`), `journal.ts` (`cashJournal` block), `types.ts`, `process.ts`, `index.ts` exports (`S4Lookup`, `S4CashJournalAdapter`, the error classes, `toCashJournalDoc`, builders and parsers); the retry endpoint with `force` and audit; detail endpoint with attempts and payload; fixtures; append both question lists to `docs/SAP_INTEGRATION.md`. The existing `sap.test.ts` must stay valid without edits. Tests: `s4lookup.test.ts`, `s4hana.test.ts`, `cashjournal.test.ts`, `process.test.ts`, `apps/api/test/integrations/sap-retry.test.ts`. Acceptance: core and api typecheck clean for your files; eslint clean.

**A3 - S3 and metrics (Sonnet).** Read PLAN 5.5, B4, B5, 7.2 (storage, metrics), 7.3 (`metrics`, `files-redirect`); read `packages/core/src/storage/index.ts`, `apps/api/src/files/files.controller.ts`, `apps/api/src/health/*`, `packages/shared/src/constants/errors.ts`. Do: `storage/s3.ts`, `presignGet` on the interface, `getStorage()` S3 branch, `setStorageForTests`; the files redirect; `metrics/index.ts`; `MetricsInterceptor`, module registration, the `/metrics` handler; the two doc sections. Tests: `storage/s3.test.ts`, `metrics/metrics.test.ts`, `apps/api/test/health/metrics.test.ts`, `apps/api/test/files/files-redirect.test.ts`. Acceptance: core and api typecheck clean for your files; eslint clean.

**A4 - e-mail and fan-out (Sonnet).** Read PLAN 5.4, 5.5, B6, B7 (fan-out bullet), 7.2 (e-mail, fan-out), 7.4 (worker); read `packages/core/src/notifications/*`, `packages/core/src/jobs/enqueue.ts`, `apps/worker/src/*`, `apps/worker/test/worker.test.ts`. Do: the `email` folder, `fanOutUserChannels` and its call in `notifyUsers`, the worker `email.send` handler and the `force` pass-through for `sap.post`. Tests: `email/email.test.ts`, `notifications/fanout.test.ts`, `apps/worker/test/email.test.ts`. Acceptance: core and worker typecheck clean for your files; eslint clean.

**A5 - bot (Sonnet).** Read PLAN B7 (bot part), 7.4; read `apps/bot/src/{flow.ts,messages.ts,jobs.ts,types.ts}`, `apps/bot/test/{helpers.ts,onboarding.test.ts}`. Do: `handleLinkToken`, the approver-only reply, the four messages, user recipients in `createTelegramSendHandler`. Do not touch the driver conversation otherwise. Tests: `apps/bot/test/link.test.ts`, `apps/bot/test/jobs.test.ts`. Acceptance: `pnpm --filter @dms/bot typecheck` clean for your files; eslint clean.

**A6 - load tooling (Sonnet).** Read PLAN B8, 5.7; read `packages/db/prisma/schema.prisma` (models named in B8), `packages/db/scripts/migrate.ts`, `packages/db/src/pgconfig.ts`, `packages/core/scripts/seed-demo.ts`, `packages/core/src/engine/queries.ts`, `packages/core/src/reports/{query.ts,dashboard.ts}`. Do the two core scripts and the two root launchers. Acceptance: `pnpm --filter @dms/core typecheck` clean (if `scripts/` is outside the package's `tsconfig` include, run `pnpm --filter @dms/core exec tsc --noEmit --skipLibCheck scripts/load-data.ts scripts/load-timing.ts` with the package's compiler options and report the result); eslint clean on your four files.

**T1 - Playwright and guards (Sonnet).** Read `DESIGN_SPEC.md` section 10 and section 9 (for flows), PLAN 7.5 (your rows), 7.6; read `e2e/tests/*`, `e2e/support/flow.ts`, `apps/web/src/features/i18n-keys.test.ts`. Do: `e2e/support/ui.ts`, rewrite `web-ui.spec.ts`, add `redesign.spec.ts`, extend `full-flow.spec.ts`, write `style-guard.test.ts`, extend `i18n-keys.test.ts`. Select only by the documented test ids and roles. Acceptance: `pnpm --filter @dms/e2e typecheck` clean; eslint clean on your paths.

**H1 - demo fix and simulator restyle (Haiku).** Read PLAN B9 and `DESIGN_SPEC.md` section 13; read `scripts/demo.ts` and `apps/bot/src/simulator/page.html`. Do: create `scripts/demo-lib.ts` with the five functions exactly as specified; apply the five numbered changes to `scripts/demo.ts`; write `e2e/unit/demo-lib.test.ts` (import from `../../scripts/demo-lib`); replace the content of the `<style>` element in `page.html` with the CSS block given, changing nothing else in that file. Acceptance: `pnpm exec eslint scripts/demo.ts scripts/demo-lib.ts e2e/unit/demo-lib.test.ts` clean; `pnpm exec tsc --noEmit --skipLibCheck --module esnext --moduleResolution bundler --target es2022 --types node scripts/demo.ts scripts/demo-lib.ts` reports no errors.

---

## 9. Integration (work package Z, Sonnet, after every other agent has committed)

Brief (after the common preamble; Z may edit any path):

1. `git status` must show no uncommitted work from other agents; `git log --oneline` shows one `P2-*` commit per package. Read every `P2-` line in `docs/CONTRACT_NOTES.md` and resolve each (make the requested change or record why not).
2. Run `pnpm -r typecheck`. Fix every error (most will be prop mismatches between packages; the documents decide who is right). Repeat until clean.
3. Run `pnpm lint`. Fix every error; warnings may stay.
4. Static sweeps with ripgrep over `apps/web/src` (fix what you find):
   - physical direction classes: `(?<![\w-])(ml|mr|pl|pr)-\d|(?<![\w-])(left|right)-\d|text-(left|right)`
   - legacy palette classes: `(bg|text|border|ring|divide)-(slate|brand|emerald|sky|violet|purple|red|amber)-\d`
   - native date inputs: `type="date"`
   - every test id of `DESIGN_SPEC.md` section 10 appears at least once in `apps/web/src` (list the missing ones in your report and add them where the element exists).
   - every `t('ns.key')` literal has its key in both dictionaries (compare by grep per namespace; the vitest check runs later on the other machine).
5. Verify cross-package contracts by reading: `ActionPanel` props vs `RequestDetailPage` usage; `EvidenceViewer` props; `CreateTemplateDialog` usage in W9; `TelegramLinkDialog` usage in W1/W8; worker `sap.post` passes `force`; `ui/index.ts` exports exist; `NAMESPACES` contains the four new namespaces.
6. Confirm nothing ran that should not: `apps/web/tsconfig.json` and `apps/web/next-env.d.ts` are unchanged (`git diff --stat`); no `.next*` or `storage-data` paths are staged.
7. Docs: add a section "Phase 2 (implemented 2026-11, tests written, NOT yet run)" to `docs/PROGRESS.md` listing each item of sections A and B with its status and the test files that will prove it, and move the fixed items out of "Known bugs and limitations"; update `README.md` (new env variables table, `pnpm load:data`, `pnpm load:timing`, link to `docs/plan-v2/TESTING_GUIDE.md`, the redesign in one paragraph); rewrite `docs/HOW_TO_ADD_NEW_REQUEST_TYPE.md` for the new UI (keep the API notes as an appendix).
8. Do not run tests, builds or servers. Commit: `git add -- .` is forbidden; add by top-level folder you changed (`git add -- apps packages e2e scripts docs README.md`), then `git commit -m "P2-Z: integration, typecheck and lint clean, docs"`. Never push.
9. Report: the typecheck and lint results, the list of resolved contract notes, anything cut (section 10), and the exact commands the friend should run first (from `TESTING_GUIDE.md`).

---

## 10. Risks, timing and the cut list

**Is one hour realistic?** Not fully. The plan needs about 80 minutes wall-clock (install 3, phase 0 15, gate 3, phase 1 about 40, integration about 20). Phase 1 is bounded by the largest rewrites (W3, W4, W6, W8, W9) and integration by how many cross-package type errors 20 agents leave behind. To land near 60-65 minutes, apply the cut list **up front** (tell the agents in their briefs); the cut items are isolated and can be done in a follow-up run.

**Cut list, in order (first cut first):**
1. C1: command palette (W1) - keep the top-bar search trigger hidden.
2. C2: workflow route preview card (W6) - keep the simulator text result.
3. C3: audit diff viewer (W8) - show raw before/after JSON.
4. C4: roles matrix mobile accordion (W8) - matrix scrolls horizontally on phones.
5. C5: density preference and the Arabic-Indic numerals toggle UI (W1; the formatter support in F1 stays).
6. C6: request-type "attachments" grid tab (W9) - the same fields remain in the category drawer.
7. C7: S3 presigned redirect (A3) - proxy mode only.
8. C8: A6 load tooling as a separate later run (it does not block anything else).
Never cut: tokens and kit, shell, login, inbox, request detail with the action bar, request types UI with the templates API, `findByReference`, the demo fix, and writing the tests.

**Top risks**

| # | Risk | Mitigation |
|---|---|---|
| 1 | Nothing is executed here: tests, the Next build and the UI are unverified until the friend runs them. Visual defects and runtime errors are likely on the first run. | `TESTING_GUIDE.md` orders the checks (typecheck, unit, API, build, e2e, visual pass) and tells the friend how to report; plan a short fix run after his report. |
| 2 | 17 agents type-checking the same packages at once on one Windows machine (memory, noisy errors). | Agents fix only their own files; G0 gate before phase 1; Z owns the final reconciliation; the orchestrator may stagger the web agents in two waves if the machine swaps. |
| 3 | Kit API drift between F1/F2 and the page agents. | APIs are fixed in `DESIGN_SPEC.md` section 7; kit keeps old exports; G0 proves old pages compile. |
| 4 | SAP element names (journal SOAP, OData lookup, cash journal BAPI) are unverified; no SAP system exists. | Everything is config-driven and fixture-tested; `SAP_S4_LOOKUP_MODE=none` is the safe mode; question lists for the SAP team are part of the deliverable. |
| 5 | `radix-ui` unified package export names or React 19 edge cases. | F2 verifies names in the installed `.d.ts`; fallback is the per-primitive `@radix-ui/react-*` packages (note in CONTRACT_NOTES, orchestrator installs). |
| 6 | Legacy colour aliases hide un-migrated classes. | `style-guard.test.ts` and Z's sweep fail on them; the aliases only keep leftovers presentable. |
| 7 | `pg_trgm` missing on the private Postgres cluster. | The migration skips the trigram index with a NOTICE; search still works, slower. |
| 8 | Notification fan-out inside transactions adds rows and jobs to hot paths. | Off by default (both settings disabled, `EMAIL_DRIVER=none`); fan-out errors never fail the caller. |
| 9 | Admin-issued Telegram links weaken D35 (contact-only linking). | Short TTL, signed, single target, refused when already linked, audited; listed in `OWNER_DECISIONS.md`. |
| 10 | Arabic copy and the Naskh display face are a matter of taste for the owner. | One place to change each: `--font-display` and the i18n tables; alternatives listed in `OWNER_DECISIONS.md`. |
