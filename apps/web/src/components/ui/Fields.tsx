'use client';

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { normalizeDigits } from '@dms/shared';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

const base =
  'block w-full rounded border border-input bg-surface px-3 text-base text-ink placeholder:text-ink-3 transition-colors duration-1 hover:border-ink-3 focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25 disabled:border-hairline disabled:bg-surface-2 disabled:text-ink-disabled sm:text-sm';
const invalidCls = 'border-danger hover:border-danger focus:border-danger focus:ring-danger/25';

export interface FieldControlProps {
  invalid?: boolean;
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & FieldControlProps & { numeric?: boolean; startAdornment?: ReactNode; endAdornment?: ReactNode }
>(function Input({ className, invalid, numeric, startAdornment, endAdornment, onChange, ...rest }, ref) {
  const handle = onChange
    ? (e: ChangeEvent<HTMLInputElement>) => {
        if (numeric) e.target.value = normalizeDigits(e.target.value);
        onChange(e);
      }
    : undefined;
  const input = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      {...(numeric ? { dir: 'ltr', inputMode: 'decimal' as const } : {})}
      className={cn(base, 'h-10', invalid && invalidCls, numeric && 'num text-end', startAdornment ? 'ps-9' : undefined, endAdornment ? 'pe-9' : undefined, className)}
      onChange={handle}
      {...rest}
    />
  );
  if (!startAdornment && !endAdornment) return input;
  return (
    <div className="relative">
      {startAdornment && <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-ink-3">{startAdornment}</span>}
      {input}
      {endAdornment && <span className="absolute inset-y-0 end-3 flex items-center text-ink-3">{endAdornment}</span>}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldControlProps>(function Textarea(
  { className, invalid, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} aria-invalid={invalid || undefined} className={cn(base, 'py-2', invalid && invalidCls, className)} {...rest} />;
});

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'>, FieldControlProps {
  options: SelectOption[];
  /** adds an empty first option with this label */
  placeholder?: string;
  onChange?: (value: string) => void;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ options, placeholder, className, invalid, onChange, ...rest }, ref) {
  return (
    <div className={cn('relative', className)}>
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(base, 'h-10 appearance-none pe-9', invalid && invalidCls)}
        onChange={(e) => onChange?.(e.target.value)}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} strokeWidth={1.5} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
    </div>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label?: ReactNode;
  onChange?: (checked: boolean) => void;
}

export function Checkbox({ label, className, onChange, ...rest }: CheckboxProps) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-ink', className)}>
      <input type="checkbox" className="h-[18px] w-[18px] shrink-0 rounded-sm accent-primary" onChange={(e) => onChange?.(e.target.checked)} {...rest} />
      {label}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm text-ink', className)}>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-2 disabled:opacity-50', checked ? 'bg-primary' : 'bg-line')}
      >
        <span className={cn('block h-4 w-4 rounded-full bg-surface shadow-card transition-[margin] duration-2', checked ? 'ms-4' : 'ms-0')} />
      </button>
      {label}
    </span>
  );
}

export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  size = 'sm',
  block,
  ariaLabel,
}: {
  items: { value: T; label: ReactNode; icon?: ReactNode; testId?: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  block?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('inline-flex rounded border border-line bg-surface-2 p-0.5', block && 'flex w-full')}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={it.testId}
            onClick={() => onChange(it.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm transition-colors duration-1',
              size === 'md' ? 'h-9 px-4 text-sm' : 'h-7 px-3 text-13',
              block && 'flex-1',
              active ? 'bg-surface font-medium text-ink shadow-card' : 'text-ink-2 hover:text-ink',
            )}
          >
            {it.icon}
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  debounceMs = 300,
  className,
  ltr,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
  ltr?: boolean;
}) {
  const { t } = useT();
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setLocal(value), [value]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const push = (v: string, immediate = false) => {
    setLocal(v);
    if (timer.current) clearTimeout(timer.current);
    if (immediate || debounceMs <= 0) onChange(v);
    else timer.current = setTimeout(() => onChange(v), debounceMs);
  };
  return (
    <div className={cn('relative', className)}>
      <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        type="search"
        value={local}
        dir={ltr ? 'ltr' : undefined}
        placeholder={placeholder ?? t('common.searchPlaceholder')}
        onChange={(e) => push(e.target.value)}
        className={cn(base, 'h-10 ps-9 pe-9 [&::-webkit-search-cancel-button]:hidden')}
      />
      {local && (
        <button
          type="button"
          aria-label={t('ui.date.clear')}
          onClick={() => push('', true)}
          className="absolute end-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <X size={14} strokeWidth={1.5} aria-hidden />
        </button>
      )}
    </div>
  );
}

export interface FormFieldProps {
  label: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  /** render-prop receives the generated id for `htmlFor` wiring */
  children: ReactNode | ((id: string) => ReactNode);
}

/** Label + control + hint/error wrapper used by every form. */
export function FormField({ label, error, hint, required, className, children }: FormFieldProps) {
  const id = useId();
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-13 font-medium text-ink-2">
        {label}
        {required && <span className="ms-0.5 text-danger">*</span>}
      </label>
      {typeof children === 'function' ? children(id) : children}
      {hint && !error && <p className="text-xs text-ink-3">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
