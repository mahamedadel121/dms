'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconEnd?: ReactNode;
  block?: boolean;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded font-medium whitespace-nowrap select-none transition-colors duration-1 ease-out active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active disabled:bg-surface-3 disabled:text-ink-disabled',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-2 active:bg-surface-3 disabled:border-hairline disabled:text-ink-disabled',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3 disabled:text-ink-disabled',
  danger: 'bg-danger text-on-danger hover:bg-danger-hover disabled:bg-surface-3 disabled:text-ink-disabled',
  'danger-outline': 'border border-danger/40 bg-surface text-danger hover:bg-danger-bg disabled:border-hairline disabled:text-ink-disabled',
  link: 'h-auto px-0 text-link hover:underline',
};

const sizes: Record<ButtonSize, string> = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-5 text-base' };

export function Button({ variant = 'primary', size = 'md', loading, icon, iconEnd, block, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      className={cn(base, variants[variant], variant !== 'link' && sizes[size], block && 'w-full', className)}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : icon}
      {children}
      {iconEnd}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  loading,
  className,
  disabled,
  type = 'button',
  ...rest
}: Omit<ButtonProps, 'icon' | 'iconEnd' | 'children' | 'block'> & { icon: ReactNode; label: string }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      aria-label={label}
      title={label}
      className={cn(base, variants[variant], size === 'sm' ? 'h-8 w-8 px-0' : 'h-10 w-10 px-0', className)}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : icon}
    </button>
  );
}
