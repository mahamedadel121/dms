'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const base =
  'block w-full rounded-md border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:bg-slate-100 disabled:text-slate-500';

export interface FieldControlProps {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldControlProps>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(base, 'h-10', invalid ? 'border-red-500' : 'border-slate-300', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldControlProps>(function Textarea(
  { className, invalid, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(base, 'py-2', invalid ? 'border-red-500' : 'border-slate-300', className)} {...rest} />;
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
    <select
      ref={ref}
      className={cn(base, 'h-10 pe-8', invalid ? 'border-red-500' : 'border-slate-300', className)}
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
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label?: ReactNode;
  onChange?: (checked: boolean) => void;
}

export function Checkbox({ label, className, onChange, ...rest }: CheckboxProps) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700', className)}>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
        onChange={(e) => onChange?.(e.target.checked)}
        {...rest}
      />
      {label}
    </label>
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
    <div className={cn('space-y-1', className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ms-1 text-red-600">*</span>}
      </label>
      {typeof children === 'function' ? children(id) : children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
