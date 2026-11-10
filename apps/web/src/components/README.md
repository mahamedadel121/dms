# Web kit (phase 2, "Majlis")

Spec: `docs/plan-v2/DESIGN_SPEC.md`. All pages are client-rendered, RTL-first, and use **logical** Tailwind utilities only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`). Never `ml/mr/pl/pr/left/right/text-left/text-right`.

## Tokens
Colours are CSS variables (RGB triplets) in `app/globals.css`, exposed as semantic Tailwind classes in `tailwind.config.ts`: `bg-canvas`, `bg-surface` (`-2`, `-3`), `border-hairline`, `border-line`, `border-input`, `text-ink` (`-2`, `-3`, `-disabled`), `bg-primary`, `text-on-primary`, `bg-brass` / `text-brass-ink` / `bg-brass-tint`, and `success|warning|danger|info` (+ `-bg`). Dark theme = `html[data-theme="dark"]`. Never write hex values or `slate-*` / `brand-*` classes in new code (legacy aliases only keep old pages on-theme). Fonts: Plex Sans Arabic (body), Noto Naskh (`.display`), Plex Mono (`.code`). Helpers: `.rule-double`, `.num`, `.code`, `.display`, `.skeleton`.

## Lib (`@/lib/*`)
`format.ts` (`formatDay/DayTime/Time/Relative/Count/Percent`, `formatNumber`, `formatEgp`, `ltrIsolate`, `setNumeralSystem`), `prefs.tsx` (`usePrefs`: theme, numerals, density, sidebar), `prefs-core.ts` (pure), `useMediaQuery.ts` (`useIsMobile`, `useIsDesktop`), `useCountUp.ts`, `i18n.tsx` (`useT`), `api.ts`, `auth.tsx`.

## Kit (`@/components/ui`, import from the index)
- Display of data: `Num`, `Money` (`original` shows an edited chip), `Code` (identifiers), `DateText` (`day|dayTime|relative|long`), `StatusChip` (`kind` + `status` + translated `label`), `Badge`, `ActiveBadge`.
- Layout: `Page` (`testId` = `page-<slug>`), `PageHeader` (title, actions, back, rule), `Card` (`accent="rule"` for the one key-number card), `Rule`, `DL`/`DLItem`, `Tabs`, `Stat`, `Banner`, `EmptyState`, `ErrorBlock`, `Skeleton*`, `Spinner`.
- Controls: `Button` (primary, secondary, ghost, danger, danger-outline, link; sizes sm/md/lg), `IconButton` (needs `label`), `Input` (`numeric`, adornments), `Textarea`, `Select`, `Checkbox`, `Switch`, `SegmentedControl`, `SearchInput`, `FormField`.
- Signature: `Seal` (stamped state mark), `BrandMark` (`components/brand`).
- Overlays and data (`Modal`, `Drawer`, `Menu`, `Toast`, `DataTable`, `DateField`, `FilterBar`, lookups) are documented in the spec section 7.3.

## Rules
1. Icons only through `<Icon as={X} />`; mirror directional icons with `mirror`.
2. Numbers, money, dates and codes always go through `Num`, `Money`, `DateText`, `Code`.
3. Never colour alone: statuses carry an icon and a word. Reject is an outline button; solid danger lives only in the confirm dialog.
4. Every user-facing string comes from `t('ns.key')` with the key in both `ar` and `en`.
5. Every page root is `<Page testId="page-...">` and its heading is `<PageHeader>`.
