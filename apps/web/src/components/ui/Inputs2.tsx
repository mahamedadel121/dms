'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import type { LookupItem } from '@/lib/types';
import { Checkbox, Input, Select } from './Fields';

/** Two `<input type=date>` (yyyy-MM-dd values, interpret in Cairo with `cairoDayToIso`). */
export function DateRange({ from, to, onChange, className }: { from: string; to: string; onChange: (v: { from: string; to: string }) => void; className?: string }) {
  const { t } = useT();
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Input type="date" aria-label={t('common.from')} value={from} max={to || undefined} onChange={(e) => onChange({ from: e.target.value, to })} />
      <span className="text-slate-400">-</span>
      <Input type="date" aria-label={t('common.to')} value={to} min={from || undefined} onChange={(e) => onChange({ from, to: e.target.value })} />
    </div>
  );
}

export function useLookup(entity: string, q = '') {
  return useQuery({
    queryKey: ['lookup', entity, q],
    queryFn: () => api.get<LookupItem[]>(`/lookups/${entity}`, { q }),
    staleTime: 60_000,
  });
}

export interface LookupSelectProps {
  entity: string;
  value: string;
  onChange: (id: string, item?: LookupItem) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
  /** label shows `code - label` when true */
  showCode?: boolean;
}

/** Select fed by `GET /lookups/:entity`. */
export function LookupSelect({ entity, value, onChange, placeholder, disabled, invalid, id, className, showCode }: LookupSelectProps) {
  const { t } = useT();
  const { data, isLoading } = useLookup(entity);
  const options = (data ?? []).map((i) => ({ value: i.id, label: showCode && i.code ? `${i.code} - ${i.label}` : i.label }));
  return (
    <Select
      id={id}
      className={className}
      invalid={invalid}
      disabled={disabled || isLoading}
      value={value}
      placeholder={placeholder ?? t('common.select')}
      options={options}
      onChange={(v) => onChange(v, data?.find((i) => i.id === v))}
    />
  );
}

/** Checkbox list fed by `GET /lookups/:entity` (multi-select). */
export function LookupMultiSelect({ entity, value, onChange, className }: { entity: string; value: string[]; onChange: (ids: string[]) => void; className?: string }) {
  const { data } = useLookup(entity);
  return (
    <div className={cn('grid gap-1.5 rounded-md border border-slate-200 p-2 sm:grid-cols-2', className)}>
      {(data ?? []).map((i) => (
        <Checkbox
          key={i.id}
          label={i.label}
          checked={value.includes(i.id)}
          onChange={(c) => onChange(c ? [...value, i.id] : value.filter((x) => x !== i.id))}
        />
      ))}
    </div>
  );
}

export interface FileDropProps {
  accept?: string;
  onFile: (file: File) => void;
  hint?: ReactNode;
  label?: ReactNode;
  disabled?: boolean;
}

/** Click or drag-and-drop single-file picker. */
export function FileDrop({ accept, onFile, hint, label, disabled }: FileDropProps) {
  const { t } = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && ref.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && ref.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f && !disabled) onFile(f);
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm',
        over ? 'border-brand-600 bg-brand-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <Upload className="h-6 w-6 text-slate-400" />
      <span className="font-semibold text-slate-700">{label ?? t('import.chooseFile')}</span>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
