'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LOCALE, pickName, translate, type Locale, type Params } from '@/i18n';

const LOCALE_KEY = 'dms.locale';

export interface I18nValue {
  locale: Locale;
  dir: 'rtl' | 'ltr';
  setLocale: (l: Locale) => void;
  /** `t('common.save')`, `t('common.rowsTotal', { n: 3 })` */
  t: (key: string, params?: Params) => string;
  /** pick nameAr / nameEn by the current locale */
  name: (o: { nameAr?: string | null; nameEn?: string | null } | null | undefined) => string;
}

const Ctx = createContext<I18nValue | null>(null);

function applyToDocument(l: Locale): void {
  document.documentElement.lang = l;
  document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LOCALE_KEY);
      if (saved === 'ar' || saved === 'en') {
        setLocaleState(saved);
        applyToDocument(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    applyToDocument(l);
    try {
      window.localStorage.setItem(LOCALE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      dir: locale === 'ar' ? 'rtl' : 'ltr',
      setLocale,
      t: (key, params) => translate(locale, key, params),
      name: (o) => pickName(locale, o),
    }),
    [locale, setLocale],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT(): I18nValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useT must be used inside <I18nProvider>');
  return v;
}
