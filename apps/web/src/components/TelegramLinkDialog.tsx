'use client';

import { Copy, ExternalLink } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Button, Code, DateText, Icon, Modal, useToast } from '@/components/ui';

export interface TelegramLinkInfo {
  command: string;
  deepLink: string | null;
  expiresAt: string;
}

/** Shows the one-time Telegram link command (and deep link) for a user or driver. */
export function TelegramLinkDialog({
  open,
  onClose,
  info,
  subjectName,
}: {
  open: boolean;
  onClose: () => void;
  info: TelegramLinkInfo | null;
  subjectName: string;
}) {
  const { t } = useT();
  const toast = useToast();

  async function copy() {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.command);
      toast.success(t('ui.copied'));
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      testId="tg-link-dialog"
      title={t('ui.tg.title', { name: subjectName })}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      {info && (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 ps-5 text-sm text-ink-2">
            <li>{t('ui.tg.step1')}</li>
            <li>{t('ui.tg.step2')}</li>
            <li>{t('ui.tg.step3')}</li>
          </ol>
          <div className="flex items-center gap-2">
            <div dir="ltr" className="min-w-0 flex-1 select-all break-all rounded border border-hairline bg-surface-2 px-3 py-2 text-start" data-testid="tg-link-command">
              <Code>{info.command}</Code>
            </div>
            <Button variant="secondary" icon={<Icon as={Copy} size={16} />} onClick={() => void copy()} data-testid="tg-link-copy">
              {t('ui.tg.copy')}
            </Button>
          </div>
          {info.deepLink && (
            <Button variant="link" iconEnd={<Icon as={ExternalLink} size={14} />} onClick={() => window.open(info.deepLink!, '_blank', 'noopener,noreferrer')} data-testid="tg-link-open">
              {t('ui.tg.openLink')}
            </Button>
          )}
          <p className="text-xs text-ink-3">
            {t('ui.tg.expires')} <DateText value={info.expiresAt} mode="dayTime" />
          </p>
        </div>
      )}
    </Modal>
  );
}
