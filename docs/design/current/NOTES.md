# Current UI: screenshots and honest critique

Captured 2026-11-10 against the running demo (web :3000 production build, API :4000, simulator :3010), Arabic/RTL (default locale). Files: `<page>-desktop.png` (1440x900 viewport, full page) and `<page>-mobile.png` (390x844, full page). Logged in as `admin` unless the name starts with `supervisor-`. Request detail uses DE-26-000011 (admin, mid-workflow at Chief Accountant, 2 lines with photos) and DE-26-000003 (supervisor, with the action panel). English locale was not captured.

Screenshot caveats: the admin inbox is empty because admin holds no queue role (use `supervisor-inbox-*` for a populated view). The desktop sidebar is `sticky h-screen`, so in full-page captures it ends at 900px; that is a capture effect, but the nav list itself overflows (see Global).

## Global (every screen)

- Generic "Tailwind admin template" look: slate-100 page, white cards with a hairline border, one blue (brand-700) accent, a dark slate-900 sidebar. Nothing says "fleet / expenses / Egypt"; no brand identity beyond a blue square with a "D".
- Single font (Cairo 400/600/700). Arabic is good, but Latin text, digits and codes (DE-26-000011, plate numbers, amounts) have no distinct treatment; numbers are not tabular.
- Sidebar: 25 items in 3 groups, all the same weight and icon style; the "Main" group mixes daily work (Inbox) with configuration (Workflows, Templates). It needs scrolling on a 900px screen, and "Admin" is cut off below the fold. No collapse, no counters (inbox badge), no search.
- Top bar is nearly empty: language toggle, bell, username, a bare logout icon. No page-level breadcrumbs, no global search, no environment/role indicator. The logout icon has no label.
- Date inputs show the browser `mm/dd/yyyy` placeholder in an RTL Arabic UI (native `<input type=date>`, en-US rendering); inconsistent with the Cairo-time `yyyy-MM-dd` used everywhere else.
- Filter blocks are plain bordered grids of labelled inputs, always expanded on desktop; each page re-implements the same pattern. No saved filters, no chips.
- Empty states are a faint grey icon plus one line; no guidance or call to action.
- Mixed tone of badges (pastel pill) and solid buttons; status colours are consistent but there is no legend. Disabled primary buttons are washed-out light blue (login).
- Hierarchy is flat: page title, subtitle, card, card. Few places use size or colour to say "this is the important number".
- RTL: layout mirroring is mostly correct (logical utilities). Problems: mixed-direction strings (e.g. "آخر قراءة 66901 (+7703)" renders with the parenthesis and number out of reading order); the "-" separator between the two dashboard date inputs; amounts render as `ج.م 896.00` with the currency glyph on the visually wrong side in some cells ("p.ج 744.00" order). Chevrons/arrows in the stepper (">") point in the LTR direction inside an RTL flow in places.

## Login (login-*)
Centered white card on a dark-blue gradient. Clean but anonymous: no logo, no product description, no password show/hide, no error area visible, language toggle is an unlabeled-looking text link. On mobile it is fine (card scales) but the gradient background is flat.

## Inbox (inbox-*, supervisor-inbox-*)
Admin view is the empty state under a big filter card: the filter card dominates when there is no data. The "all my roles (0)" pill and the two tabs ("waiting for action" / "waiting for driver correction") are low contrast; the tab underline is thin. This is the primary daily screen for approvers yet it is a generic table. Mobile collapses the filters behind a "Filter" disclosure (good) but the card stack is plain text rows with repeated field labels. No SLA/overdue emphasis, no lock indicator beyond a tiny badge, no quick approve.

## Requests list (requests-*)
Desktop: filter grid plus a dense table; fine but flat. Mobile is the weak spot: every request becomes a card with 5 repeated label/value rows (driver, vehicle, total, status, date) so 25 requests make a ~5500px page; there is no sticky header, no compact row, labels are repeated for every card, and the filter block takes a full screen of stacked fields before the first result.

## Request detail (request-detail-*, supervisor-request-detail-*)
Best screen, still generic. Approval route is a horizontal stepper of equal-size boxes: parallel steps are a dashed stack that looks like a bug; skipped steps are struck-through and grey; the active step has only a pale-blue outline, so "where is it now" is not obvious. The request header card shows data as a 4-column label/value grid with mixed alignment (value sizes differ, an odometer note wraps awkwardly). Lines are big cards with a tiny receipt thumbnail (about 95px) that is the most important evidence for the approver; no obvious zoom affordance. The timeline repeats "الطلب وصل لخطوة جديدة" many times with little signal; icons are just coloured dots. The action panel (approve / request correction / reject) sits in the left column above the timeline, below the fold on laptops for requests with many lines; "reject" is a loud solid red equal in weight to approve. On mobile the stepper wraps to a ragged grid and the page is very long (~2150px); actions are at the bottom, not sticky.

## Dashboard (dashboard-*)
Four KPI cards, then horizontal bar lists for month, expense type, vehicle, top vehicles, delay by role, average approval time. All the same blue; no chart types beyond bars; "Vehicle" and "Top vehicles" show the same data twice; "average hours" bars all show 0 and look broken (empty/zero data not handled gracefully); two empty states sit in prominent cards. The date range inputs float top-left with no label or presets. KPI numbers are large but there is no trend, no delta, no colour meaning.

## Reports (reports-*)
Report builder form (filters, grouping, columns) on one long page; exports list below. Functional and dense, but the form is a wall of inputs with no grouping, no preview of what the report will contain, no presets. Mobile stacks everything; the result table needs horizontal scroll.

## Workflows list / builder (workflows-*, workflow-builder-*)
List is a tiny table with one row (one workflow per request type). Builder is a vertical list of collapsed step cards, each with a number bubble, name, small badges (conditional, extra, parallel, payment) and a "Details" dropdown; there is no visual flow, no drag handle affordance, no way to see parallel groups or conditions at a glance; the version bar and "note" field sit above as ordinary form controls. The simulator card at the bottom is a row of category checkboxes plus an amount; results are text. On mobile the step cards stay usable but the editing form inside "Details" is long.

## Templates list / editor (templates-*, template-editor-*)
Editor has a live preview on one side (good) but the preview column is narrow and stops at the signature blocks while the form column runs 3x longer, so the preview scrolls out of view (not sticky as captured). Header fields and line columns are lists of text inputs showing raw keys (`requestNumber`, `vehicleNumber`) next to checkboxes; labels are tiny grey text. There is no create-template button and no layout picker (the layoutKey is not visible). Mobile stacks preview above the form; preview text is tiny.

## SAP monitor (sap-*)
A plain table with filters; status pills are clear (posted green, failed red) and the failed row has a retry button. No summary counters (posted/failed/pending), no detail drawer in the capture, the attempts column is a bare number, error text is truncated in tiny red. Mobile card view repeats labels like the requests list.

## Master data: vehicles, expense types, drivers (master-*)
All use the shared CrudPage: search, add, import/export buttons, table with row actions. Consistent but undifferentiated; no inline status toggle, no bulk actions, rows are visually identical. Expense types modal is the only place to see category fields and approval roles, so the "request type" concept is invisible. Drivers shows a Telegram linked/not linked badge and an unlink action in the row menu only.

## Assignments (assignments-*)
Tabs for current / history, a table and a modal to assign a vehicle. Functional; nothing explains that one driver can hold one open assignment at a time.

## Admin: users, roles, audit (admin-*)
Users: a table plus a modal with roles multiselect and a read-only Telegram badge; no unlink for users. Roles: the permission matrix is a very tall checkbox grid (about 2300px) with role columns, group headers and a "+" toggle that is easy to miss; on mobile it scrolls horizontally with the first role columns cut off ("GER ACCOUNTANT") and the sticky label column eats half the width. Audit: a long table of raw action codes; no diff viewer visible, no actor/entity filters beyond the basics.

## Notifications (notifications-*)
A plain list with read/unread dots; no grouping by day, no actions, no link affordance beyond the row.

## Master drivers / driver simulator (master-drivers-*, driver-simulator-*)
Simulator is a standalone Telegram-like chat (blue header, beige bubbles area) centered at 440px width on a flat grey-blue page, with its own style unrelated to the web app. It is a test tool, not a product screen; on desktop it wastes the whole viewport, on mobile it fills the screen as intended. Initial state is just "type /start to begin".

## Priorities for a redesign
1. A real visual identity and token set (type scale, spacing, status colours, elevation) instead of default Tailwind slate/blue.
2. Navigation: group by role-based task (Work, Configuration, Data, Admin), badges for inbox counts, collapsible sidebar, a command/search bar.
3. A mobile-first card/row pattern for lists (compact rows, tap targets) and a sticky action bar on request detail.
4. Request detail: stronger "current step" emphasis, bigger evidence viewer, quieter timeline, de-emphasised reject.
5. Builder/editor screens (workflow, template, and the missing request-type editor) need a visual canvas or at least structured previews, not stacks of text inputs.
6. Localised date inputs and consistent number/currency/bidi formatting.
