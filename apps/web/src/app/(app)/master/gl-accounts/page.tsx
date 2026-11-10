'use client';

import { useT } from '@/lib/i18n';
import { CrudPage } from '@/components/crud/CrudPage';

interface Row {
  id: string;
  number: string;
  nameAr: string;
  nameEn: string;
  isActive: boolean;
}

export default function GlAccountsPage() {
  const { t } = useT();
  return (
    <CrudPage<Row>
      resource="gl-accounts"
      title={t('master.glAccounts.title')}
      initial={{ number: '', nameAr: '', nameEn: '', isActive: true }}
      fields={[
        { key: 'number', label: t('master.glAccounts.number'), type: 'text', required: true, immutable: true, ltr: true },
        { key: 'nameAr', label: t('common.nameAr'), type: 'text', required: true },
        { key: 'nameEn', label: t('common.nameEn'), type: 'text', required: true, ltr: true },
      ]}
      columns={[
        { key: 'number', header: t('master.glAccounts.number'), sortable: true, primary: true, cell: (r) => <bdi>{r.number}</bdi> },
        { key: 'nameAr', header: t('common.nameAr'), sortable: true },
        { key: 'nameEn', header: t('common.nameEn'), sortable: true },
      ]}
    />
  );
}
