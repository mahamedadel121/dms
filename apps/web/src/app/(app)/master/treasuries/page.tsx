'use client';

import { useT } from '@/lib/i18n';
import { Badge } from '@/components/ui';
import { CrudPage } from '@/components/crud/CrudPage';

interface Row {
  id: string;
  code: string;
  name: string;
  cashGlNumber: string;
  companyCode: string;
  isDefault: boolean;
  isActive: boolean;
}

export default function TreasuriesPage() {
  const { t } = useT();
  return (
    <CrudPage<Row>
      resource="treasuries"
      title={t('master.treasuries.title')}
      subtitle={t('master.treasuries.subtitle')}
      initial={{ code: '', name: '', cashGlNumber: '', companyCode: '1000', isDefault: false, isActive: true }}
      fields={[
        { key: 'code', label: t('common.code'), type: 'text', required: true, immutable: true, ltr: true },
        { key: 'name', label: t('common.name'), type: 'text', required: true },
        { key: 'cashGlNumber', label: t('master.treasuries.cashGl'), type: 'text', required: true, ltr: true },
        { key: 'companyCode', label: t('master.treasuries.companyCode'), type: 'text', required: true, ltr: true },
        { key: 'isDefault', label: t('master.treasuries.isDefault'), type: 'checkbox' },
      ]}
      columns={[
        { key: 'code', header: t('common.code'), sortable: true, cell: (r) => <bdi>{r.code}</bdi> },
        {
          key: 'name',
          header: t('common.name'),
          sortable: true,
          primary: true,
          cell: (r) => (
            <span className="flex items-center gap-2">
              {r.name}
              {r.isDefault && <Badge tone="blue">{t('master.treasuries.default')}</Badge>}
            </span>
          ),
        },
        { key: 'cashGlNumber', header: t('master.treasuries.cashGl'), cell: (r) => <bdi>{r.cashGlNumber}</bdi> },
        { key: 'companyCode', header: t('master.treasuries.companyCode'), cell: (r) => <bdi>{r.companyCode}</bdi> },
      ]}
    />
  );
}
