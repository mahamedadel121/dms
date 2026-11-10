# DMS redesign: design research

Audience: owner (modern, current) and older traditional Egyptian managers (must feel premium, careful, designed by a person). Stack: Next.js 15, Tailwind 3.4, fully offline, OFL fonts and icons only. Arabic first, RTL, English second. Desktop for accountants, chief accountant, GM, admins; mobile browser for supervisors on the road.

## 0. Method and honesty notes

- 35 public pages screenshotted with Playwright plus 1 own render (`references/`, listed in `references/SOURCES.md`). These are marketing and docs pages, so product UI is seen through hero mock-ups, not live logged-in screens.
- Measured myself (Chromium, Google Fonts CSS, test only): digit widths of 12 Arabic-capable fonts, contrast ratios of every palette below (WCAG 2.x formula, script in session). These numbers are firm.
- Web search was weak for typography detail. Anything stated from general professional knowledge, not from a fetched page, is marked (K). Treat (K) items as strong priors to verify during build, not as citations.
- Not reachable: DGA (Saudi) design system site timed out; Careem blocked by captcha. The UAE Design System home page was captured instead.
- Licence check: Thmanyah Sans is free for commercial use but under a proprietary "Thmanyah Font" licence that forbids modifying, renaming or deriving files. It is not OFL, so it is excluded (we also could not confirm Latin coverage). Re-read the licence text before ever reconsidering.

## 1. What makes premium products feel premium (2025-2026)

Observed in the screenshots, plus (K) where noted.

### 1.1 Common traits

1. **Restraint in colour.** Linear, Vercel, Attio, Mercury: neutral canvas, one accent, semantic colours used only for state. Ramp uses a single lime; Mercury a single blue; UAE DS bronze/gold. Colour is information, not decoration.
2. **Hairlines over shadows.** Linear and Vercel separate regions with 1px low-contrast borders; shadows are tiny and reserved for floating layers (menus, dialogs). Cards on pale tinted canvases (Attio, Stripe) use soft 1-2px shadows plus a border.
3. **Typography does the work.** Large, tightly set headlines; small, quiet labels; clear 4-5 step scale. Notion and Ramp use editorial headlines. Premium feel comes from consistent rhythm, not from effects.
4. **Density with air.** Rows are compact (36-44px) but padding on page margins and between groups is generous. Information is dense inside a group, space between groups.
5. **Real data in the hero.** Brex, Mercury, Linear show actual-looking tables and charts with believable numbers. That signals competence. In our app, seed realistic Arabic names, EGP amounts and receipts for demos and empty states.
6. **Depth by layering.** Canvas -> surface -> raised surface, each one step lighter (light mode) or lighter (dark mode). Not by gradients. Gradients appear only as soft ambient backdrops (Stripe).
7. **Calm motion** (see section 5).
8. **Numbers are first-class.** Tabular figures, right/end aligned, consistent decimals, delta chips (+4.5%), monospace-feeling IDs. Stripe and Mercury never let amounts jitter.

### 1.2 Per product takeaways

- **Linear**: dark-first, keyboard-first, ultra-compact lists with status icons rather than coloured pills. Lesson: icon-led status keeps tables clean. Risk for us: too cold and too "developer" for senior managers.
- **Stripe Dashboard**: the benchmark for finance data presentation: balanced whitespace, small caps labels, status badges with tinted background + dark text, drawer detail panels rather than page changes. Stripe's design is calm and trustworthy, the right emotional register.
- **Ramp / Brex / Mercury**: approvals shown as cards: merchant, amount, who, policy status, receipt thumbnail, two clear buttons. Ramp adds "agent reviewing" states. Brex shows desktop and phone as one system. Mercury is the best "banking" feel: dark panels, soft radii, large balance numerals.
- **Vercel / Geist**: 10-step colour scales with documented purposes; mono for IDs. Lesson: define tokens by purpose (bg, subtle bg, hover bg, border, strong border, solid, text) not by name.
- **Attio / Notion**: light, warm, editorial; proves "modern" and "warm/humane" coexist. Notion's serif display touch is the clearest precedent for an editorial headline face.
- **Arabic consumer fintech (Tabby, Tamara)**: heavy 80px Arabic display headlines, bright brand colours (green, purple), illustration. High energy and playful. Great marketing; wrong register for a back-office approvals tool. Takeaway: Arabic display type holds up at very large sizes, but weight and colour decide whether it reads "consumer" or "institution".
- **UAE Design System**: beige background, bronze/gold accent, outlined secondary buttons, circular progress and numbered stepper. This is the strongest evidence that a warm neutral plus muted metal accent reads "state-grade, trusted, premium" to Gulf and Egyptian eyes (K: Egyptian banking and government visual language leans similarly to navy plus gold). The DGA system (Saudi) could not be fetched; its public positioning is similar (K).

### 1.3 Specifics by topic

**Typography scale (K, recommended for DMS).** Base 15px Arabic / 14px Latin-heavy tables; scale 12 / 13 / 15 / 17 / 20 / 24 / 30 / 40. Arabic renders visually smaller than Latin at the same px (shorter x-height proportion), so give Arabic text +1px against a Latin design. Weights 400, 500, 600 only; avoid 300 below 18px and avoid 700+ in tables.

**Density.** Three table densities: comfortable 52px, default 44px, compact 36px, with a toggle persisted per user. Mobile rows min 56px (touch 44px target + padding).

**Colour restraint.** 90% neutrals, 1 primary (actions, links, focus), 1 metal accent used at most once per screen (a hairline, a brand mark, KPI emphasis), 4 semantic colours only in chips and alerts.

**Depth.** Four elevation levels: 0 canvas, 1 card (border + shadow 0 1px 2px at 4-6%), 2 popover (0 8px 24px at 10%), 3 modal (0 24px 64px at 16% over a 40% scrim). In RTL, shadows stay vertical-biased so they do not need mirroring.

**Motion.** See section 5.

**Empty states.** Stripe/Linear style: small line illustration or icon in a tinted disc, one sentence explaining what will appear here, one primary action. Arabic microcopy should be human ("لا توجد طلبات تنتظر اعتمادك الآن") not technical. Inbox-zero is a moment of delight: a calm confirmation, not confetti.

**Data tables.** Header 12-13px weight 500 in ink-3, no uppercase (Arabic has no case; uppercase Latin looks shouty next to Arabic). Row hover tint, selected row tint plus start-edge 2px accent bar. Numeric columns end-aligned with tabular digits. Sticky header, sticky first column on mobile scroll. Zebra only in compact density (K).

**Number formatting.** `Intl.NumberFormat('ar-EG-u-nu-latn', {style:'currency', currency:'EGP'})` yields Western digits with Arabic currency text. Default `ar-EG` gives Arabic-Indic digits, which must be a deliberate choice. Money: always two decimals, thousands separators, currency symbol/abbreviation after the number in Arabic ("12,450.75 ج.م"), negative amounts with a visible minus and a danger colour only if it means a problem. Show original vs corrected amount as struck-through grey -> bold ink with a small "تم التصحيح" chip.

**Status chips.** Tinted background (step 3 of scale), dark text (step 11), 1px border in the same hue at low opacity, 24px high, radius 6-full, always icon or dot + text so colour is never the only signal. Max 5 distinct statuses per screen.

**Document viewers.** Stripe/Ramp/Linear pattern: split view, evidence on one side, data on the other; thumbnails strip, zoom (fit, 100%, 200%), rotate, pan, full-screen, keyboard arrows, "open original". Dark neutral viewer background (#0E1116) in both themes so receipt photos pop. Show EXIF-independent metadata (uploaded by, time, size).

## 2. Arabic typography

### 2.1 Measured numeral behaviour (Chromium, 40px, same sentence; "tnum" = `font-variant-numeric: tabular-nums`)

Width of "1111" vs "8888" (Western digits) default, then with tnum, then Arabic-Indic "١١١١" vs "٨٨٨٨".

| Font | Western default 1111 / 8888 | with tnum | Arabic-Indic 1111 / 8888 | Verdict for money columns |
|---|---|---|---|---|
| IBM Plex Sans Arabic | 96 / 96 | same | 42 / 85 | Western digits tabular by default. Arabic-Indic proportional. |
| Readex Pro | 80 / 93 | no change | 49 / 89 | Proportional, no tnum support. Bad for columns. |
| Noto Kufi Arabic | 91.5 / 91.5 | same | 91.5 / 91.5 | Tabular for both numeral systems. Best for tables. |
| Noto Sans Arabic | 91.5 / 91.5 | same | 91.5 / 91.5 | Tabular for both. |
| Alexandria | 60 / 101 | 112 / 112 | 48 / 124 | Proportional by default; tnum works (wide). |
| Almarai | 57 / 85 | no change | 43 / 85 | Proportional, no tnum. |
| Tajawal | 60 / 86 | no change | 33 / 77 | Proportional, no tnum, tiny Arabic digits. |
| Cairo | 89.6 / 89.6 | same | 49.5 / 99.8 | Western tabular; Arabic-Indic proportional. |
| Vazirmatn | 89.9 / 89.9 | same | 46 / 94 | Western tabular; Arabic-Indic proportional. |
| Noto Naskh Arabic | 89.5 / 89.5 | same | 71.8 / 71.8 | Tabular both. |
| Rubik | 68.5 / 102 | 99 / 99 | 49 / 101 | tnum works. |
| Amiri | 85 / 85 | same | 93.6 / 93.6 | Tabular both (classical, too ornate for UI). |

Consequences: if the UI uses Western digits (recommended below), IBM Plex Sans Arabic, Noto Sans/Kufi/Naskh, Cairo and Vazirmatn are safe without extra CSS; Alexandria and Rubik need `font-variant-numeric: tabular-nums`; Readex Pro, Almarai and Tajawal should not be used for amount columns. If the owner wants Arabic-Indic digits, only the Noto family is cleanly tabular.

### 2.2 Candidate assessment (UI, dense tables, 13-16px)

| Font | Licence / source | Weights | Character | Use |
|---|---|---|---|---|
| **IBM Plex Sans Arabic** | OFL 1.1; Google Fonts / fontsource `@fontsource/ibm-plex-sans-arabic` / github.com/IBM/plex | 100-700 (7 styles), Latin glyphs included (Plex Sans) | Neo-grotesque, even, sober; the corporate/banking voice | Best UI + body face |
| Noto Sans Arabic | OFL; fontsource `@fontsource-variable/noto-sans-arabic` | variable 100-900 (+width) | Neutral, huge coverage, tabular digits | Safe table face |
| Noto Kufi Arabic | OFL; fontsource | variable | Regular Kufi rhythm, formal, tabular | Headings / KPI |
| Noto Naskh Arabic | OFL; fontsource | variable 400-700 | Traditional book Naskh | Editorial headings (large only) |
| Readex Pro | OFL; fontsource | 160-700 variable | Friendly, open; Lexend-derived readability | Marketing/friendly, not for tables |
| Alexandria | OFL; fontsource | variable 100-900 | Geometric, wide, modern | Display only (tnum works) |
| Almarai | OFL; github.com/googlefonts/Almarai | 300-800 (4 weights) | Clean but limited | Skip |
| Tajawal | OFL | 200-900 | Compact humanist; tiny digits | Skip |
| Cairo | OFL | variable 200-1000 | Egyptian-familiar, rounded; dated | Acceptable fallback |
| Vazirmatn | OFL | variable 100-900 | Neutral, good Latin | Fallback |
| Rubik | OFL | 300-900 | Rounded, playful | Skip |
| Thmanyah Sans | Proprietary free-use, no derivatives | n/a | Distinctive Saudi media face | Excluded (not OFL) |

Recommendation: **IBM Plex Sans Arabic for UI and body in every direction** unless a direction explicitly differs, with a single display face for page titles and hero numbers. Plex's Arabic and Latin share proportions and stroke contrast, which prevents the "two fonts glued together" look in mixed strings such as "طلب رقم REQ-4821".

### 2.3 Arabic text settings (K, standard practice)

- `line-height`: body 1.7 (15px), table cells 1.5, headings 1.3-1.4, captions 1.6. Below 1.4 Arabic diacritics and descenders collide.
- `letter-spacing: 0` always. Never track Arabic; never use `text-transform: uppercase` on mixed strings.
- No italics, no faux bold; keep to real weights. `font-synthesis: none`.
- Avoid pure-black on pure-white: use ink #16202F style tones to reduce glare.
- Underlines: use `text-decoration-skip-ink: auto; text-underline-offset: 0.25em` so lines do not eat dots.
- Do not use `word-break: break-all`; use `overflow-wrap: anywhere` only on IDs/URLs.
- Use `font-feature-settings` default (ligatures on) for Arabic; disable `liga` only on mono IDs.
- Latin text inside Arabic: same family; if a fallback is needed, size-adjust the Latin fallback so x-heights match.
- Self-host with `next/font/local` (woff2 subsets for `arabic` + `latin`); `display: swap` plus `size-adjust` fallbacks to avoid layout shift. Variable fonts reduce files to ~2 per family.

### 2.4 Numerals decision

- Egyptian banking apps and accounting software overwhelmingly show Western digits (0-9) for money, while Arabic-Indic (٠-٩) is used in print, government forms and some newspapers (K, verify with the owner by showing both on a mock-up). Mixed Arabic-Indic in text and Western in tables is the single most common visible inconsistency; avoid mixing in one screen.
- Recommended default: **Western digits everywhere** (amounts, dates, IDs, phone numbers), with a per-user setting "Arabic-Indic digits" later if requested. Format via `Intl` with `-u-nu-latn`, never hand-convert strings.
- Dates: Gregorian `dd/MM/yyyy`, optionally Hijri hidden by default. Month names in Arabic (Egyptian forms: يناير، فبراير ...). Week starts Saturday in Egypt (K).
- Currency: "ج.م" after the number (12,450.75 ج.م) in Arabic; "EGP 12,450.75" in English. Keep the number in an LTR isolate (see section 3).

## 3. RTL UX specifics

### 3.1 Layout

- Set `dir="rtl"` and `lang="ar"` on `<html>`; switch both with the locale. Tailwind 3.3+ supports logical utilities: `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`, `text-end`, `border-s`, `border-e`, `rounded-s`, `rounded-e`, plus the `rtl:` and `ltr:` variants for the exceptions. Ban `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left/right` through an ESLint rule (`eslint-plugin-tailwindcss` or a custom regex), with tests in e2e comparing screenshots in both directions.
- Sidebar sits on the inline-start (right in Arabic). Primary action in a form footer sits at the inline-start of the button row (right), cancel after it. Page header: title at start, actions at end.
- Stepper/progress flows right-to-left; "next" arrows point left and "back" chevrons point right.
- Scrollbars appear on the left in RTL for the page and for overflow containers; do not hack it.
- Use `inset-inline-*`, `translate` animations need `rtl:-translate-x-*` or CSS variable `--dir: -1` multiplied.

### 3.2 Icon mirroring rules (K; consistent with Material bidirectionality guidance and rtlstyling.com)

Mirror: arrows, chevrons, back/forward, undo/redo, list-indent, sidebar-collapse toggles, "reply", text-align icons, send, progress/step arrows, and external-link arrows (debated; mirror for consistency).
Do NOT mirror: clocks and anything depicting time, checkmarks, search magnifier (Material mirrors it, many Arabic apps keep it; pick one and keep it), plus/minus, close X, media play/pause/skip (play follows the timeline, which is LTR), phone, camera, trash, download/upload, brand logos, charts with a physical meaning (trend up), the document icon, signature, rotate-clockwise (clockwise stays clockwise; in the receipt viewer label rotate buttons by direction in words, since a mirrored icon would invert their meaning).
Implementation: a wrapper `<Icon mirror />` adds `rtl:-scale-x-100`. Default is no mirroring; mirroring is opt-in per usage.

### 3.3 Numbers, bidi and mixed text

- Digits are LTR even inside Arabic. A currency string like "12,450.75 ج.م" displayed in an RTL paragraph can reorder to "ج.م 12,450.75" visually or flip punctuation. Wrap every amount, ID, phone, date, plate number in `<bdi>` or an element with `unicode-bidi: isolate; direction: ltr` (e.g. `<span class="num">`). Keep the unit outside or use `dir="auto"` for user-entered strings.
- Vehicle plates in Egypt mix Arabic letters and Arabic-Indic digits (e.g. "س ص ع 1234"). Store as separate fields (letters, digits) and render as an `isolate` block with explicit order; never concatenate and hope.
- IDs like `REQ-2026-00481` in RTL text: wrap in isolate, use mono/tabular, never break mid-token.
- User-entered free text (notes, driver names) uses `dir="auto"` so Arabic names align start in Arabic and English notes align left; keep container alignment `text-start`.
- Punctuation: use Arabic comma "،" and question mark "؟" in Arabic strings; parentheses and slashes at bidi boundaries are the usual bug source, isolate them.
- Inputs: email, phone and URL fields stay `dir="ltr"` and left-aligned in RTL forms; amount inputs use `dir="ltr"` with `text-align: end` and `inputmode="decimal"`. Normalise pasted Arabic-Indic digits to Western on input (K: accountants paste from Excel and WhatsApp).
- Search with Arabic: normalise alef forms (أ إ آ -> ا), taa marbuta/haa, yaa/alef-maqsura, strip tashkeel and tatweel server-side and client-side so "احمد" finds "أحمد".
- Sorting: use `Intl.Collator('ar-EG')`.
- PDF/Excel exports: Excel sheets set right-to-left sheet view for Arabic reports; PDF templates embed the same OFL font.

### 3.4 Charts in RTL

- Time axis: Arabic readers still read time left-to-right in most business charts in Egypt (K, varies); the safe rule is: **do not mirror time series**, but do mirror the whole chart *layout* (legend position, Y-axis on the inline-end side, i.e. left in RTL, if the product mirrors everything). Decide once and apply to all charts. Recommendation: keep the plotting area LTR (time flows left to right, numbers LTR), place the legend and titles RTL.
- Bar charts of categories (not time) may flow right-to-left starting at the right.
- Axis labels in Arabic need `text-anchor` handling; tooltips use `dir="rtl"`; number labels use the same `Intl` formatter; do not use SVG `<text>` with `direction` unset.
- Pick chart libraries that expose `direction` or inline-end axis: ECharts (has `rtl` handling for legends/tooltip), Recharts (manual `orientation="right"` for Y axis), visx. Keep charts accessible: direct labels, pattern/shape redundancy, table fallback.

### 3.5 Forms and tables

- Labels above inputs (best for Arabic; no ambiguity), aligned to start. Inline units (ج.م) as end adornment inside the field, in an LTR-isolated span.
- Required marker `*` after label text with accessible text.
- Tables: first column (name/ID) at the inline-start (right). Numeric columns end-aligned (left side in RTL) so decimals align; actions column at the inline-end. Row action chevron mirrored.
- Pagination controls: "السابق" on the right, "التالي" on the left, arrows mirrored.
- Dropdown panels open toward the inline-start edge of the viewport; popover placement uses `start/end` not `left/right` (Radix and Floating UI accept `align="start"`; set `dir` via Radix `DirectionProvider`).
- Mobile: bottom sheet actions, thumb zone, primary button full width, swipe gestures must respect direction (swipe toward the inline-start to reveal actions; avoid destructive swipes).

## 4. Pattern references for the core screens

### 4.1 Approval inbox / queue

References: Ramp approvals cards, Linear inbox (keyboard triage), Stripe list + drawer, Brex mobile.
- Two modes: **list** (default, desktop) with left filters: tabs "بانتظاري / تمت بواسطتي / كل الطلبات" with counts; and **cards** on mobile.
- Each row: requester + avatar initials, request type, amount (end-aligned tabular), age ("منذ ٣ ساعات" with SLA colour only when late), current step chip, receipt-count icon, policy flags (over limit, corrected amount) as small chips. Unread = ink weight 600 + start dot.
- Triage: select row opens a **side drawer or split pane** (desktop) so approvers can walk the queue with J/K and A/R shortcuts; on mobile it is a push page with a sticky bottom action bar.
- Bulk approve only for low-risk types; require explicit confirmation count.
- Empty state: calm "لا شيء ينتظرك" with next-due info.

### 4.2 Approval detail with evidence viewer

- Layout (desktop, 12 cols): data column (7) + evidence column (5, sticky). Data column order: summary header (amount large, status, requester, dates) -> workflow progress -> expense lines table -> comments/history. Evidence column: viewer with thumbnails.
- Header holds the amount in the display face, with original vs corrected amount stacked: struck-through original in ink-3, corrected in ink with chip.
- Expense lines: table with line type, GL account, amount, original/corrected diff column; corrected cells carry a small amber dot and tooltip with who/when/why.
- Receipt viewer: thumbnail strip, active image fit-to-width, zoom controls (+, -, fit, 100%), rotate left/right, download, full-screen; mouse wheel + pinch zoom; keyboard arrows between receipts; badge "٣ من ٥". Dark neutral background. Link each expense line to its receipt(s) (hover line highlights thumbnail).
- Action bar: sticky at bottom on mobile, top-end on desktop; approve = primary solid, reject = outline danger, correct = secondary. Reject and correct require a reason (text area, min length) in a modal/sheet. After action: toast with undo window of 5 s where legally acceptable (K: not for SAP-posted).
- Mobile: evidence first as a horizontal swipe carousel under the header; data in accordion sections; actions fixed bottom.

### 4.3 Workflow / stepper visualisation (incl. parallel and skipped)

References: UAE DS 3-step stepper, GitHub Actions graph, Linear project timeline, Stripe Billing flows.
- Horizontal stepper on desktop, vertical on mobile. Nodes: done (filled check), current (ring + pulse once), pending (hollow), skipped (dashed outline with "تم التخطي" and reason tooltip), rejected (danger). Connector line solid for done, dashed for pending.
- Parallel group: a bracket/fork. Draw a vertical stack of lanes between a fork node and a join node; each lane shows approver and state; join node reads "يتطلب الجميع / أي واحد" (ALL / ANY). Do not rely on colour: use icon + text.
- Each node: step name, assignee (role or person), timestamp when done, SLA clock when current. Click opens details in the history timeline.
- Direction: progress flows from the inline-start to inline-end (right to left in Arabic) and arrow glyphs mirror.

### 4.4 Audit timeline

- Vertical line at the inline-start with typed nodes (created, submitted, approved, corrected, rejected, posted to SAP, exported), actor avatar, action sentence ("وافق **أحمد سمير** كمدير مباشر"), relative time plus absolute on hover, diff blocks for corrections (before -> after), attachments as chips. Group by day with sticky day labels. Filter by event type. Immutable look: no edit affordances, a lock icon in the header.
- Reference: Linear activity feed, Stripe event log, GitHub timeline.

### 4.5 Permission matrix

- Rows = permissions grouped by module (collapsible groups with "select all in group"), columns = roles, sticky header and sticky first column. Cell = checkbox (compact) with tri-state group checkbox; show inherited permissions as disabled-checked with tooltip. A diff bar ("3 تغييرات غير محفوظة") with save/discard. A role-vs-role compare view. Search box filters rows. Colour only highlights changed cells.
- Mobile: switch to a per-role accordion list; matrix is desktop only.
- Reference: GitHub Roles, Notion permissions, Carbon data-table with batch actions.

### 4.6 Rule / condition builder (workflow builder)

- Plain-language sentence builder: "إذا كان **المبلغ** **أكبر من** **٥٠٬٠٠٠ ج.م** **و** **نوع الطلب** **يساوي** **سلفة** فـ ..." Chips as dropdown tokens inside a sentence; AND/OR group toggles; nested groups indented with a coloured start rule. Always show a natural-language preview of the entire rule and a "test with sample request" panel.
- Steps as vertical list of cards with drag handle, approver picker, condition badge, parallel-group container (dashed outline) that holds several step cards. Validation inline (no approver, unreachable step). Sticky mini-map of the resulting flow.
- Reference: Linear/Notion filter chips, Zapier/Make steps, Retool query builder, Carbon forms.

### 4.7 KPI dashboard

- Row of 4 KPI cards: label, value (display face, tabular), delta chip, 1-line caption, small sparkline. Below: a main chart (requests per week), a status breakdown, SLA table, "oldest waiting" list. Max 6-8 widgets; GM sees money (approved amount, pending amount, avg approval time, rejection rate).
- Reference: shadcn dashboard, Mercury, Stripe. Keep charts monochrome plus one accent, with direct labels.

### 4.8 Enterprise data table

- Toolbar: search, filter chips (add filter menu), saved views as tabs ("كل السجلات", "غير نشط") with "حفظ كعرض", column visibility, density toggle (3 states), export. Sticky header, resizable columns, keyboard row focus, row selection with batch bar. Server-side pagination with total counts, page-size selector. Empty/no-results/error states distinct. Loading: skeleton rows that match column widths.
- Reference: Carbon, Polaris IndexTable (saved views as tabs), shadcn tasks table, Primer DataTable.

### 4.9 Mobile approval flow

- Bottom tab bar (الوارد، طلباتي، البحث، حسابي), inbox as cards with swipe-free explicit buttons, detail page with evidence carousel at top, sticky approve/reject bar, biometric-free (browser), offline-tolerant (retry banner). Large 48px targets, 16px+ inputs to prevent iOS zoom, haptic-like quick transitions, pull to refresh. Reject opens a bottom sheet with reason presets and free text.
- Reference: Brex mobile mock-up, Ramp mobile approvals, Tabby/Tamara (RTL mobile rhythm).

## 5. Icons and motion

### 5.1 Icon set

| Set | Licence | Size | Fit |
|---|---|---|---|
| **Lucide** | ISC (MIT-like, OSI) | ~1,700 icons, 24px, adjustable stroke | Clean, consistent, tree-shakeable `lucide-react`; matches Linear/shadcn direction. Strong coverage for finance/office. |
| Phosphor | MIT | ~1,500 x 6 weights | Duotone/regular gives warmer, more crafted look; `@phosphor-icons/react` |
| Tabler | MIT | 6,000+ | Largest coverage, slightly busier at small sizes. |

Recommendation: **Lucide at 1.5px stroke, 20px default** (1.75 on mobile). If Direction A wants more warmth use Phosphor "regular" instead. Whichever is chosen, wrap in one `<Icon>` component with `mirror` prop. Do not mix sets. Provide a small custom brand mark and 6-8 custom empty-state illustrations (line + one accent fill) to avoid "stock icon" feel.

### 5.2 Motion principles (K)

- Purpose over delight: motion explains change (drawer slides from the inline-end edge; list item removal collapses; stepper advances).
- Durations: 120-160 ms micro (hover, press), 200-240 ms for panels/popovers, 280-320 ms for large layout moves; nothing over 400 ms. Easing: `cubic-bezier(0.2, 0, 0, 1)` (decelerate in), `cubic-bezier(0.4, 0, 1, 1)` out; avoid bounce and springs with overshoot in a finance tool.
- Directional motion follows `dir`: slide-in from the inline-start/end using logical variables.
- Numbers: count-up on dashboard first load only (≤600 ms), never on updates; amounts never animate in lists.
- Skeletons over spinners; optimistic UI for approve with rollback.
- Honour `prefers-reduced-motion`: fade only.
- One signature moment: approve stamp (subtle check draw 240 ms) so the action feels final and satisfying to senior managers.

## 6. Accessibility and dark mode

- WCAG 2.2 AA targets: body text 4.5:1, large text and UI components/borders 3:1, focus indicator ≥3:1 with 2px offset ring. All colours in section 7 were computed with the WCAG relative-luminance formula; values are listed next to each palette.
- Never colour alone: status chips carry icons and labels; charts carry direct labels and patterns; tables sort indicators have text.
- Touch targets ≥44px (mobile), keyboard flow in logical order (DOM order follows reading order in RTL, so no `tabindex` hacks), `aria-live` for toasts, labelled icon buttons in Arabic, `lang` attributes on mixed-language spans, screen-reader friendly amount ("12,450.75 جنيه مصري").
- Dark mode: do not invert; use separate tokens. Surfaces step lighter with elevation (#0F141C -> #171E29 -> #1F2836); desaturate and lighten semantic colours; reduce pure white text (#ECE8E1); borders at 12-16% white; shadows replaced with border plus subtle highlight. Arabic on dark needs +0.1 line-height and weight 400 not 300 (thin strokes bloom). Provide system/auto, light, dark; ship light as default for this audience (managers in offices, printed-document culture) and dark as an option, except Direction C which is dark-first.
- Print: approvals are printed in this culture; give request detail a print stylesheet (light, no chrome, signature block).

## 7. Candidate design directions

Common to all: Western digits, `ar-EG-u-nu-latn`, Lucide icons, logical CSS, three table densities, skeleton loading, dark mode token set, semantic chips with icons.

All contrast values below are computed (WCAG ratio, foreground on background).

### Direction A: "Majlis" (Arabic editorial / premium banking)

**Mood.** A private bank's printed annual report turned into software: warm ivory paper, deep navy ink, a thin brass line. Calm, authoritative, humane. Echoes UAE DS warmth and Notion's editorial headline, but sober.

**Palette (light).**

| Token | Hex | Use | Contrast |
|---|---|---|---|
| canvas | #FAF7F2 | page bg | |
| surface | #FFFFFF | cards, tables | |
| sunken | #F1ECE2 | wells, table header, hover | |
| hairline | #E6E0D3 | dividers, card borders (decorative) | n/a |
| border-input | #7C8596 | inputs, checkboxes | 3.48 on canvas (>=3) |
| ink | #16202F | text | 15.33 on canvas, 16.38 on white |
| ink-2 | #4B5565 | secondary text | 7.05 on canvas, 6.40 on sunken |
| ink-3 | #5E6675 | captions, placeholders | 5.41 on canvas, 5.78 on white |
| primary navy | #14284B | buttons, links, focus anchor | white on it 14.64; on canvas 13.70 |
| primary hover | #0F1F3A | | |
| focus ring | #2F5FA8 | 2px ring | 5.91 on canvas |
| brass (fill) | #C9A45C | hairline accents, KPI underline, selected bar | ink on brass 6.98 |
| brass (text) | #8A6A2F | small brass labels | 4.70 on canvas, 5.02 on white |
| brass tint | #F4EAD3 | corrected-amount chip bg; text #6E521F | 6.08 |
| success | #1E6B46 on #E6F2EA | chip | 5.62 |
| warning | #8A5A00 on #FBF0D9 | chip | 5.24 |
| danger | #A12D2D on #FBE9E7 | chip; solid danger button white text 7.17 | 6.12 |
| info | #1F4E8C on #E6EEF8 | chip | 7.10 |

**Dark variant.** canvas #0F141C, surface #171E29, text #ECE8E1 (15.12), muted #A3AAB8 (7.18 on surface), link #9DB8EA (8.35), brass #D8B56B (8.56), button text on #9DB8EA is #0F141C (9.21).

**Fonts.** UI/body: IBM Plex Sans Arabic 400/500/600 (OFL; fontsource `@fontsource/ibm-plex-sans-arabic` or Google Fonts download; Latin glyphs included, otherwise IBM Plex Sans OFL). Display (page titles >= 24px, KPI hero numbers, login title): Noto Naskh Arabic 600 (OFL, fontsource `@fontsource-variable/noto-naskh-arabic`), Latin counterpart Source Serif 4 600 (OFL, fontsource). Display face used in at most 3 places per screen so tables stay Plex. Mono for IDs: IBM Plex Mono (OFL). Tabular digits come free from Plex.

**Radius / shadow / border language.** Radius 6px controls, 10px cards, 14px modals; chips 6px (not pills). 1px hairline borders everywhere, shadow only on popovers and modals (0 8px 24px rgba(22,32,47,.10)). A signature **1.5px brass top rule** on cards that need emphasis (KPIs, request summary) and a brass start-edge bar on the selected row. No gradients.

**Density.** Default 44px rows, 15px body; generous 32px page gutters; comfortable/compact toggle.

**Motion.** Calm, 160-240 ms, decelerate; drawer from inline-end; approve stamp; no bounce.

**Inbox.** Ivory canvas, white table sheet with hairline border, sticky header on sunken tint. Row: avatar initials in navy tint, requester and request type stacked, amount in tabular Plex end-aligned, step chip, age. Filters as underlined tabs with counts in brass text. Top-of-page: Naskh display title "الوارد" with a thin brass rule below and a one-line summary ("٧ طلبات بانتظار اعتمادك" in Western digits: "7 طلبات...").

**Request detail.** Left/right split: summary card with brass top rule, huge amount in display face with original (struck) and corrected beneath; stepper as numbered navy nodes on a hairline; expense lines table; right (start side in RTL) dark-neutral receipt viewer with thumbnails and zoom/rotate; timeline in the lower area with a navy line. Action bar bottom-end: navy "اعتماد", outlined "طلب تعديل", outlined danger "رفض".

**Risk.** Naskh headings next to Plex can look dated if overused; mitigate by constraining display usage. Brass must stay under 5% of area.

### Direction B: "Nile Ledger" (modern cool-neutral, Stripe/Linear descendant)

**Mood.** Crisp, efficient, contemporary SaaS; emerald as a nod to prosperity and calm; very light cool greys. Feels like Stripe Dashboard in Arabic. Most "modern" for the owner, a bit less "traditional-premium."

**Palette.**

| Token | Hex | Use | Contrast |
|---|---|---|---|
| canvas | #F6F8FA | bg | |
| surface | #FFFFFF | cards | |
| ink | #0F172A | text | 16.77 on canvas |
| ink-2 | #475467 | secondary | 7.22 |
| border-input | #7A8494 | inputs | 3.55 |
| hairline | #E4E8EE | dividers | n/a |
| primary emerald | #0B6B57 | actions | white on it 6.45; on canvas 6.06 |
| primary hover | #08574A | | white 8.49 |
| hover tint | #E4EEEA | row hover/selected | ink 15.06 |
| amber accent text | #8F5B00 | highlights | 5.38 |
| success | #18794E on #E7F5EE | | 4.81 |
| warning | #8F5B00 on #FFF3D6 | | 5.20 |
| danger | #B42318 on #FEECEA | | 5.76 |
| info | #1D5FA8 on #E8F1FB | | 5.66 |

Dark variant: canvas #0B1220, surface #111A2B, emerald lifted to #3DBE9C for links, same rules as A (verify ratios when finalising).

**Fonts.** Headings/display and KPI numbers: Alexandria 600 (OFL, fontsource `@fontsource-variable/alexandria`) with `tabular-nums`. UI/body/tables: Noto Sans Arabic 400/500/600 (OFL, fontsource variable; tabular digits by default). Latin text uses the same families (Alexandria has Latin, Noto Sans Arabic lacks full Latin, so pair with Inter/Noto Sans for Latin: Noto Sans OFL). IDs: JetBrains Mono (OFL).

**Radius / shadow / border.** 8px controls, 12px cards, 16px modals; pill chips; 1px #E4E8EE borders plus 0 1px 2px rgba(15,23,42,.06); popovers 0 12px 32px rgba(15,23,42,.12). Subtle ambient gradient only on login.

**Density.** Default 40px rows, 14px table text; compact 32px.

**Motion.** Snappy 120-200 ms, subtle scale 0.98 -> 1 on popovers, shared-element drawer.

**Inbox.** Full-width table on pale grey, filter chips toolbar, saved-view tabs, status chips with icons, keyboard triage (J/K/A/R), split pane detail.

**Request detail.** Two-column with a sticky evidence panel, emerald primary action, parallel branches drawn as clean lanes with rounded nodes.

**Risk.** Emerald plus rounded geometry is close to many "generic modern SaaS" skins; senior managers may read it as "a tech start-up," not "established." Needs strong custom touches (illustrations, microcopy) to feel designed.

### Direction C: "Obsidian Diwan" (dark-first premium, Mercury/Linear descendant)

**Mood.** Night-banking: deep charcoal, warm off-white text, antique gold accent. Dramatic and clearly luxurious; best on a GM's laptop in a dim office; a light theme exists but is secondary.

**Palette (dark primary).**

| Token | Hex | Contrast |
|---|---|---|
| canvas | #0E1116 | |
| surface | #171B22 | |
| text | #ECE8E1 | 15.49 on canvas, 14.14 on surface |
| muted | #A1A7B3 | 7.83 on canvas, 7.15 on surface |
| gold | #D8B56B | 9.67 on canvas |
| gold button | bg #D8B56B, text #0E1116 | 9.67 |
| input border | #6B7383 | 3.97 on canvas |
| success | #5FD08F on #12261C | 8.26 |
| warning | #F2C14E on #2B2208 | 9.37 |
| danger | #FF8A80 on #2D1412 | 7.54 |
| info | #7DB4F5 on #101E30 | 7.77 |

Light secondary theme: reuse Direction A's ivory palette.

**Fonts.** Display/headings/KPIs: Noto Kufi Arabic 600 (OFL, fontsource variable; tabular digits). Body/tables: IBM Plex Sans Arabic. Mono: IBM Plex Mono. All OFL.

**Radius / shadow / border.** 8px controls, 12px cards; borders at rgba(255,255,255,.08), no shadows, elevation by lighter surface; gold 1px focus/selected glow; chips with tinted bg.

**Density.** Default 44px, large type.

**Motion.** Slow-calm 200-280 ms, soft fades, gold underline slides.

**Inbox / detail.** Dark list with gold unread dot; the amount as a large Kufi numeral in gold on detail; receipts glow on a darker well.

**Risk.** Dark-first conflicts with paper/print culture and bright office use; receipts photographed in daylight look harsh on dark; senior users often prefer light. Highest wow, highest adoption risk.

## 8. Recommendation: Direction A, "Majlis"

**Why it wins for this audience.**
1. **Respect.** Warm ivory + navy + brass is the visual language of institutions older Egyptian managers already trust (bank statements, ministry letterheads, annual reports, UAE/Gulf state systems). It looks deliberate and expensive rather than "tech start-up."
2. **Still modern.** Underneath, it uses today's best practice: hairlines, restrained single accent, tabular numerals, calm motion, split-pane triage, tokens by purpose. The owner gets Stripe-level craft; the skin is editorial instead of generic SaaS.
3. **Arabic-native.** Plex Sans Arabic for UI is sober and number-safe; a Naskh display touch on titles and KPI figures is exactly what a human designer would add and what generic bootstrap output never has. It also makes screenshots, printouts and PDFs feel branded.
4. **Safe on accessibility.** Every text/background pair computed above passes AA (lowest text ratio 4.70, most >=5.4); input borders pass 3:1; dark variant verified.
5. **Differentiation without risk.** Brass hairline + top rule gives a recognisable signature at almost zero visual cost. Direction B is the fallback if the owner wants a cooler, more tech-forward look (same tokens structure, swap palette and fonts). Direction C should only be offered as the dark theme, not the default.

**Suggested next steps for implementation (not done here).** Build tokens as CSS variables mapped into Tailwind (`colors`, `borderRadius`, `boxShadow`, `fontFamily`), self-host woff2 via `next/font/local`, create `Num`, `Money`, `Icon`, `StatusChip`, `DataTable`, `Stepper`, `EvidenceViewer`, `PermissionMatrix` primitives first, then restyle login -> inbox -> request detail as the proof-of-direction slice, and review that slice with the owner and one senior manager before touching the rest. Show them Western vs Arabic-Indic digits side by side to settle the numeral question.

## 9. Open questions for the owner

1. Western or Arabic-Indic digits in money columns (default proposed: Western)?
2. Is there an existing company logo/colour that must be respected (if navy or gold clashes)?
3. Any Hijri date requirement in documents?
4. Printing: do approvals need a printable one-page request sheet with signature block?
5. Dark mode: required at launch or later?
