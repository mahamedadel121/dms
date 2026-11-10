'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { todayCairo } from '@/lib/format';
import { IconButton } from './Button';
import { Icon } from './Icon';
import { Popover } from './Overlay';
import { addDays, addMonths, isValidDay, monthGrid, toDisplay } from './calendar';

const control =
  'flex h-10 w-full items-center justify-between gap-2 rounded border border-input bg-surface px-3 text-base text-ink transition-colors duration-1 hover:border-ink-3 focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25 disabled:border-hairline disabled:bg-surface-2 disabled:text-ink-disabled sm:text-sm';

export function DateField({
  value,
  onChange,
  id,
  placeholder,
  min,
  max,
  invalid,
  disabled,
  clearable = true,
  className,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  invalid?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  testId?: string;
}) {
  const { t, dir } = useT();
  const [open, setOpen] = useState(false);
  const today = useMemo(() => todayCairo(), []);
  const anchor = isValidDay(value) ? value : today;
  const [view, setView] = useState(() => ({ year: Number(anchor.slice(0, 4)), month0: Number(anchor.slice(5, 7)) - 1 }));
  const [focus, setFocus] = useState(anchor);
  const gridRef = useRef<HTMLDivElement>(null);

  // reset the visible month and the focused day each time the popover opens
  useEffect(() => {
    if (!open) return;
    const a = isValidDay(value) ? value : today;
    setView({ year: Number(a.slice(0, 4)), month0: Number(a.slice(5, 7)) - 1 });
    setFocus(a);
  }, [open, value, today]);

  const cells = monthGrid(view.year, view.month0);
  const disabledDay = (d: string) => (!!min && d < min) || (!!max && d > max);

  const select = (d: string) => {
    if (disabledDay(d)) return;
    onChange(d);
    setOpen(false);
  };
  const moveFocus = (d: string) => {
    setFocus(d);
    setView({ year: Number(d.slice(0, 4)), month0: Number(d.slice(5, 7)) - 1 });
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>('[data-day="' + d + '"]')?.focus());
  };
  const onKey = (e: KeyboardEvent) => {
    const side = dir === 'rtl' ? -1 : 1;
    const step: Record<string, number> = { ArrowRight: side, ArrowLeft: -side, ArrowDown: 7, ArrowUp: -7 };
    const n = step[e.key];
    if (n !== undefined) {
      e.preventDefault();
      moveFocus(addDays(focus, n));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select(focus);
    }
  };
  const go = (n: number) => setView((v) => addMonths(v.year, v.month0, n));

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      className="w-[296px]"
      testId={testId ? testId + '-popover' : 'date-popover'}
      trigger={
        <button
          type="button"
          id={id}
          disabled={disabled}
          data-testid={testId ?? 'date-field'}
          aria-invalid={invalid || undefined}
          className={cn(control, invalid && 'border-danger hover:border-danger focus:border-danger focus:ring-danger/25', className)}
        >
          {value && isValidDay(value) ? <span className="num">{toDisplay(value)}</span> : <span className="text-ink-3">{placeholder ?? t('ui.date.placeholder')}</span>}
          <Icon as={Calendar} size={16} className="text-ink-3" />
        </button>
      }
    >
      <div className="flex items-center justify-between pb-2">
        <IconButton size="sm" icon={<Icon as={ChevronLeft} mirror size={16} />} label={t('ui.date.prevMonth')} onClick={() => go(-1)} />
        <span className="text-sm font-medium text-ink">
          {t('ui.date.month.' + view.month0)} <span className="num">{view.year}</span>
        </span>
        <IconButton size="sm" icon={<Icon as={ChevronRight} mirror size={16} />} label={t('ui.date.nextMonth')} onClick={() => go(1)} />
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-ink-3">
        {[6, 0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="flex h-8 items-center justify-center">
            {t('ui.date.wd.' + i)}
          </span>
        ))}
      </div>
      <div ref={gridRef} className="grid grid-cols-7 justify-items-center" onKeyDown={onKey}>
        {cells.map((c) => {
          const selected = c.day === value;
          return (
            <button
              key={c.day}
              type="button"
              data-day={c.day}
              disabled={disabledDay(c.day)}
              tabIndex={c.day === focus ? 0 : -1}
              onClick={() => select(c.day)}
              className={cn(
                'num h-9 w-9 rounded text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-ink-disabled disabled:hover:bg-transparent',
                !c.inMonth && 'text-ink-disabled',
                c.day === today && 'ring-1 ring-brass',
                selected && 'bg-primary text-on-primary hover:bg-primary-hover',
              )}
            >
              {Number(c.day.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2 text-sm">
        <button type="button" className="rounded px-2 py-1 text-link hover:bg-surface-2" onClick={() => select(today)}>
          {t('ui.date.today')}
        </button>
        {clearable && value && (
          <button
            type="button"
            className="rounded px-2 py-1 text-ink-2 hover:bg-surface-2"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            {t('ui.date.clear')}
          </button>
        )}
      </div>
    </Popover>
  );
}
