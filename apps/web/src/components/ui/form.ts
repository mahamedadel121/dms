'use client';

import { useCallback, useState } from 'react';
import { ApiError } from '@/lib/api';

export type FormErrors<T> = Partial<Record<keyof T & string, string>>;

/**
 * Tiny form state helper.
 *   const f = useFormState({ name: '', amount: '' });
 *   <Input value={f.values.name} onChange={(e) => f.set('name', e.target.value)} />
 */
export function useFormState<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<FormErrors<T>>({});
  const set = useCallback(<K extends keyof T & string>(key: K, value: T[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }, []);
  const reset = useCallback((next?: T) => {
    setValues(next ?? initial);
    setErrors({});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { values, set, setValues, errors, setErrors, reset };
}

/**
 * Maps an API validation error to field errors. The API sends
 * `details: { fieldErrors: { name: ['msg'] } }` or `details: [{ path: ['name'], message }]` (zod).
 * Returns {} when the shape is unknown.
 */
export function fieldErrorsFromApi(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError) || !e.details) return {};
  const out: Record<string, string> = {};
  const d = e.details as { fieldErrors?: Record<string, string[]>; issues?: { path: (string | number)[]; message: string }[] } | { path: (string | number)[]; message: string }[];
  if (Array.isArray(d)) {
    for (const i of d) if (i.path?.length) out[String(i.path[0])] ??= i.message;
  } else {
    for (const [k, v] of Object.entries(d.fieldErrors ?? {})) if (v?.[0]) out[k] = v[0];
    for (const i of d.issues ?? []) if (i.path?.length) out[String(i.path[0])] ??= i.message;
  }
  return out;
}

/** Required-field check returning `{ key: message }` for empty values. */
export function requiredErrors<T extends Record<string, unknown>>(values: T, keys: (keyof T & string)[], message: string): FormErrors<T> {
  const out: FormErrors<T> = {};
  for (const k of keys) {
    const v = values[k];
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) out[k] = message;
  }
  return out;
}
