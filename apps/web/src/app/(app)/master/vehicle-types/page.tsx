'use client';

import { useT } from '@/lib/i18n';
import { CrudPage } from '@/components/crud/CrudPage';

interface Row {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  isActive: boolean;
}

export default function VehicleTypesPage() {
  const { t } = useT();
  return (
    <CrudPage<Row>
      resource="vehicle-types"
      title={t('master.vehicleTypes.title')}
      initial={{ code: '', nameAr: '', nameEn: '', isActive: true }}
      fields={[
        { key: 'code', label: t('common.code'), type: 'text', required: true, immutable: true, ltr: true },
        { key: 'nameAr', label: t('common.nameAr'), type: 'text', required: true },
        { key: 'nameEn', label: t('common.nameEn'), type: 'text', required: true, ltr: true },
      ]}
      columns={[
        { key: 'code', header: t('common.code'), sortable: true, cell: (r) => <bdi>{r.code}</bdi> },
        { key: 'nameAr', header: t('common.nameAr'), sortable: true, primary: true },
        { key: 'nameEn', header: t('common.nameEn'), sortable: true },
      ]}
    />
  );
}
