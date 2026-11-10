'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { Button } from './Button';
import { Badge } from './Display';
import { Icon } from './Icon';
import { Modal } from './Modal';

export function FilterChip({ label, onRemove }: { label: ReactNode; onRemove: () => void }) {
  const { t } = useT();
  return (
    <Badge tone="navy">
      {label}
      <button type="button" onClick={onRemove} aria-label={t('ui.filter.reset')} className="-me-1 rounded-sm p-0.5 hover:bg-primary/10">
        <Icon as={X} size={14} />
      </button>
    </Badge>
  );
}

export function FilterBar({
  children,
  activeCount,
  onReset,
  search,
  chips,
  testId,
}: {
  children: ReactNode;
  activeCount: number;
  onReset: () => void;
  search?: ReactNode;
  chips?: ReactNode;
  testId?: string;
}) {
  const { t } = useT();
  const desktop = useMediaQuery('(min-width: 768px)');
  const [open, setOpen] = useState(false);
  const id = testId ?? 'filter-bar';

  if (desktop) {
    return (
      <div data-testid={id}>
        <div className="flex flex-wrap items-end gap-3">
          {search && <div className="w-64">{search}</div>}
          {children}
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={onReset} data-testid="filter-reset">
              {t('ui.filter.reset')}
            </Button>
          )}
        </div>
        {chips && <div className="mt-2 flex flex-wrap gap-2">{chips}</div>}
      </div>
    );
  }

  return (
    <div data-testid={id}>
      <div className="flex items-center gap-2">
        {search && <div className="flex-1">{search}</div>}
        <Button variant="secondary" onClick={() => setOpen(true)} data-testid="filter-open">
          {t('ui.filter.open')}
          {activeCount > 0 && <span className="num rounded-full bg-primary px-1.5 text-xs text-on-primary">{activeCount}</span>}
        </Button>
      </div>
      {chips && <div className="mt-2 flex flex-wrap gap-2">{chips}</div>}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('ui.filter.title')}
        testId="filter-sheet"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{t('ui.filter.apply')}</Button>
            <Button variant="secondary" onClick={onReset}>
              {t('ui.filter.reset')}
            </Button>
          </>
        }
      >
        <div className="space-y-4 [&>*]:w-full">{children}</div>
      </Modal>
    </div>
  );
}
