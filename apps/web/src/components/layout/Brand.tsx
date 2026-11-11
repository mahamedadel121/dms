'use client';

import { BrandMark } from '@/components/brand/BrandMark';
import { useT } from '@/lib/i18n';
import { companyName } from '@/lib/demo';
import { cn } from '@/lib/cn';

/** Brand mark plus the company name (NEXT_PUBLIC_COMPANY_NAME) or, when unset, the product name. */
export function Brand({ size = 32, className }: { size?: number; className?: string }) {
  const { t } = useT();
  const company = companyName();
  if (!company) return <BrandMark size={size} withName className={className} />;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <BrandMark size={size} />
      <span className="min-w-0">
        <span data-testid="brand-company" className="display block truncate text-lg text-ink">{company}</span>
        <span className="block truncate text-xs text-ink-3">{t('common.appName')}</span>
      </span>
    </span>
  );
}
