'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { PenLine, Unlink } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Badge, Button, ConfirmDialog, Modal, useToast } from '@/components/ui';
import { CrudPage } from '@/components/crud/CrudPage';
import { SignatureManager } from '@/components/SignatureManager';

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

  const doUnlink = useMutation({
    mutationFn: (d: Driver) => api.post(`/submitters/${d.id}/telegram-unlink`),
    onSuccess: () => {
      toast.success(t('master.drivers.unlinked'));
      unlink?.reload();
      setUnlink(null);
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
      <CrudPage<Driver>
        resource="submitters"
        title={t('master.drivers.title')}
        subtitle={t('master.drivers.subtitle')}
        initial={{ kind: 'DRIVER', code: '', fullName: '', phone: '', nationalId: '', departmentId: '', notes: '', isActive: true }}
        searchPlaceholder={t('master.drivers.fullName') + ' / ' + t('master.drivers.phone')}
        fields={[
          { key: 'code', label: t('master.drivers.code'), type: 'text', required: true, immutable: true, ltr: true },
          { key: 'fullName', label: t('master.drivers.fullName'), type: 'text', required: true },
          { key: 'phone', label: t('master.drivers.phone'), type: 'text', required: true, ltr: true, hint: t('master.drivers.phoneHint') },
          { key: 'nationalId', label: t('master.drivers.nationalId'), type: 'text', ltr: true },
          { key: 'departmentId', label: t('master.drivers.department'), type: 'lookup', lookup: 'departments' },
          { key: 'notes', label: t('common.notes'), type: 'textarea' },
        ]}
        columns={[
          { key: 'code', header: t('master.drivers.code'), sortable: true, cell: (r) => <bdi>{r.code}</bdi> },
          { key: 'fullName', header: t('master.drivers.fullName'), sortable: true, primary: true },
          { key: 'phone', header: t('master.drivers.phone'), sortable: true, cell: (r) => <bdi dir="ltr">{r.phone}</bdi> },
          { key: 'currentVehicle', header: t('master.drivers.currentVehicle'), cell: (r) => (r.currentVehicle ? <bdi>{r.currentVehicle.number}</bdi> : '-') },
          {
            key: 'telegram',
            header: t('master.drivers.telegram'),
            cell: (r) => <Badge tone={r.telegramLinked ? 'green' : 'gray'}>{r.telegramLinked ? t('master.drivers.linked') : t('master.drivers.notLinked')}</Badge>,
          },
        ]}
        rowActions={(row, reload) => (
          <>
            {can('signatures.manage') && (
              <Button size="sm" variant="ghost" icon={<PenLine className="h-4 w-4" />} title={t('master.drivers.signature')} aria-label={t('master.drivers.signature')} onClick={() => setSig(row)} />
            )}
            {row.telegramLinked && can('submitters.telegram_link') && (
              <Button size="sm" variant="ghost" icon={<Unlink className="h-4 w-4" />} title={t('master.drivers.unlink')} aria-label={t('master.drivers.unlink')} onClick={() => setUnlink({ driver: row, reload })} />
            )}
          </>
        )}
      />
      <ConfirmDialog
        open={!!unlink}
        onClose={() => setUnlink(null)}
        danger
        title={t('master.drivers.unlinkTitle')}
        message={t('master.drivers.unlinkBody')}
        loading={doUnlink.isPending}
        onConfirm={() => unlink && doUnlink.mutate(unlink.driver)}
      />
      <Modal open={!!sig} onClose={() => setSig(null)} size="lg" title={`${t('master.drivers.signature')} - ${sig?.fullName ?? ''}`}>
        {sig && <SignatureManager owner="submitters" ownerId={sig.id} canEdit={can('signatures.manage')} />}
      </Modal>
    </>
  );
}
