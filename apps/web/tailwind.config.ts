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
