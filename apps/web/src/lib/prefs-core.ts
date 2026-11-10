/** Pure preference helpers (no React). */
import type { NumeralSystem } from './format';

export type ThemePref = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'default' | 'compact';

export const PREF_KEYS = { theme: 'dms.theme', numerals: 'dms.numerals', density: 'dms.density', sidebar: 'dms.sidebar' } as const;

export function resolveTheme(pref: ThemePref, systemDark: boolean): 'light' | 'dark' {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}

export function parseTheme(raw: string | null): ThemePref {
  return raw === 'dark' || raw === 'system' || raw === 'light' ? raw : 'light';
}

export function parseNumerals(raw: string | null): NumeralSystem {
  return raw === 'arab' ? 'arab' : 'latn';
}

export function parseDensity(raw: string | null): Density {
  return raw === 'comfortable' || raw === 'compact' ? raw : 'default';
}
