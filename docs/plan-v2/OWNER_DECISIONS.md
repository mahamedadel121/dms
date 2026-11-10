# Decisions made on the owner's behalf (phase 2)

Each item is a choice the plan had to make without asking. All of them can be changed; the "How to change" column says where. Items marked **please confirm** affect how the product looks or behaves for every user.

## Look and feel

| # | Decision | Why | How to change |
|---|---|---|---|
| O1 | **Direction "Majlis"**: ivory paper, navy ink, one brass line, an approval seal. Chosen over the cooler "Nile Ledger" (emerald, Stripe-like) and the dark-first "Obsidian Diwan". **Please confirm.** | It reads as an established institution (bank statement, letterhead) to senior managers and still uses current practice (hairlines, one accent, tabular numbers). | All colours are in one place: `apps/web/src/app/globals.css`. Swapping the palette to "Nile Ledger" is a change of about 40 values; layouts do not change. |
| O2 | **Light theme is the default; dark theme is available** from the top bar and the profile, plus "follow the device". | Office use and a paper culture; dark is offered, not imposed. | Default is the `'light'` fallback in `layout.tsx` (boot script) and `lib/prefs-core.ts`. |
| O3 | **Western digits (0-9) by default**, with a per-user switch to Arabic-Indic digits (٠-٩) in Profile > Appearance. Request numbers, plates, codes and anything typed stay Western always. **Please confirm the default.** | Egyptian banking and accounting screens use Western digits; columns align perfectly with the chosen font. With Arabic-Indic digits the body font is not perfectly column-aligned (digits have different widths), so that mode is slightly less tidy in tables. | Default: `parseNumerals` in `lib/prefs-core.ts`. To remove the switch, delete the control in the profile page. |
| O4 | **Dates as `dd/MM/yyyy`**, 24-hour time, Cairo time zone, Gregorian only; long form "5 مارس 2026" on documents; relative time ("منذ 3 ساعات") in the inbox and notifications. Week starts on Saturday. | Egyptian convention; the previous `2026-03-05` format is kept only inside inputs and file names. No Hijri. | `lib/format.ts`. |
| O5 | **Fonts**: IBM Plex Sans Arabic for text, Noto Naskh Arabic for page titles and big amounts, IBM Plex Mono for request numbers and codes, IBM Plex Serif for English titles. All free (OFL), shipped inside the app, no internet needed. | Naskh titles give the "newspaper of record" voice; Plex is sober and number-safe. | If the Naskh titles feel too traditional: change `--font-display` in `globals.css` to the body font (one line) and titles become plain sans. |
| O6 | **Brand mark**: a navy disc with a brass ring and the letter "د", and the product name from the existing text "نظام إدارة المستندات". No company logo is used in the app chrome. | No logo file was provided. | Replace `components/brand/BrandMark.tsx` with the real logo. Tell us if the company colours clash with navy and brass. |
| O7 | **The printed PDF keeps the Cairo font** and its current layout in this phase. | Changing the PDF font needs a visual re-check of every template that cannot be done without running the system. | Follow-up task: embed IBM Plex Sans Arabic in `packages/core/src/pdf`. |
| O8 | **Reject is an outline button** on the request page; the solid red button appears only inside the confirmation dialog. Approve is the only solid button. | Prevents accidental rejection and makes the main action obvious. | `features/requests/ActionPanel.tsx`. |
| O9 | **The approval seal**: after approve / pay / reject a round seal ("اعتُمد" / "صُرف" / "رُفض") stamps onto the request sheet and stays there for paid, approved and rejected requests. | A familiar, satisfying confirmation for people used to stamped paper. | Remove `<Seal>` from `RequestDetailPage.tsx`, or change the words in the `ui` translations. |
| O10 | **Navigation regrouped** into: Daily work, Insight, Configuration, Master data, Administration. Same pages, same permissions. Phones get a bottom tab bar (Inbox, Requests, Alerts, More). | The old "Main" group mixed daily work with configuration; the list overflowed the screen. | `apps/web/src/lib/nav.ts`. |
| O11 | **Arabic interface copy is formal Modern Standard Arabic**; the Telegram bot keeps Egyptian colloquial Arabic. | Managers read the web app; drivers chat with the bot. | Translation files under `apps/web/src/i18n`. |
| O12 | **The dashboard no longer shows "by vehicle" twice** (only "top vehicles"), and adds "edit difference" (how much approvers cut from drivers' claims). | The two cards showed the same data. | `features/dashboard/DashboardPage.tsx`. |

## Behaviour

| # | Decision | Why | How to change |
|---|---|---|---|
| O13 | **Request types can be created and edited in the web app, but not deleted** (deactivate only), and the code and number prefix cannot change after creation. | Old requests keep pointing at them. | - |
| O14 | **New request types work through the web API only; the Telegram bot still serves the driver-expense type only.** The screen says so. | Making the bot generic is a separate project. | Future phase. |
| O15 | **Templates**: "new template" creates a draft (optionally copied from another template); exactly one template per request type can be the default; the default cannot be deactivated. | Keeps PDF generation predictable. | - |
| O16 | **SAP safety first**: if the system cannot check whether SAP already has a document, it does not post again on its own. A person with the "retry SAP" permission must confirm "I checked SAP" before re-sending. Until the SAP team confirms the lookup service, run with `SAP_S4_LOOKUP_MODE=none`. **Please confirm.** | Posting twice is worse than waiting for a person. | `.env` (`SAP_S4_LOOKUP_MODE`). |
| O17 | **Cash Journal (FBCJ)** is a second SAP mode (`SAP_ADAPTER=s4hana-cj`): one cash-journal document per paid request, one item per expense line. Which mode to use (journal entry or cash journal) is the SAP team's call. | Both are built; neither can be verified without SAP. | `.env`. |
| O18 | **E-mail and Telegram notifications to approvers are off by default.** When switched on (Settings), they are sent for: request reached your step, SLA reminder, driver returned a correction, sent back, SAP failed, vehicle change requested. Export-ready is in-app only. | Avoids surprising people with mail on day one. | Settings `notifications.email` and `notifications.telegramUsers`. |
| O19 | **Telegram linking for approvers and re-linking for drivers uses an admin-issued link** valid for 15 minutes ("/start ..." command or a t.me link). This relaxes the earlier rule that a driver can link only by sharing his own phone contact: an administrator may now link a driver directly. **Please confirm.** | Needed when a driver's Telegram phone differs from the registered one, and approvers have no phone-based flow. Every link and unlink is in the audit log. | To keep the strict rule for drivers, hide the "relink" action on the Drivers screen. TTL: `TELEGRAM_LINK_TTL_SEC`. |
| O20 | **Files on S3 are still downloaded through the application's own signed links** (5 minutes); a direct S3 link is used only if `S3_PRESIGNED_REDIRECT=true`. | One security model for both storage types. | `.env`. |
| O21 | **`/metrics` needs a secret token in production** (`METRICS_TOKEN`) and is hidden without one. | It now carries real operational data. | `.env`. |
| O22 | **Load test data lives in a separate database** (`dms_load`) with request numbers starting `LD-`. | Never mixes with real data. | - |
| O23 | **`pnpm demo` no longer rebuilds the database when the system is already running**; it reuses the running servers and says so. | Fixes the failure seen when starting the demo twice. | Stop the servers first to migrate or reseed. |

## Scope and timing

| # | Decision | Why |
|---|---|---|
| O24 | **Nothing was executed during the build** (no tests, no browser). The first real verification is the friend's run with `TESTING_GUIDE.md`; a short fix round after his report should be expected. | Owner's instruction. |
| O25 | **One hour is tight.** The honest estimate is about 80 minutes. If the hour is firm, these are dropped first and done later: command palette (Ctrl+K), workflow route preview, audit before/after viewer, phone layout of the roles matrix, table-density and numeral switches, the attachments grid in the request-type editor, direct S3 links, the load-test scripts. | See PLAN_V2 section 10. |
| O26 | **New libraries are limited to**: four font packages, `radix-ui` (dialogs and menus), `nodemailer` (e-mail), three AWS SDK packages (S3). No chart, animation or form library. | Fewer moving parts; charts are simple enough to draw directly. |

## Questions still open for the owner

1. Is there a company logo and are there company colours to respect (O6)?
2. Western or Arabic-Indic digits as the default (O3)? We can show both on the real inbox once it runs.
3. Is the admin-issued Telegram link for drivers acceptable (O19)?
4. Who at the SAP team answers the two question lists in `docs/SAP_INTEGRATION.md` (lookup service, cash journal)?
5. Should approvers get e-mail, Telegram, both or neither at go-live (O18)?
