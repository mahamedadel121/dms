'use client';

import { useT } from '@/lib/i18n';
import { CrudPage } from '@/components/crud/CrudPage';

interface Row {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export default function CostCentersPage() {
  const { t } = useT();
  return (
    <CrudPage<Row>
      resource="cost-centers"
      title={t('master.costCenters.title')}
      initial={{ code: '', name: '', isActive: true }}
      fields={[
        { key: 'code', label: t('master.costCenters.code'), type: 'text', required: true, immutable: true, ltr: true },
        { key: 'name', label: t('common.name'), type: 'text', required: true },
      ]}
      columns={[
        { key: 'code', header: t('master.costCenters.code'), sortable: true, primary: true, cell: (r) => <bdi>{r.code}</bdi> },
        { key: 'name', header: t('common.name'), sortable: true },
      ]}
    />
  );
}
