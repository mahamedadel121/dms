# SAP integration

Status on the build machine: the posting pipeline, the journal entry mapping, the file adapter and the idempotency rules are built and tested with the mock and file adapters. The S/4HANA adapter is built but has **never run against a real SAP system**: there are no credentials, no endpoint and no sandbox. Treat the S/4HANA part as a draft until the SAP team confirms the items in the checklist below.

## 1. When a posting is made

1. A request reaches the `treasury` step (kind `PAYMENT`) and the treasury approves it. The request becomes `PAID`.
2. The expense module (`packages/core/src/expense/index.ts`, `onPaid`) stores the treasury on the expense row, creates one `SapPosting` row (status `PENDING`, `idempotencyKey` = request id, `payload` = the journal entry document, `adapter` = the value of `SAP_ADAPTER` at that moment), and enqueues two jobs in the same transaction: `sap.post` (dedupe key `sap.post:<requestId>`) and `pdf.finalize`.
3. The worker (`apps/worker`) runs `sap.post`, which calls `processSapPosting` (`packages/core/src/sap/process.ts`).
4. On success the posting becomes `POSTED` with the SAP document number and fiscal year, and the request gets a `SAP_POSTED` event. On failure the posting becomes `FAILED`, the request stays `PAID`, and the job is retried with backoff.

The SAP monitor (web route `/sap`, API `GET /sap/postings`) lists the postings. Users with `sap.retry` can retry a posting (`POST /sap/postings/:id/retry`).

> **Fixed (WP8):** step 2 enqueues `sap.post` with `{ postingId, trigger: 'AUTO' }` and dedupe key `sap.post:<requestId>`, matching the worker handler. Covered end-to-end by `e2e/tests/full-flow.spec.ts` (treasury pays, worker posts, status `POSTED` via the mock adapter).

## 2. Adapters

Selected by `SAP_ADAPTER` (`mock` by default). `packages/core/src/sap/adapters.ts` builds one instance per name. Each posting remembers the adapter name it was created with, so changing `SAP_ADAPTER` affects new postings only. Restart the worker after changing it.

| Adapter | Use | What it does | Limits |
|---|---|---|---|
| `mock` | Development, tests, demos | Keeps the posted documents in memory (`MockSapAdapter`). Document numbers look like `49100001`. | Lost when the worker restarts. Not a SAP posting. |
| `file` | Until a live SAP connection exists | Writes `sap-export/<posting date>/<request number>.csv` and `.xlsx` under `STORAGE_ROOT`, and returns a document number `FILE-000001`, `FILE-000002`, ... An accountant uploads the files to SAP by hand. | The `FILE-` numbers are not SAP document numbers. The posting is marked `POSTED` on the basis of the file. An index file per reference (`sap-export/index/`) makes repeated runs return the same number. |
| `s4hana` | Live SAP S/4HANA | Sends a SOAP `JournalEntryBulkCreateRequest` to `SAP_S4_URL` with basic auth (`SAP_S4_USER`, `SAP_S4_PASSWORD`) and the `sap-client` header (`SAP_S4_CLIENT`), and parses the confirmation. | Element names, namespaces and severity mapping are **unverified** (TODO in `packages/core/src/sap/s4hana.ts`). `findByReference` returns `null` (TODO), so the idempotency check after an unknown outcome does not work (see section 4). |
| Cash Journal (FBCJ) | Not built | `CashJournalAdapter` in `packages/core/src/sap/types.ts` is an interface only. No adapter and no wiring. | Needs the SAP team's answer (checklist item 9). |

Environment (`.env`, see `.env.example`):

```
SAP_ADAPTER=mock            # mock | file | s4hana
SAP_S4_URL=                 # SOAP endpoint of the journal entry service
SAP_S4_USER=                # communication user
SAP_S4_PASSWORD=            # keep out of git
SAP_S4_CLIENT=              # sent as the sap-client header; empty = none
```

The journal settings live in the database, not in `.env`: setting `sap.config` (web: `/master/sap-settings`; API: `PUT /api/v1/settings/sap.config`, permission `settings.manage`). Defaults are in `packages/shared/src/constants/settings.ts`:

| Field | Default | Meaning |
|---|---|---|
| `companyCode` | `1000` | Used when the treasury has no company code (placeholder) |
| `documentType` | `SA` | Accounting document type of the journal entry (placeholder) |
| `currency` | `EGP` | Currency of every line |
| `debitPostingKey` | `40` | Posting key of the expense lines (debit) |
| `creditPostingKey` | `50` | Posting key of the cash line (credit) |
| `aggregateSameGlCostCenter` | `false` | `true` merges lines with the same GL and cost center into one debit |
| `documentDateMode` | `PAYMENT_DATE` | `SUBMISSION_DATE` uses the submission date as the document date |

Per treasury (master data `/master/treasuries`): `cashGlNumber` (the credit account) and `companyCode` (overrides the default). The seed uses placeholder values: `cashGlNumber` `11001000` and company code `1000`.

## 3. Journal entry mapping

`buildJournalEntry` (`packages/core/src/sap/journal.ts`) builds the document at payment time from the request and its expense line snapshots.

Header:

| JournalEntryDoc field | SAP element (S/4HANA envelope) | Value |
|---|---|---|
| `reference` | `DocumentReferenceID` (intended for XBLNR, the reference document number) | Request number, for example `DE-26-000123` |
| `idempotencyKey` | (not sent) | Request id (used for the posting row) |
| `companyCode` | `CompanyCode` | Treasury company code, else `sap.config.companyCode` |
| `documentType` | `AccountingDocumentType` | `sap.config.documentType` |
| `currency` | `AmountInTransactionCurrency currencyCode` | `EGP` |
| `postingDate` | `PostingDate` | Payment date (paid timestamp) as a Cairo calendar date, `yyyy-MM-dd` |
| `documentDate` | `DocumentDate` | Payment date, or the submission date when `documentDateMode = SUBMISSION_DATE` |
| `headerText` | `DocumentHeaderText` | Driver full name and vehicle number, trimmed to 25 characters |

Items:

| Item | Side | Posting key | GL account | Cost center | Amount | Assignment (ZUONR) | Item text (max 50) |
|---|---|---|---|---|---|---|---|
| One per expense line with amount > 0 (zero-amount lines are left out) | D | `debitPostingKey` (40) | Line snapshot `glNumber` (`ExpenseLine`) | Line snapshot cost center | Line amount, 2 decimals | Request number | Category name (Arabic) + vehicle number |
| The cash credit (one line) | C | `creditPostingKey` (50) | Treasury `cashGlNumber` | none | Sum of all debits | Request number | `Payment <request number>` |

- The entry must balance (sum of debits = credit), otherwise the build fails with `INVALID_STATE` and no posting is created.
- If there is no treasury, or the request has no expense data, the build fails the same way.
- The S/4HANA envelope writes the assignment as `AssignmentReference` and the cost center as `AccountAssignment/CostCenter` (only when the line has one). Credit amounts are sent negative with `DebitCreditCode` `H`; debits use `S`.
- The file adapter writes the same rows to CSV (UTF-8 with BOM, CRLF) and XLSX, with the columns Reference, CompanyCode, DocumentType, Currency, PostingDate, DocumentDate, HeaderText, Item, Side, PostingKey, GLAccount, CostCenter, Amount, Assignment, ItemText.

## 4. Idempotency

`processSapPosting` makes sure one request is posted once:

1. `SapPosting.requestId` is unique (one posting per request), and the job has the dedupe key `sap.post:<requestId>`, so a second `enqueueJob` does nothing.
2. The worker locks the posting row (`SELECT ... FOR UPDATE`). A `POSTED` row is returned unchanged.
3. The row is set to `POSTING` and an attempt row is written (`SapPostingAttempt`). If the row was already `POSTING` before this run, the previous outcome is unknown. In that case the adapter's `findByReference(requestNumber, companyCode)` is asked first, and an existing document is reused without a second post.
4. Otherwise `adapter.post(doc)` is called once. The outcome is written in one transaction (`POSTED`, document number, fiscal year, `SAP_POSTED` event).
5. On error: `FAILED`, the error text in `lastError`, a `SAP_FAILED` event, and the job is rethrown so the runner retries it with backoff (`min(30 s x 2^(attempt-1), 1 h)` with jitter, up to the job's `maxAttempts`). The request stays `PAID`. After `MAX_AUTO_ATTEMPTS` (8) automatic attempts, every active user with `sap.retry` gets an in-app notification.
6. A manual retry resets the same job row (never a second posting row). It is refused while the posting is `POSTED` or `POSTING`.

**Gap for S/4HANA:** step 3 only works if `findByReference` finds the document. The S/4HANA adapter returns `null` today, so after a lost response (SAP booked the document but the worker did not see the answer) a retry would post the same journal entry again. Before go-live, implement `findByReference` (an OData query for the journal entry items by the reference) and test the lost-response case in the SAP sandbox. The mock adapter has `failAfterAccept()` to simulate that case in tests.

## 5. Checklist for the SAP team

Please provide the following. Items marked (placeholder) are values the code uses today that are not confirmed.

1. **Endpoint:** the URL of the journal entry service that the DMS should call (the code assumes the SOAP service `JournalEntryBulkCreateRequest_In`, an A2A service). If another API is preferred (for example an OData journal entry API), say so: the adapter must be changed.
2. **Communication user and arrangement:** the user name, password, and the communication arrangement that allows the service for that user. Confirm the authorization objects needed to create journal entries and to read them back (for the duplicate check).
3. **SAP client** (the number for the `sap-client` header), and whether basic auth is allowed on the endpoint.
4. **Company code(s):** the default code (placeholder `1000`) and the code per treasury, if there is more than one.
5. **Accounting document type** for the expense journal entries (placeholder `SA`), and whether a different type is required for payments.
6. **Cash GL account per treasury** (placeholder `11001000`), which is the credit line.
7. **Expense GL accounts:** `51501800` (maintenance) and `51501500` (spare parts) are real; `51501100` to `51501900` are placeholders in the seed. Give the full list and check each GL exists in the company code.
8. **Posting keys:** debit `40` and credit `50` (defaults). Confirm, or give the keys for the expense and cash lines.
9. **Cash Journal (FBCJ):** whether daily treasury payments must be posted through a SAP cash journal instead of a general ledger journal entry. If yes, the cash journal number per treasury and the GL numbers for cash postings. The code has no cash journal adapter yet.
10. **Cost centers:** the codes (for example `MLF450`, `MLF451`, `DST100`, `ADM200` in the seed) must exist in SAP, and the team must say what to do when a cost center is missing.
11. **Document date rule:** payment date or submission date (`documentDateMode`), and the rule for a request paid in a later period.
12. **Line aggregation:** whether lines with the same GL and cost center should be merged into one debit (`aggregateSameGlCostCenter`).
13. **References and lengths:** confirm that the request number goes in the reference field (XBLNR) and the assignment field (ZUONR), and the maximum lengths of the header text (25 characters in the DMS) and item text (50).
14. **Duplicate check:** the way to find a journal entry by its reference (for example an OData query on the journal entry items). This is needed before go-live (section 4).
15. **Response samples:** a sample of a successful confirmation and of a rejection (with severity codes), so the parser can be checked.
16. **Sandbox:** a test system with a test endpoint and test credentials, and a window to run the end-to-end test: a paid request must produce a balanced entry and a document number.

## 6. TODOs and placeholders in the code

| Where | What |
|---|---|
| `packages/core/src/sap/s4hana.ts` (top comment) | Element names, namespaces and the severity mapping are unverified against a real system. |
| `packages/core/src/sap/s4lookup.ts` | OData lookup is config-driven and unverified (section 8). |
| `packages/core/src/sap/cashjournal.ts` | Cash journal adapter, element names unverified (section 9). |
| `packages/core/src/expense/index.ts` `onPaid` | A fallback that stores a placeholder payload if `buildJournalEntry` throws `NOT_IMPLEMENTED`. It is not reached now, because the function is built; the TODO says to remove it. |
| `packages/core/src/expense/index.ts` `onPaid` (enqueue) | The known issue in section 1: payload must be `{ postingId }`. |
| `packages/db/prisma/seed.ts` | GL numbers other than `51501800` and `51501500`, the treasury cash GL `11001000` and company code `1000` are placeholders (OPEN_QUESTIONS Q1). |
| `packages/core/src/sap/journal.ts` | Credit is always one line for the total (no per-treasury split). |

## 7. Test coverage

- `packages/core/src/sap/sap.test.ts`: journal balance and mapping, the file adapter (CSV, XLSX, index), the S/4HANA envelope and parser against fixtures (no network), idempotent retry, lost-response recovery with the mock adapter, failure and retry counters.
- `apps/worker/test/worker.test.ts` and `apps/api/test/integrations/integrations.test.ts`: the `sap.post` job to `DONE`, retry endpoint status codes (201 accepted, 409 when already posted), list filters and permissions.
- Not covered by any test: the `onPaid` enqueue payload (section 1), any real SAP system.

## 8. Phase 2: idempotency lookup

After an attempt whose outcome is unknown (timeout, 5xx, lost response), a retry first asks SAP whether a document with our reference (the request number) already exists, through a config-driven OData read (`SAP_S4_ODATA_URL`, `SAP_S4_LOOKUP_SERVICE`, `SAP_S4_LOOKUP_ENTITY`, `SAP_S4_LOOKUP_REF_FIELD`; code in `packages/core/src/sap/s4lookup.ts`). Definite rejections (HTTP 401/403/404, SOAP faults, error log items) are stored as `definiteFailure` on the attempt and never trigger a lookup. If the lookup is unavailable (`SAP_S4_LOOKUP_MODE=none`, missing configuration, HTTP 401/403/404) the posting stops with `UNKNOWN_OUTCOME`; a person with `sap.retry` checks FB03 and may press "re-send" with the confirmation box (`force`), which is audited as `sap.posting.force_retry`.

Questions for the SAP team:

1. Is the OData service `API_JOURNALENTRYITEMBASIC_SRV` (entity `A_JournalEntryItemBasic`) activated, and may the communication user read it? If not, which read API returns FI documents by reference (`API_OPLACCTGDOCITEMCUBE_SRV`, a CDS view, a custom service)?
2. Does `DocumentReferenceID` hold the value we send in the SOAP field `DocumentReferenceID` (XBLNR)? Is it filterable? Case-sensitive?
3. Base URL of the OData gateway and whether it is OData V2 or V4.
4. How long after posting is the document visible to this read (is posting synchronous)?
5. When the same `OriginalReferenceDocument` + logical system is posted twice, does SAP reject it? What exact message text or number is returned (to set `SAP_S4_DUPLICATE_PATTERN`)? Which logical system name should we send (`SAP_S4_LOGICAL_SYSTEM`)?
6. Should reversed documents count as "already posted"? (Today any document with the reference blocks re-posting.)
7. Until 1-3 are confirmed, run with `SAP_S4_LOOKUP_MODE=none`: a retry after an unknown outcome then stops with `UNKNOWN_OUTCOME` and needs a person to check FB03 and press "re-send" with the confirmation box.

## 9. Phase 2: cash journal

`SAP_ADAPTER=s4hana-cj` selects `S4CashJournalAdapter` (`packages/core/src/sap/cashjournal.ts`): debit lines become cash journal payment items, the cash GL credit is implied by the cash journal. Cash journal number per treasury and the business transaction come from the `sap.config` setting (`cashJournal` block). All element names are UNVERIFIED.

Questions for the SAP team:

1. Which interface is available: `BAPI_CASHJOURNALDOC_CREATE` exposed as a web service (SOAMANAGER), a Z wrapper, CPI, or none? Endpoint URL?
2. Does the exposed service commit (`BAPI_TRANSACTION_COMMIT`) in the same call? If not, a Z wrapper `Z_DMS_CASHJOURNAL_POST` that creates, posts and commits is required; give its name and parameters.
3. Does CREATE only save the cash document, or also post it to FI? If it only saves, which call posts it?
4. Exact parameter and field names of `HEADER` and `ITEMS` in your release, and the response fields carrying the cash journal document number and the FI document number.
5. Cash journal number per treasury, and the business transaction (number/name) for expense payments with a G/L account per item.
6. Is `REF_DOC_NO` copied to the FI document reference (XBLNR), so the lookup finds cash journal postings?
7. Tax code and other mandatory item fields in your configuration.
