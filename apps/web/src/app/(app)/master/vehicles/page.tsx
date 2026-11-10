'use client';

import { useT } from '@/lib/i18n';
import { Badge, type BadgeTone } from '@/components/ui';
import { CrudPage } from '@/components/crud/CrudPage';

interface Vehicle {
  id: string;
  number: string;
  plateNumber: string | null;
  vehicleTypeId: string;
  vehicleTypeName: string | null;
  costCenterId: string;
  costCenterCode: string | null;
  status: 'ACTIVE' | 'STOPPED' | 'UNDER_MAINTENANCE';
  notes: string | null;
  lastOdometer: number | null;
  isActive: boolean;
  currentDriver: { id: string; name: string } | null;
}

const TONE: Record<Vehicle['status'], BadgeTone> = { ACTIVE: 'green', STOPPED: 'red', UNDER_MAINTENANCE: 'amber' };

export default function VehiclesPage() {
  const { t } = useT();
  const statusOptions = (['ACTIVE', 'STOPPED', 'UNDER_MAINTENANCE'] as const).map((s) => ({ value: s, label: t(`master.vehicles.st.${s}`) }));
  return (
    <CrudPage<Vehicle>
      resource="vehicles"
      title={t('master.vehicles.title')}
      subtitle={t('master.vehicles.subtitle')}
      initial={{ number: '', plateNumber: '', vehicleTypeId: '', costCenterId: '', status: 'ACTIVE', notes: '', isActive: true }}
      filters={[{ key: 'status', label: t('master.vehicles.status'), options: statusOptions }]}
      fields={[
        { key: 'number', label: t('master.vehicles.number'), type: 'text', required: true, immutable: true, ltr: true },
        { key: 'plateNumber', label: t('master.vehicles.plate'), type: 'text' },
        { key: 'vehicleTypeId', label: t('master.vehicles.type'), type: 'lookup', lookup: 'vehicle-types', required: true },
        { key: 'costCenterId', label: t('master.vehicles.costCenter'), type: 'lookup', lookup: 'cost-centers', required: true },
        { key: 'status', label: t('master.vehicles.status'), type: 'select', options: statusOptions, required: true },
        { key: 'notes', label: t('common.notes'), type: 'textarea' },
      ]}
      columns={[
        { key: 'number', header: t('master.vehicles.number'), sortable: true, primary: true, cell: (r) => <bdi className="font-semibold">{r.number}</bdi> },
        { key: 'plateNumber', header: t('master.vehicles.plate'), sortable: true, cell: (r) => r.plateNumber ?? '' },
        { key: 'vehicleTypeName', header: t('master.vehicles.type') },
        { key: 'costCenterCode', header: t('master.vehicles.costCenter'), cell: (r) => <bdi>{r.costCenterCode}</bdi> },
        { key: 'status', header: t('master.vehicles.status'), sortable: true, cell: (r) => <Badge tone={TONE[r.status]}>{t(`master.vehicles.st.${r.status}`)}</Badge> },
        { key: 'currentDriver', header: t('master.vehicles.driver'), cell: (r) => r.currentDriver?.name ?? '-' },
      ]}
    />
  );
}
