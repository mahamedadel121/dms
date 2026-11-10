# DMS — Phase 2 plan (follow-up gaps)

Written 2026-11-10 against the code as built (commit `8c067c2`). Source of truth for Phase 2 execution. `docs/PLAN.md` conventions (§4, §10–§14) stay in force unless this file says otherwise.

## 0. Hard rules for every agent in Phase 2 (read first)

1. **TESTS ARE WRITTEN, NEVER RUN, ON THIS MACHINE.** The developer runs them on his own machine (`docs/PHASE2_RUN_TESTS.md`).
   - Allowed: `pnpm --filter <pkg> exec tsc --noEmit` and `pnpm exec eslint <your files>`. Static `grep`/`git` are fine.
   - Forbidden: `vitest`, `pnpm test`, `playwright`, `pnpm e2e`, `pnpm dev`, `pnpm demo`, `next build`, `next dev`, starting the API/bot/worker, `pnpm db:migrate`, `pnpm db:seed`, `prisma migrate`, `prisma db push`, running `scripts/load-*.ts`, any `psql` write.
   - Because nothing is executed, write tests against behaviour you can prove by reading the code, mirror an existing test file's setup exactly, and never weaken or delete an existing test.
2. **No schema change in Phase 2.** `packages/db/**` stays frozen; no Prisma migration is written or applied. Everything new uses existing columns (`SapPostingAttempt.response` Json, `Notification.channel = EMAIL`, `User.telegramUserId`, `LineCategory.allowedMimeTypes`). The only SQL written is `docs/load/candidate-indexes.sql`, which is **not** a migration (see G4 for how the developer promotes it).
3. **100% local.** No remote, no push, no `gh`, no hosted CI. `git add -- <owned paths>` then `git commit -m "P2-<WP>: …"`; retry on `index.lock`; never `git add -A`, never stash/reset/checkout.
4. **Ownership by path** (§6). Never edit a path you do not own. If another WP's code blocks you, work around it in your own files and add one line to `docs/CONTRACT_NOTES.md` (append-only, prefix `P2-<WP>,`).
5. **Dependencies are installed only by the pre-step P0a.** No agent runs `pnpm add`/`pnpm install` afterwards. If something is missing, write the code without it and note it in `CONTRACT_NOTES.md`.
6. Shared typecheck: `tsc` on a package shows other agents' in-progress errors. Fix only errors in files you own; re-run at the end.
7. Every new API handler carries `@RequirePermission(...)`, `@AuthOnly()` or `@Public()` (the meta-test enforces it). Bodies through `ZodPipe`. Errors are `DomainError`. Money = decimal strings. Never hard-delete referenced rows. Audit every mutation.
8. Web: Tailwind logical utilities only, every user-visible string through `t('ns.key')` with the key present in **both** `ar` and `en`. No `eslint-disable` comments for `@next/next/*` or `react-hooks/*`.
9. Each agent's final message lists: files created/changed, test files with the number of `it(...)` cases in each, static checks run and their result, anything left TODO.

## 1. Goal and constraints

Goal: close the gaps in `docs/PROGRESS.md`:
1. Web UI to create/edit Request Types and create new Templates (business goal: HR adds a request type without code).
2. SAP no-double-post with the real S/4HANA adapter (`findByReference`, safe when unconfigured).
3. Cash Journal (FBCJ) adapter, selectable.
4. Load data + bench scripts, index recommendations.
5. `/metrics` in Prometheus text, SMTP e-mail notifications, S3 storage driver, Telegram relink.

Constraints: about **1 hour wall-clock**; Sonnet 5.5 agents for real work, Haiku 5.5 for mechanical work; six parallel work packages; tests written but not run (§0.1); local only.

## 2. What the code has today (verified by reading)

| Area | Exists | Missing |
|---|---|---|
| Request types API (`apps/api/src/workflow/config.controller.ts`) | `GET /request-types`, `GET /request-types/:id`, `POST /request-types` (creates type + `Workflow` + version 1 DRAFT, no steps), `PATCH /request-types/:id` (no code/prefix change), `POST|PATCH /request-types/:id/line-categories[/:cid]` | No template is created with the type. DTO has `workflowId` only (no versions, no templates, no readiness). `allowedMimeTypes` (column exists, enforced by `submit.ts`) is not in the input schema. No semantic validation of field definitions (duplicate keys, select without options…). |
| Templates API | `GET /templates[?requestTypeId]`, `GET /templates/:id`, `GET /template-versions/:id`, `POST /templates/:id/versions`, `PUT /template-versions/:id`, `POST …/publish`, `POST /templates/logo`, `POST /template-versions/:id/preview` | **`POST /templates` does not exist** (cannot create a template at all). No `PATCH /templates/:id` (name, default, active). |
| Workflows API | complete (list, get, versions, save, publish, delete draft, simulate) | nothing |
| Web | `/workflows`, `/templates` (list + editor), `/master/expense-types` has an extra-fields editor to copy from | No `/admin/request-types`. No "new template". |
| SAP | `processSapPosting` calls `findByReference` whenever `attempts > 0`; mock/file implement it | `S4HanaSapAdapter.findByReference` returns `null` ⇒ a retry after a lost response posts twice. No error classification. Cash Journal = interface only. |
| Ops | `/metrics` JSON stub (`@Public`), `email.send` handler is a no-op, `getStorage()` throws for `s3`, `POST /submitters/:id/telegram-unlink` only | everything in gap 5 |
| Submitting a non-expense type | `POST /requests` (WEB channel) works for any type | **No web form to submit a generic request and the bot is hard-wired to `DRIVER_EXPENSE`** — out of scope here, see §9 D1. |

## 3. Cross-cutting decisions

- **Env vars** (all optional, all added to `packages/core/src/config/index.ts` by P0b; `.env.example` by the final step):

| Var | Default | Used by |
|---|---|---|
| `SAP_ADAPTER` | `mock` (now `mock\|file\|s4hana\|cashjournal`) | G2, G3 |
| `SAP_S4_TIMEOUT_MS` | `30000` | G2 |
| `SAP_S4_LOOKUP_URL` | empty = lookup not configured | G2 |
| `SAP_S4_LOOKUP_FILTER` | `CompanyCode eq '{companyCode}' and FiscalYear eq '{fiscalYear}' and DocumentReferenceID eq '{reference}'` | G2 |
| `SAP_S4_LOOKUP_SELECT` | `CompanyCode,FiscalYear,AccountingDocument` | G2 |
| `SAP_S4_LOOKUP_USER`, `SAP_S4_LOOKUP_PASSWORD` | fall back to `SAP_S4_USER/PASSWORD` | G2 |
| `SAP_S4_LOOKUP_MIN_AGE_SEC` | `120` | G2 |
| `SAP_CJ_MODE` | `file` (`soap\|file`) | G3 |
| `SAP_CJ_URL`, `SAP_CJ_USER`, `SAP_CJ_PASSWORD` | empty (user/password fall back to `SAP_S4_*`) | G3 |
| `SAP_CJ_NUMBER` | empty (default cash journal number) | G3 |
| `SAP_CJ_BY_CASH_GL` | empty (JSON `{"11001000":"0001"}`: cash GL → cash journal number) | G3 |
| `SAP_CJ_TRANSACTION` | empty (business transaction of an expense line) | G3 |
| `SAP_CJ_TESTRUN` | `false` | G3 |
| `METRICS_TOKEN` | empty | G5a |
| `SMTP_HOST` | empty = e-mail disabled | G5b |
| `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | `587`, `false`, empty, empty, empty | G5b |
| `EMAIL_NOTIFY_TYPES` | empty = all types (comma list of `Notification.type`) | G5b |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | empty, `us-east-1`, empty, empty, empty | G5c |
| `S3_FORCE_PATH_STYLE`, `S3_PREFIX`, `S3_PRESIGN_REDIRECT` | `true`, empty, `false` | G5c |
| `BOT_USERNAME` | empty (needed only for `https://t.me/<bot>?start=` links) | G5d |
| `TELEGRAM_LINK_TTL_MIN` | `30` | G5d |
| `TELEGRAM_NOTIFY_USERS` | `true` | G5d |

- **No new permissions.** Request types = `request_types.manage`; templates = `templates.manage`; SAP resolve = `sap.retry`; driver link code = `submitters.telegram_link`; user link code/unlink = `users.manage`.
- **Metrics are hand-written** (no `prom-client`): the text format is small, a private registry avoids the "metric already registered" problem when tests boot several Nest apps, and it removes a dependency nobody can test here.
- **New `@dms/core` subpaths** (`exports: "./*"` already maps them): `@dms/core/metrics`, `@dms/core/email`, `@dms/core/telegram-link`, `@dms/core/loadtest`.

## 4. Pre-step P0 (T+0:00 → T+0:10) — two agents at once, disjoint files

### P0a (Haiku) — dependencies, the only lockfile writer in Phase 2
Owns: every `package.json`, `pnpm-lock.yaml`. Run from the repo root, in this order:
```
pnpm add --filter @dms/core nodemailer @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
pnpm add --filter @dms/core -D @types/nodemailer pg @types/pg
```
Then add two root scripts to `package.json`: `"load:data": "tsx scripts/load-data.ts"`, `"load:bench": "tsx scripts/load-bench.ts"`. Check `pnpm --filter @dms/core exec tsc --noEmit` is still clean. Commit `P2-P0a: dependencies` with `git add -- package.json pnpm-lock.yaml packages/core/package.json`. No other install, no `prisma generate`, no tests. Not needed and not installed: `prom-client`, `@aws-sdk/lib-storage`, `aws-sdk-client-mock`.

### P0b (Sonnet) — shared contracts, config, web shell hooks (so all six WPs compile against the same types from minute 0)
Owns for this step only: the files listed below. After P0b they pass to the WP named in §6.

1. `packages/core/src/config/index.ts` — add helpers and keys (keep existing keys untouched):
```ts
const flag = (def: boolean) => z.string().optional().transform((v) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));
const intE = (def: number) => z.preprocess((v) => (v === undefined || v === '' ? def : v), z.coerce.number().int()); // '' -> default (plain int() turns '' into 0)
// in envSchema:
SAP_ADAPTER: z.enum(['mock', 'file', 's4hana', 'cashjournal']).default('mock'),
SAP_S4_TIMEOUT_MS: intE(30000),
SAP_S4_LOOKUP_URL: optStr,
SAP_S4_LOOKUP_FILTER: z.string().default("CompanyCode eq '{companyCode}' and FiscalYear eq '{fiscalYear}' and DocumentReferenceID eq '{reference}'"),
SAP_S4_LOOKUP_SELECT: z.string().default('CompanyCode,FiscalYear,AccountingDocument'),
SAP_S4_LOOKUP_USER: optStr, SAP_S4_LOOKUP_PASSWORD: optStr, SAP_S4_LOOKUP_MIN_AGE_SEC: intE(120),
SAP_CJ_MODE: z.enum(['soap', 'file']).default('file'),
SAP_CJ_URL: optStr, SAP_CJ_USER: optStr, SAP_CJ_PASSWORD: optStr, SAP_CJ_NUMBER: optStr, SAP_CJ_BY_CASH_GL: optStr, SAP_CJ_TRANSACTION: optStr, SAP_CJ_TESTRUN: flag(false),
METRICS_TOKEN: optStr,
SMTP_HOST: optStr, SMTP_PORT: intE(587), SMTP_SECURE: flag(false), SMTP_USER: optStr, SMTP_PASSWORD: optStr, SMTP_FROM: optStr, EMAIL_NOTIFY_TYPES: optStr,
S3_BUCKET: optStr, S3_REGION: z.string().default('us-east-1'), S3_ENDPOINT: optStr, S3_ACCESS_KEY_ID: optStr, S3_SECRET_ACCESS_KEY: optStr,
S3_FORCE_PATH_STYLE: flag(true), S3_PREFIX: z.string().default(''), S3_PRESIGN_REDIRECT: flag(false),
BOT_USERNAME: optStr, TELEGRAM_LINK_TTL_MIN: intE(30), TELEGRAM_NOTIFY_USERS: flag(true),
```
`S3_REGION`/`SAP_S4_LOOKUP_FILTER`/`SAP_S4_LOOKUP_SELECT` must treat `''` as "use default" (wrap with the same `preprocess` idea).

2. `packages/shared/src/contracts/workflow.ts` — add (import `LOOKUP_ENTITIES` from `./platform`, `templateConfigSchema`/`TemplateConfig` from `../schemas`):
```ts
export const RESERVED_HEADER_KEYS = ['requestNumber', 'submittedAt', 'submitterName'] as const;
export const ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const TEMPLATE_LAYOUT_KEYS = ['expense-sheet', 'generic-request'] as const;
export type FieldProblemCode = 'BAD_KEY' | 'DUPLICATE_KEY' | 'RESERVED_KEY' | 'OPTIONS_REQUIRED' | 'DUPLICATE_OPTION' | 'BAD_LOOKUP' | 'BAD_RANGE' | 'BAD_REGEX';
export interface FieldProblem { index: number; key: string; code: FieldProblemCode }
/** Pure; used by the API (superRefine) and by the web builder for inline errors. */
export function validateFieldDefinitions(fields: FieldDefinition[], o?: { reserved?: readonly string[] }): FieldProblem[];
```
Rules of `validateFieldDefinitions`, per field at `index`: key must match `/^[A-Za-z][A-Za-z0-9_]{0,39}$/` else `BAD_KEY`; key seen before ⇒ `DUPLICATE_KEY`; key in `o.reserved` ⇒ `RESERVED_KEY`; `type='select'` with no options or an empty option value ⇒ `OPTIONS_REQUIRED`, repeated option values ⇒ `DUPLICATE_OPTION`; `type='lookup'` with `lookup` not in `LOOKUP_ENTITIES` ⇒ `BAD_LOOKUP`; `min > max` ⇒ `BAD_RANGE`; `regex` that `new RegExp` rejects ⇒ `BAD_REGEX`.

Restructure the request-type and category schemas (inferred types keep their names; `superRefine` adds one zod issue per `FieldProblem` with `path: [<field>, index, 'key']` and `message: code`):
```ts
const requestTypeBase = z.object({ /* the existing fields, with channels: z.array(z.enum(['TELEGRAM','WEB'])).min(1).default(['TELEGRAM']) */ });
export const requestTypeInputSchema = requestTypeBase.extend({
  template: z.object({ mode: z.enum(['BLANK', 'CLONE', 'NONE']).default('BLANK'), cloneFromTemplateId: z.string().optional() }).default({ mode: 'BLANK' }),
  cloneWorkflowFromTypeId: z.string().optional(),
}).superRefine(/* headerFields via validateFieldDefinitions(reserved = RESERVED_HEADER_KEYS); template.mode==='CLONE' needs cloneFromTemplateId */);
export const requestTypeUpdateSchema = requestTypeBase.partial().omit({ code: true, numberPrefix: true }).superRefine(/* headerFields when present */);
const lineCategoryBase = z.object({ /* existing fields */, allowedMimeTypes: z.array(z.enum(ATTACHMENT_MIME_TYPES)).min(1).optional() });
export const lineCategoryInputSchema = lineCategoryBase.superRefine(/* extraFields; quantityFieldKey must be the key of a number-type extra field; minAttachments <= maxAttachments; unitPriceMin <= unitPriceMax when both set */);
export const lineCategoryUpdateSchema = lineCategoryBase.partial().omit({ code: true }).superRefine(/* same checks on the fields that are present */);
```
DTO additions (new members optional so existing code compiles; WP-A always returns them):
```ts
// LineCategoryDto: + allowedMimeTypes?: string[]
export interface RequestTypeTemplateRef { id: string; code: string; nameAr: string; nameEn: string; isDefault: boolean; isActive: boolean; activeVersion: number | null; draftVersionId: string | null }
export interface RequestTypeReadiness { workflowPublished: boolean; templatePublished: boolean; hasActiveCategory: boolean; ready: boolean }
// RequestTypeDto: + workflow?: { id: string; activeVersion: number | null; activeVersionId: string | null; draftVersionId: string | null } | null;
//                 + defaultTemplateId?: string | null; categoryCount?: number; requestCount?: number; templates?: RequestTypeTemplateRef[]; readiness?: RequestTypeReadiness
export const createTemplateBodySchema = z.object({
  requestTypeId: z.string().min(1), code: z.string().min(1).max(40).regex(/^[A-Z0-9_]+$/), nameAr: z.string().min(1), nameEn: z.string().min(1),
  isDefault: z.boolean().default(false), layoutKey: z.enum(TEMPLATE_LAYOUT_KEYS).optional(),
  cloneFromTemplateId: z.string().optional(), cloneFromVersionId: z.string().optional(),
});
export type CreateTemplateBody = z.infer<typeof createTemplateBodySchema>;
export const updateTemplateBodySchema = z.object({ nameAr: z.string().min(1).optional(), nameEn: z.string().min(1).optional(), isDefault: z.boolean().optional(), isActive: z.boolean().optional() });
export type UpdateTemplateBody = z.infer<typeof updateTemplateBodySchema>;
/** Starting config of a blank template: title = type names; headerFields = RESERVED_HEADER_KEYS + the type's header field keys (labels from the definitions, show: true);
 *  lineColumns = category, amount, note (+ `extra.<key>` per extraFieldKeys) when hasLines, else []; showOriginalValues false; showAmountInWords = hasLines; signature { perRow: 4, showDateTime: true, submitterLabelAr: 'مقدم الطلب' }. Must satisfy templateConfigSchema. */
export function blankTemplateConfig(t: { nameAr: string; nameEn: string; hasLines: boolean; headerFields: FieldDefinition[]; extraFieldKeys?: string[] }): TemplateConfig;
```
P0b implements `validateFieldDefinitions` and `blankTemplateConfig` fully.

3. `packages/shared/src/contracts/integrations.ts` — add:
```ts
export const SAP_MANUAL_CHECK_PREFIX = 'MANUAL_CHECK_REQUIRED: ';
// sapPostingsQuerySchema: + manualCheck: z.enum(['true', 'false']).optional()
// SapPostingListItem:     + manualCheckRequired?: boolean
export const sapResolveBodySchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('MARK_POSTED'), documentNumber: z.string().trim().min(1).max(20), fiscalYear: z.string().regex(/^\d{4}$/), note: z.string().trim().max(500).optional() }),
  z.object({ decision: z.literal('CONFIRM_NOT_POSTED'), note: z.string().trim().min(3).max(500) }),
]);
export type SapResolveBody = z.infer<typeof sapResolveBodySchema>;
```
4. `packages/shared/src/contracts/platform.ts` — add `export interface TelegramLinkCodeResponse { code: string; command: string; deepLink: string | null; expiresAt: string; wasLinked: boolean }`.
5. Web shell: `apps/web/src/lib/nav.ts` — admin group, first item: `{ href: '/admin/request-types', labelKey: 'common.nav.requestTypes', permission: P.REQUEST_TYPES_MANAGE, icon: 'FilePlus2' }`; `apps/web/src/components/layout/Sidebar.tsx` — import `FilePlus2` and add it to `ICONS`; `apps/web/src/i18n/{ar,en}/common.ts` — `'nav.requestTypes'`: `أنواع الطلبات` / `Request types`; create `apps/web/src/i18n/{ar,en}/reqtypes.ts` (`const dict: Dict = {}; export default dict;` in the style of the sibling files) and register namespace **`reqtypes`** (lower case on purpose: `features/i18n-keys.test.ts` only matches `[a-z]+\.`) in `apps/web/src/i18n/index.ts` (`NAMESPACES` + both dictionaries).
6. Gate: `pnpm --filter @dms/shared exec tsc --noEmit`, `pnpm --filter @dms/core exec tsc --noEmit`, `pnpm --filter @dms/api exec tsc --noEmit`, `pnpm --filter @dms/web exec tsc --noEmit` all clean; `pnpm exec eslint` on the touched files. Commit `P2-P0b: shared contracts, config, web shell hooks`.

The orchestrator starts the six WPs only after both P0 commits exist.

---

## 5. Designs

### G1 — Request Types UI + new Templates (highest priority)

#### G1 API (WP-A) — `apps/api/src/workflow/config.controller.ts`
| Endpoint | Change |
|---|---|
| `POST /request-types` | In the existing transaction, after the workflow + v1 DRAFT: (a) `template.mode='BLANK'` (default) ⇒ create `Template { code: 'DEFAULT', nameAr, nameEn, isDefault: true }` + `TemplateVersion { version: 1, status: 'DRAFT', layoutKey: moduleKey === 'expense' ? 'expense-sheet' : 'generic-request', config: blankTemplateConfig(type) }`; `'CLONE'` ⇒ same, with `config` and `layoutKey` copied from the source template's ACTIVE version (else its highest version), 404 when the source is missing; `'NONE'` ⇒ nothing. (b) `cloneWorkflowFromTypeId` ⇒ copy every `WorkflowStep` of that type's ACTIVE version (404 if the type or an ACTIVE version is missing) into the new v1 DRAFT with `createMany` (same columns, new ids, `condition`/`checklist` as Json). Strip `template`/`cloneWorkflowFromTypeId` before writing the `RequestType` row. Returns the detail DTO, 201. |
| `GET /request-types` | each row also has `workflow`, `defaultTemplateId`, `categoryCount`, `requestCount`, `readiness`. One query with includes/`_count`; no N+1. |
| `GET /request-types/:id` | also `templates: RequestTypeTemplateRef[]` (ordered default first, then code), `workflow`, `readiness`, `requestCount`. |
| `PATCH /request-types/:id` | unchanged fields plus: `moduleKey` change is refused with `CONFLICT` when `requestCount > 0`; `channels` empty is already rejected by the schema. |
| `POST/PATCH …/line-categories` | read/write `allowedMimeTypes`; duplicate `(requestTypeId, code)` ⇒ `CONFLICT` (catch the unique violation `P2002` or pre-check); `catDto` returns `allowedMimeTypes`. |
| **`POST /templates`** (new, `templates.manage`, `ZodPipe(createTemplateBodySchema)`) | 404 unknown `requestTypeId`; `CONFLICT` on duplicate `(requestTypeId, code)`; source = `cloneFromVersionId`, else `cloneFromTemplateId`'s ACTIVE (else highest) version (404 if not found; cloning across request types is allowed); no source ⇒ `blankTemplateConfig` with the type's header fields and the union of its categories' extra field keys; `layoutKey` = body, else the source's, else by `moduleKey` as above. One transaction: `SELECT … FROM request_types WHERE id = $1 FOR UPDATE`; when `isDefault` clear the other defaults of the type; create template + version 1 DRAFT (`createdById`, note `Blank` or `Cloned from <code> v<n>`); audit `template.create`. Returns the same shape as `GET /templates/:id`, 201. |
| **`PATCH /templates/:id`** (new, `templates.manage`, `updateTemplateBodySchema`) | 404; `isDefault: true` clears the type's other defaults in the same transaction; audit `template.update` with before/after. Returns `GET /templates/:id` shape. |

`readiness`: `workflowPublished` = the workflow has an ACTIVE version; `templatePublished` = some active template of the type has an ACTIVE version (informational: `pdf/model.ts` falls back to `DEFAULT_TEMPLATE_CONFIG` + `generic-request`); `hasActiveCategory` = `!hasLines` or at least one active category; `ready` = `isActive && workflowPublished && hasActiveCategory`.

#### G1 Web (WP-B)
- Routes: `apps/web/src/app/(app)/admin/request-types/page.tsx` → `RequestTypesListPage`; `…/admin/request-types/[id]/page.tsx` → `RequestTypeEditorPage` (`id = 'new'` creates). Follow `app/(app)/templates/[id]/page.tsx` for the Next 15 `params` handling.
- `features/request-types/RequestTypesListPage.tsx`: `DataTable` — code, name (locale), department, prefix, channels (badges), workflow (`v<n>` green / "draft only" amber), default template, categories count, readiness badge (ready / not ready), active; row click opens the editor; "New request type" when `can('request_types.manage')`.
- `features/request-types/RequestTypeEditorPage.tsx` — `Tabs`:
  1. **General**: code (upper-cased, immutable after create, `dir="ltr"`), number prefix (1–4, immutable after create, live example `PR-26-000001`), name AR/EN, department (`LookupSelect entity="departments"`, optional), submission channels (Telegram / Web checkboxes, at least one), has line items, active. On create only: template start (`blank` / `clone existing` + template select / `none`) and "copy approval route from" (request type select, optional). `moduleKey` is not editable: created as `null`; shown read-only when set.
  2. **Header fields**: `FieldDefsEditor` (below) with `reserved = RESERVED_HEADER_KEYS`.
  3. **Line-item categories** (hidden when `hasLines` is false; for `moduleKey === 'expense'` the tab is read-only with a link to `/master/expense-types`, because expense categories also need a GL account): table (code, name, icon, order, attachments min–max, extra fields count, approval roles count, active) + `CategoryModal`: code (immutable after create), name AR/EN, icon, sort order, active, extra fields (`FieldDefsEditor`), quantity field (select among number-type extra fields), unit price min/max, max amount warning, **attachment rules** (min, max, allowed types checkboxes from `ATTACHMENT_MIME_TYPES`), extra approval roles (`LookupMultiSelect entity="roles"`). Deactivate instead of delete.
  4. **Workflow & template**: readiness checklist (3 items with tick/cross and a "what to do" hint); workflow card (active version / draft, button "Open workflow builder" → `/workflows/<workflow.id>`); templates table (code, name, active version / draft, default radio → `PATCH /templates/:id { isDefault: true }`, active toggle, "Open" → `/templates/<id>`) + "New template" (opens `NewTemplateDialog` with this type preselected).
  Save = `POST /request-types` (then `router.replace` to the new id) or `PATCH`; API `VALIDATION` details are mapped to field errors with `fieldErrorsFromApi`; all mutations invalidate `['request-types']`, `['request-type', id]`, `['templates']`, `['workflows']`.
- `features/request-types/FieldDefsEditor.tsx` (reusable; copy the behaviour of `ExtraFieldsEditor` in `app/(app)/master/expense-types/page.tsx`, do not edit that page): per row key, label AR, label EN, type (text/number/date/select/lookup), required, move up/down, remove; type-specific: select ⇒ option rows (value, label AR, label EN); lookup ⇒ entity select from `LOOKUP_ENTITIES`; number ⇒ min/max; text ⇒ regex; all ⇒ `promptAr` (bot question). Inline errors come from `validateFieldDefinitions` (`reqtypes.fieldError.<CODE>`). `order` is rewritten as the row index on save.
- `features/request-types/model.ts` (pure, unit-tested): `toEditable/fromEditable` field rows, `moveRow`, `typeFormToCreate`, `typeFormToUpdate` (never sends `code`, `numberPrefix`, `template`), `categoryFormToInput` (empty string ⇒ `null`, decimals as strings, ints parsed), `readinessItems(dto)`.
- Templates: `features/templates/NewTemplateDialog.tsx` (request type via `LookupSelect entity="request-types"`, code, name AR/EN, start from blank or clone (template select, all types, labelled `<type code> / <template code>`), "make default") → `POST /templates` → navigate to `/templates/<id>`; `TemplatesListPage.tsx` gets the "New template" button (`can('templates.manage')`), shows the request type code on each card and an "inactive" badge.
- Add `data-testid` on: `rt-new`, `rt-save`, `rt-code`, `rt-prefix`, `rt-name-ar`, `rt-name-en`, `rt-tab-<general|fields|categories|links>`, `fd-add`, `fd-row-<i>-key`, `fd-row-<i>-type`, `cat-add`, `cat-save`, `tpl-new`, `tpl-create`.
- i18n: namespace `reqtypes` (new keys, both languages), `templates` (new keys, both languages).

#### G1 tests to write
| File | Cases (each an `it`) | Developer command |
|---|---|---|
| `packages/shared/src/contracts/workflow.test.ts` (WP-A) | valid mixed field set ⇒ `[]`; duplicate key reported on the second index; `1abc` and `a b` ⇒ `BAD_KEY`; reserved key ⇒ `RESERVED_KEY` only when `reserved` is passed; select without options ⇒ `OPTIONS_REQUIRED`; repeated option value ⇒ `DUPLICATE_OPTION`; unknown lookup entity ⇒ `BAD_LOOKUP`, `departments` passes; `min > max` ⇒ `BAD_RANGE`; regex `(` ⇒ `BAD_REGEX`; `requestTypeInputSchema` rejects lower-case code, 5-char prefix, empty channels, duplicate header keys, `CLONE` without source, and fills defaults (`channels=['TELEGRAM']`, `template.mode='BLANK'`); `requestTypeUpdateSchema` output has no `code`/`numberPrefix` even when sent; `lineCategoryInputSchema` rejects `quantityFieldKey` that is not a number field, `minAttachments > maxAttachments`, `allowedMimeTypes: ['text/html']`; `createTemplateBodySchema` code regex; `blankTemplateConfig` output passes `templateConfigSchema` for `hasLines` true and false | `pnpm --filter @dms/shared exec vitest run src/contracts/workflow.test.ts` |
| `apps/api/test/workflow/config-phase2.test.ts` (WP-A; `createTestApp('p2-config')`, mirror `workflow.test.ts`) | (1) `POST /request-types` creates type + workflow v1 DRAFT + template `DEFAULT` v1 DRAFT with `layoutKey='generic-request'` and `titleAr = nameAr`; response has `workflow.draftVersionId`, one template, `readiness.ready=false`; audit `request_type.create`. (2) `template.mode='NONE'` ⇒ no template; `'CLONE'` from the seeded expense template ⇒ config deep-equals the source's active config and the layout key is copied. (3) `cloneWorkflowFromTypeId` = seeded type ⇒ draft v1 has the same step keys in the same order. (4) duplicate code or prefix ⇒ 409; duplicate header keys ⇒ 400 `VALIDATION` with details. (5) a seeded non-admin user ⇒ 403; no token ⇒ 401 (for `POST /request-types`, `POST /templates`, `PATCH /templates/:id`). (6) `PATCH` changes names, department, channels, header fields, `isActive`; `code`/`numberPrefix` in the body change nothing; audit has before/after. (7) `PATCH moduleKey` on the seeded type that has a request ⇒ 409. (8) category create with extra fields, `allowedMimeTypes`, approval roles echoes them; duplicate code ⇒ 409; `PATCH` replaces approval roles and attachment rules; category id under another type ⇒ 404. (9) `POST /templates` blank ⇒ 201 with v1 DRAFT; duplicate code ⇒ 409; unknown type ⇒ 404; `isDefault: true` leaves exactly one default. (10) clone by `cloneFromVersionId` and by `cloneFromTemplateId` (other request type) ⇒ equal config. (11) `PATCH /templates/:id` switches the default; `GET /request-types/:id` shows the new `defaultTemplateId`; `isActive:false` works. (12) **end-to-end proof of "no code"**: create type (WEB channel, one select header field) → add a category with `minAttachments: 0` → `PUT /workflow-versions/:draft` with one ROLE step for a seeded role → publish ⇒ `readiness.ready=true` → `POST /requests` for the new type ⇒ 201 and the number starts with the new prefix, `templateVersionId` is null; publish the template version → the next request pins it. | `pnpm --filter @dms/api exec vitest run test/workflow/config-phase2.test.ts` |
| `apps/web/src/features/request-types/model.test.ts` (WP-B) | field rows round-trip (`fromEditable(toEditable(x))` equals `x` incl. options/min/max); `order` renumbered after `moveRow`; `typeFormToUpdate` omits `code`, `numberPrefix`, `template`; `categoryFormToInput` maps `''` to `null`, keeps decimals as strings, parses ints; `readinessItems` for the four combinations; `ar` and `en` `reqtypes` dictionaries have identical key sets; every `reqtypes.fieldError.<CODE>` exists for all `FieldProblemCode`s | `pnpm --filter @dms/web exec vitest run src/features/request-types` |
| `e2e/tests/request-types.spec.ts` (WP-B; mirror login/helpers of `web-ui.spec.ts`, use only `data-testid` and role selectors) | admin creates a type `E2E_PURCHASE`/`EP` with one select header field and saves; it appears in the list; adds a category with one number extra field; the links tab shows the workflow draft and the `DEFAULT` template; from `/templates` creates a template by cloning and lands on the editor; API check (`GET /request-types`) confirms persistence | `pnpm --filter @dms/e2e exec playwright test tests/request-types.spec.ts` |

The existing `features/i18n-keys.test.ts` and the API authorization meta-test must still pass; they cover the new keys and routes automatically.

### G2 — SAP no-double-post with the real S/4HANA adapter (WP-C)

**Principle:** a document is re-posted only when it is *proved* that no earlier attempt booked it. Proof = a definitive rejection, a lookup that answered "not found", or an accountant's explicit confirmation. Without proof and without a lookup the posting is parked for a manual check and is never retried automatically.

1. `packages/core/src/sap/errors.ts` (new; all extend `DomainError('INVALID_STATE', …)`):
   - `SapRejectedError` — nothing was booked (SAP answered with an error log / SOAP fault / 401 / 403, or the adapter failed before sending, e.g. not configured).
   - `SapOutcomeUnknownError` — the request may have reached SAP (network error, timeout, 5xx, unreadable answer).
   - `SapLookupUnavailableError { transient: boolean }` — absence cannot be proved (not configured / 401 / unreadable ⇒ `transient=false`; network / timeout / 5xx / 429 ⇒ `transient=true`).
   - `SapLookupAmbiguousError { documents: string[] }` — several documents, or only reversed ones.
2. `types.ts`: `findByReference(reference, companyCode, o?: { fiscalYear?: string; postingDate?: string })` — **contract: return `null` only when the adapter positively knows that no document exists; otherwise throw one of the lookup errors.** Optional adapter member `lookupMinAgeSec?: number`.
3. `packages/core/src/sap/odata-lookup.ts` (new, pure + injected `fetch`):
   - `buildLookupUrl(cfg, { reference, companyCode, fiscalYear })` → `<SAP_S4_LOOKUP_URL>?$filter=<template with {reference} {companyCode} {fiscalYear}, values OData-escaped (' → '')>&$select=<SAP_S4_LOOKUP_SELECT>&$top=50&$format=json`.
   - `parseLookupRows(json)` accepts OData V2 `{ d: { results: [] } }` and V4 `{ value: [] }`; reads `AccountingDocument`, `FiscalYear`, and when present `IsReversal`/`IsReversed`. Any other shape ⇒ `SapLookupUnavailableError(transient=false)`.
   - `lookupByReference(cfg, p, fetchImpl)`: no URL ⇒ `Unavailable(false)` without a network call; Basic auth (lookup user or the S/4 user), `sap-client`, `Accept: application/json`, `AbortSignal.timeout(SAP_S4_TIMEOUT_MS)`; zero rows ⇒ `null`; one distinct non-reversed `(AccountingDocument, FiscalYear)` ⇒ it; more than one, or only reversed ⇒ `Ambiguous`.
   - Default target (to be confirmed, §10): OData `API_JOURNALENTRYITEMBASIC_SRV/A_JournalEntryItemBasic` filtered by company code + fiscal year + the header reference (XBLNR; CDS name `DocumentReferenceID`). Fiscal year = `postingDate.slice(0, 4)`. Because the whole filter is one env template, the SAP team can switch to `AssignmentReference eq '{reference}'` (ZUONR, which the journal builder already fills on every item), add `Ledger eq '0L'`, or drop the fiscal year, without a code change.
4. `s4hana.ts`: `findByReference` delegates to `lookupByReference`; `lookupMinAgeSec = SAP_S4_LOOKUP_MIN_AGE_SEC`. `post()` classification: not configured ⇒ `SapRejectedError` (no network); `fetch` throws / times out ⇒ `SapOutcomeUnknownError`; HTTP 401/403 ⇒ `SapRejectedError`; `parseSoapResponse` gains `definitive: boolean` on failures (`true` for a SOAP fault or error-severity log items, `false` for "no document number found") ⇒ definitive ⇒ `SapRejectedError`, otherwise ⇒ `SapOutcomeUnknownError`. Keep `buildSoapEnvelope` as is (still unverified, §10).
5. `mock.ts`: `failNext(n, message?, kind: 'unknown' | 'rejected' = 'unknown')`; `lookupMode: 'ok' | 'unavailable' | 'transient' = 'ok'`; `lookupCalls` counter. `file.ts` unchanged in behaviour.
6. `process.ts` — new algorithm (attempt outcome stored in `SapPostingAttempt.response.outcome`: `'POSTED' | 'REJECTED' | 'NOT_SENT' | 'UNKNOWN' | 'MANUAL_CHECK'`):
   1. Tx as today (lock, `POSTED` ⇒ no-op, set `POSTING`, create the attempt) and load the earlier attempts. `needsLookup` = some earlier attempt is **not provably unposted**. Provably unposted = `response.outcome ∈ {REJECTED, NOT_SENT, MANUAL_CHECK}` or `response.resolved.decision === 'NOT_POSTED'`. An unfinished attempt (crash, row left `POSTING`) and a legacy failed attempt without `response` are not provable ⇒ lookup (same as today's `attempts > 0`).
   2. If `needsLookup`: when the adapter has `lookupMinAgeSec` and the newest unproved attempt ended (or started) less than that many seconds ago ⇒ throw `SapLookupUnavailableError(transient=true, 'waiting before lookup')` (SAP may still be processing; never post). Otherwise `adapter.findByReference(reference, companyCode, { fiscalYear, postingDate })`. Found ⇒ go to 4 with `reusedExisting: true`. `null` ⇒ write `response.resolved = { decision: 'NOT_POSTED', by: 'LOOKUP', at }` on the unproved attempts, then post.
   3. `adapter.post(doc)`.
   4. Commit `POSTED` as today; attempt `response.outcome = 'POSTED'`.
   - Errors in the lookup phase: `Unavailable(transient=false)` or `Ambiguous` ⇒ **manual check**: posting `FAILED`, `lastError = SAP_MANUAL_CHECK_PREFIX + message`, attempt `outcome='MANUAL_CHECK'`, event `SAP_FAILED` with `data.manualCheck = true`, in-app notification to `sap.retry` holders (once per posting: skip when the previous `lastError` already had the prefix), and **return the posting without throwing** so the job ends `DONE` and is not retried. `Unavailable(transient=true)` ⇒ attempt `outcome='NOT_SENT'`, posting `FAILED`, rethrow (job backoff; the next run looks up again).
   - Errors in the post phase: `SapRejectedError` ⇒ `outcome='REJECTED'`; anything else ⇒ `outcome='UNKNOWN'`. Posting `FAILED`, rethrow as today (max-attempt notification unchanged).
   - Replace the direct `notification.createMany` in `notifySapFailure` with `notifyUsers` from `../notifications` (same texts) so the e-mail fan-out of G5b applies.
   - New exports: `resolveSapPosting(prisma, postingId, a: SapResolveBody & { userId: string })` and `isManualCheckRequired(p: { status; lastError })`.
     - Only for `status === 'FAILED'` (else `INVALID_STATE`); row locked `FOR UPDATE`.
     - `MARK_POSTED`: set `POSTED` + document number / fiscal year / company code / `postedAt`, update `ExpenseRequest`, event `SAP_POSTED` with `data.manual = true` and the note, set the job `sap.post:<requestId>` to `DONE` when it is `PENDING` or `FAILED`.
     - `CONFIRM_NOT_POSTED`: write `response.resolved = { decision: 'NOT_POSTED', by: userId, at, note }` on every unproved attempt (close unfinished ones: `finishedAt`, `success=false`), then `retrySapPosting` ⇒ the worker posts without a lookup.
7. API `apps/api/src/integrations/sap.controller.ts`: `POST /sap/postings/:id/resolve` (`sap.retry`, `ZodPipe(sapResolveBodySchema)`, audit `sap.resolve` with decision, note, document number, before/after status); list items carry `manualCheckRequired`; `GET /sap/postings?manualCheck=true` filters `status='FAILED' AND lastError LIKE 'MANUAL_CHECK_REQUIRED:%'`.
8. Web `apps/web/src/features/sap/**` + `i18n/{ar,en}/sap.ts`: amber "manual check" badge in the list and detail; filter chip; in the detail a "Resolve" dialog with two choices — "I found the document in SAP" (document number, fiscal year, note) and "I checked SAP (FB03 by reference): it was not posted, post it now" (note required) — each behind a confirm; plain "Retry" stays.

Behaviour summary for the owner: with `SAP_S4_LOOKUP_URL` set, a lost response is resolved automatically. Without it, a posting whose outcome is unknown stops at "manual check" and is never re-sent by itself.

#### G2 tests to write (recorded fixtures / injected `fetch` only; no network)
| File | Cases | Developer command |
|---|---|---|
| `packages/core/src/sap/lookup.test.ts` + fixtures `packages/core/src/sap/fixtures/{lookup-v2-one.json,lookup-v2-two-docs.json,lookup-v2-reversed.json,lookup-v4-empty.json}` | URL has the encoded filter, `$select`, `$top=50`, `$format=json`; a quote in the reference is doubled; a custom template without fiscal year works; V2 with three items of one document ⇒ that document; V4 empty ⇒ `null`; two documents ⇒ `Ambiguous` listing both; only reversed ⇒ `Ambiguous`; HTTP 500 ⇒ `Unavailable(transient=true)`; `fetch` rejects ⇒ transient; 401 ⇒ `transient=false`; HTML body ⇒ `transient=false`; no URL ⇒ `transient=false` and `fetch` never called; Basic auth, `sap-client`, `Accept` headers sent; lookup user overrides the S/4 user. `S4HanaSapAdapter.post`: SOAP fault ⇒ `SapRejectedError`; error log ⇒ rejected; `fetch` throws ⇒ `SapOutcomeUnknownError`; 502 HTML ⇒ unknown; 401 ⇒ rejected; unconfigured ⇒ rejected without network; `findByReference` passes `fiscalYear` from the posting date | `pnpm --filter @dms/core exec vitest run src/sap/lookup.test.ts` |
| `packages/core/src/sap/process-unknown.test.ts` (`setupTestDb('p2-sap-unknown')`, fixture helpers copied from `sap.test.ts`) | (1) lost response + lookup ok ⇒ retry finds the document, `POSTED`, `postCalls === 1`, first attempt `outcome='UNKNOWN'`, second `reusedExisting`. (2) rejected + lookup unavailable ⇒ retry posts, `lookupCalls === 0`. (3) lost response + lookup unavailable ⇒ `processSapPosting` resolves (no throw), `FAILED`, `lastError` starts with the prefix, `postCalls` still 1, event `SAP_FAILED` has `manualCheck`, exactly one notification per `sap.retry` holder even after a second run. (4) via `runDueJobs`: the `sap.post` job ends `DONE` and is not rescheduled. (5) crash simulation (row `POSTING`, attempt unfinished) + lookup unavailable ⇒ manual check, no post. (6) transient lookup failure ⇒ throws, attempt `NOT_SENT`, no post; next run with lookup "not found" posts exactly once. (7) ambiguous ⇒ manual check, both numbers in `lastError`. (8) `lookupMinAgeSec = 120` and the unknown attempt 10 s old ⇒ throws, neither lookup nor post called; with the attempt back-dated ⇒ proceeds. (9) `CONFIRM_NOT_POSTED` ⇒ attempts resolved, posting `PENDING`, job reset; next run posts once without a lookup. (10) `MARK_POSTED` ⇒ `POSTED` with the given number, `ExpenseRequest` updated, event manual, job not `PENDING`; a later `processSapPosting` is a no-op. (11) resolve on `POSTED`, `POSTING`, `PENDING` ⇒ `INVALID_STATE`. (12) two concurrent runs on a manual-check posting ⇒ `postCalls` unchanged | `pnpm --filter @dms/core exec vitest run src/sap/process-unknown.test.ts` |
| `apps/api/test/integrations/sap-resolve.test.ts` (`createTestApp('p2-sap-resolve')`) | 401 without token; 403 without `sap.retry`; 400 for `MARK_POSTED` without document number and for `CONFIRM_NOT_POSTED` without note; both happy paths; audit `sap.resolve`; list shows `manualCheckRequired: true` and `?manualCheck=true` returns only those | `pnpm --filter @dms/api exec vitest run test/integrations/sap-resolve.test.ts` |

`packages/core/src/sap/sap.test.ts` must stay green unchanged (mock default `kind='unknown'`, `lookupMode='ok'`, no `lookupMinAgeSec` ⇒ same behaviour as today).

### G3 — Cash Journal (FBCJ) adapter (WP-C)

- `packages/core/src/sap/cashjournal.ts`, class `CashJournalSapAdapter implements SapPostingAdapter`, `name = 'cashjournal'`, selected by `SAP_ADAPTER=cashjournal` (wire in `adapters.ts`, export from `index.ts`). It consumes the same `JournalEntryDoc`, so `buildJournalEntry`, the outbox, retries, the monitor and G2 all apply unchanged. `SapPosting.adapter` is stored at payment time, so switching the env affects new postings only.
- **Mapping per line** — `toCashJournalDoc(doc, cfg)`: header `{ companyCode, cashJournal, currency, postingDate, documentDate, reference (XBLNR, ≤ 16), headerText }`; one cash-journal item per **debit** item `{ itemNo, transaction: SAP_CJ_TRANSACTION, amount (payment, positive, 2 decimals), glAccount, costCenter?, assignment, text }`. The single credit item is not sent (the cash journal's own GL account is the offset): it must exist exactly once and equal the sum of the debits, and its `glAccount` selects the cash journal number: `SAP_CJ_BY_CASH_GL[glAccount] ?? SAP_CJ_NUMBER`; none ⇒ `SapRejectedError('no cash journal number configured for cash GL <x>')`.
- **Two transports** (`SAP_CJ_MODE`):
  - `soap` — POST to `SAP_CJ_URL` an RFC-style SOAP envelope for `BAPI_CASHJOURNALDOC_CREATE` (namespace `urn:sap-com:document:sap:rfc:functions`): `HEADER`, `ITEMS/item`, `TESTRUN`; answer parsed for the cash journal document number, fiscal year, company code and `RETURN` messages (type `E`/`A` ⇒ `SapRejectedError`; network/timeout/5xx/unreadable ⇒ `SapOutcomeUnknownError`; not configured ⇒ `SapRejectedError`, no network). **Every element name lives in one exported constant `CJ_ELEMENTS`** (`COMP_CODE`, `CAJO_NUMBER`, `CURRENCY`, `DOC_DATE`, `PSTNG_DATE`, `REF_DOC_NO`, `TEXT`, item `TRANSACT_NUMBER`, `P_PAYMENTS`, `GL_ACCOUNT`, `COSTCENTER`, `ALLOC_NMBR`, `POSITION_TEXT`, response `CASH_JOURNAL_DOC_NO`, `FISCAL_YEAR`, `COMPANY_CODE`) with `// TODO(SAP): unverified` so a correction from the SAP team is a one-place edit. Functions: `buildCashJournalEnvelope(cj)`, `parseCashJournalResponse(xml)` (reuse `xmlEscape` and the tag helpers of `s4hana.ts`; export them there).
  - `file` — one CSV per posting at `sap-export-cj/<postingDate>/<reference>.csv` (header columns repeated on each item row) for a manual or batch upload, document number `CJFILE-<seq 6 digits>`, idempotent by reference exactly like `FileSapAdapter` (own counter and index keys under `sap-export-cj/`), `exportFileKey` returned in `raw`.
- `findByReference`: `file` ⇒ the index (like `FileSapAdapter`); `soap` ⇒ `lookupByReference` when `SAP_S4_LOOKUP_URL` is set (a cash journal document creates an FI document carrying the same reference), else `SapLookupUnavailableError(transient=false)` ⇒ G2 manual check. `lookupMinAgeSec` as in G2 for `soap`.
- The old `CashJournalAdapter` interface in `types.ts` is removed (unused placeholder).

#### G3 tests to write
| File | Cases | Developer command |
|---|---|---|
| `packages/core/src/sap/cashjournal.test.ts` + fixtures `fixtures/{cj-confirmation.xml,cj-error.xml,cj-fault.xml}` | mapping: one item per debit with GL, cost center, amount, text, assignment; number from `SAP_CJ_BY_CASH_GL`, fallback `SAP_CJ_NUMBER`, none ⇒ `SapRejectedError`; two credits or an unbalanced document ⇒ error; envelope contains the function element, header values, N items, positive 2-decimal amounts, escaped Arabic text, `TESTRUN`; parse: confirmation ⇒ number/year/company, `RETURN` type E ⇒ definitive failure, SOAP fault ⇒ definitive, garbage ⇒ not definitive; soap adapter with injected `fetch`: one POST with Basic auth, error ⇒ `SapRejectedError`, network ⇒ `SapOutcomeUnknownError`, no URL ⇒ rejected without network; `findByReference` without lookup URL ⇒ `Unavailable(false)`, with it ⇒ calls the OData URL; file mode (tmp `createLocalStorage`): CSV rows = debit lines, `CJFILE-000001`, second post of the same reference returns the same number and writes nothing new, `findByReference` returns it / `null`; `getSapAdapter('cashjournal')` builds from env (`getConfig`/`resetConfigCache`, `registerSapAdapter('cashjournal', null)`) | `pnpm --filter @dms/core exec vitest run src/sap/cashjournal.test.ts` |

### G4 — Load data + bench (WP-F)

- **Where the code lives:** root `scripts/` cannot resolve `@dms/*` or `@prisma/client`, so the implementations are `packages/core/scripts/load-data.ts` and `packages/core/scripts/load-bench.ts` (type-checked with `@dms/core`), and root `scripts/load-data.ts` / `scripts/load-bench.ts` are thin launchers that `spawnSync('pnpm', ['--filter', '@dms/core', 'exec', 'tsx', 'scripts/load-data.ts', ...process.argv.slice(2)], { stdio: 'inherit', shell: true })` and exit with the child's code. Pure generators live in `packages/core/src/loadtest/index.ts` (unit-tested).
- **Target database:** `dms_load`, created with `CREATE DATABASE "dms_load" TEMPLATE dms_template` through `pg` + `adminUrl()` from `@dms/db` (`--reset` drops it first, `WITH (FORCE)`). The scripts refuse any database whose name does not start with `dms_load` (so `dms` and `dms_template` can never be touched) and print the target before writing.
- `load-data.ts` flags: `--requests 50000 --months 18 --seed 42 --db dms_load --reset`. Deterministic (seeded PRNG, ids `ld_<base36 counter>`). Reuses the seeded request type, ACTIVE workflow version and its steps, template version, categories, GL accounts, roles and users; adds about 300 drivers, 250 vehicles with assignments, and extra cost centers. Inserts with Prisma `createMany` in chunks of 2,000–5,000 rows (column names are then checked by `tsc`; no hand-written INSERT SQL), prints progress and elapsed time per table, ends with `ANALYZE`, then prints row counts and **fails (exit 1) when requests < 50,000 or attachments < 200,000**.
- Distribution: request dates spread over the months with weekday weighting and growth toward the present; drivers Zipf-like (a few very active); statuses about 78% PAID, 14% in review (more at the early steps, so supervisor and accountant queues are the big ones), 2% awaiting correction (with an open `CorrectionRequest`), 5% rejected, 1% cancelled — use the real enum values; 1–6 lines per request (mean about 3) with weighted categories (diesel and tolls dominate) and log-normal amounts per category; `ExpenseRequest`/`ExpenseLine` snapshots; step instances per request following the workflow (approved with rising `actedAt`, the current stage ACTIVE, later PENDING, conditional steps NOT_APPLICABLE when no line needs them); events (submitted, one per acted step, paid/rejected); **attachment metadata only** — 1–3 per line (≥ 200k rows), unique fake `storageKey` (`attachments/load/<n>.jpg`), random sha256 and random 64-bit `phash`, about 0.5% exact duplicates across requests, no files written; `SapPosting` for PAID (about 95% POSTED, 3% FAILED, 2% PENDING) with a small valid payload; `RequestNumberCounter` set to the per-year maximum; about 100k in-app notifications (30% unread); about 20k jobs (DONE, a few PENDING/FAILED).
- `load-bench.ts` (same `--db` guard; flags `--runs 10 --with-candidates --out docs/load`): Prisma client with query events; for each scenario one warm-up + N runs ⇒ min / p50 / p95 / max ms. Scenarios call the **real functions**: `listQueue` + `queueCounters` for a supervisor, an accountant and the GM (default tab, with a number search, with a vehicle filter, page 1 and a deep page); `listRequests` (no filter, status, date range, `q` number search, submitter, vehicle, page 200); `getRequestDetail`; `queryReport` (one month grouped by category, 18 months grouped by cost center, tolls only) + the first page of rows; `dashboardSummary` (30 days, 12 months) and `listDelayed`; the SAP monitor list query (same `findMany` + `count` as the controller, FAILED filter); notifications unread count; the near-duplicate SQL of `flagDuplicates` for one attachment; the job-claim SELECT. Every distinct SELECT captured from the query events is re-run as `EXPLAIN (ANALYZE, BUFFERS)` with its captured parameters; an EXPLAIN that fails is recorded with its error and the bench continues. Output: console table plus `docs/load/bench-<timestamp>.md` and `.json` (timings, full plans, flags `SLOW` = p95 above target, `SEQ_SCAN_BIG` = sequential scan on a table with more than 50k rows).
- Targets (p95, 50k requests, warm cache): queue page and counters ≤ 300 ms; request list filters ≤ 500 ms; request detail ≤ 200 ms; report page + totals ≤ 1,500 ms; dashboard ≤ 2,000 ms.
- **Indexes:** WP-F reads `engine/queries.ts`, `reports/query.ts`, `reports/dashboard.ts` and the existing indexes, and writes `docs/load/candidate-indexes.sql` (`CREATE INDEX IF NOT EXISTS …`, one comment per index naming the scenario it serves) plus `docs/LOAD_TEST.md` (how to run, how to read the output, the candidates and their reasoning). Typical candidates to evaluate, not to assume: a partial index on `request_step_instances ("roleId", status)` for the open statuses; `requests ("submittedAt" DESC, id)` for the default sort; `request_lines ("categoryId")`; `expense_requests ("vehicleId")` / `("costCenterId")`; a partial unread index on `notifications`; trigram search on `requests.number` (needs the `pg_trgm` extension ⇒ owner decision). `--with-candidates` applies the file to `dms_load` only, re-runs and prints a before/after table.
- **No migration is written in the execution hour.** Rule for the follow-up: an index is promoted only when the developer's bench shows a scenario above target or a `SEQ_SCAN_BIG` in a hot path **and** the candidate improves its p95 at least 2×. To promote: copy the chosen statements (without `IF NOT EXISTS` is fine) to `packages/db/prisma/migrations/0003_phase2_indexes/migration.sql`, add the same lines to the comment block at the bottom of `schema.prisma` (as `0002` did), run `pnpm db:migrate` (applies to `dms` and rebuilds `dms_template`), commit.

#### G4 tests to write
| File | Cases | Developer command |
|---|---|---|
| `packages/core/src/loadtest/loadtest.test.ts` | same seed ⇒ same sequence, different seed ⇒ different; status plan for 50,000 sums to 50,000 and each share is within 1 point of the target; dates fall inside the window and never in the future; mean lines per request in [2.5, 3.5]; the attachment plan for 50,000 requests yields ≥ 200,000; request numbers are unique, formatted `<PREFIX>-YY-NNNNNN`, and the per-year counters equal the maxima; the database-name guard accepts `dms_load`, `dms_load_2` and rejects `dms`, `dms_template`, `postgres` | `pnpm --filter @dms/core exec vitest run src/loadtest` |
| run by the developer, not tests | `pnpm load:data -- --reset` then `pnpm load:bench`, then `pnpm load:bench -- --with-candidates` | see `docs/LOAD_TEST.md` |

### G5a — `/metrics` in Prometheus text (WP-D)

- `packages/core/src/metrics/index.ts`: a small registry — `createRegistry()` → `counter(name, help, labelNames)`, `gauge(…)`, `histogram(name, help, labelNames, buckets)`, `render(): string` (text format 0.0.4: `# HELP`, `# TYPE`, label escaping of `\`, `"`, newline; histogram `_bucket{le=…}` cumulative with `+Inf`, `_sum`, `_count`; stable order). `collectDbMetrics(prisma): Promise<string>` renders gauges from grouped counts, cached in memory for 10 s:
  `dms_requests{status}` · `dms_step_instances_active{role}` (ACTIVE only, role code) · `dms_jobs{queue,status}` · `dms_jobs_failed{type}` · `dms_jobs_oldest_pending_age_seconds{queue}` · `dms_sap_postings{status}` · `dms_sap_postings_manual_check` · `dms_notifications{channel,status}` · `dms_db_up`.
- API (`apps/api/src/health/**`): `HttpMetricsMiddleware` registered from `HealthModule.configure()` for all routes (Nest 11 / Express 5 wildcard: use the form the installed version accepts, e.g. `forRoutes({ path: '{*splat}', method: RequestMethod.ALL })`); on `res.finish` it observes `dms_http_request_duration_seconds{method,route,status}` (buckets 0.01 … 10 s) and `dms_http_requests_total{method,route,status}`; `route` = the matched route pattern (`req.baseUrl + req.route.path`, e.g. `/api/v1/requests/:id`), `unmatched` when there is none — never the raw URL. The registry is a provider created per app instance (no module-level singleton, so several test apps do not clash).
- `GET /api/v1/metrics` stays `@Public()` at the same path, now `Content-Type: text/plain; version=0.0.4; charset=utf-8`: process gauges (`process_uptime_seconds`, `process_resident_memory_bytes`, `nodejs_heap_used_bytes`), the HTTP metrics, `collectDbMetrics`. Access: when `METRICS_TOKEN` is set, `Authorization: Bearer <token>` is required (constant-time compare, else 401); when it is not set and `NODE_ENV=production` ⇒ 403; otherwise open (dev). A database error gives `dms_db_up 0` and the rest, not a 500.
- The worker has no HTTP port; queue depth and failures come from the tables above.

| Test file | Cases | Developer command |
|---|---|---|
| `packages/core/src/metrics/metrics.test.ts` (`setupTestDb('p2-metrics')` for the DB part) | counter with labels; gauge set/overwrite; histogram cumulative buckets, `+Inf`, `_sum`, `_count`; label escaping; one HELP/TYPE per metric; deterministic output; `collectDbMetrics` after inserting known jobs/postings/requests contains e.g. `dms_jobs{queue="default",status="PENDING"} 2` and the manual-check gauge; a second call within 10 s is served from the cache (no new query: spy on `$queryRaw`/`groupBy`) | `pnpm --filter @dms/core exec vitest run src/metrics` |
| `apps/api/test/health/metrics.test.ts` (`createTestApp('p2-metrics-api')`) | 200 with the text content type; body has `dms_requests`, `dms_jobs`, `dms_sap_postings`, `dms_http_request_duration_seconds_bucket`; after two `GET /health` the counter for route `/api/v1/health` is ≥ 2; a call to `/api/v1/request-types/<id>` is labelled with `:id`, not the id; with `METRICS_TOKEN` set: 401 without, 200 with the bearer; `NODE_ENV=production` and no token ⇒ 403 (set env + `resetConfigCache()` and restore in `afterEach`) | `pnpm --filter @dms/api exec vitest run test/health/metrics.test.ts` |

### G5b — E-mail notifications over SMTP (WP-D)

- `packages/core/src/email/index.ts`: `isEmailEnabled()` (`SMTP_HOST` and `SMTP_FROM` set); `getMailer()` (lazy nodemailer transport from `SMTP_*`; `auth` only when a user is set); `registerMailer(m | null)` test hook; `renderNotificationEmail(n, { webUrl, locale })` → `{ subject, text, html }` (subject = title, body, link `<WEB_PUBLIC_URL>/requests/<requestId>` when there is one; HTML `dir="rtl"` for Arabic, every value escaped); `sendNotificationEmail(prisma, notificationId)` — idempotent: `SENT`/`SKIPPED` ⇒ no-op; disabled, or the user has no e-mail or is inactive ⇒ `SKIPPED` with the reason; send ⇒ `SENT` + `sentAt`; permanent SMTP error (response code 5xx) ⇒ `FAILED` + error, no throw; anything else ⇒ throw (job backoff, the row stays `PENDING`).
- Fan-out in `packages/core/src/notifications/index.ts`, inside `notifyUsers` after the in-app rows and **on the same `db`/transaction** (outbox): when `isEmailEnabled()` and the type passes `EMAIL_NOTIFY_TYPES`, for each recipient that is active and has an e-mail create `Notification { channel: 'EMAIL', status: 'PENDING', … same texts }` and `enqueueJob({ type: 'email.send', payload: { notificationId }, dedupeKey: 'email.send:<id>' })`. When `TELEGRAM_NOTIFY_USERS` and the user has `telegramChatId`, also create a `TELEGRAM` row for `recipientUserId` + `telegram.send` job on queue `telegram` (delivery is WP-E's handler change; until then the row ends `SKIPPED`). Disabled e-mail ⇒ zero extra rows and jobs. `notifyRole` and the SLA/engine/fleet call sites already go through `notifyUsers`; WP-C moves the SAP failure notification onto it. The web bell is unaffected (it filters `channel = 'IN_APP'`).
- Worker `apps/worker/src/handlers.ts`: `email.send` ⇒ `sendNotificationEmail(prisma, payload.notificationId)`; missing id ⇒ fatal error like the other handlers.

| Test file | Cases | Developer command |
|---|---|---|
| `packages/core/src/email/email.test.ts` (`setupTestDb('p2-email')`; env set through `process.env` + `resetConfigCache()`; fake mailer via `registerMailer`) | disabled ⇒ `notifyUsers` creates only in-app rows and no job; enabled ⇒ one EMAIL row + one `email.send` job per active user with an e-mail, none for users without e-mail or inactive; rows roll back with the surrounding transaction; `EMAIL_NOTIFY_TYPES` filters; render: subject, escaped HTML (`<script>` in the body is escaped), RTL, request link; send ⇒ `SENT`, second call does not send again; no e-mail ⇒ `SKIPPED`; transient error ⇒ throws and stays `PENDING`; error with `responseCode: 550` ⇒ `FAILED`, no throw; transport options built from env (port, secure, auth present only with a user) | `pnpm --filter @dms/core exec vitest run src/email` |
| `apps/worker/test/email.test.ts` (mirror `worker.test.ts`) | `runDueJobs` with `createHandlers()` and a fake mailer delivers a queued EMAIL notification ⇒ `SENT`, job `DONE`; payload without `notificationId` ⇒ job `FAILED` at once (fatal) | `pnpm --filter @dms/worker exec vitest run test/email.test.ts` |

### G5c — S3 storage driver (WP-D)

- `packages/core/src/storage/s3.ts`: `createS3Storage(cfg, client?)` implementing `StorageAdapter` with AWS SDK v3 (`S3Client({ region, endpoint, forcePathStyle, credentials })`; works with MinIO and AWS). Object key = `S3_PREFIX + key`; `assertValidKey` first, before any client call.
  - `put`: Buffer ⇒ hash + `PutObject` (`ContentType`, `ContentLength`). Readable ⇒ spool to a temp file under `os.tmpdir()` while hashing and counting, then `PutObject` with a file stream and the known `ContentLength`, delete the temp file in `finally` (no multipart, no extra dependency; single PUT limit 5 GB). `ifNotExists` ⇒ `HeadObject` first, `CONFLICT` when present (small race, acceptable: keys are unique ids and the final PDF is also guarded by its database row).
  - `get` (`GetObject` → bytes; missing ⇒ `NOT_FOUND`), `stream` (returns a `PassThrough` at once and pipes the body into it; errors destroy the stream), `exists` / `stat` (`HeadObject`), `delete` (`DeleteObject`, idempotent).
  - `presignGetUrl(key, { ttlSec, download?, fileName?, contentType? })` via `getSignedUrl(GetObjectCommand …)` with `ResponseContentDisposition` / `ResponseContentType`.
- `storage/index.ts`: `StorageAdapter` gets optional `presignGetUrl?`; `getStorage()` builds the S3 adapter when `STORAGE_DRIVER=s3` (missing bucket or keys ⇒ `DomainError('VALIDATION', …)`), cached; new `registerStorage(adapter | null)` test hook and `resetStorageCache()`.
- **Signed URLs:** the application's HMAC links (`/api/v1/files/...`) stay the only links handed to browsers, so permissions do not change. `apps/api/src/files/files.controller.ts`: after the signature check, when `S3_PRESIGN_REDIRECT=true` and the adapter has `presignGetUrl` ⇒ `302` to a presigned S3 URL (TTL = min(remaining, 300 s), content type from the existing map, attachment disposition when `d=1`); default `false` ⇒ stream through the API as today (keeps `nosniff`/CSP headers and works when MinIO is not reachable from browsers).

| Test file | Cases | Developer command |
|---|---|---|
| `packages/core/src/storage/s3.test.ts` (in-memory fake client object `{ send(cmd) }` switching on `cmd.constructor.name`; **no network**) | put Buffer ⇒ size + sha256, command has bucket, prefixed key, content type, length; put Readable ⇒ same sha256 as the Buffer, temp file removed; `ifNotExists` on an existing key ⇒ `CONFLICT` and no `PutObject`; get/stat/exists/delete; missing ⇒ `NOT_FOUND`, `exists` false; bad key rejected before any client call; `stream()` yields the bytes and emits an error for a missing key; `presignGetUrl` with a real `S3Client` and dummy credentials (pure signing) contains `X-Amz-Signature`, `X-Amz-Expires=120`, path-style bucket/key and `response-content-disposition` for downloads; `getStorage()` with `STORAGE_DRIVER=s3` and no bucket ⇒ `VALIDATION`; `local` path unchanged | `pnpm --filter @dms/core exec vitest run src/storage` |
| `apps/api/test/files/s3-redirect.test.ts` | with `registerStorage(fake with presignGetUrl)` and `S3_PRESIGN_REDIRECT=true`: valid link ⇒ 302 with the fake `Location`; tampered signature ⇒ 403; flag `false` ⇒ 200 stream | `pnpm --filter @dms/api exec vitest run test/files/s3-redirect.test.ts` |

### G5d — Telegram relink (WP-E)

**Chosen semantics: a one-time link code that the person sends to the bot as `/start <code>`** (one tap through `https://t.me/<BOT_USERNAME>?start=<code>`). Reasons: it works for drivers and for web users (users have no phone onboarding at all), it covers a driver whose Telegram phone differs from the registered one, and it needs no schema change. The contact-share onboarding stays as the normal first-time path for drivers. Issuing a code is an administrative act of vouching for identity, so it is permission-gated and audit-logged with the issuing user.

- `packages/core/src/telegram-link/index.ts`:
  - `createLinkCode({ kind: 'S' | 'U', id, updatedAt }, o?: { ttlSec?, now? }) → { code, expiresAt }`; code = `<kind>_<id>_<exp base36>_<sig>`, `sig` = first 20 hex chars of `HMAC-SHA256(key, "tglink\n<kind>\n<id>\n<exp>\n<updatedAt ms>")`, `key` = `HMAC-SHA256(JWT_SECRET, "telegram-link")`. Only `[A-Za-z0-9_]`, must be ≤ 64 chars (Telegram start-parameter limit) else `DomainError('VALIDATION')`.
  - `parseLinkCode(code)`, `verifyLinkCode(code, row: { id; updatedAt }, now?) → 'OK' | 'EXPIRED' | 'INVALID'` (constant-time compare), `telegramDeepLink(code) → string | null` (needs `BOT_USERNAME`).
  - **One-time by construction:** the signature covers the row's `updatedAt`. Issuing a code first writes the row (unlink, or a touch), so older codes die; using the code writes the row (link), so it cannot be used twice; any later edit of the person also cancels an unused code. No table needed.
- API — new `apps/api/src/platform/telegram-link.controller.ts`, registered in `platform.module.ts`:
  - `POST /submitters/:id/telegram-link-code` (`submitters.telegram_link`): 404; inactive ⇒ `INVALID_STATE`; in one transaction clear `telegramUserId/ChatId/Username/LinkedAt` when linked, otherwise touch `updatedAt`; create the code from the fresh row; audit `submitter.telegram_link_code` (`before` = old Telegram id/username, `after` = `{ expiresAt, wasLinked }`; **never store the code**). Returns `TelegramLinkCodeResponse` (`command = '/start <code>'`).
  - `POST /users/:id/telegram-link-code` (`users.manage`): same on `User`; audit `user.telegram_link_code`.
  - `POST /users/:id/telegram-unlink` (`users.manage`): `INVALID_STATE` when not linked; audit `user.telegram_unlink`. (`POST /submitters/:id/telegram-unlink` already exists and is unchanged.)
- Bot (`apps/bot/src/flow.ts`, `messages.ts`, `jobs.ts`):
  - At the top of `handleInput`, text matching `/^\/start\s+([A-Za-z0-9_]{10,64})$/` goes to `handleLinkCode`. Kind `S`: load the submitter, `verifyLinkCode` (`INVALID`/`EXPIRED` ⇒ a clear Arabic message, then the normal welcome with the contact button), refuse when the submitter is inactive, when this Telegram account is already linked to another active submitter, or when the submitter is linked to another account; then set `telegramUserId`, `telegramChatId`, `telegramUsername`, `telegramLinkedAt`, audit `bot.linked_by_code`, reset the session (`submitterId`, `IDLE`, no draft/correction) and show the menu. Kind `U`: same checks on `User`, set `telegramUserId`/`telegramChatId`, audit `bot.user_linked_by_code`, reply "linked, you will receive approval notifications here". A code that does not parse falls through to the existing `/start` behaviour.
  - A Telegram account linked only to a web user that sends anything else gets one short "notifications only" message instead of the driver onboarding.
  - `telegram.send` (stretch, last): when the notification has `recipientUserId`, send to the user's chat (`bodyAr`, plus the request link when `requestId` is set); everything else unchanged.
- Web: `apps/web/src/components/TelegramLinkDialog.tsx` (shows the command with a copy button, the deep link when present, the expiry time, and a note that the old link was removed); drivers page — row action "Link / relink Telegram" (`submitters.telegram_link`) beside the existing unlink; users page — in the edit modal "Link / relink Telegram" and "Unlink" (`users.manage`), replacing the note that says linking is only on the drivers screen. Keys in `i18n/{ar,en}/{master,admin}.ts`.

| Test file | Cases | Developer command |
|---|---|---|
| `packages/core/src/telegram-link/telegram-link.test.ts` | code ≤ 64 chars and charset; verify `OK`; expired ⇒ `EXPIRED`; changed signature, id, kind or expiry ⇒ `INVALID`; different `updatedAt` ⇒ `INVALID`; garbage ⇒ `parseLinkCode` null; deep link with and without `BOT_USERNAME`; over-long id ⇒ `VALIDATION` | `pnpm --filter @dms/core exec vitest run src/telegram-link` |
| `apps/api/test/platform/telegram-link.test.ts` (`createTestApp('p2-tglink')`) | 401/403 without the permission (both endpoints); driver code: 200 with `code`, `command`, `expiresAt`, `wasLinked=false`; on a linked driver the link is cleared and `wasLinked=true`; a second issue makes the first code `INVALID` against the stored row; the audit row does not contain the code; inactive ⇒ 409; user link code and user unlink (409 when not linked) | `pnpm --filter @dms/api exec vitest run test/platform/telegram-link.test.ts` |
| `apps/bot/test/link-code.test.ts` (`setup('p2-linkcode')`, harness as in `onboarding.test.ts`) | `/start <code>` links a seeded driver without sharing a contact, shows the menu, audit `bot.linked_by_code`; the same code from a second Telegram account is refused; expired code (harness clock) refused; garbage after `/start` shows the normal welcome with the contact button; an account already linked to driver A cannot use driver B's code; contact-share onboarding still links (regression); user code sets `User.telegramUserId` and a later plain message gets the "notifications only" text; (stretch) `telegram.send` for a user notification calls `sendMessage` with the user's chat id | `pnpm --filter @dms/bot exec vitest run test/link-code.test.ts` |

---

## 6. Work packages (six, parallel, T+0:10 → T+0:48)

| WP | Model | Scope | Owns (only it edits) | Needs |
|---|---|---|---|---|
| **WP-A Config API** | Sonnet | G1 API + shared-contract tests | `apps/api/src/workflow/config.controller.ts`; `packages/shared/src/contracts/workflow.ts`; `packages/shared/src/contracts/workflow.test.ts`; `apps/api/test/workflow/config-phase2.test.ts` | P0b |
| **WP-B Web request types** | Sonnet | G1 Web | `apps/web/src/app/(app)/admin/request-types/**`; `apps/web/src/features/request-types/**`; `apps/web/src/features/templates/**`; `apps/web/src/app/(app)/templates/**`; `apps/web/src/i18n/{ar,en}/{reqtypes,templates}.ts`; `e2e/tests/request-types.spec.ts` | P0b; codes against §4/§5 G1 contract, not against WP-A's finished code |
| **WP-C SAP** | Sonnet | G2 + G3 | `packages/core/src/sap/**`; `apps/api/src/integrations/sap.controller.ts`; `packages/shared/src/contracts/integrations.ts`; `apps/api/test/integrations/sap-resolve.test.ts`; `apps/web/src/features/sap/**`; `apps/web/src/i18n/{ar,en}/sap.ts` | P0b; `notifyUsers` signature (stable) |
| **WP-D Ops** | Sonnet | G5a + G5b + G5c | `packages/core/src/{metrics,email,storage,notifications}/**`; `apps/api/src/{health,files}/**`; `apps/api/test/{health,files}/**` (new files only); `apps/worker/src/handlers.ts`; `apps/worker/test/email.test.ts` | P0a, P0b |
| **WP-E Telegram relink** | Sonnet | G5d | `packages/core/src/telegram-link/**`; `apps/api/src/platform/telegram-link.controller.ts`; `apps/api/src/platform/platform.module.ts`; `apps/api/test/platform/telegram-link.test.ts`; `apps/bot/src/{flow,messages,jobs}.ts`; `apps/bot/test/link-code.test.ts`; `apps/web/src/components/TelegramLinkDialog.tsx`; `apps/web/src/app/(app)/master/drivers/page.tsx`; `apps/web/src/app/(app)/admin/users/page.tsx`; `apps/web/src/i18n/{ar,en}/{master,admin}.ts` | P0b |
| **WP-F Load test** | Sonnet | G4 | `packages/core/scripts/load-*.ts`; `packages/core/src/loadtest/**`; `scripts/load-data.ts`; `scripts/load-bench.ts`; `docs/LOAD_TEST.md`; `docs/load/**` | P0a (`pg`) |

Files nobody edits after P0: every `package.json`, `pnpm-lock.yaml`, `packages/db/**`, `packages/core/src/config/**`, `packages/shared/src/{constants,schemas,utils,types}/**`, `packages/shared/src/contracts/{platform,reports}.ts`, `apps/api/src/{main,app.module,configure-app}.ts`, `apps/web/src/lib/**`, `apps/web/src/components/{ui,crud,layout}/**`, `apps/web/src/i18n/index.ts`, `apps/web/src/i18n/{ar,en}/common.ts`, `apps/web/src/features/types.ts` (import new types from `@dms/shared` directly), existing test files. `docs/CONTRACT_NOTES.md` is append-only for everyone.

### Timeline
| Time | Who | What |
|---|---|---|
| 0:00–0:10 | P0a (Haiku) ∥ P0b (Sonnet) | dependencies; contracts, config, web hooks; both committed |
| 0:10–0:48 | WP-A … WP-F (6 × Sonnet) | implementation + tests written + own `tsc`/`eslint`; commit at least at 0:30 and at the end |
| 0:48–0:54 | Orchestrator | static gate: `pnpm typecheck`, `pnpm lint` (nothing else). Errors go back to the owning agent, or to one Sonnet fixer that may touch any Phase 2 file |
| 0:48–0:60 | Final step (Haiku) | docs (§8), starting from the WP reports |

Priority if time runs short (drop from the bottom): G1 (API + web) → G2 → G5d → G5a/G5b → G5c → G3 soap transport (file mode + mapping must still ship) → G4 `--with-candidates` → e2e spec → `telegram.send` for users.

## 7. Briefs (paste as is; each agent also reads §0 and its design section)

**Common header for all six:**
> You implement one work package of `docs/PLAN_PHASE2.md` in the DMS monorepo at `c:\Users\Administrator\Downloads\new project\Dooo`. Read `CLAUDE.md`, then `docs/PLAN_PHASE2.md` §0 (hard rules), §3, and the design section named below; read the existing code you extend before writing. **Write the tests listed for your section but never run them**: the only commands you may run are `pnpm --filter <pkg> exec tsc --noEmit`, `pnpm exec eslint <your files>`, and read-only git/grep. No vitest, no playwright, no servers, no builds, no database migrations or seeds, no `pnpm add`. Edit only the paths you own (§6). Commit locally with `git add -- <your paths>` and `git commit -m "P2-<WP>: …"` (no push, no remote). Finish with the report described in §0.9.

**WP-A — Config API (Sonnet).** Section: §4 item 2 and §5 "G1 API". Extend `apps/api/src/workflow/config.controller.ts`: request-type create with default/cloned template and optional workflow clone, extended DTOs (`workflow`, `templates`, `defaultTemplateId`, `categoryCount`, `requestCount`, `readiness`), `moduleKey` guard, `allowedMimeTypes`, duplicate-category 409, new `POST /templates` and `PATCH /templates/:id`. Keep every existing route and response field. You own `packages/shared/src/contracts/workflow.ts` after P0b: refine validation there if needed, but do not rename or remove anything P0b exported (WP-B compiles against it). Write `packages/shared/src/contracts/workflow.test.ts` and `apps/api/test/workflow/config-phase2.test.ts` with the cases in the G1 test table (mirror the setup of `apps/api/test/workflow/workflow.test.ts`; find seeded usernames/roles in `packages/db/prisma/seed.ts`). For case 12 read `packages/core/src/engine/submit.ts` and `POST /requests` in `requests.controller.ts` to build a valid body (the user needs `requests.create`; `lines` needs at least one entry); a module-less type is submittable today (`getModule(null)` is skipped). If reading shows a blocker, do not change the engine: keep the test and report it. Static checks: `tsc` for `@dms/shared` and `@dms/api`.

**WP-B — Web request types + new template (Sonnet).** Section: §5 "G1 Web" (and the endpoint table of "G1 API" as your contract; types come from `@dms/shared`). Read `apps/web/src/components/README.md`, `app/(app)/master/expense-types/page.tsx` (field editor to imitate), `features/workflows/WorkflowsListPage.tsx` and `features/templates/*`. Build the list and the tabbed editor under `/admin/request-types`, `FieldDefsEditor`, `CategoryModal`, the pure `model.ts`, `NewTemplateDialog` and the "New template" button; add the `data-testid`s listed; fill `i18n/{ar,en}/reqtypes.ts` and add keys to `templates.ts` in both languages. The nav item and the `reqtypes` namespace already exist (P0b). Write `features/request-types/model.test.ts` and `e2e/tests/request-types.spec.ts` (copy login and helpers from `e2e/tests/web-ui.spec.ts`). Static check: `pnpm --filter @dms/web exec tsc --noEmit` (fix only your files) and eslint on your files. Do not run `next build`.

**WP-C — SAP: no double post + Cash Journal (Sonnet).** Sections: §5 G2 and G3. Work in this order and commit after each: (1) `errors.ts`, `types.ts`, `mock.ts`, the new `process.ts` algorithm, `resolveSapPosting`; (2) `odata-lookup.ts` + `s4hana.ts` classification and `findByReference`; (3) `POST /sap/postings/:id/resolve`, `manualCheckRequired`, the `manualCheck` filter; (4) `cashjournal.ts` (mapping + file mode first, then the soap transport) and its wiring; (5) the SAP monitor badge and resolve dialog in `apps/web/src/features/sap/**`. Hard requirement: `packages/core/src/sap/sap.test.ts` must keep passing unchanged — reason about every existing case against your new algorithm. Use `notifyUsers` from `../notifications` for SAP failure notifications. Mark every unverified SAP element name with `// TODO(SAP)` and keep cash-journal names in `CJ_ELEMENTS`. Write the test files and fixtures of the G2 and G3 tables. Static checks: `tsc` for `@dms/core`, `@dms/api`, `@dms/web`. Report the list of items the SAP team must confirm that you met in code.

**WP-D — Ops: metrics, e-mail, S3 (Sonnet).** Sections: §5 G5a, G5b, G5c. Order: (1) `@dms/core/metrics` + `/metrics` + HTTP middleware; (2) `@dms/core/email`, the fan-out in `notifications/index.ts` (must be a no-op when e-mail is not configured and must not change the in-app rows existing tests count), the worker handler; (3) `storage/s3.ts`, `getStorage()` wiring, `registerStorage`/`resetStorageCache`, the optional redirect in `files.controller.ts`. Check that `apps/api/test/app.test.ts` and the e2e do not rely on the old JSON body of `/metrics` (grep; report if they do, do not edit them). Write the test files of the G5a–c tables; the S3 tests use an in-memory fake client and never the network. Static checks: `tsc` for `@dms/core`, `@dms/api`, `@dms/worker`.

**WP-E — Telegram relink (Sonnet).** Section: §5 G5d. Order: (1) `@dms/core/telegram-link`; (2) `telegram-link.controller.ts` + one line in `platform.module.ts`; (3) bot: `/start <code>` for drivers and users, the "notifications only" reply, messages in `messages.ts`; (4) web dialog and buttons on the drivers and users pages with i18n in both languages; (5) stretch: `telegram.send` for user recipients. Existing bot tests (`onboarding`, `flow`, `session`, `correction`) must keep passing unchanged: plain `/start` and contact sharing behave exactly as before. Never write the code into the audit log or application logs. Write the three test files of the G5d table (mirror `apps/bot/test/onboarding.test.ts` and `apps/api/test/platform/admin.test.ts`). Static checks: `tsc` for `@dms/core`, `@dms/api`, `@dms/bot`, `@dms/web`.

**WP-F — Load data and bench (Sonnet).** Section: §5 G4. Read `packages/db/prisma/schema.prisma` (the models you insert into, every required column), `packages/db/prisma/seed.ts`, `packages/core/scripts/seed-demo.ts`, `packages/core/src/engine/queries.ts`, `packages/core/src/reports/{query,dashboard}.ts`, `packages/db/src/testing.ts`. Write `packages/core/src/loadtest/index.ts` (pure generators + database-name guard) with its test, `packages/core/scripts/load-data.ts`, `packages/core/scripts/load-bench.ts`, the two root launchers, `docs/load/candidate-indexes.sql`, `docs/LOAD_TEST.md`. You cannot run the scripts, so: use Prisma `createMany` with typed inputs for every insert, give every non-null column a value, respect unique constraints (`requests.number`, `clientKey`, `attachments.storageKey`, `(requestId, stepKey)`, one `SapPosting` per request), keep foreign keys valid, and walk through one full generated request by hand against the schema before finishing. The bench must survive any single failing scenario or EXPLAIN. No migration file. Static check: `pnpm --filter @dms/core exec tsc --noEmit` and eslint on your files.

## 8. Final step (T+0:48 → T+0:60)

**Orchestrator gate (static only):** `pnpm typecheck` and `pnpm lint`. Then `git status` must show nothing outside Phase 2 paths.

**Docs agent (Haiku)** — owns `docs/PROGRESS.md`, `README.md`, `docs/SAP_INTEGRATION.md`, `docs/HOW_TO_ADD_NEW_REQUEST_TYPE.md`, `.env.example`, `docs/PHASE2_RUN_TESTS.md` (new). Input: this plan + the six WP reports + the code as committed (docs describe what was built, not what was planned). No code edits, nothing executed except `grep`/`git`.
1. `.env.example`: append every variable of §3 with a one-line comment, grouped (SAP lookup, Cash Journal, metrics, SMTP, S3, Telegram). Integer variables get their default value written out, not an empty string.
2. `docs/PROGRESS.md`: add a "Phase 2" section; move the affected rows to **"Implemented, tests written, NOT yet run"** with the test file names; state plainly that no Phase 2 test has been executed and no load numbers exist yet; keep the SAP caveats (element names unverified, lookup entity to confirm); list the deferrals of §9.
3. `README.md`: new env vars table, `/admin/request-types`, `pnpm load:data` / `pnpm load:bench`, `/metrics` access rule, e-mail and S3 switches, Telegram link codes.
4. `docs/SAP_INTEGRATION.md`: adapters table (s4hana lookup, cashjournal), the outcome/manual-check rules of G2 in plain words, the resolve procedure for accountants (search by reference in SAP, then one of the two buttons), the new env vars, and the confirmation checklist of §10 replacing the old item 9.
5. `docs/HOW_TO_ADD_NEW_REQUEST_TYPE.md`: replace the "API only" steps with the web steps; keep the limitation that generic requests have no web submission form yet.
6. `docs/PHASE2_RUN_TESTS.md`: exactly what the developer runs, in order, and what green looks like:
   - Setup: `pnpm install` (the lockfile changed), `pnpm db:up`, `pnpm db:migrate` (no new migration; it rebuilds `dms_template`, which every test clones).
   - Static: `pnpm lint` (0 errors), `pnpm typecheck` (no output errors).
   - New tests, one command per file exactly as in the tables of §5, each with the expected line `Test Files 1 passed` and `Tests <n> passed` where `<n>` is the number of `it(` in that file (count them with grep and write the number).
   - Everything: `pnpm test` — expected total = 384 + the sum of the new counts, 0 failed; then `pnpm e2e` — expected 8 + the new spec's count passed.
   - Regression files to watch first: `packages/core/src/sap/sap.test.ts`, `apps/bot/test/onboarding.test.ts`, `apps/api/test/platform/authz-matrix.test.ts`, `apps/web/src/features/i18n-keys.test.ts`, `apps/api/test/app.test.ts`.
   - Load: `pnpm load:data -- --reset`, `pnpm load:bench`, `pnpm load:bench -- --with-candidates`; where the reports land; the promotion rule for the index migration (G4).
   - Manual smoke (5 minutes, `pnpm demo --rebuild`): create a request type in the UI, add a field and a category, publish its workflow, create and publish a template; `/sap` shows the resolve dialog on a failed posting; `/api/v1/metrics` returns text; a driver link code works in the bot simulator.
   - "If a test fails": it is a first run of unexecuted tests; report the file and the message, do not weaken the test.
7. Commit `P2-final: docs`.

## 9. Deferred (with reason)

| # | Item | Why |
|---|---|---|
| D1 | **Web form to submit a generic (non-expense) request** (`/requests/new`) and bot support for more than `DRIVER_EXPENSE` | Not in the requested scope and does not fit the hour, but it is the missing half of "HR adds a request type without code": after Phase 2 a type can be fully configured in the UI and is submittable through `POST /requests`, yet no screen submits it. Recommended as the first item of Phase 3 (one Sonnet WP: dynamic form from `headerFields` + categories + attachment upload). |
| D2 | Index migration | Needs measured evidence; agents may not run the bench. Candidates and the promotion rule are delivered (G4). |
| D3 | Real S/4HANA and FBCJ verification | No endpoint or credentials. Code is fixture-tested; names are isolated and marked `TODO(SAP)`. |
| D4 | E-mail for export-ready notifications | `reports/exports.ts` writes notification rows directly; left untouched to keep ownership disjoint. One-line follow-up: call `notifyUsers`. |
| D5 | QR code for the Telegram link, automatic bot username discovery | Extra dependency / needs a live token. The dialog shows the command and the link. |
| D6 | Worker `/metrics` endpoint, job-duration histograms | The worker has no HTTP server; queue depth and failures come from the database gauges. |
| D7 | S3 multipart upload (> 5 GB objects), bucket lifecycle rules, migration of existing local files to S3 | Not needed at this size; a copy script is a follow-up when the owner chooses S3. |
| D8 | Running Docker, real Telegram, real SMTP, real MinIO | Not available on this machine. |

## 10. Risks, and what must be confirmed

### Risks
1. **Nothing in Phase 2 is executed here.** About 150 new test cases meet the code for the first time on the developer's machine; expect a fixing round. Mitigations: tests mirror existing files, `tsc`/`eslint` gate, regression list in `PHASE2_RUN_TESTS.md`.
2. **WP-C is the largest package** (G2 + G3 + API + UI). The order in its brief guarantees that no-double-post lands first; the soap transport of the cash journal is the first thing to drop.
3. **`process.ts` change touches the money path.** Existing `sap.test.ts` is the guard; the manual-check path must return (not throw) or the job would loop.
4. **Notification fan-out sits inside business transactions** (approve, send back, SLA scan). It must be a strict no-op when e-mail is off, and when on it may only do what `notifySubmitter` already does there: plain row inserts plus `enqueueJob` on the same transaction. No network call, no template rendering and no SMTP work inside the transaction; all of that belongs to the `email.send` job.
5. **Web typecheck is shared by three agents** (WP-B, WP-C, WP-E); disjoint files, each fixes only its own.
6. **Playwright spec and load scripts are the least certain artefacts** (selectors, bulk data vs constraints). Both are isolated: a failure there does not affect the product.
7. **`/metrics` format change**: anything scraping the old JSON breaks (nothing in the repo does; WP-D greps to be sure).
8. **Link codes are bearer secrets for 30 minutes.** Mitigated by one-time use, expiry, permission, audit; the code is never logged.

### The SAP team must confirm
1. Journal entry service: the synchronous SOAP service name and URL, and that the envelope element names in `s4hana.ts` are right (still unverified from Phase 1).
2. **Lookup:** which read API is released for the communication user — OData `API_JOURNALENTRYITEMBASIC_SRV` (`A_JournalEntryItemBasic`) or another (for example `API_OPLACCTGDOCITEMCUBE_SRV`); the exact property that carries the header reference XBLNR (`DocumentReferenceID`? note that `ReferenceDocument` is usually the AWKEY reference, not XBLNR) or whether to filter by `AssignmentReference` (ZUONR); whether `Ledger` must be filtered; OData V2 or V4; that the reference (request number, ≤ 16 chars) is stored unchanged and is unique per company code and year.
3. Fiscal year variant: calendar year, or how to derive the fiscal year from the posting date (else the fiscal-year clause is removed from `SAP_S4_LOOKUP_FILTER`).
4. Duplicate-reference check on the SAP side (document type setting / validation) as a second line of defence.
5. How long after a timeout a document can still appear (sets `SAP_S4_LOOKUP_MIN_AGE_SEC`), and whether reversed documents carry `IsReversal`/`IsReversed` in the chosen API.
6. Authorizations of the communication user for both posting and reading.
7. **Cash Journal:** whether treasury payments must go through FBCJ at all; if yes, the interface — RFC/SOAP web service of `BAPI_CASHJOURNALDOC_CREATE` (and whether the service commits, i.e. wraps `BAPI_TRANSACTION_COMMIT`), a custom service, or a file upload — and its URL; the structure and field names (`HEADER`, `ITEMS`, the returned document number and year) against `CJ_ELEMENTS`; the cash journal number per treasury (per cash GL account); the business transaction (number/name) for an expense payment and whether the G/L account may be given per line; whether the document is saved or posted, and which FI reference it carries (for the lookup); tax codes if any; the file layout if the file route is chosen.

### The owner must decide or provide
1. D1 (generic submission form) as the next step — without it a new request type is configurable but not usable from the screens.
2. SMTP server, sender address, and which notification types go by e-mail; users need e-mail addresses in `/admin/users`.
3. Storage: stay on local disk or move to S3/MinIO (bucket, keys, redirect or proxy mode).
4. `METRICS_TOKEN` and who scrapes `/metrics`.
5. Whether issuing Telegram link codes to drivers is allowed for the current holders of `submitters.telegram_link`, and the validity time (default 30 minutes); `BOT_USERNAME` once the bot exists.
6. Performance targets in G4 (accept or adjust) and whether `pg_trgm` may be installed if number search needs it.
