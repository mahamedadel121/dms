# Build Prompt: Paperless Document & Approval Management System (DMS) — Phase 1: Driver Expense Claims

> ENVIRONMENT OVERRIDE (from the project owner, takes precedence over section 2):
> - **No Docker available on the build machine.** Write `docker-compose.yml` as a file only; never run it.
> - **PostgreSQL:** local Postgres (no Docker). For dev/tests use an embedded Postgres (npm `embedded-postgres`) unless `DATABASE_URL` points to an existing server.
> - **No Redis / no BullMQ.** Background jobs use a PostgreSQL-backed job table (`SELECT ... FOR UPDATE SKIP LOCKED`), which also serves as the transactional outbox.
> - **No MinIO.** File storage = local filesystem behind a `StorageAdapter` interface (an S3 adapter can be added later by config).

---

## 0. Your Role & Mission

You are a senior full-stack architect and engineer. Build a **production-ready, paperless Document & Approval Management System** for a transport company in Egypt.

- **First module (this build):** Driver Expense Claims ("كشف مصاريف") submitted by ~120 truck drivers via **Telegram**, approved through a **configurable multi-step workflow** on a web app, generating a **signed PDF expense sheet**, and posting an automatic **journal entry to SAP S/4HANA** when the treasury pays.
- **Strategic requirement:** The platform core must be **generic**. If this succeeds, the company will reuse it for **HR and other departments** with completely different request types (e.g., leave requests, custody, purchase requests). Never hard-code "driver" or "expense" logic into the core engine. Expense-specific logic (GL accounts, cost centers, vehicles, SAP posting) lives in a **module** that plugs into the core.

You will work **autonomously in phases**, with **tests and a self-review loop after every phase**. Read sections 13–14 (Working Method & QA Loop) before writing any code.

---

## 1. Business Context (current paper process we are replacing)

1. Every morning a driver brings receipts for money he paid on the road: road toll tickets (كارتات طريق), road weighbridge tickets (موازين طريق), traffic fines (مخالفات), roadside maintenance (صيانة), spare parts (قطع غيار), diesel (سولار), tips (إكراميات), and other vehicle expenses.
2. He fills a paper "Expense Sheet" (كشف مصاريف): a table with each expense type and its amount, and a grand total at the bottom. He staples all receipts to it.
3. The sheet is signed in sequence by: Campaign Supervisor (مسؤول الحملة) → Campaign Manager (مدير الحملة) → Accountant (محاسب, may correct amounts) → Chief Accountant (رئيس الحسابات, may correct amounts) → General Manager (المدير العام) → Treasury (الخزينة), which pays the cash.
4. "Campaign" (الحملة) = the vehicles department. The Campaign Supervisor is responsible for **all** drivers and is **always the first approver**.
5. Drivers are not tech-savvy. They only use **Telegram**.

**New process:** The driver submits everything through a Telegram bot (photos per expense line), receives a request number, writes it on the stapled physical receipts, and hands them to the first approver. Approvers compare physical receipts against the system and approve on the web app (desktop, laptop, or mobile browser). The **physical original receipts are kept by the Treasury** after payment.

---

## 2. Tech Stack (mandatory unless you find a blocking reason — document any deviation in `docs/DECISIONS.md`)

- **Monorepo** (pnpm workspaces): `apps/api`, `apps/web`, `apps/bot`, `apps/worker`, `packages/shared`.
- **Backend:** Node.js + TypeScript + **NestJS**, **PostgreSQL** + **Prisma** ORM.
- **Frontend:** **Next.js** (React, TypeScript) + Tailwind CSS. **Arabic-first, full RTL**, with English as a second language (i18n). Fully responsive (desktop, laptop, mobile).
- **Telegram bot:** **grammY** (TypeScript). Must support **both long polling and webhook** via config (hosting is undecided: on-premise or cloud).
- **Background jobs:** BullMQ + Redis (SAP posting, PDF generation, report exports, notifications, reminders). *(Overridden: Postgres job table, see top.)*
- **File storage:** S3-compatible object storage (**MinIO** in Docker; swappable to AWS S3 by config). *(Overridden: local filesystem adapter, see top.)*
- **PDF generation:** HTML → PDF using **Playwright/Chromium** (required for correct Arabic text shaping and RTL; do not use PDF libraries that break Arabic).
- **Excel:** exceljs. **ZIP:** streaming (archiver) for large exports.
- **Auth:** username/password with secure hashing (argon2), JWT access + refresh tokens, session revocation.
- **Deployment:** Docker Compose for the whole stack (postgres, redis, minio, api, web, bot, worker), `.env.example`, health checks, and a backup script for DB + object storage. Must run identically on an on-premise server or a cloud VM.
- **Testing:** Jest/Vitest for unit + integration, Playwright for web E2E, plus a bot conversation test harness that simulates Telegram updates.

---

## 3. Core Platform (generic — reusable by any department)

### 3.1 Organization, Users, Roles, Permissions
- **Departments** (e.g., Vehicles/Campaign, Accounts, Treasury, HR...).
- **Users:** name, username, phone, department, active flag, **signature image** (uploaded by Super User — a scanned real handwritten signature, PNG with transparent background supported, with crop/preview), and optional Telegram link.
- **Roles = job functions** (e.g., Campaign Supervisor, Campaign Manager, Maintenance Engineer, Shipping Officer (مسؤول الشحن), Accountant, Chief Accountant, General Manager, Treasury, Super User). A user can hold **multiple roles**. Roles are created/edited from the UI, not code.
- **Role-based queues (critical):** Workflow steps are assigned to a **role, not a person**. **Any** user holding that role sees **all** requests currently waiting at that role's step and can act on them. This solves absence/backup: if one accountant is absent, any other accountant handles the queue.
- **Claim/lock:** When a user opens a request to edit/act, it is soft-locked to them (visible to others as "being reviewed by X") with auto-release after a configurable timeout, and an explicit "release" button. Prevents two accountants editing the same request simultaneously.
- **Granular permissions** assigned to roles by the Super User through a permission matrix UI (e.g., view requests, approve at step, edit line amounts, reclassify expense type, manage master data, manage workflows, manage templates, manage users, view reports, export images, view audit log, retry SAP posting). Super User has everything and grants anything to anyone.
- **Optional role scope** (by department) so in the future an HR role cannot see vehicle requests and vice versa.
- **Delegation (optional but build it):** a user can temporarily delegate their roles to another user for a date range (logged).

### 3.2 Request Types (the generic engine)
A **Request Type** defines a kind of document in any department. Configurable from the UI by Super User:
- Code, name (AR/EN), department, request number prefix.
- **Header fields** (dynamic field definitions: text, number, date, select, master-data lookup, required flag, validation).
- **Line items** (optional): line item categories (for expenses = expense types), per-category extra fields, attachments rules (min/max photos, allowed file types).
- Linked **Workflow** and **Template(s)**.
- Optional **integrations/hooks** (e.g., "on final approval → post to SAP"), implemented by modules.
- Submission channels (Telegram bot, web).

### 3.3 Request Numbers
- Format: `{PREFIX}-{YY}-{6-digit sequence}`, e.g. `DE-26-000123` (≤ 16 characters — must fit SAP's Reference field XBLNR). Sequence is gap-safe and concurrency-safe (DB sequence or row lock). Easy for a driver to write by hand.

### 3.4 Workflow Engine (configurable, versioned)
- A **Workflow** = ordered list of **steps**. Each step has: name, assigned **role**, **activation condition** (always / conditional), allowed actions, and permissions at that step (e.g., "can edit amounts", "can reclassify expense type").
- **Conditions** are built in a UI rule builder (no code): based on line item categories present in the request (e.g., "request contains Maintenance or Spare Parts"), total amount thresholds, vehicle type, department, or any header field. Steps whose condition is false are **skipped** and recorded as "Not applicable".
- **Expense-type-driven approvals (key requirement):** each Expense Type in master data has an optional list of **"additional required approval roles"** (e.g., Maintenance → Maintenance Engineer; Tips → Shipping Officer). The workflow includes these steps automatically only when the request contains such a line. Examples that MUST work:
  - Request with tolls + weighbridge only → no Maintenance Engineer, no Shipping Officer.
  - Request with maintenance → Maintenance Engineer included.
  - Request with maintenance + tips → both Maintenance Engineer and Shipping Officer included.
- Support **parallel steps** (e.g., Maintenance Engineer and Shipping Officer can approve at the same time; next step starts when both approve).
- **Default workflow for Driver Expenses (seed it):**
  1. Campaign Supervisor — always (first). Must tick "Physical receipts received and match".
  2. Maintenance Engineer — conditional (from expense types).
  3. Shipping Officer — conditional (from expense types).
  4. Campaign Manager — always.
  5. Accountant — always, **can edit amounts and reclassify expense types**.
  6. Chief Accountant — always, **can edit amounts and reclassify expense types**.
  7. General Manager — always.
  8. Treasury — always. Approval = **Paid**. Triggers SAP posting.
  (Super User can reorder, add, remove, rename steps, change roles, and change conditions from the UI.)
- **Versioning:** editing a workflow creates a new version. **In-flight requests keep the version they started with.** New requests use the latest active version.
- **Actions available to an approver:**
  - **Approve** → moves to next applicable step.
  - **Request correction from driver** on a specific line and/or specific image (e.g., "image unclear", "wrong amount") with a mandatory comment → driver is notified on Telegram and re-uploads/corrects only that item → the request returns **directly to the same approver who asked**, not to the start.
  - **Send back to previous step** with mandatory comment.
  - **Reject (final)** with mandatory reason → request closed; driver notified.
- **Edits by Accountant / Chief Accountant:** they can increase or decrease amounts or change expense type. **The request does NOT go back to previous approvers; it simply continues forward.** Mandatory edit reason. The **original driver-entered value is always preserved** and shown next to the corrected value (in UI, history, and PDF). Driver is notified of the change on Telegram. Only the driver can replace images (via Telegram).
- **Full history/audit trail per request:** every action, edit (field, old value, new value), correction request, image re-upload (old images preserved, never deleted), who did it, and exact date & time. Displayed as a clear timeline.
- **SLA reminders:** configurable max hours per step; reminders to the role's users (in-app + optional Telegram/email) and a "delayed requests" dashboard.
- **Notifications:** in-app notification center for approvers; Telegram notifications for drivers at each stage ("Your request DE-26-000123 is now with the Accountant", "Correction needed on the Diesel image", "Paid").

### 3.5 Templates (document layout + signatures)
- Each Request Type has one or more **Templates** (HTML-based layout rendered to PDF). The expense-sheet layout is **fixed** (header: company logo, title "كشف مصاريف", request number, date, driver name, vehicle number, vehicle type, cost center, odometer reading; body: table of expense lines with amounts, original vs corrected values if edited; footer: grand total in numbers and Arabic words; then signature blocks).
- **Signature blocks are generated automatically from the workflow steps that actually applied to that request.** The only variable part is which signatures appear: e.g., a sheet without Maintenance Engineer, one without Shipping Officer, one with both, one with neither. Skipped steps do not appear. This guarantees the template always matches the workflow — no manual mismatch possible.
- Each signature block shows: role title, user's full name, **the user's uploaded signature image**, and approval date & time. The **driver's signature** appears as the submitter when he submits the request.
- A signature is stamped **only by the actual user who performed the approval** (tied to their account). Every signature upload/change is audit-logged.
- Super User can, from the UI: change logo, titles, header fields shown, order of expense columns, add new expense types (appear automatically), and preview the PDF live. Templates are **versioned** like workflows. Do **not** build a free-form drag & drop designer; keep it a structured configuration editor + live preview.
- Support adding **more templates** later for other request types (HR etc.).
- The final PDF after payment is **locked** (stored with SHA-256 hash, immutable).

### 3.6 Audit Log (global)
- Every create/update/delete on master data, users, roles, permissions, workflows, templates, signatures, and every request action. Who, when, IP/user agent, before/after JSON. Searchable UI with filters.

---

## 4. Master Data (Expense module + shared)

All master data is managed from simple UI screens (list, search, add, edit, deactivate, Excel import/export). Never hard-delete records referenced by requests — deactivate.

- **Drivers:** code, full name, national ID (optional), **mobile number registered on Telegram**, linked Telegram user ID (set during onboarding), active flag, signature image, current vehicle (derived from assignments).
- **Vehicles:** vehicle number (e.g., 2157), plate number, vehicle type, **cost center** (e.g., MLF450), status (**Active / Stopped / Under maintenance**), notes.
- **Vehicle Types.**
- **Cost Centers:** code, name, active.
- **GL Accounts:** SAP GL number, name (e.g., `51501800` Vehicle Maintenance — صيانة وسائل نقل; `51501500` Vehicle Spare Parts — قطع غيار سيارات).
- **Expense Types:** name (AR/EN), linked GL account, icon/order for the Telegram menu, active, required extra fields (see 5.3), min/max images, optional max amount warning, and **additional required approval roles**.
- **Driver ↔ Vehicle Assignments (with history):** driver, vehicle, valid from, valid to. A simple, fast screen showing "who drives which vehicle now" and which vehicles are stopped. Changes are never overwrites — they close the old assignment and open a new one.
- **Treasuries (cash accounts):** name, SAP cash GL account, company code, active (support more than one, choose a default).
- **SAP settings:** company code, document type, currency (EGP), posting key defaults, connection settings.
- **Snapshots:** every request line stores a snapshot of GL account, cost center, vehicle, and expense type name at submission time (and updated if reclassified), so old reports stay correct even if master data changes later.

---

## 5. Telegram Bot (driver channel) — extremely simple UX

### 5.1 Onboarding (first time only)
- Driver presses `/start` → bot asks him to press a **"Share my phone number" button** (Telegram `request_contact`). The bot must verify the shared contact belongs to the sender (contact.user_id == from.id) to prevent impersonation. The number is normalized (Egyptian formats: +20, 0020, 01xxxxxxxxx) and matched against Drivers master data. If matched → Telegram user ID is linked permanently. If not matched → polite message to contact the supervisor. Typed numbers are never accepted.
- Super User can unlink/relink a driver's Telegram account from the UI (logged).

### 5.2 New Expense Request flow (buttons everywhere, minimal typing, Egyptian Arabic messages)
1. Driver taps **"طلب جديد"**.
2. Bot: "عربيتك رقم 2157 (MLF450)؟" → buttons **أيوه / لأ**.
   - **لأ** → offers **"طلب تغيير عربية"**: driver selects/types the new vehicle number → a Vehicle Change Request is created and routed to the **Shipping Officer** role for approval → on approval the assignment history updates and the driver is notified and can continue.
   - If the vehicle status is **Stopped**, the bot informs him and blocks the request (configurable).
3. Bot asks for the **current odometer reading** (required in every request; must be numeric; warn if lower than the last recorded reading for that vehicle or an unrealistic jump — configurable threshold).
4. Bot shows the **expense types** as buttons. Driver selects one (e.g., صيانة).
5. Bot asks for the **amount**. Accept Arabic-Indic digits (١٢٣), Persian digits, commas, decimals; validate > 0.
6. Bot asks for **expense-type-specific extra fields** (see 5.3), e.g., liters for diesel.
7. Bot asks him to **upload photos** of the receipts for this expense only (one or more; photos or PDF documents). Then a button **"خلصت صور"**.
8. Bot shows buttons: **"إضافة مصروف تاني"** / **"كده خلصت"**. Repeat steps 4–7 as needed. The same expense type may be added more than once (e.g., two toll tickets) or the driver may add multiple images to one line — both supported.
9. **Summary screen:** all lines with amounts, image counts, odometer, grand total → buttons **"تأكيد وإرسال" / "تعديل" / "إلغاء"**. Edit allows deleting/modifying a line before submission.
10. On confirm → request number generated (e.g., `DE-26-000123`) → bot sends it in large clear text: "اكتب الرقم ده على الإيصالات المدبسة وسلمها لمسؤول الحملة".
- **Drafts:** conversation state persisted in DB/Redis; if the driver leaves, he resumes where he stopped. Drafts expire after a configurable time with a reminder.
- **"طلباتي"** button: list of his recent requests with current status/step.
- **Correction requests:** when an approver requests a correction, the bot messages the driver with the request number, the line, the reason, and guides him to re-upload or correct only that item. Old images remain stored in history.
- **Images:** downloaded immediately from Telegram to object storage (never rely on Telegram file_id for storage). Store original file, a generated thumbnail, SHA-256 hash, and a perceptual hash.
- **Duplicate detection:** flag (not block) images identical or near-identical to images in any previous request; show the warning to approvers with a link to the other request.
- Handle unexpected input gracefully (text when a photo is expected, etc.) with friendly guidance. Rate limiting and error resilience.

### 5.3 Expense-type-specific fields
- **Diesel (سولار):** liters (required). System computes **price per liter = amount ÷ liters**, rounded to 2 decimals, stored and shown in UI, PDF, and reports. Warn approvers if the price per liter is outside a configurable expected range.
- **Odometer** is at request level for all requests (shown in every template and report).
- Super User can configure extra fields for any expense type (e.g., fine number for traffic fines, part name for spare parts).

---

## 6. Web Application (approvers, accountants, admins)

- **Login**, Arabic RTL by default, responsive for mobile approvals.
- **My Queue / Inbox:** all requests waiting at any role the user holds, with filters (role, date, driver, vehicle, amount, waiting time), and counters.
- **Request detail page:** header data, lines table, **image gallery per line** (zoom, rotate, full-screen, download), duplicate warnings, price per liter, odometer vs last reading, original vs corrected amounts, workflow progress bar (with skipped steps), timeline/history, action buttons according to the user's permissions at this step, and a "Preview PDF" button.
- **First approver** must confirm "Physical receipts received and match" before approving.
- **Master data screens**, **Users/Roles/Permissions matrix**, **Workflow builder** (steps list with drag-to-reorder, role selection, condition builder, parallel grouping, versions), **Template editor** with live preview, **Vehicle Change Requests** queue, **Audit log**, **SAP posting monitor**, **Settings**.
- **Dashboard:** totals by period, by vehicle, by expense type, top-spending vehicles, average approval time per step, delayed requests per role.

---

## 7. Treasury Payment & SAP S/4HANA Integration

- When the **Treasury** role approves, the request becomes **Paid** (payment date/time and treasury user recorded), the final PDF is generated with all signatures and locked, and a **SAP posting job** is queued.
- **Journal entry (no VAT, no driver custody/advance):**
  - **Debit** each expense line's **GL account** with the vehicle's **cost center** and the line amount (multiple lines → multiple debit items; lines with the same GL + cost center may be aggregated — make this configurable).
  - **Credit** the selected **Treasury cash GL account** with the total.
  - **Reference (XBLNR)** = request number (e.g., `DE-26-000123`); **Assignment (ZUONR)** = request number on every item; header text = driver name + vehicle number; posting date = payment date; document date configurable.
- **Architecture:** implement a `SapPostingAdapter` interface with three implementations selectable by config:
  1. **Mock adapter** (default for development/tests) — simulates success/failure.
  2. **File export adapter** — generates an Excel/CSV file in a format suitable for upload into SAP (fallback if API is not yet available).
  3. **S/4HANA API adapter** — posts using the standard S/4HANA Journal Entry API (SOAP `JournalEntryCreateRequestConfirmation_In` / API_JOURNALENTRY) with credentials from env. Keep it configurable for on-premise or cloud. Leave clear TODOs and a document `docs/SAP_INTEGRATION.md` listing exactly what the SAP team must provide (endpoint, communication user, company code, document type, cash GL, whether "daily treasury" is managed via Cash Journal FBCJ — if so, add a Cash Journal adapter option).
- **Reliability:** use the **transactional outbox pattern** + idempotency key (request ID) so a request is **never posted twice**, even on retries or crashes. Statuses: `Pending → Posted (SAP doc number + fiscal year saved on the request) | Failed (error message saved)`. Automatic retries with backoff, then manual "Retry" button for authorized users. A posting failure must **not** undo the payment status; it shows in the SAP Posting Monitor.

---

## 8. Reports

- **Report builder** with filters: date range (submission date / payment date / expense date), driver, vehicle, vehicle type, cost center, expense type, GL account, request status, workflow step, request number, amount range.
- **Group by:** driver, vehicle, expense type, GL, cost center, month.
- **Columns:** request number, dates, driver, vehicle, cost center, expense type, GL, original amount, final amount, liters, price per liter, odometer reading, approvers & dates, SAP document number, image count, link to request.
- **Exports:**
  - **Excel** (with totals/subtotals).
  - **ZIP of images** for the filtered result, organized in folders (configurable, default: `ExpenseType/RequestNumber/image_n.jpg`) plus an Excel index inside the ZIP. Example use case: an auditor asks for all road-toll expenses in Q1 → filter by expense type + dates → download Excel + all toll images.
  - **PDF bundle** of expense sheets.
- Large exports run as **background jobs**; user gets a notification with a download link (expiring signed URL).
- Every export is audit-logged.

---

## 9. Security & Non-Functional Requirements

- Role/permission checks enforced on the **backend** for every endpoint (never only in the UI). Write authorization tests.
- Input validation everywhere (zod/class-validator). Protection against IDOR, XSS, CSRF (as applicable), SQL injection, file-upload abuse (type sniffing, size limits).
- Images served only via short-lived signed URLs after permission check.
- Secrets only in env vars. HTTPS-ready behind a reverse proxy (include an example Nginx/Caddy config).
- Timezone: **Africa/Cairo** for display; store UTC. Currency: EGP, 2 decimals, use decimal types (never floats) for money.
- Performance target: 120 drivers × ~5 images/day (~180k images/year). Pagination everywhere, DB indexes on filter columns, thumbnails for galleries.
- Backups: documented daily backup + restore procedure for PostgreSQL and MinIO, tested with a script.
- Logging (structured JSON) and basic health/metrics endpoints.

---

## 10. Seed / Demo Data

Create a seed script with realistic demo data: roles listed above, one user per role (plus 2 accountants to demonstrate role queues), 10 drivers, 10 vehicles (including vehicle **2157** with cost center **MLF450**, and one **Stopped** vehicle), expense types (road tolls, weighbridge, traffic fines, maintenance → GL **51501800**, spare parts → GL **51501500**, diesel, tips, other), maintenance & spare parts requiring Maintenance Engineer, tips requiring Shipping Officer, a default treasury, the default workflow and template, sample signature images, and ~30 sample requests in various states.

---

## 11. Deliverables

- Complete source code in the monorepo, Docker Compose, `.env.example`.
- `README.md` (setup, run, test, deploy).
- `docs/ARCHITECTURE.md` (with diagrams), `docs/DECISIONS.md`, `docs/SAP_INTEGRATION.md`, `docs/BACKUP_RESTORE.md`.
- `docs/ADMIN_GUIDE_AR.md`: Arabic guide for the Super User (adding users, roles, signatures, expense types, workflows, templates).
- `docs/DRIVER_GUIDE_AR.md`: very short Arabic guide with bot screenshots/steps for drivers.
- `docs/HOW_TO_ADD_NEW_REQUEST_TYPE.md`: how another department (e.g., HR) would configure a new request type, workflow, and template without code changes, and when a new module is needed.

---

## 12. Implementation Phases (do them in order)

Each phase ends only when its **acceptance criteria pass** and the **QA loop (section 14)** is complete.

**Phase 0 — Planning:** Read the whole document. Write `docs/PLAN.md` (architecture, data model/ERD, module boundaries, API outline, bot state machine, workflow engine design) and `CLAUDE.md` (project conventions, commands, rules). List every assumption in `docs/DECISIONS.md`. Create the monorepo skeleton, Docker Compose, CI scripts (lint, typecheck, test).
*Acceptance:* `docker compose up` brings all services up healthy; lint/typecheck/test commands run green.

**Phase 1 — Core foundation:** auth, users, departments, roles, permission matrix, delegation, audit log, i18n/RTL web shell, master data screens (all of section 4) with Excel import/export, signature upload.
*Acceptance:* Super User can create roles/permissions and users; non-permitted actions are blocked at API level (tests prove it); assignment history works.

**Phase 2 — Generic request & workflow engine:** request types, dynamic fields, line items, request numbering, workflow builder with conditions, expense-type-driven steps, parallel steps, versioning, role queues, claim/lock, all approver actions, edits with original value preservation, history timeline, notifications, SLA reminders.
*Acceptance:* automated tests for the four signature scenarios (neither / maintenance only / tips only / both), parallel steps, correction returning to the same approver, send-back, final reject, accountant edit continuing forward, in-flight requests keeping old workflow version, two accountants seeing the same queue.

**Phase 3 — Telegram bot:** onboarding with contact verification, full request flow, odometer, diesel liters & price per liter, multi-image lines, drafts, summary/edit, "My requests", vehicle change requests, correction flow, notifications, duplicate detection.
*Acceptance:* bot conversation tests cover the happy path, Arabic digits, invalid input, impersonation attempt (shared contact not belonging to sender), stopped vehicle, resume draft, correction re-upload.

**Phase 4 — Web approval UI & templates/PDF:** inbox, request detail with gallery, action panels, template editor with live preview, PDF generation with dynamic signature blocks and user signature images, locked final PDF.
*Acceptance:* Playwright E2E of a full request from submission (via bot harness) to Paid; generated PDFs render Arabic correctly and show only the applicable signatures.

**Phase 5 — Treasury & SAP:** payment, outbox, adapters (mock, file export, S/4HANA), monitor, retry, idempotency.
*Acceptance:* tests prove no double posting on retries/crash simulation; correct debit/credit lines with cost centers; reference = request number.

**Phase 6 — Reports & dashboard:** report builder, Excel, ZIP images, PDF bundle, background exports, dashboard.
*Acceptance:* the "auditor asks for all road tolls in a date range" scenario produces a correct Excel and ZIP.

**Phase 7 — Hardening & docs:** security review, performance check with generated load data (≥200k images metadata, ≥50k requests), backup/restore test, all documentation.

---

## 13. Working Method (mandatory)

1. **Plan before coding** (Phase 0). Keep `docs/PLAN.md` updated as the source of truth.
2. Maintain `docs/PROGRESS.md`: checklist of every requirement in this document mapped to phase, status, and the test(s) that prove it.
3. Small, focused commits with clear messages after each meaningful step (use git).
4. When something is ambiguous, **choose the most reasonable option, document it in `docs/DECISIONS.md`, and keep going** — do not stop to ask unless it is truly blocking. Collect open questions for the business owner in `docs/OPEN_QUESTIONS.md`.
5. Never hard-code business rules that the Super User should control (roles, steps, conditions, expense types, GL accounts, signatures, template content).
6. Keep the core generic; expense-specific code lives in its own module.

---

## 14. Self-Review & QA Loop (after EVERY phase — do not skip)

1. Run **lint, typecheck, unit, integration, and E2E tests**. Fix all failures. Never disable or weaken a test to make it pass.
2. **Requirements traceability review:** re-read the relevant sections of this document line by line and compare with what you built. Update `docs/PROGRESS.md`. Anything missing or deviating → fix it now.
3. **Code review pass** as a strict senior reviewer: security (authorization on every endpoint, file handling), data integrity (money as decimals, transactions, snapshots, versioning), error handling, Arabic/RTL correctness, edge cases, dead code, duplication.
4. **Manually exercise the feature** (run the app, hit the API, simulate bot conversations, open generated PDFs/Excels/ZIPs) and verify outputs are actually correct, not just that tests pass.
5. Fix every issue found, then **repeat steps 1–4 until a full pass finds no issues**.
6. Write a short phase report in `docs/PROGRESS.md`: what was built, tests added, issues found & fixed, remaining risks.

After Phase 7, perform a **final end-to-end audit** of the entire system against this whole document, fix everything found, and produce a final summary listing: what is complete, what is mocked/pending (e.g., real SAP credentials), and the exact steps to go live.
