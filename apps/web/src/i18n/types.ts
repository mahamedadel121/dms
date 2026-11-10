/** A flat dictionary for one namespace. Keys may contain dots (`inbox.title`). */
export type Dict = Record<string, string>;

export type Locale = 'ar' | 'en';

export const LOCALES: Locale[] = ['ar', 'en'];
export const DEFAULT_LOCALE: Locale = 'ar';
