'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarRange, Plus, Upload, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { todayCairo } from '@/lib/format';
import { useT } from '@/lib/i18n';
import type { LookupItem } from '@/lib/types';
import { Button } from './Button';
import { Badge } from './Display';
import { Checkbox, SearchInput, Select } from './Fields';
import { Icon } from './Icon';
import { DateField } from './DateField';
import { Menu } from './Overlay';
import { Popover } from './Overlay';
import { presetRange, type DatePreset } from './calendar';

const PRESETS: DatePreset[] = ['today', 'last7', 'last30', 'thisMonth', 'lastMonth', 'thisYear'];

/** Two date fields (yyyy-MM-dd values, interpret in Cairo with `cairoDayToIso`) plus optional quick ranges. */
export function DateRange({
  from,
  to,
  onChange,
  className,
  presets = true,
}: {
  from: string;
  to: string;
  onChange: (v: { from: string; to: string }) => void;
  className?: string;
  presets?: boolean;
}) {
  const { t } = useT();
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <DateField value={from} max={to || undefined} placeholder={t('common.from')} onChange={(v) => onChange({ from: v, to })} testId="date-from" />
      <Icon as={ArrowRight} mirror size={16} className="text-ink-3" />
      <DateField value={to} min={from || undefined} placeholder={t('common.to')} onChange={(v) => onChange({ from, to: v })} testId="date-to" />
      {presets && (
        <Menu
          align="end"
          testId="date-presets"
          trigger={
            <Button variant="ghost" icon={<Icon as={CalendarRange} size={18} />} aria-label={t('ui.date.preset.thisMonth')} data-testid="date-presets-trigger" />
          }
          items={PRESETS.map((p) => ({
            key: p,
            label: t('ui.date.preset.' + p),
            onSelect: () => onChange(presetRange(p, todayCairo())),
            testId: 'date-preset-' + p,
          }))}
        />
      )}
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

/** Multi-select fed by `GET /lookups/:entity`: removable badges plus an "add" popover with search and a checkbox list. */
export function LookupMultiSelect({ entity, value, onChange, className }: { entity: string; value: string[]; onChange: (ids: string[]) => void; className?: string }) {
  const { t } = useT();
  const { data } = useLookup(entity);
  const [q, setQ] = useState('');
  const items = data ?? [];
  const selected = value.map((id) => items.find((i) => i.id === id)).filter((i): i is LookupItem => Boolean(i));
  const needle = q.trim().toLowerCase();
  const shown = needle ? items.filter((i) => `${i.code ?? ''} ${i.label}`.toLowerCase().includes(needle)) : items;
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} data-testid="lookup-multi">
      {selected.map((i) => (
        <Badge key={i.id} tone="navy">
          {i.label}
          <button type="button" aria-label={t('common.close')} onClick={() => onChange(value.filter((x) => x !== i.id))} className="-me-1 rounded-sm p-0.5 hover:bg-primary/10">
            <Icon as={X} size={14} />
          </button>
        </Badge>
      ))}
      <Popover
        align="start"
        className="w-72"
        testId="lookup-multi-popover"
        trigger={
          <Button variant="secondary" size="sm" icon={<Icon as={Plus} size={16} />} data-testid="lookup-multi-add">
            {t('ui.more')}
          </Button>
        }
      >
        <SearchInput value={q} onChange={setQ} />
        <div className="mt-2 max-h-[260px] space-y-1.5 overflow-y-auto">
          {shown.map((i) => (
            <Checkbox
              key={i.id}
              label={i.label}
              checked={value.includes(i.id)}
              onChange={(c) => onChange(c ? [...value, i.id] : value.filter((x) => x !== i.id))}
            />
          ))}
        </div>
      </Popover>
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
        'flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-6 text-center text-sm',
        over ? 'border-primary bg-primary-tint' : 'border-line bg-surface-2/50 hover:border-ink-3',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <Icon as={Upload} size={24} className="text-ink-3" />
      <span className="font-semibold text-ink">{label ?? t('import.chooseFile')}</span>
      {hint && <span className="text-xs text-ink-3">{hint}</span>}
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
