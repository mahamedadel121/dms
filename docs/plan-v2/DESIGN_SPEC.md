# DMS phase 2: design specification ("Majlis")

Audience: the Sonnet/Haiku agents that implement `docs/plan-v2/PLAN_V2.md`. Everything needed to build the UI is in this file. Do not invent tokens, component names, props, test ids or strings: if something is missing, use the closest rule in this file and add one line to `docs/CONTRACT_NOTES.md`.

Sections: 1 direction, 2 tokens (exact code), 3 fonts, 4 formatting rules, 5 icons and RTL, 6 motion, 7 component kit, 8 app shell, 9 per-screen specs, 10 test ids, 11 new i18n keys, 12 file map (rewritten vs restyled), 13 driver simulator.

---

## 1. Direction

**Majlis: the stamped ledger.** The app looks like the stationery of a private bank: warm ivory paper, deep navy ink, one thin brass line. Structure comes from hairlines and type, never from grey boxes, gradients or drop shadows.

Three signature devices. They are the only decoration in the product; use them exactly where specified.

1. **The letterhead rule.** A double rule (thick navy line, small gap, thin brass line). It sits across the very top of the app, under every page title, and on top of the one card per screen that carries the key number.
2. **Naskh display type.** Page titles and hero amounts are set in Noto Naskh Arabic (the voice of an Egyptian newspaper of record). Everything else is IBM Plex Sans Arabic. Identifiers (request numbers, plates, codes, SAP documents) are IBM Plex Mono.
3. **The seal (الختم).** Approving, paying or rejecting a request stamps a round seal on the request sheet. It is the one animated moment in the app, and it stays on the sheet afterwards as the state mark.

Rules that keep it premium:
- 90% neutrals. Navy only for the primary action, links, the active stepper node and focus. Brass on at most three elements per screen (letterhead rule, active nav bar, one emphasis). Semantic colours only inside chips, banners and the stepper.
- Never colour alone: every status has an icon and a word.
- Dense inside a group, generous between groups. Rows 44px, page gutter 32px, 24px between cards.
- No pills except avatars and count badges. Chips and buttons have a 6px radius.
- No emoji, no uppercase, no letter-spacing on Arabic, no italics.
- Reject is never a solid red button on a page. It is an outline; the solid danger button exists only inside the confirm dialog.

---

## 2. Tokens

All colours are CSS variables holding space-separated RGB triplets, consumed by Tailwind as `rgb(var(--x) / <alpha-value>)`. Dark theme = `html[data-theme="dark"]`. Components must use the semantic Tailwind classes of 2.2 (`bg-surface`, `text-ink-2`, `border-hairline`...). Never write a hex value or a `slate-*`/`brand-*` class in new code.

### 2.1 `apps/web/src/app/globals.css` (replace the whole file with this)

```css
@import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
@import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
@import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
@import '@fontsource/ibm-plex-sans-arabic/latin-400.css';
@import '@fontsource/ibm-plex-sans-arabic/latin-500.css';
@import '@fontsource/ibm-plex-sans-arabic/latin-600.css';
@import '@fontsource-variable/noto-naskh-arabic/wght.css';
@import '@fontsource/ibm-plex-serif/latin-600.css';
@import '@fontsource/ibm-plex-mono/latin-400.css';
@import '@fontsource/ibm-plex-mono/latin-500.css';
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* surfaces */
  --canvas: 250 247 242;        /* #FAF7F2 page */
  --surface: 255 255 255;       /* #FFFFFF cards, tables, inputs */
  --surface-2: 241 236 226;     /* #F1ECE2 sidebar, table header, wells, row hover */
  --surface-3: 233 226 212;     /* #E9E2D4 pressed, hover on surface-2 */
  /* lines */
  --hairline: 230 224 211;      /* #E6E0D3 card borders, dividers */
  --line: 207 199 182;          /* #CFC7B6 stronger divider, secondary button border */
  --input: 124 133 150;         /* #7C8596 input and checkbox borders (3.5:1) */
  /* ink */
  --ink: 22 32 47;              /* #16202F text */
  --ink-2: 75 85 101;           /* #4B5565 secondary text */
  --ink-3: 94 102 117;          /* #5E6675 captions, placeholders */
  --ink-disabled: 154 161 173;  /* #9AA1AD */
  /* primary (navy) */
  --primary: 20 40 75;          /* #14284B */
  --primary-hover: 15 31 58;    /* #0F1F3A */
  --primary-active: 11 24 48;   /* #0B1830 */
  --primary-tint: 232 236 243;  /* #E8ECF3 avatar bg, selected tint */
  --on-primary: 255 255 255;
  --focus: 47 95 168;           /* #2F5FA8 focus ring */
  --link: 31 78 140;            /* #1F4E8C */
  /* brass */
  --brass: 201 164 92;          /* #C9A45C fills and rules only */
  --brass-ink: 138 106 47;      /* #8A6A2F brass-coloured text */
  --brass-tint: 244 234 211;    /* #F4EAD3 */
  --brass-tint-ink: 110 82 31;  /* #6E521F text on brass-tint */
  /* semantic: fg is text/icon, bg is the chip or banner fill */
  --success: 30 107 70;         /* #1E6B46 */
  --success-bg: 230 242 234;    /* #E6F2EA */
  --warning: 138 90 0;          /* #8A5A00 */
  --warning-bg: 251 240 217;    /* #FBF0D9 */
  --danger: 161 45 45;          /* #A12D2D also the solid danger button */
  --danger-hover: 138 36 36;    /* #8A2424 */
  --danger-bg: 251 233 231;     /* #FBE9E7 */
  --on-danger: 255 255 255;
  --info: 31 78 140;            /* #1F4E8C */
  --info-bg: 230 238 248;       /* #E6EEF8 */
  /* fixed in both themes */
  --viewer: 14 17 22;           /* #0E1116 receipt viewer background */
  --viewer-ink: 236 232 225;    /* #ECE8E1 */
  --scrim: 22 32 47;            /* used at 45% */
  --legacy-white: 255 255 255;  /* backs Tailwind `white` so un-migrated classes follow the theme */
  /* elevation */
  --shadow-card: 0 1px 2px rgb(22 32 47 / 0.05);
  --shadow-pop: 0 8px 24px rgb(22 32 47 / 0.10), 0 1px 2px rgb(22 32 47 / 0.06);
  --shadow-modal: 0 24px 64px rgb(22 32 47 / 0.16);
  --shadow-bar: 0 -4px 16px rgb(22 32 47 / 0.06);
  /* type */
  --font-sans: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif;
  --font-display: 'Noto Naskh Arabic Variable', 'IBM Plex Serif', 'Times New Roman', serif;
  --font-mono: 'IBM Plex Mono', 'IBM Plex Sans Arabic', Consolas, monospace;
  /* motion */
  --dur-1: 120ms;   /* hover, press */
  --dur-2: 180ms;   /* popover, chip, tab */
  --dur-3: 240ms;   /* modal, drawer, sheet */
  --dur-4: 320ms;   /* layout moves */
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-inout: cubic-bezier(0.4, 0, 0.2, 1);
  /* density (table row height); see html[data-density] below */
  --row-h: 44px;
  color-scheme: light;
}

html[lang='en'] {
  --font-display: 'IBM Plex Serif', 'Noto Naskh Arabic Variable', 'Times New Roman', serif;
}
html[data-density='comfortable'] { --row-h: 52px; }
html[data-density='compact'] { --row-h: 36px; }

html[data-theme='dark'] {
  --canvas: 15 20 28;           /* #0F141C */
  --surface: 23 30 41;          /* #171E29 */
  --surface-2: 31 40 54;        /* #1F2836 */
  --surface-3: 40 51 68;        /* #283344 */
  --hairline: 42 52 69;         /* #2A3445 */
  --line: 58 70 90;             /* #3A465A */
  --input: 107 115 131;         /* #6B7383 */
  --ink: 236 232 225;           /* #ECE8E1 */
  --ink-2: 163 170 184;         /* #A3AAB8 */
  --ink-3: 139 147 163;         /* #8B93A3 */
  --ink-disabled: 92 101 117;   /* #5C6575 */
  --primary: 157 184 234;       /* #9DB8EA */
  --primary-hover: 180 201 240; /* #B4C9F0 */
  --primary-active: 134 166 226;/* #86A6E2 */
  --primary-tint: 30 42 64;     /* #1E2A40 */
  --on-primary: 15 20 28;       /* #0F141C */
  --focus: 157 184 234;
  --link: 157 184 234;
  --brass: 216 181 107;         /* #D8B56B */
  --brass-ink: 216 181 107;
  --brass-tint: 46 39 22;       /* #2E2716 */
  --brass-tint-ink: 230 203 143;/* #E6CB8F */
  --success: 95 208 143;        /* #5FD08F */
  --success-bg: 18 38 28;       /* #12261C */
  --warning: 242 193 78;        /* #F2C14E */
  --warning-bg: 43 34 8;        /* #2B2208 */
  --danger: 255 138 128;        /* #FF8A80 */
  --danger-hover: 255 164 156;  /* #FFA49C */
  --danger-bg: 45 20 18;        /* #2D1412 */
  --on-danger: 26 11 10;        /* #1A0B0A */
  --info: 125 180 245;          /* #7DB4F5 */
  --info-bg: 16 30 48;          /* #101E30 */
  --scrim: 0 0 0;
  --legacy-white: 23 30 41;
  --shadow-card: 0 0 0 1px rgb(255 255 255 / 0.02);
  --shadow-pop: 0 8px 24px rgb(0 0 0 / 0.45), 0 0 0 1px rgb(255 255 255 / 0.05);
  --shadow-modal: 0 24px 64px rgb(0 0 0 / 0.6), 0 0 0 1px rgb(255 255 255 / 0.06);
  --shadow-bar: 0 -4px 16px rgb(0 0 0 / 0.35);
  color-scheme: dark;
}

@layer base {
  html { -webkit-text-size-adjust: 100%; font-synthesis: none; }
  body {
    @apply bg-canvas font-sans text-base text-ink antialiased;
    font-feature-settings: 'tnum' 1, 'lnum' 1;
  }
  html[data-theme='dark'] body { line-height: 27px; }
  h1, h2, h3, h4 { letter-spacing: 0; }
  a { text-underline-offset: 0.25em; text-decoration-skip-ink: auto; }
  ::selection { background: rgb(var(--brass) / 0.35); }
  :focus-visible { outline: 2px solid rgb(var(--focus)); outline-offset: 2px; border-radius: 4px; }
  input[type='number'], input[type='date'], input[type='tel'] { text-align: start; }
  /* thin, quiet scrollbars */
  * { scrollbar-width: thin; scrollbar-color: rgb(var(--line)) transparent; }
}

@layer components {
  /* letterhead double rule: 2px ink, 2px gap, 1px brass */
  .rule-double { height: 5px; border-top: 2px solid rgb(var(--primary)); border-bottom: 1px solid rgb(var(--brass)); }
  /* numbers, ids, dates: always LTR, isolated, tabular */
  .num { direction: ltr; unicode-bidi: isolate; font-variant-numeric: tabular-nums lining-nums; white-space: nowrap; }
  .code { direction: ltr; unicode-bidi: isolate; font-family: var(--font-mono); font-feature-settings: 'liga' 0; white-space: nowrap; }
  .display { font-family: var(--font-display); font-weight: 700; font-variant-numeric: tabular-nums lining-nums; }
  html[lang='en'] .display { font-weight: 600; }
  /* login panel lattice (the only pattern in the app) */
  .lattice {
    background-image:
      repeating-linear-gradient(45deg, rgb(var(--brass) / 0.07) 0 1px, transparent 1px 28px),
      repeating-linear-gradient(-45deg, rgb(var(--brass) / 0.07) 0 1px, transparent 1px 28px);
  }
  .skeleton {
    background: linear-gradient(90deg, rgb(var(--surface-2)) 25%, rgb(var(--surface-3)) 37%, rgb(var(--surface-2)) 63%);
    background-size: 400% 100%;
    animation: shimmer 1.4s var(--ease-inout) infinite;
    border-radius: 4px;
  }
}

@keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes pop-in { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
@keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes drawer-in { from { transform: translateX(calc(var(--dir, 1) * 100%)); } to { transform: translateX(0); } }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes seal-stamp {
  0% { opacity: 0; transform: rotate(-14deg) scale(1.7); }
  60% { opacity: 1; transform: rotate(-8deg) scale(0.96); }
  100% { opacity: 1; transform: rotate(-8deg) scale(1); }
}
@keyframes ring-once { 0% { box-shadow: 0 0 0 0 rgb(var(--primary) / 0.35); } 100% { box-shadow: 0 0 0 10px rgb(var(--primary) / 0); } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
}

@media print {
  [data-no-print] { display: none !important; }
  body { background: #fff; color: #000; }
}
```

`--dir` for `drawer-in`: set `style={{ '--dir': side === 'end' ? (dir === 'rtl' ? -1 : 1) : (dir === 'rtl' ? 1 : -1) }}` on the drawer panel (an end-side drawer in RTL enters from the left).

### 2.2 `apps/web/tailwind.config.ts` (replace the whole file with this)

```ts
import type { Config } from 'tailwindcss';

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: { sans: ['var(--font-sans)'], display: ['var(--font-display)'], mono: ['var(--font-mono)'] },
      fontSize: {
        xs: ['12px', { lineHeight: '20px' }],   // captions, chips
        '13': ['13px', { lineHeight: '20px' }], // table headers, field labels
        sm: ['14px', { lineHeight: '22px' }],   // table cells, buttons, inputs
        base: ['15px', { lineHeight: '26px' }], // body
        lg: ['17px', { lineHeight: '28px' }],   // card titles, lead
        xl: ['20px', { lineHeight: '30px' }],   // section titles
        '2xl': ['24px', { lineHeight: '34px' }],// page title (mobile), request number
        '3xl': ['30px', { lineHeight: '42px' }],// page title (desktop)
        '4xl': ['40px', { lineHeight: '52px' }],// hero amount
      },
      colors: {
        canvas: v('canvas'),
        surface: { DEFAULT: v('surface'), 2: v('surface-2'), 3: v('surface-3') },
        hairline: v('hairline'),
        line: v('line'),
        input: v('input'),
        ink: { DEFAULT: v('ink'), 2: v('ink-2'), 3: v('ink-3'), disabled: v('ink-disabled') },
        primary: { DEFAULT: v('primary'), hover: v('primary-hover'), active: v('primary-active'), tint: v('primary-tint') },
        'on-primary': v('on-primary'),
        focus: v('focus'),
        link: v('link'),
        brass: { DEFAULT: v('brass'), ink: v('brass-ink'), tint: v('brass-tint'), 'tint-ink': v('brass-tint-ink') },
        success: { DEFAULT: v('success'), bg: v('success-bg') },
        warning: { DEFAULT: v('warning'), bg: v('warning-bg') },
        danger: { DEFAULT: v('danger'), hover: v('danger-hover'), bg: v('danger-bg') },
        'on-danger': v('on-danger'),
        info: { DEFAULT: v('info'), bg: v('info-bg') },
        viewer: { DEFAULT: v('viewer'), ink: v('viewer-ink') },
        scrim: v('scrim'),
        // ---- legacy aliases: keep un-migrated classes on-theme in light and dark. Do NOT use in new code. ----
        white: v('legacy-white'),
        slate: { 50: v('surface-2'), 100: v('surface-2'), 200: v('hairline'), 300: v('line'), 400: v('ink-disabled'), 500: v('ink-3'), 600: v('ink-2'), 700: v('ink-2'), 800: v('ink'), 900: v('ink') },
        brand: { 50: v('primary-tint'), 100: v('primary-tint'), 300: v('ink-disabled'), 500: v('focus'), 600: v('primary'), 700: v('primary'), 800: v('primary-hover'), 900: v('primary-hover') },
        emerald: { 50: v('success-bg'), 100: v('success-bg'), 300: v('success'), 500: v('success'), 600: v('success'), 700: v('success'), 800: v('success'), 900: v('success') },
        red: { 50: v('danger-bg'), 100: v('danger-bg'), 200: v('danger'), 300: v('danger'), 500: v('danger'), 600: v('danger'), 700: v('danger-hover'), 800: v('danger'), 900: v('danger') },
        amber: { 50: v('warning-bg'), 100: v('warning-bg'), 200: v('warning'), 300: v('warning'), 500: v('warning'), 600: v('warning'), 700: v('warning'), 800: v('warning'), 900: v('warning') },
        sky: { 50: v('info-bg'), 100: v('info-bg'), 300: v('info'), 500: v('info'), 600: v('info'), 700: v('info'), 800: v('info'), 900: v('info') },
        violet: { 50: v('brass-tint'), 100: v('brass-tint'), 300: v('brass'), 600: v('brass-ink'), 700: v('brass-tint-ink'), 800: v('brass-tint-ink'), 900: v('brass-tint-ink') },
        purple: { 100: v('brass-tint'), 700: v('brass-tint-ink'), 800: v('brass-tint-ink') },
      },
      borderRadius: { sm: '4px', DEFAULT: '6px', md: '6px', lg: '10px', xl: '14px', '2xl': '20px' },
      boxShadow: { card: 'var(--shadow-card)', pop: 'var(--shadow-pop)', modal: 'var(--shadow-modal)', bar: 'var(--shadow-bar)', sm: 'var(--shadow-card)', md: 'var(--shadow-pop)', xl: 'var(--shadow-modal)' },
      zIndex: { sticky: '10', bar: '20', topbar: '30', drawer: '40', pop: '50', modal: '60', toast: '70', tip: '80' },
      transitionDuration: { 1: '120ms', 2: '180ms', 3: '240ms', 4: '320ms' },
      transitionTimingFunction: { out: 'cubic-bezier(0.2, 0, 0, 1)', in: 'cubic-bezier(0.4, 0, 1, 1)', inout: 'cubic-bezier(0.4, 0, 0.2, 1)' },
      spacing: { row: 'var(--row-h)', sidebar: '264px', 'sidebar-min': '72px', topbar: '56px', tabbar: '60px', band: '5px' },
      maxWidth: { page: '1280px', 'page-wide': '1536px', 'page-narrow': '880px' },
      animation: {
        'fade-in': 'fade-in var(--dur-2) var(--ease-out) both',
        'pop-in': 'pop-in var(--dur-2) var(--ease-out) both',
        'sheet-up': 'sheet-up var(--dur-3) var(--ease-out) both',
        'drawer-in': 'drawer-in var(--dur-3) var(--ease-out) both',
        rise: 'rise var(--dur-3) var(--ease-out) both',
        seal: 'seal-stamp 400ms var(--ease-out) both',
        'ring-once': 'ring-once 900ms var(--ease-out) 1',
      },
    },
  },
  plugins: [],
};
export default config;
```

### 2.3 Scale reference

| Token | Value | Use |
|---|---|---|
| Spacing unit | 4px (Tailwind default scale) | all gaps |
| Page gutter | 16px (`px-4`) mobile, 24px (`sm:px-6`), 32px (`lg:px-8`) | `Page` |
| Gap between cards | 24px (`gap-6`), 16px on mobile (`gap-4`) | page grids |
| Card padding | 20px (`p-5`), 16px mobile (`p-4`); card header `px-5 py-3.5` | `Card` |
| Control height | sm 32px, md 40px, lg 48px (mobile primary actions) | buttons, inputs |
| Table row | `h-row` = 44px default, 52 comfortable, 36 compact; mobile list rows min 64px | `DataTable` |
| Radius | 4 (checkbox), 6 (controls, chips), 10 (cards), 14 (modals, sheets top), full (avatars, count badges) | |
| Borders | 1px `hairline` cards/dividers; 1px `line` secondary buttons; 1px `input` form controls | |
| Shadows | none on cards; `shadow-pop` popovers/menus/toasts; `shadow-modal` dialogs; `shadow-bar` sticky action bar | |
| z-index | sticky 10, bar 20, topbar 30, drawer 40, pop 50, modal 60, toast 70, tip 80 | |
| Breakpoints | Tailwind defaults: `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536 | phone < 768, tablet 768-1023, desktop >= 1024 |

Type usage (Arabic line-heights are baked into the font sizes above; never set `leading-none`/`leading-tight` on Arabic text):

| Role | Classes |
|---|---|
| Page title | `display text-2xl lg:text-3xl text-ink` |
| Hero amount (request total, main KPI) | `display num text-3xl lg:text-4xl text-ink` |
| KPI value (secondary) | `display num text-2xl` |
| Section title (h2) | `text-xl font-semibold` |
| Card title (h3) | `text-lg font-semibold` |
| Body | `text-base` (15/26) |
| Table cell, button, input | `text-sm` (14/22) |
| Field label, table header | `text-13 font-medium text-ink-2` |
| Caption, chip | `text-xs text-ink-3` |
| Request number / code | `code text-sm` (inside titles: `code text-2xl font-medium`) |

Weights: 400, 500, 600 for Plex; 700 for Naskh display (600 for Plex Serif in English). Never 700 in tables.

---

## 3. Fonts (self-hosted, OFL)

| Role | Family | Package (exact) | Files imported |
|---|---|---|---|
| UI and body | IBM Plex Sans Arabic 400/500/600 | `@fontsource/ibm-plex-sans-arabic@5.3.0` | `arabic-{400,500,600}.css`, `latin-{400,500,600}.css` |
| Arabic display | Noto Naskh Arabic Variable (400-700) | `@fontsource-variable/noto-naskh-arabic@5.3.0` | `wght.css` (family name `'Noto Naskh Arabic Variable'`) |
| Latin display (English locale) | IBM Plex Serif 600 | `@fontsource/ibm-plex-serif@5.3.0` | `latin-600.css` |
| Identifiers | IBM Plex Mono 400/500 | `@fontsource/ibm-plex-mono@5.3.0` | `latin-400.css`, `latin-500.css` |

Loading location: the `@import` lines at the top of `apps/web/src/app/globals.css` (2.1). Next bundles the woff2 files; nothing is fetched from the network. `@fontsource/cairo` stays in `package.json` (the PDF renderer in `packages/core` uses its own copy) but is no longer imported by the web app. The PDF keeps Cairo in this phase (see OWNER_DECISIONS O7).

---

## 4. Numbers, money, dates, bidi

Default numerals: **Western digits (0-9) everywhere**. A per-user preference `numerals: 'latn' | 'arab'` (Profile > Appearance, stored in `localStorage['dms.numerals']`) switches displayed amounts, counts and dates to Arabic-Indic. Identifiers (request numbers, plates, codes, phone numbers, SAP documents) and all inputs are never converted.

### 4.1 `apps/web/src/lib/format.ts` (extend; keep every existing export and its output unchanged)

Add:

```ts
export type NumeralSystem = 'latn' | 'arab';
/** Process-wide numeral system for display formatting. Set by PrefsProvider. Default 'latn'. */
export function setNumeralSystem(n: NumeralSystem): void;
export function getNumeralSystem(): NumeralSystem;
/** '05/03/2026' (short) or '5 مارس 2026' / '5 March 2026' (long), Africa/Cairo. '' for null/invalid. */
export function formatDay(v: Date | string | number | null | undefined, locale?: 'ar' | 'en', style?: 'short' | 'long'): string;
/** '05/03/2026 14:30' (24h, Cairo). */
export function formatDayTime(v: Date | string | number | null | undefined, locale?: 'ar' | 'en'): string;
/** '14:30' (Cairo). */
export function formatTime(v: Date | string | number | null | undefined): string;
/** 'الآن' / 'منذ 5 دقائق' / 'منذ 3 ساعات' / 'أمس' / 'منذ 4 أيام'; older than 7 days falls back to formatDay short. English: 'now', '5 min ago', '3 h ago', 'yesterday', '4 days ago'. */
export function formatRelative(v: Date | string | number | null | undefined, locale?: 'ar' | 'en', now?: number): string;
/** Integer or decimal count with separators, honouring the numeral system: formatCount(1234) -> '1,234'. */
export function formatCount(v: number | string | null | undefined): string;
/** Percent with one decimal: formatPercent(0.1234) -> '12.3%'. */
export function formatPercent(ratio: number): string;
```

Implementation rules:
- `formatNumber`, `formatEgp`, `formatCount`, `formatPercent`, `formatDay`, `formatDayTime`, `formatTime`, `formatRelative` build their digits with `Intl` using the locale tag `en-US-u-nu-latn` or `en-US-u-nu-arab` (numbers) and `en-GB-u-nu-<nu>` / `ar-EG-u-nu-<nu>` (dates), chosen from `getNumeralSystem()`. With `'latn'` the output of the existing functions is byte-identical to today (the existing tests in `src/lib/lib.test.ts` must keep passing unchanged).
- `formatDate`, `formatDateTime`, `todayCairo`, `cairoDayToIso`, `formatBytes` are untouched (ISO-style, used for inputs, queries and file names).
- Money is always two decimals with thousands separators. Arabic: `12,450.75 ج.م` (number first, then the unit). English: `EGP 12,450.75`.
- Month names long form via `Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Cairo' })`.

### 4.2 Display rules (enforced through the kit components of 7.2)

| Data | Component | Rendering |
|---|---|---|
| Money | `<Money value="3833.00" />` | number in a `.num` span, unit `ج.م` / `EGP` in a separate span (`text-ink-3`, 0.8em, `ms-1`); the pair is wrapped in `<bdi>` so it never reorders. Always end-aligned in tables. |
| Edited money | `<Money value={final} original={original} />` | original struck through in `text-ink-3`, then the final in ink, then a brass-tint chip "معدّل" |
| Counts | `<Num value={31} />` | `.num` |
| Request number, plate, code, SAP doc, username, phone | `<Code>DE-26-000011</Code>` | `.code` (mono, LTR isolate). Never broken across lines. |
| Dates in tables | `<DateText value={iso} />` | `dd/MM/yyyy` |
| Date and time | `<DateText value={iso} mode="dayTime" />` | `dd/MM/yyyy HH:mm` |
| Recent activity (inbox age, notifications, timeline) | `<DateText value={iso} mode="relative" />` | relative text, absolute value in the `title` |
| Document dates (request header) | `<DateText value={iso} mode="long" />` | `5 مارس 2026` |
| Free text from users (names, notes, comments) | plain element with `dir="auto"` and `text-start` | |
| Mixed strings such as "آخر قراءة 66901 (+7703)" | each number in its own `<Num>`; the sign and parentheses stay inside the `.num` span | fixes the reordering bug in NOTES |
| Amount inputs | `<Input numeric />` | `dir="ltr"`, `inputMode="decimal"`, text end-aligned, Arabic-Indic digits typed or pasted are normalised to Western with `normalizeDigits` from `@dms/shared` |
| Code / username / phone / URL inputs | `<Input dir="ltr" />` | left-aligned |
| Date inputs | `<DateField>` | never the native `type="date"` input |

Week starts on Saturday. Calendar: Gregorian only.

---

## 5. Icons and RTL

- Icon set: `lucide-react` (already installed, `^0.468.0`). No other icon set, no emoji.
- Always render through `<Icon as={X} />` (7.2). Stroke width 1.5. Sizes: 16 inside chips and captions, 18 default (buttons, table cells, inputs), 20 navigation and page-level actions, 24 empty states.
- Icon-only buttons use `<IconButton label="...">`; the label is the `aria-label` and the tooltip.
- Icon names in this document are lucide-react exports. If a name is not exported by the installed version (check `node_modules/lucide-react/dist/lucide-react.d.ts`), use the nearest equivalent and add one line to `docs/CONTRACT_NOTES.md`.
- **Mirroring is opt-in** with `<Icon mirror />` (adds `rtl:-scale-x-100`).
  - Mirror: `ChevronLeft`, `ChevronRight`, `ArrowLeft`, `ArrowRight`, `ChevronsLeft/Right`, `CornerUpLeft` (send back), `Undo2`, `Redo2`, `Reply`, `Send`, `LogOut`, `LogIn`, `ExternalLink`, `PanelRightClose`/`PanelRightOpen`, `ListTree`, `Indent`, `TextAlign*`.
  - Never mirror: `Check`, `X`, `Plus`, `Minus`, `Search`, `Clock`, `Calendar`, `Lock`, `Unlock`, `Download`, `Upload`, `Trash2`, `Camera`, `Phone`, `FileText`, `Receipt`, `Truck`, `Car`, `BarChart3`, `TrendingUp`, `RotateCw`, `RotateCcw`, `ZoomIn`, `ZoomOut`, `Maximize2`, `Play`, brand marks.
  - The rule: **author the icon as you would for an LTR layout, then add `mirror`.** "Back" = `<Icon as={ArrowLeft} mirror />` (points right in Arabic). "Open row / next" = `<Icon as={ChevronRight} mirror />` (points left in Arabic). Never write `rtl:rotate-*` / `ltr:rotate-*` by hand.
- Layout: logical utilities only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `text-end`, `border-s`, `border-e`, `rounded-s`, `rounded-e`). `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right` are banned (test `src/features/style-guard.test.ts` fails on them). `inset-x-0` and symmetric utilities are fine.
- Radix components get direction from `<DirectionRoot>` (7.3); pass `align="start"`/`"end"`, never left/right.
- The sidebar is on the inline-start (right in Arabic). Page header: title at start, actions at end. Dialog footers: primary button first in DOM order (so it sits at the inline-start in the button row), cancel second. Tables: identifier column first, numeric columns `text-end`, row chevron last and mirrored. Pagination: previous first, next second, arrows mirrored.
- Rotate buttons in the receipt viewer are labelled in words ("تدوير لليمين" / "تدوير لليسار") and not mirrored.
- Charts: time always flows left to right (the plot area is `dir="ltr"`); titles, legends and category bar lists follow the page direction.

---

## 6. Motion

| Event | Animation |
|---|---|
| Hover / press on controls | colour and background transition `duration-1 ease-out`; pressed buttons `active:scale-[0.98]` |
| Popover, menu, tooltip, toast | `animate-pop-in` (180ms) |
| Modal (>= 640px) | scrim `animate-fade-in`, panel `animate-pop-in` |
| Bottom sheet (< 640px) | `animate-sheet-up` (240ms) |
| Drawer | `animate-drawer-in` (240ms), direction from `--dir` |
| Page load | the page header and the first 5 top-level blocks get `animate-rise` with `style={{ animationDelay: `${i * 40}ms` }}` (max 200ms total). Nothing else animates on load. |
| Table / list refresh | no animation; skeletons only on first load, previous data stays while refetching |
| KPI numbers | count-up over 600ms on the first render only (`useCountUp`, disabled with reduced motion) |
| Stepper current node | `animate-ring-once` once when the page loads |
| **Seal** | `animate-seal` (400ms): the seal drops from 1.7x scale and -14deg to rest at -8deg. Played once after a successful approve / pay / reject. Static afterwards. |
| Reduced motion | all animations collapse to an instant state (handled globally in `globals.css`) |

No bounce, no spring overshoot, nothing longer than 400ms, no animated amounts in lists.

---

## 7. Component kit

All kit files live in `apps/web/src/components/ui/` and start with `'use client'`. Import from the index: `import { Button, Money } from '@/components/ui'`. Every component accepts `className`; components with a single root element spread unknown props onto it, so `data-testid` can always be passed. Existing exports keep their names and props (new props are optional), so pages that are not rewritten still compile.

Owner column: **F1** = foundation agent, **F2** = overlay/data agent (see PLAN_V2 section 8).

### 7.1 Inventory

| File | Exports | Status | Owner |
|---|---|---|---|
| `ui/Icon.tsx` | `Icon` | new | F1 |
| `ui/Num.tsx` | `Num`, `Money`, `Code`, `DateText` | new | F1 |
| `ui/Button.tsx` | `Button`, `IconButton`, `ButtonProps`, `ButtonVariant`, `ButtonSize` | rewrite (replaces old Button) | F1 |
| `ui/Fields.tsx` | `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `SegmentedControl`, `SearchInput`, `FormField`, `SelectOption`, `SelectProps`, `CheckboxProps`, `FormFieldProps`, `FieldControlProps` | rewrite | F1 |
| `ui/Display.tsx` | `Badge`, `BadgeTone`, `ActiveBadge`, `Card`, `Page`, `PageHeader`, `Spinner`, `LoadingBlock`, `EmptyState`, `ErrorBlock`, `Banner`, `Tabs`, `TabItem`, `DL`, `DLItem`, `Kbd` | rewrite | F1 |
| `ui/status.ts` | `statusTone`, `statusIconName`, `StatusKind` (pure) | new | F1 |
| `ui/StatusChip.tsx` | `StatusChip` | new | F1 |
| `ui/Skeleton.tsx` | `Skeleton`, `SkeletonRows`, `SkeletonCard` | new | F1 |
| `ui/Rule.tsx` | `Rule` | new | F1 |
| `ui/Avatar.tsx` | `Avatar` | new | F1 |
| `ui/Stat.tsx` | `Stat` | new | F1 |
| `ui/Seal.tsx` | `Seal`, `SealKind` | new | F1 |
| `components/brand/BrandMark.tsx` | `BrandMark` | new (replaces the "D" square in AppShell) | F1 |
| `ui/index.ts` | re-exports every file in this table | rewrite | F1 |
| `ui/Modal.tsx` | `Modal`, `ConfirmDialog`, `Drawer`, `ModalProps`, `ConfirmDialogProps`, `DrawerProps` | rewrite (Radix Dialog) | F2 |
| `ui/Overlay.tsx` | `DirectionRoot`, `Tooltip`, `Popover`, `Menu`, `MenuItem` | new (Radix) | F2 |
| `ui/Toast.tsx` | `ToastProvider`, `useToast`, `ToastApi` | rewrite, same API | F2 |
| `ui/DataTable.tsx` | `DataTable`, `Column`, `DataTableProps`, `Pagination`, `PaginationProps`, `parseSort`, `SortState` | rewrite, superset API | F2 |
| `ui/calendar.ts` | `monthGrid`, `addMonths`, `toDisplay`, `isValidDay`, `presetRange`, `DatePreset` (pure) | new | F2 |
| `ui/DateField.tsx` | `DateField` | new (replaces native date inputs) | F2 |
| `ui/Inputs2.tsx` | `DateRange`, `useLookup`, `LookupSelect`, `LookupSelectProps`, `LookupMultiSelect`, `FileDrop`, `FileDropProps` | rewrite, same API | F2 |
| `ui/FilterBar.tsx` | `FilterBar`, `FilterChip` | new | F2 |
| `ui/form.ts` | unchanged | keep | - |

`ui/index.ts` content (exact):

```ts
export * from './Icon';
export * from './Num';
export * from './Button';
export * from './Fields';
export * from './Display';
export * from './status';
export * from './StatusChip';
export * from './Skeleton';
export * from './Rule';
export * from './Avatar';
export * from './Stat';
export * from './Seal';
export * from './Modal';
export * from './Overlay';
export * from './Toast';
export * from './DataTable';
export * from './calendar';
export * from './DateField';
export * from './Inputs2';
export * from './FilterBar';
export * from './form';
```

### 7.2 Foundation components (F1)

**Icon**
```ts
export function Icon(p: { as: LucideIcon; size?: 14 | 16 | 18 | 20 | 24; mirror?: boolean; className?: string; label?: string }): JSX.Element
```
Renders `<p.as size={size ?? 18} strokeWidth={1.5} className={cn('shrink-0', mirror && 'rtl:-scale-x-100', className)} aria-hidden={!label} aria-label={label} />`.

**Num / Money / Code / DateText** (rules in 4.2)
```ts
export function Num(p: { value: number | string | null | undefined; decimals?: number; className?: string }): JSX.Element;      // <span class="num">; '—' when empty
export function Money(p: { value: string | number | null | undefined; original?: string | number | null; size?: 'sm' | 'md' | 'lg' | 'hero'; muted?: boolean; className?: string }): JSX.Element;
export function Code(p: { children: ReactNode; className?: string; title?: string }): JSX.Element;                              // <bdi class="code">
export function DateText(p: { value: string | Date | null | undefined; mode?: 'day' | 'dayTime' | 'relative' | 'long'; className?: string }): JSX.Element; // <time class="num" dateTime title>
```
`Money` sizes: `sm` = `text-sm`, `md` = `text-base font-medium`, `lg` = `text-xl font-semibold`, `hero` = `display text-3xl lg:text-4xl`. When `original` is given and differs from `value` (compare as numbers): render `<span class="num text-ink-3 line-through">original</span>` before the value, and a `<Badge tone="brass" size="sm">` with `t('ui.edited')` after it. `Money`, `Num`, `DateText` read the locale from `useT()` and call the formatters of 4.1.

**Button**
```ts
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; icon?: ReactNode; iconEnd?: ReactNode; block?: boolean }
export function Button(p: ButtonProps): JSX.Element;                 // default type="button", variant 'primary', size 'md'
export function IconButton(p: Omit<ButtonProps, 'icon' | 'iconEnd' | 'children' | 'block'> & { icon: ReactNode; label: string }): JSX.Element; // default variant 'ghost'; square; aria-label + title = label
```
Classes:
- base: `inline-flex items-center justify-center gap-2 rounded font-medium whitespace-nowrap select-none transition-colors duration-1 ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100`
- `primary`: `bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active disabled:bg-surface-3 disabled:text-ink-disabled`
- `secondary`: `border border-line bg-surface text-ink hover:bg-surface-2 active:bg-surface-3 disabled:border-hairline disabled:text-ink-disabled`
- `ghost`: `text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3 disabled:text-ink-disabled`
- `danger` (dialogs only): `bg-danger text-on-danger hover:bg-danger-hover disabled:bg-surface-3 disabled:text-ink-disabled`
- `danger-outline`: `border border-danger/40 bg-surface text-danger hover:bg-danger-bg disabled:border-hairline disabled:text-ink-disabled`
- `link`: `h-auto px-0 text-link hover:underline`
- sizes: `sm` `h-8 px-3 text-sm`, `md` `h-10 px-4 text-sm`, `lg` `h-12 px-5 text-base`; `block` adds `w-full`; IconButton: `sm` `h-8 w-8 px-0`, `md` `h-10 w-10 px-0`.
- loading: the leading icon is replaced by `<Loader2 size={16} className="animate-spin" />`, `aria-busy="true"`, button disabled.
- Focus: the global `:focus-visible` outline (2px `focus`, offset 2px). Do not add ring classes.

**Fields**
- Shared control class: `block w-full rounded border border-input bg-surface px-3 text-base text-ink placeholder:text-ink-3 transition-colors duration-1 hover:border-ink-3 focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25 disabled:border-hairline disabled:bg-surface-2 disabled:text-ink-disabled sm:text-sm` (16px text below `sm` prevents iOS zoom). Invalid: `border-danger hover:border-danger focus:border-danger focus:ring-danger/25` and `aria-invalid`.
- `Input`: `forwardRef`, `InputHTMLAttributes & { invalid?: boolean; numeric?: boolean; startAdornment?: ReactNode; endAdornment?: ReactNode }`. Height `h-10`. `numeric` adds `dir="ltr"`, `inputMode="decimal"`, classes `num text-end`, and wraps `onChange` so the value is passed through `normalizeDigits` from `@dms/shared` before the caller sees it (mutate `e.target.value`). Adornments render inside a relative wrapper at `start-3` / `end-3`, `text-ink-3`, and add `ps-9` / `pe-9` to the input.
- `Textarea`: same class plus `py-2`, default `rows={3}`.
- `Select` (native `<select>`, same props as today): control class plus `h-10 appearance-none pe-9`; a `ChevronDown` icon (16, `text-ink-3`) positioned `end-3`, `pointer-events-none`.
- `Checkbox`: `<label class="inline-flex cursor-pointer items-center gap-2 text-sm text-ink">` + `<input type="checkbox" class="h-[18px] w-[18px] shrink-0 rounded-sm accent-primary">`. Same props as today.
- `Switch`: `{ checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; id?: string; className?: string }`. `<button role="switch" aria-checked>` track `h-5 w-9 rounded-full p-0.5 transition-colors duration-2` (`bg-line` off, `bg-primary` on); thumb `block h-4 w-4 rounded-full bg-surface shadow-card transition-[margin] duration-2` with `ms-0` off and `ms-4` on (logical margin, so it is RTL-safe).
- `SegmentedControl<T extends string>`: `{ items: { value: T; label: ReactNode; icon?: ReactNode; testId?: string }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md'; block?: boolean; ariaLabel?: string }`. Container `inline-flex rounded border border-line bg-surface-2 p-0.5` with `role="radiogroup"`; item `h-7 rounded-sm px-3 text-13` (`md`: `h-9 px-4 text-sm`), `role="radio"`; active `bg-surface font-medium text-ink shadow-card`; inactive `text-ink-2 hover:text-ink`.
- `SearchInput`: `{ value: string; onChange: (v: string) => void; placeholder?: string; debounceMs?: number; className?: string; ltr?: boolean }` (default debounce 300ms; `Search` icon at start, clear `X` button at end when not empty).
- `FormField`: same props as today. Label `block text-13 font-medium text-ink-2`, required star `ms-0.5 text-danger`, hint `text-xs text-ink-3`, error `text-xs font-medium text-danger` with `role="alert"`; `space-y-1.5`.

**Badge / ActiveBadge**
```ts
export type BadgeTone = 'gray' | 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'brass' | 'navy';
export function Badge(p: { tone?: BadgeTone; icon?: ReactNode; size?: 'sm' | 'md'; children: ReactNode; className?: string; title?: string }): JSX.Element;
```
Base `inline-flex h-6 items-center gap-1 whitespace-nowrap rounded border px-2 text-xs font-medium` (`sm`: `h-5 px-1.5`). Tones: gray `border-hairline bg-surface-2 text-ink-2`; green `border-success/25 bg-success-bg text-success`; red `border-danger/25 bg-danger-bg text-danger`; amber `border-warning/25 bg-warning-bg text-warning`; blue `border-info/25 bg-info-bg text-info`; brass and purple `border-brass/40 bg-brass-tint text-brass-tint-ink`; navy `border-primary/20 bg-primary-tint text-primary`. `ActiveBadge({ active })` = green with a `Check` icon / gray with a `Minus` icon.

**StatusChip**
```ts
export type StatusKind = 'request' | 'step' | 'sap' | 'export' | 'version' | 'delegation';
export function statusTone(kind: StatusKind, status: string): BadgeTone;   // ui/status.ts, pure
export function statusIconName(kind: StatusKind, status: string): string;  // lucide icon name, pure
export function StatusChip(p: { kind: StatusKind; status: string; label: ReactNode; size?: 'sm' | 'md'; className?: string }): JSX.Element;
```
The caller passes the translated `label` (keep using the existing keys such as `t('requests.status.' + status)`). Mapping (unknown status = gray + `Circle`):

| kind | status -> tone, icon |
|---|---|
| request | IN_REVIEW blue `Clock3`; CORRECTION_REQUESTED amber `MessageSquareWarning`; APPROVED green `Check`; PAID navy `Banknote`; REJECTED red `X`; CANCELLED gray `Ban` |
| step | PENDING gray `Circle`; ACTIVE blue `Clock3`; AWAITING_CORRECTION amber `MessageSquareWarning`; APPROVED green `Check`; NOT_APPLICABLE gray `Minus`; REJECTED red `X`; CANCELLED gray `Ban` |
| sap | PENDING gray `Clock3`; POSTING blue `RefreshCw`; POSTED green `Check`; FAILED red `AlertTriangle` |
| export | QUEUED gray `Clock3`; RUNNING blue `RefreshCw`; DONE green `Check`; FAILED red `AlertTriangle`; EXPIRED gray `Ban` |
| version | DRAFT amber `PencilLine`; ACTIVE green `Check`; ARCHIVED gray `Archive` |
| delegation | ACTIVE green `Check`; UPCOMING blue `Clock3`; ENDED gray `Minus`; REVOKED red `X` |

**Card / Page / PageHeader**
```ts
export function Card(p: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string; padded?: boolean; accent?: 'none' | 'rule' | 'brass' }): JSX.Element;
export function Page(p: { testId: string; width?: 'default' | 'wide' | 'narrow' | 'full'; children: ReactNode; className?: string }): JSX.Element;
export function PageHeader(p: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; eyebrow?: ReactNode; meta?: ReactNode; rule?: boolean }): JSX.Element;
```
- `Card`: `<section class="overflow-hidden rounded-lg border border-hairline bg-surface">`. `accent="rule"` puts `<div class="rule-double" />` first; `accent="brass"` adds `border-t-2 border-t-brass`. Header (when `title` or `actions`): `flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3.5`, title `text-lg font-semibold text-ink`, subtitle `text-xs text-ink-3`. Body `p-4 sm:p-5` when `padded` (default true). Footer `border-t border-hairline px-5 py-3`.
- `Page`: root of every page. `<div data-testid={testId} class="mx-auto w-full space-y-4 sm:space-y-6 {max}">` where max = `max-w-page` (default), `max-w-page-wide`, `max-w-page-narrow`, or none. `testId` is always `page-<slug>` (10.1).
- `PageHeader`: optional back link (`<Icon as={ArrowLeft} mirror size={16} />` + label, `text-sm text-ink-3 hover:text-ink`, `mb-2`); then a row `flex flex-wrap items-end justify-between gap-3`: start = eyebrow (`text-xs font-medium text-brass-ink`), `<h1 data-testid="page-title" class="display text-2xl text-ink lg:text-3xl">`, subtitle (`mt-1 text-sm text-ink-2`), meta; end = actions (`flex flex-wrap items-center gap-2`). When `rule !== false` a `<div class="rule-double mt-4" />` follows. The old `mb-5` is gone (spacing comes from `Page`).

**Banner / EmptyState / ErrorBlock / Tabs / DL / Spinner / Skeleton**
```ts
export function Banner(p: { tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral'; icon?: ReactNode; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }): JSX.Element;
export function EmptyState(p: { title?: ReactNode; hint?: ReactNode; action?: ReactNode; icon?: ReactNode; compact?: boolean }): JSX.Element;
export function ErrorBlock(p: { message: string; onRetry?: () => void }): JSX.Element;
export function Tabs(p: { items: TabItem[]; value: string; onChange: (key: string) => void; className?: string; variant?: 'underline' | 'pill' }): JSX.Element;
export interface TabItem { key: string; label: ReactNode; count?: number; icon?: ReactNode }
export function DL(p: { children: ReactNode; cols?: 2 | 3 | 4; className?: string }): JSX.Element;   // grid: grid-cols-2, md:grid-cols-{cols}, gap-x-6 gap-y-4
export function DLItem(p: { label: ReactNode; children: ReactNode; className?: string }): JSX.Element; // dt text-xs text-ink-3, dd text-sm font-medium text-ink
export function Skeleton(p: { className?: string }): JSX.Element;                                     // <div class="skeleton">
export function SkeletonRows(p: { rows?: number; cols?: number }): JSX.Element;                       // rows of h-row with bars
export function SkeletonCard(p: { lines?: number }): JSX.Element;
```
- `Banner`: `flex items-start gap-3 rounded border px-4 py-3 text-sm`; tone fills as in Badge (neutral = gray); default icons `Info`, `CheckCircle2`, `AlertTriangle`, `AlertOctagon`, `Info`.
- `EmptyState` (`data-testid="empty-state"`): centred column, `py-12` (`compact`: `py-6`); icon in a `h-14 w-14 rounded-full bg-brass-tint text-brass-tint-ink` disc (default icon `Inbox`, size 24); title `text-base font-semibold`; hint `max-w-sm text-sm text-ink-2`; then `action`.
- `ErrorBlock` (`data-testid="error-block"`): danger `Banner` with the message and, when `onRetry`, a `ghost` button `t('ui.retry')`.
- `Tabs` underline (default): `flex gap-6 overflow-x-auto border-b border-hairline` `role="tablist"`; each tab `-mb-px inline-flex h-10 items-center whitespace-nowrap border-b-2 text-sm` `data-testid={'tab-' + key}`; active `border-primary font-semibold text-ink`; inactive `border-transparent text-ink-2 hover:text-ink`; count `ms-2 num text-xs font-medium text-brass-ink`. Pill variant = `SegmentedControl` look.
- `LoadingBlock`: centred `Spinner` (20px, `text-ink-3`) in a `min-h-40` box. Prefer skeletons for lists and cards.

**Stat** (KPI tile)
```ts
export function Stat(p: { label: ReactNode; value: ReactNode; caption?: ReactNode; delta?: { text: string; tone: 'good' | 'bad' | 'neutral' }; accent?: boolean; tone?: 'default' | 'danger'; loading?: boolean; onClick?: () => void; active?: boolean; testId?: string }): JSX.Element;
```
`rounded-lg border border-hairline bg-surface p-5`; `accent` adds the double rule on top and makes the value `display num text-3xl lg:text-4xl`; otherwise value is `display num text-2xl`. Label `text-13 text-ink-2`; caption `mt-1 text-xs text-ink-3`; delta = small Badge (good green, bad red, neutral gray). `tone="danger"` colours the value `text-danger`. With `onClick` it is a `<button>` with `hover:bg-surface-2`; `active` adds `border-primary`.

**Avatar**: `Avatar({ name, size = 32 })` - initials of the first two words of `name`, `rounded-full bg-primary-tint font-medium text-primary`, sizes 24 (`text-[11px]`), 32 (`text-xs`), 40 (`text-sm`); `aria-hidden`.

**Rule**: `Rule({ variant = 'double', className })` - `double` -> `<div class="rule-double" />`; `brass` -> `<div class="h-px bg-brass" />`; `hairline` -> `<div class="h-px bg-hairline" />`.

**Seal** (the signature mark; exact SVG)
```tsx
export type SealKind = 'approved' | 'paid' | 'rejected';
export function Seal({ kind, label, sub, size = 104, animate = false, className }: { kind: SealKind; label?: string; sub?: string; size?: number; animate?: boolean; className?: string }) {
  const { t } = useT();
  const text = label ?? t(`ui.seal.${kind}`);
  return (
    <span
      data-testid="seal" data-kind={kind} aria-label={text} role="img"
      className={cn('inline-block select-none opacity-90', kind === 'rejected' ? 'text-danger' : 'text-primary', animate ? 'animate-seal' : '-rotate-[8deg]', className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 120 120" width={size} height={size} fill="none" stroke="currentColor">
        <circle cx="60" cy="60" r="56" strokeWidth="2.5" />
        <circle cx="60" cy="60" r="49" strokeWidth="1" />
        <circle cx="60" cy="60" r="40" strokeWidth="1" strokeDasharray="2 3.5" />
        <path d="M20 60l4-4 4 4-4 4z M92 60l4-4 4 4-4 4z" fill="currentColor" stroke="none" />
        <text x="60" y={sub ? 62 : 68} textAnchor="middle" fill="currentColor" stroke="none" style={{ font: '700 22px var(--font-display)' }}>{text}</text>
        {sub && <text x="60" y="80" textAnchor="middle" fill="currentColor" stroke="none" style={{ font: '500 9px var(--font-mono)' }}>{sub}</text>}
      </svg>
    </span>
  );
}
```
`sub` is a short LTR string (the action date `dd/MM/yyyy`). The `animate-seal` keyframe ends at `rotate(-8deg)`, so the resting pose is identical with and without animation.

**BrandMark** (exact SVG)
```tsx
export function BrandMark({ size = 32, withName = false, className }: { size?: number; withName?: boolean; className?: string }) {
  const { t } = useT();
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
        <circle cx="16" cy="16" r="15.5" fill="rgb(var(--primary))" />
        <circle cx="16" cy="16" r="12" fill="none" stroke="rgb(var(--brass))" strokeWidth="1" />
        <text x="16" y="21.5" textAnchor="middle" fill="rgb(var(--on-primary))" style={{ font: '700 15px var(--font-display)' }}>د</text>
      </svg>
      {withName && <span className="display text-lg text-ink">{t('common.appName')}</span>}
    </span>
  );
}
```

### 7.3 Overlay and data components (F2)

Radix import: `import { Dialog, DropdownMenu, Popover as RPopover, Tooltip as RTooltip, Direction } from 'radix-ui';` (unified package, version 1.8.1). Check the export names in `node_modules/radix-ui/dist/index.d.ts` before use; if `Direction` is exported under another name, use that one and note it in CONTRACT_NOTES.

**DirectionRoot**: `DirectionRoot({ children })` = `<Direction.Provider dir={useT().dir}><RTooltip.Provider delayDuration={300}>{children}</RTooltip.Provider></Direction.Provider>`. Mounted once in `lib/providers.tsx`.

**Modal**
```ts
export interface ModalProps { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; testId?: string; dismissable?: boolean }
```
- `Dialog.Root open onOpenChange={(o) => !o && onClose()}`; `Dialog.Portal`; overlay `fixed inset-0 z-modal bg-scrim/45 animate-fade-in`.
- Content `data-testid={testId ?? 'modal'}` (Radix sets `role="dialog"`): below `sm` a bottom sheet `fixed inset-x-0 bottom-0 z-modal flex max-h-[92dvh] flex-col rounded-t-xl bg-surface shadow-modal animate-sheet-up` with a grabber (`mx-auto mt-2 h-1 w-9 rounded-full bg-line`); from `sm` a centred panel `sm:inset-auto sm:start-1/2 sm:top-1/2 sm:w-[calc(100vw-2rem)] sm:-translate-y-1/2 sm:rounded-xl sm:animate-pop-in` (centre horizontally with `sm:start-1/2 sm:rtl:translate-x-1/2 sm:ltr:-translate-x-1/2`). Max widths: sm 400px, md 520px, lg 720px, xl 960px.
- Header `flex items-start justify-between gap-3 border-b border-hairline px-5 py-4`: `Dialog.Title` `text-lg font-semibold`, optional `Dialog.Description` `mt-0.5 text-sm text-ink-2`, close `IconButton` (`X`, `data-testid="modal-close"`, label `t('common.close')`).
- Body `overflow-y-auto px-5 py-4`. Footer `flex flex-wrap gap-2 border-t border-hairline px-5 py-3.5 [&>button]:flex-1 sm:[&>button]:flex-none`. **Footer order: primary action first, cancel second** (primary sits at the inline-start).
- `dismissable={false}` blocks Escape and outside click (used while a mutation is pending).

**ConfirmDialog**: same props as today plus `confirmTestId?: string` (default `confirm-ok`); cancel button `data-testid="confirm-cancel"`. Footer: confirm (`primary` or `danger`) then cancel (`secondary`).

**Drawer**
```ts
export interface DrawerProps { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; side?: 'end' | 'start'; width?: 'sm' | 'md' | 'lg'; testId?: string }
```
Radix Dialog. From `sm`: `fixed inset-y-0 {side}-0 z-modal flex w-full flex-col bg-surface shadow-modal animate-drawer-in` with max width 400/520/720 and `--dir` set as described in 2.1. Below `sm`: same bottom sheet as Modal. `data-testid={testId ?? 'drawer'}`.

**Tooltip / Popover / Menu**
```ts
export function Tooltip(p: { content: ReactNode; children: ReactElement; side?: 'top' | 'bottom' }): JSX.Element; // content: z-tip rounded bg-ink px-2 py-1 text-xs text-canvas animate-fade-in
export function Popover(p: { trigger: ReactElement; children: ReactNode; align?: 'start' | 'center' | 'end'; side?: 'top' | 'bottom'; open?: boolean; onOpenChange?: (o: boolean) => void; className?: string; testId?: string }): JSX.Element; // content: z-pop rounded-lg border border-hairline bg-surface p-3 shadow-pop animate-pop-in, sideOffset 6
export type MenuItem = { key: string; label: ReactNode; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean; hidden?: boolean; testId?: string } | { key: string; separator: true };
export function Menu(p: { trigger: ReactElement; items: MenuItem[]; align?: 'start' | 'end'; testId?: string }): JSX.Element;
```
Menu content: `z-pop min-w-44 rounded-lg border border-hairline bg-surface p-1 shadow-pop animate-pop-in`; item `flex h-9 cursor-pointer items-center gap-2 rounded-sm px-2.5 text-sm text-ink outline-none data-[highlighted]:bg-surface-2 data-[disabled]:text-ink-disabled` (danger: `text-danger`); separator `my-1 h-px bg-hairline`. Hidden items are not rendered; a menu with no visible items renders nothing.

**Toast**: API unchanged (`success`, `info`, `error`). Container `pointer-events-none fixed inset-x-4 bottom-[76px] z-toast flex flex-col gap-2 md:inset-x-auto md:bottom-4 md:end-4 md:w-96`. Item `pointer-events-auto flex items-start gap-3 rounded-lg border border-hairline border-s-[3px] bg-surface px-4 py-3 text-sm text-ink shadow-pop animate-pop-in` with the start border and icon in the tone colour (`border-s-success text-success` etc.); `data-testid={'toast-' + kind}`; `role="status"` (`role="alert"` for errors). Timings unchanged (3.5s, errors 7s), max 4 visible.

**DataTable**
Additions to today's API (all optional):
```ts
interface Column<T> { /* existing */ align?: 'start' | 'end' | 'center'; width?: string /* tailwind width class, e.g. 'w-40' */ }
interface DataTableProps<T> { /* existing */ testId?: string; mobileCard?: (row: T) => ReactNode; rowTone?: (row: T) => 'default' | 'danger' | 'muted'; rowHref?: (row: T) => string; emptyAction?: ReactNode; emptyIcon?: ReactNode; stickyHeader?: boolean }
```
- Desktop (`md` and up): wrapper `overflow-x-auto rounded-lg border border-hairline bg-surface` `data-testid={testId ?? 'table'}`. `thead` `bg-surface-2` (sticky `top-0 z-sticky` when the wrapper has a max height); `th` `h-10 whitespace-nowrap px-4 text-start text-13 font-medium text-ink-2` (`text-end` for `align: 'end'`). Sortable header = `<button>` with an `ArrowUp`/`ArrowDown` (14px) when active and `ChevronsUpDown` (14px, `text-ink-disabled`) when not; `aria-sort` on the `th`.
- Rows: `tr` `h-row border-t border-hairline transition-colors duration-1 hover:bg-surface-2/60` `data-testid={(testId ?? 'table') + '-row'}` `data-row-key={rowKey(row)}`; `td` `px-4 text-sm text-ink`. `onRowClick` or `rowHref` -> `cursor-pointer`, `tabIndex={0}`, Enter activates; `rowHref` uses `router.push`. `rowTone` `danger` -> first cell gets `border-s-[3px] border-s-danger`; `muted` -> `text-ink-3`.
- Row actions cell: last column, `text-end`, content from `rowActions(row)`.
- Loading with no rows: `SkeletonRows`. Refetch with rows: a 2px `bg-primary/50 animate-pulse` line under the header; rows stay.
- Empty: `EmptyState` with `emptyTitle`, `emptyHint`, `emptyAction`, `emptyIcon`.
- Mobile (below `md`): a list `divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface`. Each row is `data-testid={(testId ?? 'table') + '-card'}` with `min-h-16 px-4 py-3`. With `mobileCard` render it. Default card: the `primary` column (or the first) as a `text-sm font-medium` title line, then the remaining columns that are not `hideOnMobile` as an inline wrapped list (`flex flex-wrap gap-x-4 gap-y-1 text-xs`): `<span class="text-ink-3">header</span> value`. No stacked label/value rows.
- `Pagination` (same props): `flex items-center justify-between gap-3 px-1 pt-3 text-sm text-ink-2`; start: `data-testid="pager-info"` text `t('ui.pager.range', { from, to, total })`; end: previous and next `IconButton`s (previous = `ChevronLeft`, next = `ChevronRight`, both with `mirror`; labels `ui.pager.prev` / `ui.pager.next`), `data-testid="pager-prev"` / `"pager-next"`, between them `t('ui.pager.page', { page, pages })`.

**calendar.ts** (pure)
```ts
export type DatePreset = 'today' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'thisYear';
export function monthGrid(year: number, month0: number, weekStart?: number): { day: string; inMonth: boolean }[]; // 42 cells, yyyy-MM-dd, weekStart default 6 (Saturday)
export function addMonths(year: number, month0: number, n: number): { year: number; month0: number };
export function toDisplay(day: string): string;       // '2026-03-05' -> '05/03/2026'; '' for invalid
export function isValidDay(day: string): boolean;     // strict yyyy-MM-dd and a real date
export function presetRange(p: DatePreset, today: string): { from: string; to: string };
```

**DateField**
```ts
export function DateField(p: { value: string; onChange: (v: string) => void; id?: string; placeholder?: string; min?: string; max?: string; invalid?: boolean; disabled?: boolean; clearable?: boolean; className?: string; testId?: string }): JSX.Element;
```
Value is `yyyy-MM-dd` or `''`. Trigger: a `<button type="button">` with the Input control class, showing `toDisplay(value)` in a `.num` span or the placeholder (`t('ui.date.placeholder')`), with a `Calendar` icon at the end. Popover content (`w-[296px]`): header row (previous month `IconButton`, month label `t('ui.date.month.' + month0)` + year, next month `IconButton`; arrows mirrored); weekday row from Saturday (`t('ui.date.wd.' + i)`, i = 0 Sunday .. 6 Saturday, `text-xs text-ink-3`); 6x7 grid of `h-9 w-9 rounded text-sm num` buttons (hover `bg-surface-2`; today `ring-1 ring-brass`; selected `bg-primary text-on-primary`; outside month `text-ink-disabled`; outside `min`/`max` disabled); footer with "اليوم" (`ui.date.today`) and, when `clearable` (default true) and a value exists, "مسح" (`ui.date.clear`). Keyboard: arrow keys move the focused day, Enter selects, Escape closes. Selecting a day closes the popover.

**Inputs2**
- `DateRange({ from, to, onChange, className, presets = true })`: two `DateField`s separated by `<Icon as={ArrowRight} mirror size={16} className="text-ink-3" />`; when `presets`, a `Menu` (`ghost` button, `CalendarRange` icon) with the six `DatePreset`s (labels `ui.date.preset.*`) computed with `presetRange(p, todayCairo())`.
- `useLookup`, `LookupSelect`: same API and behaviour, rendered with the new `Select`.
- `LookupMultiSelect`: selected items as removable `Badge`s plus an "add" `Popover` with a `SearchInput` and a checkbox list (max height 260px).
- `FileDrop`: `rounded-lg border border-dashed border-line bg-surface-2/50 px-4 py-6 text-center hover:border-ink-3`; `Upload` icon (24), label, hint; drag-over state `border-primary bg-primary-tint`.

**FilterBar**
```ts
export function FilterBar(p: { children: ReactNode; activeCount: number; onReset: () => void; search?: ReactNode; chips?: ReactNode; testId?: string }): JSX.Element;
export function FilterChip(p: { label: ReactNode; onRemove: () => void }): JSX.Element;
```
- `md` and up: `<div data-testid={testId ?? 'filter-bar'} class="flex flex-wrap items-end gap-3">`: `search` first (width `w-64`), then `children` (each child is a `FormField` the page sizes with `className="w-44"`), then, when `activeCount > 0`, a `ghost` `sm` button `t('ui.filter.reset')` (`data-testid="filter-reset"`). `chips` render on a second row (`mt-2 flex flex-wrap gap-2`).
- Below `md`: one row with `search` (flex-1) and a `secondary` button `t('ui.filter.open')` with a count badge (`data-testid="filter-open"`); it opens a `Modal` (bottom sheet, title `t('ui.filter.title')`) holding `children` stacked full width; footer: `t('ui.filter.apply')` (primary, closes) and `t('ui.filter.reset')`.
- `FilterChip`: `Badge tone="navy"` with a trailing `X` button.

### 7.4 Lib additions (F1)

| File | Content |
|---|---|
| `lib/prefs-core.ts` (pure) | `type ThemePref = 'light' \| 'dark' \| 'system'`; `type Density = 'comfortable' \| 'default' \| 'compact'`; `resolveTheme(pref: ThemePref, systemDark: boolean): 'light' \| 'dark'`; `parseTheme(raw: string \| null): ThemePref` (default `'light'`); `parseNumerals(raw: string \| null): NumeralSystem` (default `'latn'`); `parseDensity(raw: string \| null): Density` (default `'default'`); `PREF_KEYS = { theme: 'dms.theme', numerals: 'dms.numerals', density: 'dms.density', sidebar: 'dms.sidebar' }` |
| `lib/prefs.tsx` | `PrefsProvider`, `usePrefs(): { theme: ThemePref; resolvedTheme: 'light' \| 'dark'; setTheme(t): void; numerals: NumeralSystem; setNumerals(n): void; density: Density; setDensity(d): void; sidebarCollapsed: boolean; setSidebarCollapsed(b): void }`. Reads localStorage in an effect after mount, writes on change, sets `document.documentElement` attributes `data-theme` and `data-density` (`default` removes the attribute), calls `setNumeralSystem`, listens to `prefers-color-scheme` when theme is `system`. Changing numerals bumps a state counter so consumers re-render. |
| `lib/providers.tsx` | provider order: `QueryClientProvider > I18nProvider > PrefsProvider > DirectionRoot > ToastProvider > AuthProvider` |
| `lib/useMediaQuery.ts` | `useMediaQuery(query: string): boolean` (false on the server and first render), `useIsMobile()` = `(max-width: 767px)`, `useIsDesktop()` = `(min-width: 1024px)` |
| `lib/useCountUp.ts` | `useCountUp(target: number, ms = 600): number` - animates once from 0 on first mount with `requestAnimationFrame`; returns `target` immediately with reduced motion or when `target` changes later |
| `lib/format.ts` | additions of 4.1 |

`apps/web/src/app/layout.tsx` (exact):

```tsx
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/lib/providers';

export const metadata: Metadata = { title: 'DMS' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

// Runs before paint: applies the saved locale direction, theme and density so there is no flash.
const BOOT = `(function(){try{var d=document.documentElement,s=localStorage;var l=s.getItem('dms.locale');if(l==='en'){d.lang='en';d.dir='ltr';}var t=s.getItem('dms.theme')||'light';if(t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}d.setAttribute('data-theme',t==='dark'?'dark':'light');var n=s.getItem('dms.density');if(n==='compact'||n==='comfortable'){d.setAttribute('data-density',n);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

---

## 8. App shell (owner: W1)

Files: `components/layout/AppShell.tsx` (rewrite), `Sidebar.tsx` (rewrite), `NotificationsBell.tsx` (restyle; keep every export), new `TopBar.tsx`, `MobileTabBar.tsx`, `UserMenu.tsx`, `CommandPalette.tsx`, and `lib/nav.ts` (regroup).

### 8.1 Navigation (`lib/nav.ts`)

`NavItem` and `NavGroup` types stay. Item `href`, `labelKey`, `permission` values do not change. New grouping and one new item (labels of groups are new keys in the `shell` namespace; item labels keep `common.nav.*`):

| Group key | `labelKey` | Items (in order) |
|---|---|---|
| `work` | `shell.nav.work` (العمل اليومي) | `/inbox`, `/requests`, `/vehicle-changes`, `/assignments` |
| `insight` | `shell.nav.insight` (المتابعة) | `/dashboard`, `/reports`, `/sap` |
| `config` | `shell.nav.config` (الإعداد) | `/admin/request-types` (new: `labelKey: 'shell.nav.requestTypes'`, `permission: P.REQUEST_TYPES_MANAGE`, `icon: 'FileStack'`), `/workflows`, `/templates`, `/master/expense-types`, `/master/sap-settings`, `/admin/settings` |
| `data` | `shell.nav.data` (البيانات الأساسية) | `/master/drivers`, `/master/vehicles`, `/master/vehicle-types`, `/master/cost-centers`, `/master/gl-accounts`, `/master/treasuries`, `/admin/departments` |
| `admin` | `shell.nav.admin` (الإدارة) | `/admin/users`, `/admin/roles`, `/admin/delegations`, `/admin/audit` |

Also export `navSlug(href: string): string` (`'/admin/request-types'` -> `'admin-request-types'`) and `findNavItem(path: string): { group: NavGroup; item: NavItem } | null` (same "equals or starts with href + '/'" rule as today; when several items match, the longest `href` wins). The `ICONS` map in `Sidebar.tsx` gains `FileStack`.

### 8.2 Desktop layout (`lg` and up)

```
+--------------------------------------------------------------------------------------------+
|#### 5px letterhead band: 2px navy, 2px gap, 1px brass, full width, fixed ################## |
+----------------------------------------------------------------------+---------------------+
| topbar 56px  [العمل اليومي > صندوق الوارد]     [بحث أو انتقال  Ctrl K]  EN  (theme) (bell)   | (د) نظام إدارة     |
+----------------------------------------------------------------------+     المستندات       |
|                                                                      |---------------------|
|  main: px-8 py-7, <Page> centred, max 1280px                         | العمل اليومي        |
|                                                                      | | صندوق الوارد  [7] |  <- active: white, brass bar
|                                                                      |   الطلبات           |
|                                                                      |   طلبات تغيير السيارة|
|                                                                      | المتابعة            |
|                                                                      |   لوحة المتابعة ... |
|                                                                      |---------------------|
|                                                                      | (م.س) محمود السيد v |
+----------------------------------------------------------------------+---------------------+
   (Arabic: sidebar on the right = inline-start. English: mirrored.)
```

- **Letterhead band**: `<div class="rule-double fixed inset-x-0 top-0 z-topbar bg-canvas" data-no-print />` (5px). Everything below is offset with `pt-band`.
- **Sidebar**: `aside` `data-testid="sidebar"`, `hidden lg:flex w-sidebar shrink-0 flex-col border-e border-hairline bg-surface-2 sticky top-band h-[calc(100dvh-5px)]`. Collapsed state (`usePrefs().sidebarCollapsed`): `w-sidebar-min`, labels hidden, each item wrapped in a `Tooltip`, group labels replaced by a `h-px bg-hairline mx-3 my-2` divider.
  - Header (`h-topbar px-4 flex items-center justify-between`): `<BrandMark withName />` linking to `/`; collapse `IconButton` (`PanelRightClose` when expanded, `PanelRightOpen` when collapsed, both `mirror`; label `shell.sidebar.collapse` / `shell.sidebar.expand`).
  - Nav (`flex-1 overflow-y-auto px-3 py-3 space-y-5`): group label `mb-1 px-3 text-xs font-medium text-ink-3`; items `relative flex h-9 items-center gap-3 rounded px-3 text-sm text-ink-2 transition-colors duration-1 hover:bg-surface-3 hover:text-ink` with `<Icon size={18} />`, `data-testid={'nav-' + navSlug(href)}`, `aria-current="page"` when active. Active: `bg-surface font-medium text-ink shadow-card` plus a brass bar `<span class="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-brass" />`.
  - Inbox counter: the `/inbox` item shows, at the end, `<span data-testid="nav-badge-inbox" class="num ms-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-on-primary">` with the sum of `count` from `GET /requests/queue/counters` (react-query key `['queue-counters']`, `refetchInterval: 30000`, enabled when `can('requests.view')`); hidden at 0. When the sum of `overdue` > 0 the badge is `bg-danger text-on-danger`.
  - Footer (`border-t border-hairline p-3`): `<UserMenu />` trigger = `Avatar` 32 + full name (`text-sm font-medium`, truncate) + first role name (`text-xs text-ink-3`, truncate) + `ChevronsUpDown` 16.
- **UserMenu** (`data-testid="user-menu"`): `Menu` with: profile (`/profile`, `UserRound`), language toggle (`Languages`, label `العربية`/`English` = the other language), theme submenu flattened as three items (`Sun` light, `Moon` dark, `Monitor` system; the active one shows a `Check`), separator, logout (`LogOut` mirrored, `danger`, `data-testid="user-menu-logout"`; `logout()` then `router.replace('/login')`).
- **TopBar** (`data-testid="topbar"`): `sticky top-band z-topbar flex h-topbar items-center gap-3 border-b border-hairline bg-canvas/90 px-4 backdrop-blur lg:px-8`, `data-no-print`.
  - Start: breadcrumbs from `findNavItem(path)`: group label (`text-sm text-ink-3`) + `ChevronRight` (14, mirror) + page label (`text-sm font-medium text-ink`). Pages outside `NAV` (`/profile`, `/notifications`) show only their title (`shell.page.profile`, `shell.page.notifications`).
  - Middle (`flex-1`).
  - End: search trigger (`data-testid="topbar-search"`, `hidden md:flex h-9 w-64 items-center gap-2 rounded border border-line bg-surface px-3 text-sm text-ink-3`, `Search` icon, text `shell.search.placeholder`, `<Kbd>Ctrl K</Kbd>` at the end) opening the command palette; locale toggle (`data-testid="topbar-locale"`, `ghost` `sm`, text `EN` when Arabic / `ع` when English, `title` = `common.language`); theme toggle `IconButton` (`data-testid="topbar-theme"`, `Moon` in light / `Sun` in dark; toggles between light and dark); `<NotificationsBell />`.
- **Main**: `<main class="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7 pb-[84px] md:pb-7">`.
- Whole shell root: `data-testid="app-shell"`, `min-h-dvh pt-band lg:flex`.
- Auth loading: full-screen centred `<BrandMark size={48} />` with `animate-pulse`. Unauthenticated -> `/login` (unchanged). Forbidden page: warning `Banner` with `common.auth.forbiddenPage`.

### 8.3 Mobile and tablet (below `lg`)

- No sidebar. A menu `IconButton` (`Menu` icon, label `common.nav.openMenu`) at the start of the top bar opens the navigation in a `Drawer side="start" width="sm"` (title = `<BrandMark withName />`, body = the same `Sidebar` nav list with `onNavigate` closing it, footer = `UserMenu` content as plain buttons).
- Top bar on phones: menu button, current page label (`text-base font-medium`, truncate), then bell. Locale and theme toggles live in the drawer footer below `md`.
- **MobileTabBar** (`data-testid="mobile-tabbar"`, only below `md`, `data-no-print`): `fixed inset-x-0 bottom-0 z-bar flex h-tabbar items-stretch border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)]`. Tabs (each `flex-1 flex-col items-center justify-center gap-0.5 text-[11px]`, icon 20): `/inbox` (`Inbox`, `shell.tab.inbox`, shows the inbox count badge, `data-testid="tab-inbox"`), `/requests` (`FileText`, `shell.tab.requests`, `tab-requests`), `/notifications` (`Bell`, `shell.tab.notifications`, unread dot, `tab-notifications`), more (`Menu`, `shell.tab.more`, opens the navigation drawer, `tab-more`). Tabs whose permission fails are omitted. Active tab: `text-primary font-medium` with a `2px` brass bar on top; inactive `text-ink-3`.
- The tab bar is **hidden on `/requests/[id]`** (the request action bar takes its place; see 9.4).

### 8.4 NotificationsBell

Same data and exports. Trigger: `IconButton` (`Bell`, `data-testid="notif-bell"`) with a count bubble (`data-testid="notif-count"`, `absolute -top-0.5 -end-0.5 h-4 min-w-4 rounded-full bg-danger px-1 text-[10px] font-medium text-on-danger num`, "9+" above 9). Panel: `Popover align="end"` `w-[360px] p-0`: header (title `shell.notif.title`, "mark all read" link button), list of up to 8 items (unread = brass dot at the start + `font-medium`; title, body clamp 2 lines, `DateText mode="relative"`), footer link to `/notifications`. Below `sm` the bell navigates to `/notifications` instead of opening the popover.

### 8.5 Command palette (`CommandPalette.tsx`) - cut-first item C1

`Ctrl+K` / `Cmd+K` or the top-bar trigger opens a `Modal size="md"` (`data-testid="cmdk"`) with an autofocused `SearchInput` (`data-testid="cmdk-input"`) and a result list: (a) navigation items the user `can()` open, filtered by label substring in both languages; (b) when the text matches `/^[A-Za-z]{0,4}-?\d/` (looks like a request number), one debounced call `GET /requests?number=<text>&pageSize=5` and the hits listed as "request" results (`Code` number + driver + `Money`). Arrow keys move, Enter opens, Escape closes. No other features.

---

## 9. Screen specifications

Common rules for every screen:
- Root element is `<Page testId="page-<slug>">`; first child is `<PageHeader>`. Blocks animate in with `animate-rise` (section 6).
- Lists: skeleton on first load, previous data kept while refetching, `ErrorBlock` with retry on failure, `EmptyState` with a sentence that says what will appear here.
- Every API call, query key, permission gate (`can()`), i18n key and business rule of the current implementation is preserved unless this section says otherwise. Read the current file before rewriting it.
- Mobile = below `md` (768px). Dialogs become bottom sheets automatically (kit). Primary mobile actions use `size="lg"`.
- "W1..W9" = owning work package (PLAN_V2 section 8).

### 9.1 Login - `/login` (W1, rewrite `app/login/page.tsx`)

```
RTL view (form at the inline-start = right; navy panel at the inline-end = left)
+------------------------------------------------+-----------------------------------------+
| navy panel: bg-primary + .lattice              |  canvas                                 |
|                                                |      (د)  نظام إدارة المستندات           |
|   كل مصروف                                     |      ==== double rule, 72px wide        |
|   موثَّق، معتمَد، ومُرحَّل.   (display 40px)     |      تسجيل الدخول        (display 30)   |
|                                                |      أدخل بيانات حسابك للمتابعة          |
|   (icon) إيصالات السائقين بالصورة من تليجرام   |      اسم المستخدم   [______________]     |
|   (icon) مسار اعتماد واضح بتوقيع كل مسؤول      |      كلمة المرور    [__________ (eye)]  |
|   (icon) قيد محاسبي جاهز للترحيل إلى SAP       |      [ danger banner when login fails ] |
|                                                |      [        تسجيل الدخول          ]   |
|                     ( brass seal, 132px )      |      EN  ·  (moon)                      |
+------------------------------------------------+-----------------------------------------+
```

- Layout: `min-h-dvh grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]`. The letterhead band (`rule-double fixed inset-x-0 top-0`) is shown here too.
- Form column (first in DOM): `flex items-center justify-center bg-canvas px-6 py-12`; inner `w-full max-w-sm`. Order: `<BrandMark size={40} withName />`; `<div class="rule-double mt-5 w-[72px]" />`; `<h1 class="display mt-6 text-3xl">` `shell.login.title`; `<p class="mt-1 text-sm text-ink-2">` `common.auth.subtitle`; form `mt-8 space-y-4 data-testid="login-form"`: username (`FormField` + `Input dir="ltr" autoComplete="username" autoFocus data-testid="login-username"`), password (`Input type={show ? 'text' : 'password'} dir="ltr" autoComplete="current-password" data-testid="login-password"` with an eye `IconButton` as `endAdornment`, `data-testid="login-toggle-password"`, labels `shell.login.showPassword` / `shell.login.hidePassword`); error area `<div aria-live="polite">` holding a danger `Banner` (`data-testid="login-error"`) with the existing error messages; submit `<Button type="submit" size="lg" block loading data-testid="login-submit">` `common.auth.login`. Footer row `mt-6 flex items-center gap-3 text-sm text-ink-3`: locale toggle button, theme toggle `IconButton`.
- The password input must remain the only `input[type=password]` and the submit the only `button[type=submit]` on the page.
- Panel column (`hidden lg:flex`): `relative flex-col justify-between overflow-hidden bg-primary lattice p-12 text-on-primary`. Top: headline `display text-4xl leading-[1.5]` from `shell.login.headline1` and `shell.login.headline2` (two lines). Middle: three rows (`Icon` 20 in brass colour `text-brass` + `text-base`): `shell.login.point1..3` with icons `Camera`, `Signature`, `BookCheck`. Bottom end: `<Seal kind="approved" size={132} className="text-brass" />` (static).
- Below `lg`: the panel is replaced by a `h-28 bg-primary lattice` strip at the top holding nothing; the form follows.
- Motion: the six form-column blocks rise in sequence (40ms steps). The seal on the panel plays `animate-seal` once after 300ms.
- Behaviour unchanged: `useAuth().login`, redirect to `/`, same error mapping.

### 9.2 Inbox - `/inbox` (W2, rewrite `features/inbox/InboxPage.tsx`)

```
صندوق الوارد                                                              (display title)
7 طلبات بانتظار اعتمادك، منها 2 متأخرة                                     (summary sentence)
==========================================================================================
[ كل أدواري 7 ] [ مشرف الحملة 7 • ]                              <- role scope (segmented)
 بانتظار إجرائي 7      بانتظار تصحيح السائق 1                     <- underline tabs, brass counts
------------------------------------------------------------------------------------------
[01/11/2026 -> 10/11/2026 (presets)] [السائق v] [السيارة v] [المزيد v] ( ) المتأخرة فقط   مسح
+----------------------------------------------------------------------------------------+
| الطلب            السائق / السيارة       الإجمالي      الخطوة        الانتظار    الحالة   |
|----------------------------------------------------------------------------------------|
|| DE-26-000002    (ع.ح) علي حسن          1,031.00 ج.م  مشرف الحملة   (clock) 35 س  [متأخر] [تكرار محتمل]  <
|                        2158                                                             |
|  DE-26-000003    (م.ك) مصطفى كمال       3,833.00 ج.م  مشرف الحملة   (clock) 35 س          <
|  DE-26-000033    (إ.ج) إسلام جمال         100.00 ج.م  مشرف الحملة   (clock) 33 س  [عاد من التصحيح]  <
+----------------------------------------------------------------------------------------+
 1-7 من 7                                                                        < 1/1 >
```

- Header: title `requests.inbox.title`; subtitle is the summary sentence `data-testid="inbox-summary"`: `inbox.summary` (`{n}`, `{o}`) when the counters total > 0 and overdue > 0, `inbox.summaryNoOverdue` (`{n}`) when overdue = 0, `inbox.summaryNone` at 0. Numbers come from the counters query.
- Role scope: `SegmentedControl` (`size="md"`), items: all (`requests.inbox.allRoles` + count, `testId: 'inbox-role-all'`) and one per counter (`testId: 'inbox-role-' + roleId`); a counter with `overdue > 0` shows a `h-1.5 w-1.5 rounded-full bg-danger` dot after the count. Hidden when the user has a single role. Below `md` it scrolls horizontally.
- Tabs: `active` / `awaiting` (existing keys). The active tab count is the selected role's counter.
- `FilterBar`: `DateRange` (from/to), driver `LookupSelect`, vehicle `LookupSelect`, a "more" `Popover` (button `inbox.moreFilters`) with min amount, max amount (`Input numeric`) and min waiting hours, then `Switch` "overdue only". `activeCount` counts non-empty filters. Chips row shows one `FilterChip` per active filter. Filter state, query mapping and the client-side `minWaitHours` filter are unchanged; move the mapping to a pure function `toQueueQuery(f, page)` in `features/inbox/model.ts` (tested).
- Desktop list: `DataTable` (`testId="inbox"`, so rows are `inbox-row`; add `data-request-id` and `data-number` through a wrapper cell attribute or `rowKey`). Columns:
  1. `request` (`requests.col.number`): `<Code class="font-medium text-link">` number; whole row navigates to `/requests/{id}` (`rowHref`).
  2. `driver`: `Avatar` 24 + name (`text-sm`), and under it the vehicle number as `<Code class="text-xs text-ink-3">`.
  3. `total` (`align: 'end'`): `<Money value={totalFinal} />`.
  4. `step`: step name (`text-sm`).
  5. `waiting`: `Clock` icon 16 + `formatWaiting(...)` in a `.num` span; overdue -> `text-danger font-medium`.
  6. `state`: chips in this order: overdue (`Badge tone="red"`, `AlertTriangle`, `inbox.overdue`), locked by other (`Badge tone="amber"`, `Lock`, `requests.lock.lockedBy` with the name), returned from correction (`Badge tone="blue"`, existing text), duplicate (`Badge tone="red"`, existing `requests.inbox.duplicate`).
  7. chevron: `<Icon as={ChevronRight} mirror size={16} className="text-ink-disabled" />`.
  Row height: comfortable (set `class="h-[60px]"` on rows through a two-line cell; do not change `--row-h`). `rowTone`: overdue -> `danger`; locked by another user -> `muted`.
- Mobile list (`mobileCard`): 
  ```
  DE-26-000002                      1,031.00 ج.م
  علي حسن · 2158
  مشرف الحملة · (clock) 35 س   [متأخر]
  ```
  line 1: `Code` (font-medium) and `Money` (`md`) justified; line 2: `text-sm text-ink-2`; line 3: `text-xs` step, waiting and at most two chips. The whole card is a link.
- Empty (`data-testid="inbox-empty"` wrapping `EmptyState`): icon `CheckCheck`, title `inbox.emptyTitle`, hint `inbox.emptyHint`. For the `awaiting` tab: icon `MessageSquareWarning`, title `inbox.emptyAwaiting`.
- Keeps the 30s refetch and the 60s "now" tick.

### 9.3 Requests list - `/requests` (W2, rewrite `features/requests/RequestsListPage.tsx`)

- Header: `requests.title` key as today; subtitle as today.
- `FilterBar` with `search` = `SearchInput ltr` bound to `number` (`data-testid="requests-search"`, placeholder `inbox.searchNumber`), then status `Select`, driver, vehicle, `DateRange`. Same query parameters as today.
- `DataTable` (`testId="requests"`), sortable as today. Columns: number (`Code`, link colour), driver (Avatar 24 + name), vehicle (`Code`), total (`Money`, end), status (`StatusChip kind="request"`), submitted (`DateText`). `rowHref` -> `/requests/{id}`.
- Mobile card: line 1 `Code` + `Money`; line 2 driver · vehicle; line 3 `StatusChip size="sm"` + `DateText mode="relative"`.
- Empty: icon `FileSearch`, `inbox.requestsEmpty`.

### 9.4 Request detail - `/requests/[id]` (W3 page, stepper, lines, timeline; W4 action bar, dialogs, evidence viewer)

Desktop (`xl` and up, `Page width="wide"`):

```
< صندوق الوارد
DE-26-000003  [قيد المراجعة] [تكرار محتمل]                       [معاينة PDF] [تنزيل PDF]
مصروفات السائقين
==========================================================================================
[ banners: locked by someone / rejected reason / awaiting driver correction ]
+----------------------------- main (7 cols) ------------------+ +---- evidence (5 cols, sticky) ----+
|== summary sheet (double rule) ==============================| | dark viewer #0E1116                |
| الإجمالي المعتمد             السائق      السيارة   مركز التكلفة| | [-] 100% [+] [ملاءمة] [يسار] [يمين] [⤢] [فتح] |
| 3,833.00 ج.م  (hero)         (م.ك) مصطفى  2159      MLF451    | |                                    |
| ~~3,900.00~~ [معدّل]         تاريخ التقديم   القناة   العداد   | |          receipt image             |
|                    (seal)    20 أكتوبر 2026  Telegram 64,276  | |        (wheel zoom, drag pan)      |
+-------------------------------------------------------------+ |                                    |
| مسار الموافقات                                               | |  البند 1 · صيانة            1 / 3  |
|  (v)──────(●)──────[ ( ) مهندس الصيانة ]──────( )────( )     | | [th][th][th]                       |
|  تم       الآن      [ (-) مسؤول الشحن  ]      مدير   المحاسب  | +------------------------------------+
+-------------------------------------------------------------+
| بنود المصروف (1)                                             |
| #1 صيانة                                    3,833.00 ج.م    |
|    20/10/2026    [th][th]        [تعديل المبلغ] [طلب تصحيح]  |
+-------------------------------------------------------------+
| السجل الزمني (grouped by day)                                |
+-------------------------------------------------------------+
+========================== floating action bar (sticky bottom-4) ==========================+
| (lock) الطلب معك · تحرير           [رفض] [إرجاع لخطوة سابقة] [طلب تصحيح] [   اعتماد   ] |
+===========================================================================================+
```

Mobile (the approval flow on a phone):

```
+--------------------------------+
| (menu)  تفاصيل الطلب    (bell) |
+--------------------------------+
| < صندوق الوارد                 |
| DE-26-000003  [قيد المراجعة]   |
| مصروفات السائقين               |
| ============================== |
| الإجمالي المعتمد               |
| 3,833.00 ج.م        (hero)     |
| مصطفى كمال · 2159 · MLF451     |
| 20/10/2026 17:54 · Telegram    |
+--------------------------------+
| +----------------------------+ |
| |   receipt image (46dvh)    | |
| |   swipe            1 / 3   | |
| +----------------------------+ |
| [th][th][th]                   |
+--------------------------------+
| (●) مشرف الحملة · الآن         |
| الخطوة 2 من 8    عرض المسار v  |
+--------------------------------+
| #1 صيانة         3,833.00 ج.م |
|    20/10/2026      [تعديل]     |
+--------------------------------+
| السجل الزمني                 v |
+================================+
| [...] [طلب تصحيح] [  اعتماد  ] |  fixed, safe-area; the tab bar is hidden on this route
+--------------------------------+
```

**Shared state** (in `RequestDetailPage`): `activeAttachmentId: string | null` (defaults to the first current attachment) and `sealKind: SealKind | null` (set by `ActionPanel`'s `onSealed`, cleared after the next data load completes plus 1200ms).

**Page layout** (`RequestDetailPage.tsx`, W3)
- `PageHeader`: `back={{ href: '/inbox', label: t('requests.back') }}`; title = `<Code data-testid="request-number" className="text-2xl font-medium">` + `<StatusChip kind="request" data-testid="request-status">` + duplicate `Badge tone="red"`; subtitle = request type name; actions = PDF buttons as today (`data-testid="pdf-preview"`, `"pdf-download"`), `secondary`.
- Banners (in this order, each only when relevant): lock held by another user (warning, `Lock`, `requests.lock.beingReviewedBy`), rejected (danger, reason), status `CORRECTION_REQUESTED` (warning, `requests.banner.awaitingDriver`).
- Grid: `grid gap-6 xl:grid-cols-12`; main `xl:col-span-7 space-y-6 min-w-0`; evidence `xl:col-span-5`.
- Evidence placement: at `xl` render `<EvidenceViewer variant="panel" className="sticky top-[84px] h-[calc(100dvh-84px-104px)]" />` in the second column. Below `xl` render `<EvidenceViewer variant="carousel" />` directly after the summary sheet inside the main column (use `useMediaQuery('(min-width: 1280px)')`; render exactly one viewer).
- Order in the main column: summary sheet, [carousel below `xl`], route card, lines card, timeline card.
- Below everything: `<ActionPanel detail={d} onChanged={reload} onOpenCorrection={...} onSealed={setSealKind} />` then the modals as today. Add `pb-24` to the page while `d.myActions` is not null (room for the bar).

**Summary sheet** (W3): `<Card accent="rule" className="relative">` with `grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]`.
- Start block: label (`text-13 text-ink-2`) `requests.header.finalTotal`; `<Money data-testid="request-total" size="hero" value={finalTotal} original={originalTotal} />`; caption line (`text-xs text-ink-3`): when not edited nothing; when edited `requests.header.originalTotal` is already shown struck by `Money`.
- Seal: positioned `absolute bottom-4 end-4 pointer-events-none` (on mobile `top-4 end-4`, size 76; desktop size 104). Shown static when `status` is `PAID` (`kind="paid"`, `sub` = `formatDay(paidAt)`), `REJECTED` (`kind="rejected"`), `APPROVED` (`kind="approved"`). When `sealKind` is set, show `<Seal kind={sealKind} animate />` instead (even while status is still `IN_REVIEW`: it confirms the user's own approval of their step).
- End block: `<DL cols={3}>`: driver (Avatar 24 + name), vehicle (`Code` number; type under it in `text-xs text-ink-3`), cost center (`Code`), submitted at (`DateText mode="long"` + `formatTime`), channel, paid at (when set), odometer: `<Num value={odo.current} />` and, when a last reading exists, a caption built from `t('requests.header.lastOdometer', { n: ltrIsolate(formatCount(odo.last)) })` + `ltrIsolate('(+7,703)')`, in `text-danger font-medium` with the existing "lower" text when `odo.lower`. `ltrIsolate(s)` (add to `lib/format.ts`, F1) returns `'⁦' + s + '⁩'`.
- Mobile: the DL collapses to one line of key facts (`driver · vehicle · cost center`) and one line (`submitted · channel`); a "details" disclosure (`requests.header.more`) reveals the full DL.

**RouteStepper** (`features/requests/RouteStepper.tsx`, W3; `ProgressBar.tsx` becomes `export { RouteStepper as ProgressBar } from './RouteStepper';`)
```ts
export function RouteStepper(p: { steps: StepDto[]; orientation?: 'auto' | 'horizontal' | 'vertical'; compact?: boolean }): JSX.Element; // data-testid="route-stepper"
```
- Uses `groupStages(steps)`. `auto` = horizontal from `md`, vertical below.
- Node (28px circle, `data-testid={'step-' + stepKey}` `data-status={status}`):
  - `APPROVED`: `bg-primary text-on-primary`, `Check` 16.
  - `ACTIVE`: `border-2 border-primary bg-surface`, inner `h-2.5 w-2.5 rounded-full bg-primary`, `animate-ring-once`.
  - `AWAITING_CORRECTION`: `border-2 border-warning bg-warning-bg text-warning`, `MessageSquareWarning` 14.
  - `PENDING`: `border border-line bg-surface`.
  - `NOT_APPLICABLE`: `border border-dashed border-line bg-surface text-ink-disabled`, `Minus` 14. Label in `text-ink-3`, never struck through.
  - `REJECTED`: `bg-danger text-on-danger`, `X` 16. `CANCELLED`: as pending with `Ban` 14.
- Under each node: step name (`text-13 font-medium`; active `font-semibold text-ink`), then one caption line (`text-xs text-ink-3`): approved -> actor name + `DateText`; active -> `Badge tone="navy" size="sm"` with `requests.step.now` and, when `dueAt`, a due caption (`requests.step.dueIn` / `requests.step.overdueBy`, overdue in `text-danger`); awaiting correction -> existing text; pending -> role name; not applicable -> `requests.step.notApplicable`. Existing keys in `requests` are reused where they exist.
- Connectors: horizontal `h-0.5 flex-1` between stages, `bg-primary` when the stage on its start side is fully approved, else `bg-hairline`. In RTL the row naturally flows right to left; no arrows are drawn.
- Parallel stage (more than one step in a stage): a container `rounded-lg border border-dashed border-line px-3 py-2` holding the stage's steps stacked vertically (each a small node + label in a row), with a caption `requests.step.parallel` ("بالتوازي") and a `GitFork` icon 14 at the top. A stage where every step is `NOT_APPLICABLE` renders as one dashed node with the label `requests.step.skippedGroup`.
- Vertical orientation: nodes in a column with a `w-0.5` connector at the inline-start; labels to the inline-end of the node.
- `compact` (mobile summary): one line: the current step's node + name + `requests.step.position` ("الخطوة {i} من {n}") and a disclosure button (`requests.step.showRoute`) that expands the vertical stepper. Position counts stages excluding fully skipped ones.

**LineCard** (`LineCard.tsx`, W3). Props: existing plus `activeAttachmentId?: string | null; onSelectAttachment?: (attachmentId: string) => void`.
- Root `data-testid={'line-' + line.lineNo}`, `border-t border-hairline first:border-t-0 px-5 py-4`; when one of its attachments is the active one: `bg-primary-tint/40 border-s-[3px] border-s-brass`.
- Row 1: `Badge tone="gray" size="sm"` `#lineNo`, category name (`text-base font-medium`), reclassified chip (`Badge tone="brass" size="sm"`, existing text) when the category changed; at the end `<Money size="lg" value={line.amount} original={line.originalAmount} />`.
- Row 2 (`text-xs text-ink-3`, dot-separated): `DateText` of `lineDate`, quantity and unit price pairs as today (each number in `Num`), note (`dir="auto"`).
- Warnings: each `LineWarningDto` as `Badge tone="amber"` with `AlertTriangle`.
- Thumbs: current attachments as `h-14 w-14 rounded border border-hairline object-cover` buttons (`data-testid="line-thumb"`); the active one `ring-2 ring-primary`; superseded ones are not shown here. PDF attachments render a `FileText` tile. Clicking calls `onSelectAttachment`.
- Actions at the end of row 3: edit (`ghost sm`, `PencilLine`, `data-testid={'line-edit-' + lineNo}`) when `canEdit`; request correction (`ghost sm`, `MessageSquareWarning`, `data-testid={'line-correct-' + lineNo}`) when `canCorrect`.
- Open corrections for the line: warning `Banner` with the existing texts. Edit history: a disclosure `requests.line.history` (`{n}`) listing `LineEditDto` rows (old -> new in `Num`/text, reason in quotes, editor, `DateText mode="dayTime"`).

**Timeline** (`Timeline.tsx`, W3; `data-testid="timeline"`)
- Pure helper `collapseEvents(events)` in `features/requests/timelineModel.ts`: consecutive events of type `STEP_NOT_APPLICABLE` are merged into one group item `{ kind: 'skipped', count, events }`; an event of type `REQ_AT_STEP` that immediately follows another `REQ_AT_STEP` within the same second is dropped from the main list (kept in the group's `events`). Everything else passes through. `groupByDay(items, formatDay)` groups by Cairo day.
- Render: day header (`sticky top-topbar bg-surface py-1 text-xs font-medium text-ink-3`, `DateText mode="long"`); items on a vertical `w-px bg-hairline` line at the inline-start; each item: 24px disc (tone from `eventTone`, icon by type: submitted `Send` mirrored, approved `Check`, rejected `X`, correction `MessageSquareWarning`, edit `PencilLine`, SAP `Server`, PDF `FileText`, lock `Lock`, default `Dot`), sentence (existing `requests.event.*` texts), actor and `formatTime` in `text-xs text-ink-3`, comment as a quote block (`border-s-2 border-line ps-3 text-sm text-ink-2`, `dir="auto"`). A skipped group is one quiet row (`requests.timeline.skipped`, `{n}`) expandable to its events.
- On mobile the card is collapsed behind a disclosure with the event count.

**EvidenceViewer** (`features/requests/EvidenceViewer.tsx` + pure `features/requests/evidence.ts`, W4)
```ts
// evidence.ts
export interface EvidenceItem { attachment: AttachmentDto; lineId: string; lineNo: number; lineLabel: string }
export function buildEvidence(lines: LineDto[], locale: 'ar' | 'en'): EvidenceItem[];   // current attachments only, ordered by lineNo then createdAt
export function clampZoom(z: number): number;                                           // 0.25 .. 5
export function nextIndex(i: number, n: number, dir: 1 | -1): number;                   // wraps
// EvidenceViewer.tsx
export function EvidenceViewer(p: { items: EvidenceItem[]; activeId: string | null; onActiveChange: (attachmentId: string) => void; variant: 'panel' | 'carousel'; renderActions?: (item: EvidenceItem) => ReactNode; className?: string }): JSX.Element; // data-testid="evidence-viewer"
```
- Container: `flex flex-col overflow-hidden rounded-lg bg-viewer text-viewer-ink` (same colours in both themes).
- Toolbar (panel variant; `h-11 px-2 flex items-center gap-1 border-b border-white/10`, buttons are `IconButton`s styled `text-viewer-ink hover:bg-white/10`): zoom out (`ZoomOut`, `evidence-zoom-out`), zoom percent (`num text-xs w-12 text-center`), zoom in (`ZoomIn`, `evidence-zoom-in`), fit (`Maximize`, `evidence-fit`), rotate left (`RotateCcw`, label `requests.viewer.rotateLeft`, `evidence-rotate-left`), rotate right (`RotateCw`, `evidence-rotate-right`), spacer, open original in a new tab (`ExternalLink` mirrored, `evidence-open`), full screen (`Maximize2`, `evidence-fullscreen`; uses the Fullscreen API on the container, falls back to a `Modal size="xl"`).
- Stage: the image centred with `object-contain`; `transform: translate(x,y) scale(z) rotate(r)`; mouse wheel zooms around the pointer, drag pans, double click toggles fit / 200%, pinch zooms on touch. Keyboard when focused: arrows previous/next, `+`/`-` zoom, `0` fit, `R` rotate right. PDF attachments show a tile with `FileText` (32) and a button `requests.viewer.openPdf`.
- Caption bar: line label (`requests.viewer.line`, `{n}` + category) at the start; counter `i / n` (`num`) at the end; a red ribbon (`bg-danger text-on-danger text-xs px-3 py-1`) above it when the attachment has `duplicates` (existing duplicate text + the other request number in `Code`).
- Thumb strip (`flex gap-2 overflow-x-auto p-2 border-t border-white/10`): `h-12 w-12 rounded object-cover` buttons (`data-testid="evidence-thumb"`), active `ring-2 ring-brass`, each with a tiny `#lineNo` label.
- `renderActions(item)` (the per-image "request correction on this image" control) renders in the caption bar.
- `carousel` variant: height `h-[46dvh]`, no toolbar except full screen and rotate right; swipe left/right changes image; thumbs below.
- No items: a centred `ImageOff` icon and `requests.viewer.empty`.
- `ImageGallery` stays exported from `ImageGallery.tsx` as a wrapper: `ImageGallery({ attachments, renderActions })` builds items with `lineNo: 0` and renders `EvidenceViewer variant="carousel"` with local state.

**ActionPanel -> action bar** (`ActionPanel.tsx`, W4). Signature: `ActionPanel({ detail, onChanged, onOpenCorrection, onSealed })` with `onSealed?: (kind: SealKind) => void`. All mutations, lock logic, heartbeat, permission checks and i18n keys stay. Rendering:
- Not rendered at all when `detail.myActions` is null and the user cannot claim or force the lock.
- Desktop (`md` and up): `<div data-testid="action-bar" data-no-print class="sticky bottom-4 z-bar flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-surface px-5 py-3 shadow-bar">`.
  - Start: lock state. Not held: `secondary` button `requests.lock.claim` (`Lock`, `data-testid="action-claim"`). Held by you: `Badge tone="navy"` (`requests.lock.heldByYou`) + `link` button `requests.lock.release` (`action-release`). Held by another: `Badge tone="amber"` with the name, and for `requests.force_unlock` holders a `danger-outline sm` button `requests.lock.force` (`action-force`).
  - End (`ms-auto flex gap-2`), in DOM order: reject (`danger-outline`, `X`, `action-reject`), send back (`secondary`, `CornerUpLeft` mirrored, `action-sendback`), request correction (`secondary`, `MessageSquareWarning`, `action-correction`), approve or pay (`primary`, `lg`, `Check` / `Banknote`, `action-approve`). Each only when the corresponding `myActions` flag is true; disabled with the same rule as today (`!canAct`).
- Mobile: `fixed inset-x-0 bottom-0 z-bar flex items-center gap-2 border-t border-hairline bg-surface px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-bar`: a `Menu` (`IconButton` `MoreHorizontal`, `secondary`, `action-more`) holding claim/release/force, send back and reject (reject `danger`); request correction (`secondary`, `lg`, flex-1); approve/pay (`primary`, `lg`, flex-[1.4]). When the lock is not held the primary button first claims the lock, then opens the dialog.
- Approve / pay dialog (`Modal testId="approve-dialog"`): checklist items as `Checkbox` rows (`data-testid={'approve-check-' + key}`; required ones marked), treasury `Select` for payment steps, optional comment `Textarea`; footer: confirm (`primary`, `approve-confirm`, label = existing approve/pay key) then cancel. On success: `onSealed(isPayment ? 'paid' : 'approved')`, toast (existing text), `onChanged()`.
- Send back dialog: comment required (`data-testid="sendback-comment"`), confirm `sendback-confirm`.
- Reject dialog: danger `Banner` with the existing warning, reason `Textarea` (`reject-reason`), confirm `danger` (`reject-confirm`); on success `onSealed('rejected')`.
- `CorrectionModal`, `EditLineModal` (W4): same props and logic; restyled with kit components; amount inputs use `Input numeric`; before/after amounts with `Money`.

### 9.5 Vehicle changes - `/vehicle-changes` (W2, restyle `features/vehicle-changes/VehicleChangesPage.tsx`)
Tabs by status as today; `DataTable` with driver (Avatar + name), from vehicle -> to vehicle (`Code` + `ArrowRight` mirrored + `Code`; unmatched typed text in `Badge tone="amber"`), requested (`DateText mode="relative"`), status chip; row actions approve (`primary sm`) / reject (`danger-outline sm`) gated as today; decision dialogs restyled. Mobile card: names line, vehicles line, actions line.

### 9.6 Assignments - `/assignments` (W2, restyle `app/(app)/assignments/page.tsx`)
Info `Banner tone="info"` under the header: `inbox.assignments.rule` ("لكل سائق سيارة واحدة مفتوحة في كل وقت. تعيين سيارة جديدة يغلق التعيين السابق تلقائياً."). Tabs current / history; table: driver, vehicle (`Code`), since (`DateText`), until, by; "assign" primary button in the header; close action `danger-outline sm` with `ConfirmDialog`. Modal form unchanged.

### 9.7 Dashboard - `/dashboard` (W5, rewrite `features/dashboard/DashboardPage.tsx`)

```
لوحة المتابعة                                              [(presets)] [01/11/2026 -> 10/11/2026]
==========================================================================================
+== الإجمالي المعتمد ==+ +-- عدد البنود ---+ +-- فرق التعديل ---+ +-- خطوات متأخرة --+
| 39,012.00 ج.م (hero)| | 31              | | 389.00 ج.م       | | 0                |
| قبل التعديل 39,401  | | بند مصروف       | | [-1.0%]          | | لا يوجد تأخير    |
+---------------------+ +-----------------+ +------------------+ +------------------+
+---- المصروفات حسب الشهر (8 cols) ---------------+ +---- حسب نوع المصروف (4 cols) ----+
|   columns, time left-to-right, value on top    | | صيانة      17,871.00  ========  |
|    25,344        13,668                        | | سولار      13,264.00  ======    |
|     ___            _                           | | قطع غيار    5,179.00  ==        |
|   2026-10        2026-11                       | | أخرى (4)    2,698.00  =         |
+------------------------------------------------+ +---------------------------------+
+---- أعلى السيارات صرفاً (6 cols) ---+ +---- متوسط زمن الاعتماد لكل خطوة (6 cols) ----+
| 2158   12,750.00  =========  (5)   | | مشرف الحملة   3.2 س  ====    (21 طلباً)     |
+------------------------------------+ +---------------------------------------------+
+---- الطلبات المتأخرة --------------------------------------------------------------+
| [مشرف الحملة 2] [المحاسب 1]        <- role chips                                   |
| الطلب   السائق   الخطوة   منذ   التأخير                                            |
+------------------------------------------------------------------------------------+
```

- Header actions (`data-testid="dash-range"`): `DateRange` with presets; default range = this month (as a preset, replacing today's empty default only visually: when both are empty the API call is unchanged).
- KPI row `grid gap-4 grid-cols-2 xl:grid-cols-4`:
  1. `Stat accent testId="kpi-total"`: label `dashboard.kpi.total`, value `Money` of `totals.finalTotal` (count-up), caption `dashboard.kpi.before` + `Money sm` of `originalTotal` when different. Spans 2 columns on mobile.
  2. `Stat testId="kpi-count"`: `totals.count`, caption `dashboard.kpi.lines`.
  3. `Stat testId="kpi-diff"`: `originalTotal - finalTotal` as `Money`, `delta` = percent of original (`good` tone when > 0, neutral at 0).
  4. `Stat testId="kpi-overdue"`: sum of `delayedByRole[].count`; `tone="danger"` when > 0; caption `dashboard.kpi.noDelay` at 0.
- Row 2 `grid gap-6 xl:grid-cols-12`: `Card title=dashboard.byMonth` (`xl:col-span-8`, `data-testid="chart-by-month"`) with `<ColumnChart data={byPeriod} />`; `Card title=dashboard.byType` (`xl:col-span-4`, `chart-by-type`) with `<BarList>` of the top 6 expense types plus one "other" row (`dashboard.other`, `{n}`).
- Row 3 `xl:grid-cols-2`: top vehicles `BarList` (`chart-top-vehicles`, uses `topVehicles` only; the duplicate "by vehicle" card is removed); average approval hours per step `BarList` (`chart-avg-hours`, value `formatNumber(avgHours, 1)` + `dashboard.hoursShort`, caption count). When every `avgHours` is 0 show a compact `EmptyState` (`dashboard.noTimings`) instead of bars.
- Row 4: `Card title=dashboard.delayed` (`data-testid="delayed-table"`): role chips (`Badge tone="red"` name + count; click filters the table client-side), then a `DataTable`: number (`Code`, link), driver, step, since (`DateText mode="relative"`), overdue by (hours, `text-danger`). Empty: compact `EmptyState` icon `CheckCheck`, `dashboard.noDelayed`.
- Charts (W5, `apps/web/src/components/charts/`):
  - `chartModel.ts` (pure): `barWidths(values: number[]): number[]` (percent of max, min 2 when value > 0), `niceMax(max: number): number`, `topWithOther<T>(rows: T[], n: number, value: (r: T) => number): { top: T[]; otherTotal: number; otherCount: number }`.
  - `BarList({ rows: { key: string; label: ReactNode; value: number; valueLabel: ReactNode; caption?: ReactNode }[]; tone?: 'primary' | 'brass' })`: each row = label at start, `valueLabel` at end (`num text-sm font-medium`), and below a `h-1.5 rounded-full bg-surface-2` track with a `bg-primary` fill (first row `bg-brass` when `tone="brass"`); the fill anchors to the inline-start.
  - `ColumnChart({ data: { period: string; total: string; count: number }[] })`: inline SVG inside `<div dir="ltr">`, height 220, columns `fill: rgb(var(--primary))` (the latest period `rgb(var(--brass))`), rounded top 3px, value label above each column (`font: 500 12px var(--font-sans)`, fill `rgb(var(--ink-2))`), period label below (`rgb(var(--ink-3))`), 4 horizontal grid lines `rgb(var(--hairline))`. With one data point the column is 64px wide and centred. Each column has a `<title>` with the full money text.

### 9.8 Reports - `/reports` (W5, restyle + regroup `features/reports/ReportsPage.tsx`)
- `Page width="wide"`. Desktop: `grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]`.
- Filter panel (`Card`, `lg:sticky lg:top-[84px]`): four labelled groups separated by `Rule variant="hairline"`: period (date field `Select` + `DateRange`), who (drivers, vehicles, vehicle types, cost centers), what (expense types, GL accounts, statuses, waiting-at roles, number), amounts (min, max). Then group-by `Select`. Footer: run (`primary`, `data-testid="report-run"`) and reset (`ghost`). Below `lg` the panel is a `Drawer` opened by a "filters" button. `toFilters` and the request body are unchanged.
- Result column: totals strip (three `Stat`s: lines, original total, final total); when grouped, a groups `DataTable` (label, count, original, final; end-aligned numbers); rows `DataTable` (`data-testid="report-rows"`, horizontal scroll, the request number column first and `sticky start-0 bg-surface`), server pagination as today.
- Export: a `Menu` on a `secondary` button (`Download`, `data-testid="report-export"`, text `reports.export` existing key) with items `report-export-EXCEL`, `report-export-ZIP_IMAGES`, `report-export-PDF_BUNDLE` (gated by the same permissions as today). The button's accessible name must still contain "تصدير".
- Exports list (`Card`, `data-testid="exports-list"`): rows (`export-row`) with kind, `StatusChip kind="export"`, rows, size, created (`DateText mode="relative"`), download `link` button when `downloadUrl`; polling as today.

### 9.9 SAP monitor - `/sap` (W5, restyle + drawer `features/sap/SapPage.tsx`)
- Counters row: four clickable `Stat`s (`data-testid="sap-counter-POSTED|FAILED|PENDING|POSTING"`) computed from four cheap list calls with `pageSize=1` reading `total` (query keys `['sap-count', status]`); clicking sets the status filter; FAILED uses `tone="danger"` when > 0.
- `FilterBar` (status, date range, number search as today). `DataTable` (`testId="sap"`): request number (`Code`), `StatusChip kind="sap"`, SAP document (`Code`: number / fiscal year), attempts (`Num` + "/ 8"), last error (one line, truncated, `text-danger`, full text in a `Tooltip`), updated (`DateText mode="relative"`). Row click opens a `Drawer width="lg"` (`data-testid="sap-drawer"`) using `GET /sap/postings/:id`: header facts (`DL`), journal items table (side, GL `Code`, cost center `Code`, amount `Money`, text), attempts list (number, trigger, time, result or error), and the retry button (`primary`, `data-testid="sap-retry"`, gated `sap.retry`).
- Unknown outcome: when `lastError` starts with `UNKNOWN_OUTCOME`, the retry button opens a `Modal` with a warning `Banner` (`sap.force.warning`), a `Checkbox` (`data-testid="sap-force-check"`, `sap.force.confirmCheck`) and a `danger` confirm (`sap-force-confirm`, disabled until checked) that calls `POST /sap/postings/:id/retry` with body `{ force: true }`. Otherwise retry posts `{}` as today.

### 9.10 Workflows - `/workflows`, `/workflows/[id]` (W6)
- List (`WorkflowsListPage.tsx`, restyle): a grid of cards (`data-testid="workflow-card"`, `grid gap-4 sm:grid-cols-2 xl:grid-cols-3`): request type name (`text-lg font-semibold`), `Code` request type code, `StatusChip kind="version"` for the active version ("v3") or a gray "no active version" badge, open button (`secondary`).
- Editor (`WorkflowEditorPage.tsx` rewrite of the layout; `StepCard.tsx`, `ConditionBuilder.tsx` restyle; `condition.ts`, `stepModel.ts` unchanged): `Page width="wide"`, `grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]`.
  - Header: back link; title workflow name; `Code` type code as subtitle; actions: new draft (`wf-new-draft`), delete draft, save (`wf-save`, `secondary`), publish (`wf-publish`, `primary`) with the same enable rules as today.
  - Version bar (`Card`): versions as `SegmentedControl`-like chips ("v1" + `StatusChip kind="version" size="sm"` + `DateText`); the read-only notice as an info `Banner`; note `Input`.
  - Step route (main column): a vertical route with a `w-0.5 bg-hairline` line at the inline-start and a 28px numbered node per step (`bg-primary text-on-primary num`; conditional steps `border-2 border-dashed border-primary bg-surface text-primary`). Each step row (`data-testid="wf-step"` `data-key={key}`) is a card: drag handle (`GripVertical`, `cursor-grab`, dnd-kit as today), name (`text-base font-medium`), role name (`text-xs text-ink-3`), badges with Arabic labels (`workflows.badge.conditional`, `.dynamic`, `.payment`, `.parallel` + group name), and a one-line condition sentence from `describeCondition(condition, t, ctx)` (`features/workflows/describe.ts`, pure: e.g. "إذا كان الإجمالي أكبر من 5,000 ج.م و نوع البند ضمن (صيانة، قطع غيار)"). A chevron expands the existing editor form inline. Consecutive steps sharing a `parallelGroup` are wrapped in a `rounded-lg border border-dashed border-line p-2` container captioned `workflows.parallelGroup` + name. "Add step" button (`wf-add-step`, `secondary`, `Plus`) at the end of the route.
  - Side column (`xl:sticky xl:top-[84px] space-y-6`): (1) `Card title=workflows.preview` (`data-testid="wf-preview"`): a `RouteStepper orientation="vertical"` fed by synthetic `StepDto`s built from the edited steps with a pure adapter `previewSteps(steps, simulateResult?)` in `features/workflows/preview.ts` (all `PENDING`; after a simulation, steps that do not apply become `NOT_APPLICABLE`); import `RouteStepper` from `@/features/requests/RouteStepper`. (2) Simulator card: category checkboxes, amount `Input numeric`, run button (`wf-simulate`), result reflected in the preview plus a sentence (`workflows.sim.result`, `{n}`, `{total}`). (3) Validation issues (`validateSteps`) as a warning `Banner` list.
  - Below `xl` the side column follows the route.

### 9.11 Templates - `/templates`, `/templates/[id]` (W6)
- List (`TemplatesListPage.tsx`, rewrite): header action "new template" (`primary`, `Plus`, `data-testid="template-new"`). Cards (`data-testid="template-card"`): name, `Code` code, request type name, default badge (`Badge tone="brass"`), active version chip, inactive badge; card `Menu`: open, set as default (`PATCH /templates/:id { isDefault: true }`), deactivate / activate (`PATCH { isActive }`).
- `features/templates/CreateTemplateDialog.tsx` (new, exported, also used by W9):
  ```ts
  export function CreateTemplateDialog(p: { open: boolean; onClose: () => void; requestTypeId?: string; onCreated: (template: TemplateDto) => void }): JSX.Element; // Modal testId="template-create-dialog"
  ```
  Fields: request type (`Select` from `GET /request-types`, disabled when `requestTypeId` is given; `data-testid="tpl-type"`), code (`Input dir="ltr"`, uppercased, `/^[A-Z0-9_]+$/`, `tpl-code`), Arabic name (`tpl-name-ar`), English name (`tpl-name-en`), layout (`SegmentedControl`: `expense-sheet` / `generic-request`, labels `templates.layout.expense` / `templates.layout.generic`), copy settings from (`Select` of templates of the same type, optional), default `Switch`. Submit (`tpl-create-submit`) -> `POST /templates`; 409 -> field error on code (`templates.create.duplicate`). On success call `onCreated` (the list page navigates to `/templates/{id}`).
- Editor (`TemplateEditorPage.tsx`, rewrite of the layout, same state and API): `Page width="wide"`, `grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,5fr)]`.
  - Form column (cards): identity (Arabic and English names -> `PATCH /templates/:id` on blur with a small "saved" toast; default and active `Switch`es), titles and company, logo upload (`FileDrop` + preview), layout picker (`SegmentedControl` bound to `layoutKey`, sent with the existing `PUT`), header fields (rows: show `Switch`, Arabic label `Input`, key as `Code` caption), line columns (same pattern), options and signatures (as today).
  - Preview column: `xl:sticky xl:top-[84px]`; a `Card` with a toolbar (refresh, open PDF preview) and the sandboxed iframe (`data-testid="tpl-preview-frame"`) inside an A4-ratio box (`aspect-[210/297] w-full overflow-hidden rounded border border-hairline bg-white`), the iframe scaled to fit the box width with CSS `transform: scale()` computed from the box width / 794px. Below `xl` the preview sits above the form inside a collapsible card.
  - Sticky footer bar (same style as the request action bar): status chip, "unsaved changes" hint, save (`tpl-save`), publish (`tpl-publish`), new draft.

### 9.12 Master data - `/master/*`, `/admin/departments` (W7)
`components/crud/CrudPage.tsx` is rewritten (same `CrudConfig` API; add optional `mobileCard?: (row: T) => ReactNode` and `testId?: string`); every resource page inherits it.
- Header: title, subtitle, actions: add (`primary`, `Plus`, `data-testid="crud-add"`, gated by `managePermission`), and a `Menu` (`secondary` button `MoreHorizontal`) with import (`crud-import`) and export (`crud-export`) unless disabled by config. On `lg` and up import/export are shown as two `secondary` buttons instead of the menu.
- Toolbar: `FilterBar` with `SearchInput` (`data-testid="crud-search"`) and the config filters; total count at the end (`ui.total`, `{n}`).
- `DataTable` (`testId="crud"`): the config columns; the active column becomes an inline `Switch` (`data-testid={'crud-toggle-' + id}`) for managers (deactivate asks `ConfirmDialog`; activate is immediate), `ActiveBadge` for viewers; row actions in a `Menu` (edit first, then config `rowActions`).
- Form: `Modal testId="crud-form"` (size from config), fields in a `grid gap-4 sm:grid-cols-2` (`wide` fields span both), each wrapper `data-testid={'crud-field-' + key}`; `ltr` fields `dir="ltr"`; number fields `Input numeric`; footer save (`crud-save`) then cancel.
- `ImportDialog.tsx` restyle: `FileDrop`, result summary as success / danger `Banner`, row errors in a compact table.
- Drivers (`master/drivers/page.tsx`): Telegram column: linked -> `Badge tone="green"` (`Send` icon, `@username` in `Code`, `data-testid="tg-chip"`), not linked -> gray badge. Row menu (gated `submitters.telegram_link`): unlink (`tg-unlink`, existing endpoint, `ConfirmDialog`), and relink (`tg-relink`): if linked, first calls unlink, then `POST /submitters/:id/telegram-link` and opens `TelegramLinkDialog`.
- `components/TelegramLinkDialog.tsx` (new, W7; also used by W8 and W1):
  ```ts
  export interface TelegramLinkInfo { command: string; deepLink: string | null; expiresAt: string }
  export function TelegramLinkDialog(p: { open: boolean; onClose: () => void; info: TelegramLinkInfo | null; subjectName: string }): JSX.Element; // Modal testId="tg-link-dialog"
  ```
  Body: numbered steps (`ui.tg.step1..3`), the command in a `Code` box (`data-testid="tg-link-command"`, `select-all`), a copy button (`tg-link-copy`, copies with `navigator.clipboard`, toast `ui.copied`), the deep link as a `link` button when not null, and the expiry (`ui.tg.expires` + `DateText mode="dayTime"`).
- Expense types (`master/expense-types/page.tsx`), vehicles, vehicle types, cost centers, GL accounts, treasuries, departments: config unchanged apart from kit names; add `mobileCard` where a list has more than four columns.
- SAP settings (`master/sap-settings/page.tsx`, restyle): `Page width="narrow"`, a `Card` with the existing fields in a two-column grid, plus the new `sap.config` fields of PLAN_V2 B3 (cash journal block: default number, business transaction, mapping table treasury code -> cash journal number). Save bar at the bottom.

### 9.13 Administration (W8)
- **Users** (`admin/users/page.tsx`, restyle): table (`testId="users"`): user (Avatar 32 + full name + `Code` username under it), roles (`Badge`s, max 3 then "+n"), department, email (`dir="ltr"`), Telegram (`Badge` green / gray, `data-testid="tg-chip"`), status, last login (`DateText mode="relative"`). Row `Menu`: edit, roles, reset password, revoke sessions, Telegram link (`data-testid="tg-link"`: `POST /users/:id/telegram-link` -> `TelegramLinkDialog`) when not linked, Telegram unlink (`tg-unlink`: `POST /users/:id/telegram-unlink` after `ConfirmDialog`) when linked. Form modal (`user-form`) gains nothing new except kit styling (the email field already exists in the contract; make sure it is in the form).
- **Roles** (`admin/roles/page.tsx`, rewrite; pure model in `features/admin/matrixModel.ts`):
  - Tabs matrix / roles as today.
  - Matrix desktop (`data-testid="matrix"`, `Page width="full"`): a scroll container `max-h-[calc(100dvh-220px)] overflow-auto rounded-lg border border-hairline bg-surface`; header row sticky top (role Arabic name `text-13 font-medium`, `Code` role code `text-[11px] text-ink-3`); first column sticky at the inline-start (`w-72`, permission name `text-sm`, `Code` permission code `text-[11px] text-ink-3`); group rows (`bg-surface-2`, `h-9`) with a collapse chevron, the group name, and per role a tri-state checkbox (all / some / none) that toggles the whole group for that role; cells are 18px checkboxes centred (`data-testid="matrix-cell"` `data-role={roleId}` `data-perm={code}`); changed cells get `bg-brass-tint`; hovering highlights the row and the column header (`bg-surface-2/60`). A `SearchInput` above (`matrix-search`) filters permission rows by name or code.
  - Unsaved bar: sticky bottom floating bar (same style as the action bar): `matrix-dirty-count` text `admin.matrix.dirty` (`{n}`), discard (`ghost`, `matrix-discard`), save (`primary`, `matrix-save`). Saving issues one `PUT /roles/:id/permissions` per changed role (as today).
  - Mobile: a role `Select`, then permission groups as collapsible cards with one `Switch` per permission.
  - `matrixModel.ts`: `diffMatrix(original, current): { roleId: string; added: string[]; removed: string[] }[]`, `groupState(codes, set): 'all' | 'some' | 'none'`, `toggleGroup(set, codes, on): Set<string>`, `filterPermissions(meta, q, locale)`.
- **Delegations** (`admin/delegations/page.tsx`, restyle): table: from (Avatar + name), to, role or "all roles", period (`DateText` -> `DateText`), `StatusChip kind="delegation"` (ACTIVE / UPCOMING / ENDED / REVOKED computed from dates and `revokedAt` by a pure `delegationStatus(d, now)` in `features/admin/delegation.ts`), revoke action. Create modal with `DateField`s.
- **Audit** (`admin/audit/page.tsx`, rewrite): `FilterBar` (date range, actor, action text, entity type, entity id; same query as today). Table: time (`DateText mode="dayTime"`), actor, action (`Code` + humanised label when a key `admin.audit.action.<code>` exists), entity (`type` + `Code` id). Row click expands a diff panel: `diffObjects(before, after)` from `features/admin/diff.ts` (`{ key: string; before: unknown; after: unknown; kind: 'added' | 'removed' | 'changed' }[]`, one level deep, values JSON-stringified) rendered as a three-column table (field `Code`, before in `bg-danger-bg`, after in `bg-success-bg`); raw JSON behind a disclosure. A `Lock` icon and the caption `admin.audit.immutable` in the header.
- **Settings** (`admin/settings/page.tsx`, restyle + grouping): settings grouped by key prefix into cards (workflow, bot, expense, media, files, reports, company, sap, notifications; group titles `admin.settings.group.<prefix>`); each row: label (existing label logic) with the key as a `Code` caption, the control (`Switch` for booleans, `Input numeric` for numbers, `Input` for strings, `Textarea dir="ltr" class="code"` for objects) and a per-row save button that appears when dirty. `notifications.email` and `notifications.telegramUsers` (new settings, PLAN_V2 B6 and B7) get a structured editor instead of JSON: an "enabled" `Switch` and a checklist of notification types (`REQ_AT_STEP`, `SLA_REMINDER`, `CORRECTION_RETURNED`, `STEP_SENT_BACK`, `SAP_FAILED`, `VEHICLE_CHANGE_REQUESTED`, `EXPORT_READY`; labels `admin.notifType.<TYPE>`).
- `components/SignatureManager.tsx` (W8, restyle only; same props and logic).

### 9.14 Request types - `/admin/request-types`, `/admin/request-types/new`, `/admin/request-types/[id]` (W9, new)
Files: `app/(app)/admin/request-types/page.tsx`, `.../new/page.tsx`, `.../[id]/page.tsx` (thin wrappers), `features/request-types/{RequestTypesListPage.tsx, RequestTypeEditorPage.tsx, FieldListEditor.tsx, CategoryDrawer.tsx, model.ts}`. API and contracts: PLAN_V2 B1. Gate everything with `can('request_types.manage')` (the nav guard already blocks other users).

- **List**: header action "new request type" (`primary`, `data-testid="rt-new"` -> `/admin/request-types/new`). `DataTable` (`testId="rt"`, rows `rt-row` with `data-code`), data from `GET /request-types?withStats=1`: name (Arabic + English under it), `Code` code, `Code` prefix, department, channels (`Badge`s Telegram / Web), categories count, requests count, workflow (`StatusChip kind="version"` "v{n}" or gray `rt.noActiveWorkflow`), status (`ActiveBadge`). Row click -> editor. Mobile card: name, code · prefix, chips.
- **Editor** (`Page width="wide"`): header: back link, title = name (or `rt.newTitle`), subtitle `Code` code, action save (`primary`, `data-testid="rt-save"`). `Tabs` (keys `basics`, `fields`, `categories`, `attachments`, `links`; test ids `tab-<key>`). In create mode only `basics` and `fields` are enabled; saving creates the type (`POST /request-types`) and redirects to `/admin/request-types/{id}` (tab `categories`). Unsaved changes: a brass dot on the tab and a `beforeunload` guard.
  1. **Basics** (`Card`, two-column grid): code (`rt-code`, `dir="ltr"`, uppercased, `^[A-Z0-9_]+$`, max 40, immutable after creation), number prefix (`rt-prefix`, `^[A-Z0-9]+$`, max 4, immutable; live preview caption "DE-26-000123" built from the prefix), Arabic name (`rt-name-ar`), English name (`rt-name-en`), department (`LookupSelect entity="departments"`, optional), module (`Select` from `GET /request-types/modules`, first option `rt.module.none`; hint `rt.module.hint`), channels (two `Checkbox`es TELEGRAM / WEB, at least one), has lines (`Switch`), active (`Switch`).
  2. **Request fields** (`headerFields`): info `Banner` `rt.fields.botNote`; `<FieldListEditor value onChange testIdPrefix="rt-field" />`.
  3. **Line categories**: list (drag to reorder with dnd-kit; on drop call `PUT /request-types/:id/line-categories/order`) of rows `rt-cat-row`: handle, icon, names, `Code` code, approval roles count, attachments rule ("1-10"), active `Switch` (PATCH). "Add category" (`rt-add-category`) and row click open `CategoryDrawer` (`Drawer width="lg"`, `data-testid="rt-cat-form"`): code (`rt-cat-code`, immutable after creation), names, icon (text), sort order (hidden; managed by drag), active, quantity field (`Select` of the category's number fields), unit price min / max and max amount warning (`Input numeric`), approval roles (`LookupMultiSelect entity="roles"`), extra fields (`FieldListEditor`), attachments (min, max, allowed types). Save (`rt-cat-save`) -> `POST` or `PATCH`.
  4. **Attachments**: a grid table of all categories: name, min (`Input numeric` width `w-20`), max, allowed types as four `Checkbox`es (JPEG, PNG, WebP, PDF); changed rows are saved together by the page save button (one `PATCH` per changed category).
  5. **Workflow and templates**: workflow card: active version chip, steps count, and a `secondary` link button "open approval route" -> `/workflows/{workflowId}` (shown when `can(['workflows.view', 'workflows.manage'])`); warning `Banner` `rt.links.noActiveWorkflow` when no version is active ("requests of this type cannot be submitted until a route is published"). Templates card (when `can('templates.manage')`): list from `GET /templates?requestTypeId=`: name, `Code` code, default badge, active version chip, open link -> `/templates/{id}`; "new template" button opening `CreateTemplateDialog` with `requestTypeId` preset; info text `rt.links.noTemplate` when the list is empty ("the generic layout is used until a template is published").
- **FieldListEditor** (shared by header fields and category extra fields):
  ```ts
  export function FieldListEditor(p: { value: FieldDefinition[]; onChange: (v: FieldDefinition[]) => void; testIdPrefix: string; reservedKeys?: string[] }): JSX.Element;
  ```
  Sortable rows (dnd-kit; `order` is rewritten as index * 10). Collapsed row: handle, Arabic label, `Code` key, type badge, required badge. Expanded row: key (`{prefix}-{i}-key`, `dir="ltr"`, `^[a-z][A-Za-z0-9_]*$`), Arabic label, English label, type (`Select`: text, number, date, select, lookup), required `Switch`, bot prompt (`promptAr`), and type-specific inputs: number -> min, max; text -> regex; select -> options table (value, Arabic label, English label, add/remove rows); lookup -> entity `Select` (`vehicles`, `submitters`, `cost-centers`, `gl-accounts`, `treasuries`, `departments`). Add button `{prefix}-add` (for the header list the id is `rt-add-field`). Inline errors from `validateFields`.
- **model.ts** (pure, tested): `blankField(existingKeys: string[]): FieldDefinition`; `validateFields(fields: FieldDefinition[], reserved?: string[]): Record<number, Record<string, string>>` (duplicate key, bad key format, empty labels, select without options, min > max, reserved key); `normalizeOrder(fields)`; `toTypeInput(form): RequestTypeInput`; `toTypeUpdate(form, original)` (only changed keys); `toCategoryInput(form): LineCategoryInput`; `validateType(form): Record<string, string>`; `EXPENSE_RESERVED_KEYS = ['vehicleId', 'vehicleNumber', 'odometer', 'odometerWarning']`.

### 9.15 Notifications and profile (W1)
- **Notifications** (`app/(app)/notifications/page.tsx`, restyle): `Page width="narrow"`; header action "mark all read". List grouped by day (`DateText mode="long"` headers, pure `groupByDay` in `features/common/groupByDay.ts`); row: type icon in a 32px disc (`bg-surface-2`), title (`font-medium` when unread, brass dot at the start), body, `DateText mode="relative"`, chevron (mirrored) when it has a link; the whole row is a button (marks read, then navigates). Empty: icon `BellOff`, `shell.notif.empty`.
- **Profile** (`app/(app)/profile/page.tsx`, restyle + new sections): `Page width="narrow"`, cards in this order:
  1. Account: Avatar 40, full name, `Code` username, roles as badges.
  2. Appearance (new): theme `SegmentedControl` (`pref-theme-light`, `pref-theme-dark`, `pref-theme-system`; labels `shell.pref.light|dark|system`), numerals `SegmentedControl` (`pref-numerals-latn` "123", `pref-numerals-arab` "١٢٣"; hint `shell.pref.numeralsHint`), table density `SegmentedControl` (comfortable / default / compact), language `SegmentedControl` (العربية / English).
  3. Signature (`SignatureManager`, as today).
  4. Telegram notifications (new): linked -> green badge + unlink button (`POST /users/{me.id}/telegram-unlink`); not linked -> button (`data-testid="profile-tg-link"`) calling `POST /users/{me.id}/telegram-link` and opening `TelegramLinkDialog`. The linked flag comes from `GET /auth/me` (`telegramLinked`, added in PLAN_V2 B7).
  5. Change password (as today; password inputs with show/hide).
  6. Sessions (as today; table with device/user agent, created, last used, revoke).
- **Root** (`app/page.tsx`): logic unchanged; loading state = centred `BrandMark`.

---

## 10. Test ids

Convention: `data-testid` in kebab-case, `<area>-<element>`; ids never depend on text, locale or styling. Dynamic parts are appended (`step-supervisor`, `line-2`) or exposed as `data-*` attributes (`data-row-key`, `data-status`, `data-number`). E2E tests select by test id first and by role second, never by CSS class.

### 10.1 Page roots (`<Page testId>`)
`page-login`, `page-inbox`, `page-requests`, `page-request-detail`, `page-vehicle-changes`, `page-assignments`, `page-workflows`, `page-workflow-editor`, `page-templates`, `page-template-editor`, `page-sap`, `page-reports`, `page-dashboard`, `page-notifications`, `page-profile`, `page-master-drivers`, `page-master-vehicles`, `page-master-vehicle-types`, `page-master-cost-centers`, `page-master-gl-accounts`, `page-master-treasuries`, `page-master-expense-types`, `page-master-sap-settings`, `page-admin-users`, `page-admin-roles`, `page-admin-delegations`, `page-admin-departments`, `page-admin-audit`, `page-admin-settings`, `page-admin-request-types`, `page-request-type-editor`. `CrudPage` derives its id from `cfg.testId ?? 'page-' + <nav slug of the current path>`. The login page sets `data-testid="page-login"` on its root element (it does not use `Page`).

### 10.2 Kit (built in)
`page-title`, `modal` (or the given `testId`), `modal-close`, `confirm-ok`, `confirm-cancel`, `drawer`, `toast-success`, `toast-error`, `toast-info`, `<table>-row`, `<table>-card`, `pager-prev`, `pager-next`, `pager-info`, `tab-<key>`, `empty-state`, `error-block`, `filter-bar`, `filter-reset`, `filter-open`, `seal`.

### 10.3 Shell
`app-shell`, `sidebar`, `nav-<slug>`, `nav-badge-inbox`, `topbar`, `topbar-search`, `topbar-locale`, `topbar-theme`, `user-menu`, `user-menu-logout`, `notif-bell`, `notif-count`, `mobile-tabbar`, `tab-inbox`, `tab-requests`, `tab-notifications`, `tab-more`, `cmdk`, `cmdk-input`.

### 10.4 Screens
All ids named in section 9, namely: login (`login-form`, `login-username`, `login-password`, `login-toggle-password`, `login-error`, `login-submit`); inbox (`inbox-summary`, `inbox-role-all`, `inbox-role-<roleId>`, `inbox-row`, `inbox-card`, `inbox-empty`); requests (`requests-search`, `requests-row`); detail (`request-number`, `request-status`, `request-total`, `pdf-preview`, `pdf-download`, `route-stepper`, `step-<stepKey>`, `line-<n>`, `line-thumb`, `line-edit-<n>`, `line-correct-<n>`, `timeline`, `evidence-viewer`, `evidence-thumb`, `evidence-zoom-in`, `evidence-zoom-out`, `evidence-fit`, `evidence-rotate-left`, `evidence-rotate-right`, `evidence-open`, `evidence-fullscreen`, `action-bar`, `action-claim`, `action-release`, `action-force`, `action-approve`, `action-correction`, `action-sendback`, `action-reject`, `action-more`, `approve-dialog`, `approve-check-<key>`, `approve-confirm`, `sendback-comment`, `sendback-confirm`, `reject-reason`, `reject-confirm`); dashboard (`dash-range`, `kpi-total`, `kpi-count`, `kpi-diff`, `kpi-overdue`, `chart-by-month`, `chart-by-type`, `chart-top-vehicles`, `chart-avg-hours`, `delayed-table`); reports (`report-run`, `report-export`, `report-export-EXCEL`, `report-export-ZIP_IMAGES`, `report-export-PDF_BUNDLE`, `report-rows`, `exports-list`, `export-row`); SAP (`sap-counter-<STATUS>`, `sap-row`, `sap-drawer`, `sap-retry`, `sap-force-check`, `sap-force-confirm`); workflows (`workflow-card`, `wf-step`, `wf-add-step`, `wf-save`, `wf-publish`, `wf-new-draft`, `wf-simulate`, `wf-preview`); templates (`template-card`, `template-new`, `template-create-dialog`, `tpl-type`, `tpl-code`, `tpl-name-ar`, `tpl-name-en`, `tpl-create-submit`, `tpl-save`, `tpl-publish`, `tpl-preview-frame`); CRUD (`crud-search`, `crud-add`, `crud-import`, `crud-export`, `crud-row`, `crud-form`, `crud-field-<key>`, `crud-save`, `crud-toggle-<id>`); Telegram (`tg-chip`, `tg-link`, `tg-unlink`, `tg-relink`, `tg-link-dialog`, `tg-link-command`, `tg-link-copy`, `profile-tg-link`); users (`users-row`, `user-form`); roles (`matrix`, `matrix-cell`, `matrix-search`, `matrix-dirty-count`, `matrix-save`, `matrix-discard`); request types (`rt-new`, `rt-row`, `rt-save`, `rt-code`, `rt-prefix`, `rt-name-ar`, `rt-name-en`, `rt-add-field`, `rt-field-<i>-key`, `rt-add-category`, `rt-cat-row`, `rt-cat-form`, `rt-cat-code`, `rt-cat-save`); profile (`pref-theme-light`, `pref-theme-dark`, `pref-theme-system`, `pref-numerals-latn`, `pref-numerals-arab`).

---

## 11. i18n

New namespaces (registered by F1 in `src/i18n/index.ts`, files `src/i18n/{ar,en}/<ns>.ts`): `ui` (kit, owner F1), `shell` (owner W1; F1 creates it with the keys below), `inbox` (owner W2), `rt` (owner W9). Existing namespaces keep their keys; owners may add keys: `requests` W3 (W4 adds only keys starting with `requests.viewer.` and `requests.action.`), `dashboard`/`reports`/`sap` W5, `workflows`/`templates` W6, `master` W7, `admin` W8. `common` is frozen (F1 only). Every key used in code must exist in both `ar` and `en` (the test `src/features/i18n-keys.test.ts` enforces it).

Copy rules: Modern Standard Arabic, short and formal; buttons are verbal nouns (اعتماد، رفض، حفظ، إلغاء); no exclamation marks; Western digits; placeholders in braces (`{n}`).

### 11.1 `ui` (exact; F1 writes both files)

| Key | ar | en |
|---|---|---|
| `edited` | معدّل | Edited |
| `retry` | إعادة المحاولة | Retry |
| `total` | الإجمالي: {n} | Total: {n} |
| `copied` | تم النسخ | Copied |
| `more` | المزيد | More |
| `seal.approved` | اعتُمد | APPROVED |
| `seal.paid` | صُرف | PAID |
| `seal.rejected` | رُفض | REJECTED |
| `pager.range` | {from}-{to} من {total} | {from}-{to} of {total} |
| `pager.page` | {page} / {pages} | {page} / {pages} |
| `pager.prev` | السابق | Previous |
| `pager.next` | التالي | Next |
| `filter.open` | تصفية | Filters |
| `filter.title` | تصفية النتائج | Filter results |
| `filter.apply` | تطبيق | Apply |
| `filter.reset` | مسح التصفية | Clear filters |
| `date.placeholder` | يوم/شهر/سنة | dd/mm/yyyy |
| `date.today` | اليوم | Today |
| `date.clear` | مسح | Clear |
| `date.prevMonth` | الشهر السابق | Previous month |
| `date.nextMonth` | الشهر التالي | Next month |
| `date.month.0` .. `date.month.11` | يناير، فبراير، مارس، أبريل، مايو، يونيو، يوليو، أغسطس، سبتمبر، أكتوبر، نوفمبر، ديسمبر | January .. December |
| `date.wd.0` .. `date.wd.6` (Sunday..Saturday) | ح، ن، ث، ر، خ، ج، س | Su, Mo, Tu, We, Th, Fr, Sa |
| `date.preset.today` | اليوم | Today |
| `date.preset.last7` | آخر 7 أيام | Last 7 days |
| `date.preset.last30` | آخر 30 يوماً | Last 30 days |
| `date.preset.thisMonth` | هذا الشهر | This month |
| `date.preset.lastMonth` | الشهر الماضي | Last month |
| `date.preset.thisYear` | هذا العام | This year |
| `rel.now` | الآن | now |
| `rel.minutes` | منذ {n} دقيقة | {n} min ago |
| `rel.hours` | منذ {n} ساعة | {n} h ago |
| `rel.yesterday` | أمس | yesterday |
| `rel.days` | منذ {n} أيام | {n} days ago |
| `tg.step1` | افتح بوت تليجرام الخاص بالنظام. | Open the system's Telegram bot. |
| `tg.step2` | أرسل الأمر التالي كما هو (أو افتح الرابط). | Send the command below as is (or open the link). |
| `tg.step3` | ستصلك رسالة تأكيد الربط خلال ثوانٍ. | A confirmation message arrives within seconds. |
| `tg.expires` | صالح حتى | Valid until |
| `tg.openLink` | فتح في تليجرام | Open in Telegram |
| `tg.title` | ربط حساب تليجرام: {name} | Link Telegram account: {name} |
| `tg.copy` | نسخ الأمر | Copy command |

`formatRelative` in `lib/format.ts` is pure and does not call `t()`: it has the same strings inline for both locales (keep them identical to the `rel.*` rows).

### 11.2 `shell` (exact; F1 creates, W1 owns afterwards)

| Key | ar | en |
|---|---|---|
| `nav.work` | العمل اليومي | Daily work |
| `nav.insight` | المتابعة | Insight |
| `nav.config` | الإعداد | Configuration |
| `nav.data` | البيانات الأساسية | Master data |
| `nav.admin` | الإدارة | Administration |
| `nav.requestTypes` | أنواع الطلبات | Request types |
| `sidebar.collapse` | طي القائمة | Collapse menu |
| `sidebar.expand` | توسيع القائمة | Expand menu |
| `search.placeholder` | بحث أو انتقال | Search or jump to |
| `search.empty` | لا توجد نتائج | No results |
| `search.pages` | الصفحات | Pages |
| `search.requests` | الطلبات | Requests |
| `page.profile` | حسابي | My account |
| `page.notifications` | الإشعارات | Notifications |
| `page.requestDetail` | تفاصيل الطلب | Request details |
| `tab.inbox` | الوارد | Inbox |
| `tab.requests` | الطلبات | Requests |
| `tab.notifications` | الإشعارات | Alerts |
| `tab.more` | المزيد | More |
| `user.profile` | حسابي | My account |
| `user.logout` | تسجيل الخروج | Sign out |
| `pref.title` | المظهر | Appearance |
| `pref.theme` | السمة | Theme |
| `pref.light` | فاتح | Light |
| `pref.dark` | داكن | Dark |
| `pref.system` | حسب الجهاز | System |
| `pref.numerals` | شكل الأرقام | Numerals |
| `pref.numeralsHint` | أرقام الطلبات واللوحات والأكواد تبقى بالأرقام الإنجليزية دائماً. | Request numbers, plates and codes always stay in Western digits. |
| `pref.density` | كثافة الجداول | Table density |
| `pref.comfortable` | مريحة | Comfortable |
| `pref.default` | عادية | Default |
| `pref.compact` | مضغوطة | Compact |
| `pref.language` | اللغة | Language |
| `login.title` | تسجيل الدخول | Sign in |
| `login.headline1` | كل مصروف | Every expense |
| `login.headline2` | موثَّق، معتمَد، ومُرحَّل. | documented, approved and posted. |
| `login.point1` | إيصالات السائقين بالصورة من تليجرام | Drivers' receipts, photographed, straight from Telegram |
| `login.point2` | مسار اعتماد واضح بتوقيع كل مسؤول | A clear approval route signed by every approver |
| `login.point3` | قيد محاسبي جاهز للترحيل إلى SAP | An accounting entry ready to post to SAP |
| `login.showPassword` | إظهار كلمة المرور | Show password |
| `login.hidePassword` | إخفاء كلمة المرور | Hide password |
| `notif.title` | الإشعارات | Notifications |
| `notif.markAll` | تعليم الكل كمقروء | Mark all as read |
| `notif.viewAll` | عرض كل الإشعارات | View all notifications |
| `notif.empty` | لا توجد إشعارات | No notifications |
| `tg.section` | إشعارات تليجرام | Telegram notifications |
| `tg.linked` | حسابك مرتبط بتليجرام | Your account is linked to Telegram |
| `tg.notLinked` | اربط حسابك لتصلك إشعارات الاعتماد على تليجرام. | Link your account to receive approval alerts on Telegram. |
| `tg.link` | ربط تليجرام | Link Telegram |
| `tg.unlink` | فك الربط | Unlink |

### 11.3 New keys other owners must add (minimum set; owners add more in their namespace as needed)

| Namespace | Key | ar | en |
|---|---|---|---|
| inbox | `summary` | {n} طلبات بانتظار اعتمادك، منها {o} متأخرة | {n} requests await your approval, {o} overdue |
| inbox | `summaryNoOverdue` | {n} طلبات بانتظار اعتمادك | {n} requests await your approval |
| inbox | `summaryNone` | لا توجد طلبات بانتظارك الآن | Nothing is waiting for you |
| inbox | `emptyTitle` | لا شيء ينتظرك الآن | You are all caught up |
| inbox | `emptyHint` | ستظهر هنا الطلبات فور وصولها إلى دورك. | Requests appear here as soon as they reach your step. |
| inbox | `emptyAwaiting` | لا توجد طلبات بانتظار تصحيح السائق | No requests are waiting for a driver correction |
| inbox | `overdue` | متأخر | Overdue |
| inbox | `moreFilters` | المزيد | More |
| inbox | `searchNumber` | بحث برقم الطلب | Search by request number |
| inbox | `requestsEmpty` | لا توجد طلبات مطابقة | No matching requests |
| inbox | `assignments.rule` | لكل سائق سيارة واحدة مفتوحة في كل وقت. تعيين سيارة جديدة يغلق التعيين السابق تلقائياً. | A driver holds one open vehicle at a time. Assigning a new vehicle closes the previous assignment. |
| requests | `banner.awaitingDriver` | الطلب بانتظار تصحيح من السائق | Waiting for a correction from the driver |
| requests | `header.more` | تفاصيل أكثر | More details |
| requests | `step.now` | الآن | Now |
| requests | `step.parallel` | بالتوازي | In parallel |
| requests | `step.notApplicable` | لا ينطبق | Not applicable |
| requests | `step.skippedGroup` | خطوات لا تنطبق | Steps not applicable |
| requests | `step.position` | الخطوة {i} من {n} | Step {i} of {n} |
| requests | `step.showRoute` | عرض المسار | Show route |
| requests | `step.dueIn` | متبقٍ {h} س | {h} h left |
| requests | `step.overdueBy` | متأخر {h} س | {h} h overdue |
| requests | `line.history` | سجل التعديلات ({n}) | Edit history ({n}) |
| requests | `timeline.skipped` | تخطّي {n} خطوات لا تنطبق | {n} steps skipped (not applicable) |
| requests | `viewer.rotateLeft` | تدوير لليسار | Rotate left |
| requests | `viewer.rotateRight` | تدوير لليمين | Rotate right |
| requests | `viewer.zoomIn` | تكبير | Zoom in |
| requests | `viewer.zoomOut` | تصغير | Zoom out |
| requests | `viewer.fit` | ملاءمة | Fit |
| requests | `viewer.fullscreen` | ملء الشاشة | Full screen |
| requests | `viewer.open` | فتح الأصل | Open original |
| requests | `viewer.openPdf` | فتح ملف PDF | Open PDF |
| requests | `viewer.line` | البند {n} | Line {n} |
| requests | `viewer.empty` | لا توجد مرفقات | No attachments |
| requests | `action.more` | إجراءات أخرى | More actions |
| dashboard | `kpi.total` | الإجمالي المعتمد | Approved total |
| dashboard | `kpi.before` | قبل التعديل | Before edits |
| dashboard | `kpi.lines` | بند مصروف | expense lines |
| dashboard | `kpi.diff` | فرق التعديل | Edit difference |
| dashboard | `kpi.overdue` | خطوات متأخرة | Overdue steps |
| dashboard | `kpi.noDelay` | لا يوجد تأخير | No delays |
| dashboard | `other` | أخرى ({n}) | Other ({n}) |
| dashboard | `hoursShort` | س | h |
| dashboard | `noTimings` | لا توجد بيانات كافية عن زمن الاعتماد بعد | Not enough approval timing data yet |
| dashboard | `noDelayed` | لا توجد طلبات متأخرة | No overdue requests |
| sap | `force.warning` | نتيجة المحاولة السابقة غير معروفة. تأكد في SAP أنه لا يوجد مستند بهذا المرجع قبل إعادة الإرسال، حتى لا يُرحَّل القيد مرتين. | The outcome of the previous attempt is unknown. Check in SAP that no document exists with this reference before re-sending, or the entry may post twice. |
| sap | `force.confirmCheck` | راجعت SAP ولا يوجد مستند بهذا المرجع | I checked SAP and no document exists with this reference |
| sap | `force.confirm` | إعادة الإرسال الآن | Re-send now |
| workflows | `badge.conditional` | شرطية | Conditional |
| workflows | `badge.dynamic` | أدوار حسب نوع البند | Roles from line categories |
| workflows | `badge.payment` | صرف | Payment |
| workflows | `badge.parallel` | بالتوازي | Parallel |
| workflows | `parallelGroup` | مجموعة متوازية | Parallel group |
| workflows | `preview` | معاينة المسار | Route preview |
| workflows | `sim.result` | تنطبق {n} خطوات على طلب بقيمة {total} | {n} steps apply to a request of {total} |
| templates | `new` | قالب جديد | New template |
| templates | `layout.expense` | كشف مصروفات | Expense sheet |
| templates | `layout.generic` | نموذج عام | Generic form |
| templates | `create.duplicate` | يوجد قالب بنفس الكود لهذا النوع | A template with this code already exists for this type |
| templates | `setDefault` | تعيين كقالب افتراضي | Set as default |
| admin | `matrix.dirty` | {n} تغييرات غير محفوظة | {n} unsaved changes |
| admin | `audit.immutable` | السجل غير قابل للتعديل | This log cannot be edited |
| rt | `title` | أنواع الطلبات | Request types |
| rt | `subtitle` | عرّف أنواع الطلبات وحقولها وبنودها ومرفقاتها | Define request types, their fields, line categories and attachments |
| rt | `new` | نوع طلب جديد | New request type |
| rt | `newTitle` | نوع طلب جديد | New request type |
| rt | `tab.basics` | الأساسيات | Basics |
| rt | `tab.fields` | حقول الطلب | Request fields |
| rt | `tab.categories` | البنود | Line categories |
| rt | `tab.attachments` | المرفقات | Attachments |
| rt | `tab.links` | المسار والقوالب | Route and templates |
| rt | `module.none` | بدون (إعداد فقط) | None (configuration only) |
| rt | `module.hint` | الوحدة البرمجية تضيف منطقاً خاصاً مثل السيارات والعداد. اتركها فارغة لنوع عام. | A module adds built-in logic such as vehicles and odometer. Leave empty for a generic type. |
| rt | `fields.botNote` | حقول الطلب تُملأ في الطلبات المنشأة من الويب أو الـAPI. بوت تليجرام يسأل حقول البنود فقط. | Request fields are filled for requests created from the web or the API. The Telegram bot asks line fields only. |
| rt | `links.noActiveWorkflow` | لا يمكن تقديم طلبات من هذا النوع قبل نشر مسار اعتماد. | Requests of this type cannot be submitted until an approval route is published. |
| rt | `links.noTemplate` | يُستخدم النموذج العام إلى أن يُنشر قالب. | The generic layout is used until a template is published. |
| rt | `noActiveWorkflow` | لا يوجد مسار منشور | No published route |

---

## 12. File map (web)

"Rewrite" = new markup and layout, same data logic. "Restyle" = replace classes and kit components, keep structure. Owners: PLAN_V2 section 8.

| Path (under `apps/web/src`) | Action | Owner |
|---|---|---|
| `app/globals.css`, `app/layout.tsx`, `../tailwind.config.ts` | rewrite (exact content in 2.1, 2.2, 7.4) | F1 |
| `lib/format.ts` (extend), `lib/prefs.tsx`, `lib/prefs-core.ts`, `lib/useMediaQuery.ts`, `lib/useCountUp.ts` (new), `lib/providers.tsx` (edit) | per 7.4 | F1 |
| `i18n/index.ts` (register `ui`, `shell`, `inbox`, `rt`), `i18n/{ar,en}/ui.ts`, `i18n/{ar,en}/shell.ts`, empty `i18n/{ar,en}/{inbox,rt}.ts` | new / edit | F1 |
| `components/ui/{Icon,Num,Button,Fields,Display,status,StatusChip,Skeleton,Rule,Avatar,Stat,Seal,index}.ts(x)`, `components/brand/BrandMark.tsx`, `components/README.md` | rewrite / new | F1 |
| `components/ui/{Modal,Overlay,Toast,DataTable,calendar,DateField,Inputs2,FilterBar}.ts(x)` | rewrite / new | F2 |
| `components/layout/{AppShell,Sidebar,NotificationsBell}.tsx` (rewrite), `{TopBar,MobileTabBar,UserMenu,CommandPalette}.tsx` (new), `lib/nav.ts`, `app/login/page.tsx`, `app/page.tsx`, `app/(app)/layout.tsx`, `app/(app)/notifications/page.tsx`, `app/(app)/profile/page.tsx`, `features/common/groupByDay.ts`, `i18n/*/shell.ts` | rewrite / restyle | W1 |
| `features/inbox/**`, `features/requests/RequestsListPage.tsx`, `features/vehicle-changes/**`, `app/(app)/assignments/page.tsx`, `features/common/Pager.tsx`, `i18n/*/inbox.ts` | rewrite / restyle | W2 |
| `features/requests/{RequestDetailPage,RouteStepper,ProgressBar,LineCard,Timeline}.tsx`, `features/requests/{helpers,timelineModel}.ts`, `i18n/*/requests.ts` | rewrite | W3 |
| `features/requests/{ActionPanel,CorrectionModal,EditLineModal,ImageGallery,EvidenceViewer}.tsx`, `features/requests/evidence.ts` | rewrite | W4 |
| `features/dashboard/**`, `features/reports/**`, `features/sap/**`, `components/charts/**`, `i18n/*/{dashboard,reports,sap}.ts` | rewrite / restyle | W5 |
| `features/workflows/**`, `features/templates/**`, `i18n/*/{workflows,templates}.ts` | rewrite / restyle | W6 |
| `components/crud/**`, `components/TelegramLinkDialog.tsx`, `app/(app)/master/**`, `app/(app)/admin/departments/page.tsx`, `i18n/*/master.ts` | rewrite / restyle | W7 |
| `app/(app)/admin/{users,roles,delegations,audit,settings}/page.tsx`, `features/admin/**`, `components/SignatureManager.tsx`, `i18n/*/admin.ts` | rewrite / restyle | W8 |
| `app/(app)/admin/request-types/**`, `features/request-types/**`, `i18n/*/rt.ts` | new | W9 |
| `features/style-guard.test.ts`, `features/i18n-keys.test.ts` (extend) | new / edit | T1 |
| `lib/api.ts`, `lib/auth.tsx`, `lib/i18n.tsx`, `lib/permissions.ts`, `lib/cn.ts`, `lib/types.ts`, `i18n/*/common.ts`, `features/types.ts`, `features/common/{lookups.tsx,useTr.ts}`, `components/ui/form.ts`, `features/workflows/{condition,stepModel}.ts` | keep unchanged (F1 may append to `lib/types.ts`: `telegramLinked?: boolean` on `Me`) | - |

---

## 13. Driver simulator (`apps/bot/src/simulator/page.html`) - lighter matching restyle (owner H1)

Only the `<style>` block changes; markup and script stay. Replace the whole content of the `<style>` element with:

```css
  :root { --bg:#FAF7F2; --panel:#FFFFFF; --me:#E8ECF3; --bot:#FFFFFF; --ink:#16202F; --muted:#5E6675; --accent:#14284B; --brass:#C9A45C; --line:#E6E0D3; --well:#F1ECE2; }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { background: var(--well); font-family: "IBM Plex Sans Arabic", "Segoe UI", Tahoma, "Noto Naskh Arabic", Arial, sans-serif; color: var(--ink); display: flex; justify-content: center; align-items: center; }
  .phone { width: 100%; max-width: 440px; height: 100vh; height: 100dvh; background: var(--bg); display: flex; flex-direction: column; border-inline: 1px solid var(--line); box-shadow: 0 24px 64px rgba(22,32,47,.16); }
  @media (min-width: 700px) { .phone { height: min(880px, 94dvh); border: 1px solid var(--line); border-radius: 20px; overflow: hidden; } }
  header { background: var(--accent); color: #fff; padding: 12px 12px 10px; display: flex; gap: 8px; align-items: center; border-bottom: 2px solid var(--brass); }
  header select { flex: 1; min-width: 0; padding: 8px 10px; border-radius: 6px; border: 0; font-size: 14px; font-family: inherit; background: #fff; color: var(--ink); }
  header button { border: 1px solid rgba(255,255,255,.35); border-radius: 6px; padding: 7px 12px; background: transparent; color: #fff; font-size: 13px; font-family: inherit; cursor: pointer; }
  header button:hover { background: rgba(255,255,255,.12); }
  .banner { background: #F4EAD3; color: #6E521F; font-size: 12px; padding: 6px 12px; text-align: center; border-bottom: 1px solid var(--line); }
  #chat { flex: 1; overflow-y: auto; padding: 14px 12px; display: flex; flex-direction: column; gap: 8px; }
  .row { display: flex; flex-direction: column; max-width: 86%; }
  .row.me { align-self: flex-start; }
  .row.bot { align-self: flex-end; }
  .bubble { padding: 9px 12px; border-radius: 10px; line-height: 1.7; white-space: pre-wrap; word-wrap: break-word; border: 1px solid var(--line); font-size: 15px; }
  .me .bubble { background: var(--me); border-color: #D5DCE8; border-bottom-right-radius: 3px; }
  .bot .bubble { background: var(--bot); border-bottom-left-radius: 3px; }
  .bubble code { font-family: "IBM Plex Mono", Consolas, monospace; font-size: 20px; font-weight: 500; letter-spacing: 0; background: var(--well); padding: 2px 8px; border-radius: 6px; display: inline-block; direction: ltr; }
  .inline { display: flex; flex-direction: column; gap: 5px; margin-top: 5px; }
  .inline .r { display: flex; gap: 5px; }
  .inline button { flex: 1; border: 1px solid var(--accent); border-radius: 6px; padding: 8px 6px; background: var(--accent); color: #fff; font-size: 14px; cursor: pointer; font-family: inherit; }
  .inline button:hover { background: #0F1F3A; }
  .inline button:disabled { opacity: .45; cursor: default; }
  #kb { padding: 8px; background: var(--well); border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 6px; }
  #kb:empty { display: none; }
  #kb .r { display: flex; gap: 6px; }
  #kb button { flex: 1; padding: 11px 6px; border: 1px solid #CFC7B6; border-radius: 6px; background: #fff; font-size: 15px; cursor: pointer; font-family: inherit; color: var(--ink); }
  #kb button:hover { background: var(--bg); }
  #kb button.contact { background: #F4EAD3; border-color: var(--brass); font-weight: 600; color: #6E521F; }
  #kb a { font-size: 12px; color: var(--muted); text-align: center; cursor: pointer; text-decoration: underline; }
  form { display: flex; gap: 8px; padding: 10px; background: var(--panel); border-top: 1px solid var(--line); align-items: center; }
  form input[type=text] { flex: 1; min-width: 0; padding: 10px 12px; border-radius: 6px; border: 1px solid #7C8596; font-size: 16px; font-family: inherit; color: var(--ink); background: #fff; }
  form input[type=text]:focus { outline: 2px solid #2F5FA8; outline-offset: 1px; }
  form button, .attach { border: 0; border-radius: 6px; width: 40px; height: 40px; background: var(--accent); color: #fff; font-size: 18px; cursor: pointer; display: grid; place-items: center; flex: none; }
  .attach { background: #fff; color: var(--muted); border: 1px solid #CFC7B6; }
  .attach input { display: none; }
  .empty { margin: auto; color: var(--muted); text-align: center; font-size: 14px; padding: 20px; }
```

No fonts are loaded by the simulator (it has no asset pipeline); the stack falls back to Segoe UI / Tahoma when IBM Plex Sans Arabic is not installed on the machine. Do not change element ids, the script, or `server.ts`.
