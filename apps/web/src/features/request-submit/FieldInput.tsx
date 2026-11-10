'use client';

import type { FieldDefinition } from '@dms/shared';
import { DateField, FormField, Input, LookupSelect, Select, useLookup } from '@/components/ui';
import { useTr } from '../common/useTr';
import type { Issue } from './model';

export function useFieldText() {
  const { t, locale } = useTr();
  return {
    label: (f: FieldDefinition) => (locale === 'ar' ? f.labelAr : f.labelEn) || f.key,
    issue: (i: Issue | undefined) => (i ? t(`requests.submit.err.${i.code}`, i.params) : null),
  };
}

/** One dynamic field (text, number, date, select, lookup) driven by a field definition. */
export function FieldInput({ field, value, onChange, issue, testId }: { field: FieldDefinition; value: string; onChange: (v: string) => void; issue?: Issue; testId: string }) {
  const { locale } = useTr();
  const txt = useFieldText();
  const invalid = !!issue;
  return (
    <FormField label={txt.label(field)} required={field.required} error={txt.issue(issue)} hint={locale === 'ar' ? field.promptAr : undefined}>
      {(id) => {
        switch (field.type) {
          case 'date':
            return <DateField id={id} testId={testId} value={value} onChange={onChange} invalid={invalid} />;
          case 'select':
            return (
              <Select
                id={id}
                data-testid={testId}
                value={value}
                invalid={invalid}
                onChange={onChange}
                options={(field.options ?? []).map((o) => ({ value: o.value, label: locale === 'ar' ? o.labelAr : o.labelEn }))}
              />
            );
          case 'lookup':
            return (
              <div data-testid={testId}>
                <LookupSelect id={id} entity={field.lookup ?? ''} value={value} invalid={invalid} onChange={onChange} />
              </div>
            );
          case 'number':
            return <Input id={id} data-testid={testId} numeric value={value} invalid={invalid} onChange={(e) => onChange(e.target.value)} />;
          default:
            return <Input id={id} data-testid={testId} value={value} invalid={invalid} onChange={(e) => onChange(e.target.value)} />;
        }
      }}
    </FormField>
  );
}

/** Read-only rendering of a field value (lookups show their label). */
export function FieldValue({ field, value }: { field: FieldDefinition; value: string }) {
  const { locale } = useTr();
  const lookup = useLookup(field.type === 'lookup' ? (field.lookup ?? '') : '__none__');
  if (field.type === 'select') {
    const o = field.options?.find((x) => x.value === value);
    return <>{o ? (locale === 'ar' ? o.labelAr : o.labelEn) : value}</>;
  }
  if (field.type === 'lookup') return <>{lookup.data?.find((i) => i.id === value)?.label ?? value}</>;
  return <span dir={field.type === 'number' || field.type === 'date' ? 'ltr' : undefined}>{value}</span>;
}
