'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MoreHorizontal, PenLine, RefreshCw, Send, Unlink } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Badge, Code, ConfirmDialog, Icon, IconButton, Menu, Modal, useToast } from '@/components/ui';
import { CrudPage } from '@/components/crud/CrudPage';
import { SignatureManager } from '@/components/SignatureManager';
import { TelegramLinkDialog, type TelegramLinkInfo } from '@/components/TelegramLinkDialog';

interface Driver {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  nationalId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  telegramLinked: boolean;
  telegramUsername: string | null;
  notes: string | null;
  isActive: boolean;
  currentVehicle: { id: string; number: string } | null;
}

export default function DriversPage() {
  const { t } = useT();
  const { can } = useAuth();
  const toast = useToast();
  const [unlink, setUnlink] = useState<{ driver: Driver; reload: () => void } | null>(null);
  const [sig, setSig] = useState<Driver | null>(null);
  const [linkInfo, setLinkInfo] = useState<{ info: TelegramLinkInfo; name: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const doUnlink = useMutation({
    mutationFn: (d: Driver) => api.post(`/submitters/${d.id}/telegram-unlink`),
    onSuccess: () => {
      toast.success(t('master.drivers.unlinked'));
      unlink?.reload();
      setUnlink(null);
    },
    onError: (e) => toast.error(e),
  });

  /** Issues a link token; when the driver is already linked, unlinks first (relink). */
  async function relink(d: Driver, reload: () => void) {
    setBusyId(d.id);
    try {
      if (d.telegramLinked) await api.post(`/submitters/${d.id}/telegram-unlink`);
      const info = await api.post<TelegramLinkInfo>(`/submitters/${d.id}/telegram-link`);
      setLinkInfo({ info, name: d.fullName });
      reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <CrudPage<Driver>
        resource="submitters"
        testId="drivers"
        title={t('master.drivers.title')}
        subtitle={t('master.drivers.subtitle')}
        initial={{ kind: 'DRIVER', code: '', fullName: '', phone: '', nationalId: '', departmentId: '', notes: '', isActive: true }}
        searchPlaceholder={t('master.drivers.fullName') + ' / ' + t('master.drivers.phone')}
        mobileCard={(r) => (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink">{r.fullName}</span>
              <Code>{r.code}</Code>
            </div>
            <p className="text-sm text-ink-2">
              <Code>{r.phone}</Code>
              {r.currentVehicle && (
                <>
                  {' · '}
                  <Code>{r.currentVehicle.number}</Code>
                </>
              )}
            </p>
            <Badge tone={r.telegramLinked ? 'green' : 'gray'} icon={r.telegramLinked ? <Icon as={Send} size={14} /> : undefined}>
              {r.telegramLinked ? t('master.drivers.linked') : t('master.drivers.notLinked')}
            </Badge>
          </div>
        )}
        fields={[
          { key: 'code', label: t('master.drivers.code'), type: 'text', required: true, immutable: true, ltr: true },
          { key: 'fullName', label: t('master.drivers.fullName'), type: 'text', required: true },
          { key: 'phone', label: t('master.drivers.phone'), type: 'text', required: true, ltr: true, hint: t('master.drivers.phoneHint') },
          { key: 'nationalId', label: t('master.drivers.nationalId'), type: 'text', ltr: true },
          { key: 'departmentId', label: t('master.drivers.department'), type: 'lookup', lookup: 'departments' },
          { key: 'notes', label: t('common.notes'), type: 'textarea' },
        ]}
        columns={[
          { key: 'code', header: t('master.drivers.code'), sortable: true, cell: (r) => <Code>{r.code}</Code> },
          { key: 'fullName', header: t('master.drivers.fullName'), sortable: true, primary: true },
          { key: 'phone', header: t('master.drivers.phone'), sortable: true, cell: (r) => <Code>{r.phone}</Code> },
          { key: 'currentVehicle', header: t('master.drivers.currentVehicle'), cell: (r) => (r.currentVehicle ? <Code>{r.currentVehicle.number}</Code> : '-') },
          {
            key: 'telegram',
            header: t('master.drivers.telegram'),
            cell: (r) => (
              <span data-testid="tg-chip" data-linked={r.telegramLinked ? '1' : '0'}>
                {r.telegramLinked ? (
                  <Badge tone="green" icon={<Icon as={Send} size={14} />}>
                    {r.telegramUsername ? <Code>@{r.telegramUsername}</Code> : t('master.drivers.linked')}
                  </Badge>
                ) : (
                  <Badge tone="gray">{t('master.drivers.notLinked')}</Badge>
                )}
              </span>
            ),
          },
        ]}
        rowActions={(row, reload) => (
          <Menu
            align="end"
            trigger={<IconButton icon={<Icon as={MoreHorizontal} size={18} />} label={t('master.drivers.more')} data-testid={'driver-menu-' + row.id} />}
            items={[
              { key: 'sig', label: t('master.drivers.signature'), icon: <Icon as={PenLine} size={16} />, hidden: !can('signatures.manage'), onSelect: () => setSig(row) },
              {
                key: 'relink',
                label: row.telegramLinked ? t('master.drivers.relink') : t('master.drivers.link'),
                icon: <Icon as={row.telegramLinked ? RefreshCw : Send} size={16} />,
                testId: 'tg-relink',
                hidden: !can('submitters.telegram_link'),
                disabled: busyId === row.id,
                onSelect: () => void relink(row, reload),
              },
              {
                key: 'unlink',
                label: t('master.drivers.unlink'),
                icon: <Icon as={Unlink} size={16} />,
                testId: 'tg-unlink',
                danger: true,
                hidden: !row.telegramLinked || !can('submitters.telegram_link'),
                onSelect: () => setUnlink({ driver: row, reload }),
              },
            ]}
          />
        )}
      />
      <ConfirmDialog
        open={!!unlink}
        onClose={() => setUnlink(null)}
        danger
        title={t('master.drivers.unlinkTitle')}
        message={t('master.drivers.unlinkBody')}
        loading={doUnlink.isPending}
        confirmTestId="tg-unlink-confirm"
        onConfirm={() => unlink && doUnlink.mutate(unlink.driver)}
      />
      <TelegramLinkDialog open={!!linkInfo} onClose={() => setLinkInfo(null)} info={linkInfo?.info ?? null} subjectName={linkInfo?.name ?? ''} />
      <Modal open={!!sig} onClose={() => setSig(null)} size="lg" title={`${t('master.drivers.signature')} - ${sig?.fullName ?? ''}`}>
        {sig && <SignatureManager owner="submitters" ownerId={sig.id} canEdit={can('signatures.manage')} />}
      </Modal>
    </>
  );
}
