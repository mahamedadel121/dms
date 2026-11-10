'use client';

import type { ReactElement, ReactNode } from 'react';
import { Direction, DropdownMenu, Popover as RPopover, Tooltip as RTooltip } from 'radix-ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';

/** Mounted once in `lib/providers.tsx`: text direction and tooltip delay for every Radix primitive. */
export function DirectionRoot({ children }: { children: ReactNode }) {
  const { dir } = useT();
  return (
    <Direction.Provider dir={dir}>
      <RTooltip.Provider delayDuration={300}>{children}</RTooltip.Provider>
    </Direction.Provider>
  );
}

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactElement; side?: 'top' | 'bottom' }) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content side={side} sideOffset={6} className="z-tip rounded bg-ink px-2 py-1 text-xs text-canvas animate-fade-in">
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export function Popover({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  open,
  onOpenChange,
  className,
  testId,
}: {
  trigger: ReactElement;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom';
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  className?: string;
  testId?: string;
}) {
  return (
    <RPopover.Root open={open} onOpenChange={onOpenChange}>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content
          align={align}
          side={side}
          sideOffset={6}
          data-testid={testId}
          className={cn('z-pop rounded-lg border border-hairline bg-surface p-3 shadow-pop animate-pop-in focus:outline-none', className)}
        >
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

export type MenuItem =
  | { key: string; label: ReactNode; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean; hidden?: boolean; testId?: string }
  | { key: string; separator: true };

export function Menu({ trigger, items, align = 'start', testId }: { trigger: ReactElement; items: MenuItem[]; align?: 'start' | 'end'; testId?: string }) {
  const visible = items.filter((i) => 'separator' in i || !i.hidden);
  if (!visible.some((i) => !('separator' in i))) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          data-testid={testId}
          className="z-pop min-w-44 rounded-lg border border-hairline bg-surface p-1 shadow-pop animate-pop-in"
        >
          {visible.map((i) =>
            'separator' in i ? (
              <DropdownMenu.Separator key={i.key} className="my-1 h-px bg-hairline" />
            ) : (
              <DropdownMenu.Item
                key={i.key}
                disabled={i.disabled}
                onSelect={() => i.onSelect()}
                data-testid={i.testId}
                className={cn(
                  'flex h-9 cursor-pointer items-center gap-2 rounded-sm px-2.5 text-sm outline-none data-[highlighted]:bg-surface-2 data-[disabled]:cursor-not-allowed data-[disabled]:text-ink-disabled',
                  i.danger ? 'text-danger' : 'text-ink',
                )}
              >
                {i.icon}
                {i.label}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
