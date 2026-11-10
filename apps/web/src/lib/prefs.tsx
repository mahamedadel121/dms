'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setNumeralSystem, type NumeralSystem } from './format';
import { PREF_KEYS, parseDensity, parseNumerals, parseTheme, resolveTheme, type Density, type ThemePref } from './prefs-core';

export interface PrefsValue {
  theme: ThemePref;
  resolvedTheme: 'light' | 'dark';
  setTheme: (t: ThemePref) => void;
  numerals: NumeralSystem;
  setNumerals: (n: NumeralSystem) => void;
  density: Density;
  setDensity: (d: Density) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (b: boolean) => void;
}

export const PrefsContext = createContext<PrefsValue | null>(null);
const Ctx = PrefsContext;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string): void {
  try {
    window.localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>('light');
  const [numerals, setNumeralsState] = useState<NumeralSystem>('latn');
  const [density, setDensityState] = useState<Density>('default');
  const [sidebarCollapsed, setSidebarState] = useState(false);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setThemeState(parseTheme(read(PREF_KEYS.theme)));
    const n = parseNumerals(read(PREF_KEYS.numerals));
    setNumeralSystem(n);
    setNumeralsState(n);
    setDensityState(parseDensity(read(PREF_KEYS.density)));
    setSidebarState(read(PREF_KEYS.sidebar) === '1');
  }, []);

  useEffect(() => {
    if (theme !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSystemDark(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme]);

  const resolvedTheme = resolveTheme(theme, systemDark);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (density === 'default') document.documentElement.removeAttribute('data-density');
    else document.documentElement.setAttribute('data-density', density);
  }, [density]);

  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    write(PREF_KEYS.theme, t);
  }, []);
  const setNumerals = useCallback((n: NumeralSystem) => {
    setNumeralSystem(n);
    setNumeralsState(n);
    write(PREF_KEYS.numerals, n);
  }, []);
  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    write(PREF_KEYS.density, d);
  }, []);
  const setSidebarCollapsed = useCallback((b: boolean) => {
    setSidebarState(b);
    write(PREF_KEYS.sidebar, b ? '1' : '0');
  }, []);

  const value = useMemo<PrefsValue>(
    () => ({ theme, resolvedTheme, setTheme, numerals, setNumerals, density, setDensity, sidebarCollapsed, setSidebarCollapsed }),
    [theme, resolvedTheme, setTheme, numerals, setNumerals, density, setDensity, sidebarCollapsed, setSidebarCollapsed],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): PrefsValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePrefs must be used inside <PrefsProvider>');
  return v;
}
