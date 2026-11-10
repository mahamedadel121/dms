# Reference images: sources and what to learn

Internal inspiration only. Screenshots of public pages taken with Playwright (Chromium, 1440x900 viewport, top of page unless noted) on 2026-11-10, then palette-compressed with sharp. Nothing here is redistributed or shipped. Not obtained: DGA design system (design.dga.gov.sa timed out from this machine), Careem (Cloudflare captcha), any real logged-in product UI (all are marketing or docs pages, so product UI is seen through hero mock-ups).

## Premium enterprise / fintech direction

| File | Source | Learn |
|---|---|---|
| linear-homepage.png | https://linear.app | Near-black canvas, one quiet accent, tight Inter-style type, hero built around a real product frame. Restraint and density. |
| linear-features-issue-tracking.png | https://linear.app/features (scrolled) | Small product vignettes with 1px hairline borders and low-contrast depth instead of shadows; compact list rows. |
| stripe-dashboard-product.png | https://stripe.com/payments (scrolled) | Icon + short heading + one sentence feature grid; generous whitespace; precise numbers. |
| stripe-billing-product.png | https://stripe.com/billing | Soft gradient only as a background accent, content stays neutral; layered cards with real data. |
| stripe-docs-dashboard-ui.png | https://docs.stripe.com/dashboard/basics | Documentation chrome: left tree, right on-page nav, restrained blue. Reference for in-app help. |
| ramp-expense-management.png | https://ramp.com/expense-management | Expense/approval card with agent review states; single lime accent against neutral; large editorial headline. |
| ramp-approvals-workflows.png | https://ramp.com/spend-management (scrolled) | Spend-control feature set; how approval and policy features are explained with small UI cards. |
| brex-expense-management.png | https://www.brex.com/product/spend-management | Dark hero with desktop compliance report plus a phone mock-up: desktop and mobile shown as one system; dense bar charts with numeric labels. |
| mercury-homepage.png | https://mercury.com | Calm banking tone: photography plus quiet UI; trust language. |
| mercury-dashboard-ui.png | https://mercury.com (scrolled) | Dark dashboard: left nav, balance chart, KPI tiles in soft rounded panels. Closest "banking" look. |
| attio-homepage.png | https://attio.com | Light, airy SaaS: pale canvas, black primary buttons, small-radius product window with traffic lights. |
| notion-homepage.png | https://www.notion.com | Warm neutral, black primary button, serif-ish editorial headline. Shows a human/editorial tone in a work tool. |

## Arabic / RTL products and government systems

| File | Source | Learn |
|---|---|---|
| tabby-arabic-homepage.png | https://tabby.ai/ar-AE | Full RTL marketing layout, heavy Arabic display headline, nav order reversed; loud and consumer-playful (what we do NOT want for senior managers). |
| tamara-arabic-homepage.png | https://tamara.co/ar-sa | Very bold Arabic display face on a calm ground, purple accent; Arabic at 80px+ looks fine, but weight is consumer-brand. |
| uae-design-system.png | https://designsystem.gov.ae/ | Government DS: warm beige + bronze/gold on white, outlined buttons, circular progress, 3-step stepper. Evidence that a gold/bronze "state" palette reads official and premium in the Gulf. |

## Component and pattern references

| File | Source | Learn |
|---|---|---|
| carbon-data-table.png | https://carbondesignsystem.com/components/data-table/usage/ | Enterprise table anatomy: toolbar, batch actions, density, sorting, expansion. (Cookie banner overlays the lower part.) |
| primer-data-table.png | https://primer.style/components/data-table | Compact table with column widths, density and pagination states. |
| polaris-index-table.png | https://polaris-react.shopify.com/components/tables/index-table | Docs for index table: saved views as tabs, bulk selection, sticky header. |
| shadcn-ui-dashboard-example.png | https://ui.shadcn.com/examples/dashboard | KPI card row (value, delta chip, one-line caption) + area chart + data table. Good KPI structure. The site header also has an RTL demo tab. |
| shadcn-ui-tasks-table.png | https://ui.shadcn.com/examples/tasks | Table with status/priority icon cells, filter chips in toolbar, view options (column toggle). |
| radix-colors.png | https://www.radix-ui.com/colors | 12-step scales with defined use per step (backgrounds, borders, solids, text) and warm neutrals (Sand, Olive). Method for building tokens. |
| vercel-geist-colors.png | https://vercel.com/geist/colors | 10-step scales, step-to-purpose mapping, dark/light parity. |
| material-design-motion.png | https://m3.material.io/styles/motion/overview/how-it-works | Motion system language (springs, durations). We borrow principles only, not the expressive style. |

## Icons

| File | Source | Learn |
|---|---|---|
| lucide-icon-set.png | https://lucide.dev/icons/ | 24px grid, 2px stroke (adjustable), ISC licence; huge set; customiser for stroke. |
| phosphor-icons.png | https://phosphoricons.com/ | Six weights (thin to duotone), MIT; duotone gives a more "crafted" feel. |
| tabler-icons.png | https://tabler.io/icons | 6000+ icons, MIT, adjustable stroke; broad finance/office coverage. |

## Arabic fonts (Google Fonts specimen pages, OFL)

All show the same Arabic pangram at large size, so shapes are directly comparable.

| File | Source | Learn |
|---|---|---|
| gfonts-ibm-plex-sans-arabic-real.png | https://fonts.google.com/specimen/IBM+Plex+Sans+Arabic | Neo-grotesque, even colour, restrained; the most "banking/corporate" of the set. |
| gfonts-readex-pro.png | https://fonts.google.com/specimen/Readex+Pro | Geometric, open apertures, Lexend-style readability; friendlier. |
| gfonts-noto-kufi-arabic.png | https://fonts.google.com/noto/specimen/Noto+Kufi+Arabic | Unmodulated Kufi, very regular, tabular digits. |
| gfonts-noto-naskh-arabic.png | https://fonts.google.com/noto/specimen/Noto+Naskh+Arabic | Modulated Naskh; traditional book/newspaper feel; candidate for editorial headings. |
| gfonts-alexandria.png | https://fonts.google.com/specimen/Alexandria | Geometric, wide, strong display character; variable. |
| gfonts-almarai.png | https://fonts.google.com/specimen/Almarai | Neo-grotesque, light and clean, but only 4 weights. |
| gfonts-cairo.png | https://fonts.google.com/specimen/Cairo | Egyptian-origin, superelliptic, very familiar to Egyptian eyes; slightly dated/"web 2015". |
| gfonts-tajawal.png | https://fonts.google.com/specimen/Tajawal | Humanist, compact; small-looking Arabic digits. |
| gfonts-vazirmatn.png | https://fonts.google.com/specimen/Vazirmatn | Persian-origin but full Arabic; neutral, good Latin (Roboto-like). |
| own-render-arabic-font-comparison.png | Own render (Playwright, Google Fonts CSS loaded for the test only) | Same sentence with Western digits, Arabic-Indic digits and an 8888/1111 tabular test for 12 fonts. Evidence for the numeral table in RESEARCH.md section 2. |
