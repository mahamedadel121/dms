'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { Button, IconButton } from './Button';
import { Icon } from './Icon';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  testId?: string;
  /** false blocks Escape and outside click (use while a mutation is pending) */
  dismissable?: boolean;
}

const widths = { sm: 'sm:max-w-[400px]', md: 'sm:max-w-[520px]', lg: 'sm:max-w-[720px]', xl: 'sm:max-w-[960px]' };
const overlayCls = 'fixed inset-0 z-modal bg-scrim/45 animate-fade-in';
const grabber = <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line sm:hidden" aria-hidden />;

function Header({ title, description }: { title: ReactNode; description?: ReactNode }) {
  const { t } = useT();
  return (
    <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
      <div className="min-w-0">
        <Dialog.Title className="text-lg font-semibold text-ink">{title}</Dialog.Title>
        {description && <Dialog.Description className="mt-0.5 text-sm text-ink-2">{description}</Dialog.Description>}
      </div>
      <Dialog.Close asChild>
        <IconButton icon={<Icon as={X} size={18} />} label={t('common.close')} data-testid="modal-close" />
      </Dialog.Close>
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md', testId, dismissable = true }: ModalProps) {
  const block = (e: Event) => {
    if (!dismissable) e.preventDefault();
  };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayCls} />
        <Dialog.Content
          data-testid={testId ?? 'modal'}
          {...(description ? {} : { 'aria-describedby': undefined })}
          onEscapeKeyDown={block}
          onPointerDownOutside={block}
          onInteractOutside={block}
          className={cn(
            'fixed inset-x-0 bottom-0 z-modal flex max-h-[92dvh] flex-col rounded-t-xl bg-surface shadow-modal animate-sheet-up focus:outline-none',
            'sm:inset-auto sm:start-1/2 sm:top-1/2 sm:w-[calc(100vw-2rem)] sm:-translate-y-1/2 sm:rounded-xl sm:animate-pop-in sm:ltr:-translate-x-1/2 sm:rtl:translate-x-1/2',
            widths[size],
          )}
        >
          {grabber}
          <Header title={title} description={description} />
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex flex-wrap gap-2 border-t border-hairline px-5 py-3.5 [&>button]:flex-1 sm:[&>button]:flex-none">{footer}</div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => unknown;
  title?: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  confirmTestId?: string;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel, danger, loading, confirmTestId }: ConfirmDialogProps) {
  const { t } = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      testId="confirm-dialog"
      dismissable={!loading}
      title={title ?? t('common.confirmTitle')}
      footer={
        <>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={() => void onConfirm()} data-testid={confirmTestId ?? 'confirm-ok'}>
            {confirmLabel ?? t('common.confirm')}
          </Button>
          <Button variant="secondary" onClick={onClose} data-testid="confirm-cancel">
            {t('common.cancel')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-2">{message ?? t('common.confirmBody')}</p>
    </Modal>
  );
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: 'end' | 'start';
  width?: 'sm' | 'md' | 'lg';
  testId?: string;
}

const drawerWidths = { sm: 'sm:max-w-[400px]', md: 'sm:max-w-[520px]', lg: 'sm:max-w-[720px]' };

export function Drawer({ open, onClose, title, description, children, footer, side = 'end', width = 'md', testId }: DrawerProps) {
  const { dir } = useT();
  const sign = side === 'end' ? (dir === 'rtl' ? -1 : 1) : dir === 'rtl' ? 1 : -1;
  const style = { '--dir': sign } as CSSProperties;
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayCls} />
        <Dialog.Content
          data-testid={testId ?? 'drawer'}
          style={style}
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'fixed inset-x-0 bottom-0 z-modal flex max-h-[92dvh] flex-col rounded-t-xl bg-surface shadow-modal animate-sheet-up focus:outline-none',
            'sm:inset-x-auto sm:inset-y-0 sm:bottom-auto sm:max-h-none sm:w-full sm:rounded-none sm:animate-drawer-in',
            side === 'end' ? 'sm:end-0' : 'sm:start-0',
            drawerWidths[width],
          )}
        >
          {grabber}
          <Header title={title} description={description} />
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap gap-2 border-t border-hairline px-5 py-3.5">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
