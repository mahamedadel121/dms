'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, Checkbox, Code, FormField, Input, LookupMultiSelect, Select, Textarea } from '@/components/ui';
import { CrudPage, type FormCtx, type Values } from '@/components/crud/CrudPage';

interface FieldDef {
  key: string;
  labelAr: string;
  labelEn: string;
  type: 'text' | 'number' | 'date' | 'select' | 'lookup';
  required: boolean;
  min?: number | null;
  max?: number | null;
  promptAr?: string;
  options?: { value: string; labelAr: string; labelEn: string }[];
  lookup?: string;
  order: number;
}

interface ExpenseType {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  icon: string | null;
  sortOrder: number;
  glAccountId: string | null;
  glNumber: string | null;
  glName: string | null;
  extraFields: FieldDef[];
  quantityFieldKey: string | null;
  unitPriceMin: string | null;
  unitPriceMax: string | null;
  minAttachments: number;
  maxAttachments: number;
  maxAmountWarning: string | null;
  approvalRoleIds: string[];
  approvalRoles: { id: string; code: string; nameAr: string }[];
  isActive: boolean;
}

const FIELD_TYPES = ['text', 'number', 'date', 'select'] as const;
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const numOrNull = (v: unknown) => (s(v).trim() === '' ? null : Number(v));
const decOrNull = (v: unknown) => (s(v).trim() === '' ? null : s(v).trim());

function optionsToText(o?: FieldDef['options']): string {
  return (o ?? []).map((x) => `${x.value}|${x.labelAr}|${x.labelEn}`).join('\n');
}
function textToOptions(txt: string): NonNullable<FieldDef['options']> {
  return txt
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [value = '', labelAr = '', labelEn = ''] = l.split('|').map((p) => p.trim());
      return { value, labelAr: labelAr || value, labelEn: labelEn || labelAr || value };
    });
}

type EditableField = Omit<FieldDef, 'options' | 'min' | 'max'> & { min: string; max: string; optionsText: string };

function toEditable(f: FieldDef): EditableField {
  return { ...f, min: s(f.min), max: s(f.max), optionsText: optionsToText(f.options), promptAr: f.promptAr ?? '' };
}

function ExtraFieldsEditor({ ctx }: { ctx: FormCtx }) {
  const { t } = useT();
  const fields = (ctx.values.extraFields as EditableField[]) ?? [];
  const setFields = (next: EditableField[]) => ctx.set('extraFields', next);
  const patch = (i: number, p: Partial<EditableField>) => setFields(fields.map((f, idx) => (idx === i ? { ...f, ...p } : f)));
  const keys = fields.map((f) => f.key);
  const dupOrBad = (k: string) => !/^[A-Za-z][A-Za-z0-9]*$/.test(k) || keys.filter((x) => x === k).length > 1;

  return (
    <div className="space-y-3">
      {fields.length === 0 && <p className="text-sm text-ink-3">{t('master.expenseTypes.noFields')}</p>}
      {fields.map((f, i) => (
        <Card key={i} className="bg-surface-2" title={<span dir="ltr">{f.key || '...'}</span>} actions={
          <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} aria-label={t('master.expenseTypes.removeField')} onClick={() => setFields(fields.filter((_, idx) => idx !== i))} />
        }>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label={t('master.expenseTypes.fieldKey')} error={f.key && dupOrBad(f.key) ? t('master.expenseTypes.fieldKeyInvalid') : undefined}>
              {(id) => <Input id={id} dir="ltr" value={f.key} onChange={(e) => patch(i, { key: e.target.value })} />}
            </FormField>
            <FormField label={t('master.expenseTypes.fieldLabelAr')}>{(id) => <Input id={id} value={f.labelAr} onChange={(e) => patch(i, { labelAr: e.target.value })} />}</FormField>
            <FormField label={t('master.expenseTypes.fieldLabelEn')}>{(id) => <Input id={id} dir="ltr" value={f.labelEn} onChange={(e) => patch(i, { labelEn: e.target.value })} />}</FormField>
            <FormField label={t('master.expenseTypes.fieldType')}>
              {(id) => (
                <Select id={id} value={f.type} options={FIELD_TYPES.map((x) => ({ value: x, label: t(`master.expenseTypes.type.${x}`) }))} onChange={(v) => patch(i, { type: v as FieldDef['type'] })} />
              )}
            </FormField>
            {f.type === 'number' && (
              <>
                <FormField label={t('master.expenseTypes.fieldMin')}>{(id) => <Input id={id} type="number" value={f.min} onChange={(e) => patch(i, { min: e.target.value })} />}</FormField>
                <FormField label={t('master.expenseTypes.fieldMax')}>{(id) => <Input id={id} type="number" value={f.max} onChange={(e) => patch(i, { max: e.target.value })} />}</FormField>
              </>
            )}
            <FormField label={t('master.expenseTypes.fieldPrompt')} className="sm:col-span-2">
              {(id) => <Input id={id} value={f.promptAr ?? ''} onChange={(e) => patch(i, { promptAr: e.target.value })} />}
            </FormField>
            <div className="flex items-end pb-2">
              <Checkbox label={t('master.expenseTypes.fieldRequired')} checked={f.required} onChange={(c) => patch(i, { required: c })} />
            </div>
            {f.type === 'select' && (
              <FormField label={t('master.expenseTypes.fieldOptions')} className="sm:col-span-3">
                {(id) => <Textarea id={id} dir="ltr" rows={3} value={f.optionsText} onChange={(e) => patch(i, { optionsText: e.target.value })} />}
              </FormField>
            )}
          </div>
        </Card>
      ))}
      <Button
        variant="secondary"
        size="sm"
        icon={<Plus className="h-4 w-4" />}
        onClick={() => setFields([...fields, { key: '', labelAr: '', labelEn: '', type: 'text', required: true, min: '', max: '', optionsText: '', promptAr: '', order: fields.length + 1 }])}
      >
        {t('master.expenseTypes.addField')}
      </Button>
    </div>
  );
}

function ExtraForm({ ctx }: { ctx: FormCtx }) {
  const { t } = useT();
  const { values, set } = ctx;
  const numericKeys = ((values.extraFields as EditableField[]) ?? []).filter((f) => f.type === 'number' && f.key).map((f) => ({ value: f.key, label: f.key }));
  return (
    <div className="space-y-5 border-t border-hairline pt-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label={t('master.expenseTypes.minAttachments')}>{(id) => <Input id={id} type="number" min={0} value={s(values.minAttachments)} onChange={(e) => set('minAttachments', e.target.value)} />}</FormField>
        <FormField label={t('master.expenseTypes.maxAttachments')}>{(id) => <Input id={id} type="number" min={1} value={s(values.maxAttachments)} onChange={(e) => set('maxAttachments', e.target.value)} />}</FormField>
        <FormField label={t('master.expenseTypes.maxAmountWarning')}>{(id) => <Input id={id} type="number" min={0} step="0.01" value={s(values.maxAmountWarning)} onChange={(e) => set('maxAmountWarning', e.target.value)} />}</FormField>
        <FormField label={t('master.expenseTypes.quantityField')} hint={t('master.expenseTypes.quantityHint')} className="sm:col-span-3">
          {(id) => <Select id={id} value={s(values.quantityFieldKey)} placeholder={t('master.expenseTypes.quantityFieldNone')} options={numericKeys} onChange={(v) => set('quantityFieldKey', v)} />}
        </FormField>
        {s(values.quantityFieldKey) && (
          <>
            <FormField label={t('master.expenseTypes.unitPriceMin')}>{(id) => <Input id={id} type="number" min={0} step="0.01" value={s(values.unitPriceMin)} onChange={(e) => set('unitPriceMin', e.target.value)} />}</FormField>
            <FormField label={t('master.expenseTypes.unitPriceMax')}>{(id) => <Input id={id} type="number" min={0} step="0.01" value={s(values.unitPriceMax)} onChange={(e) => set('unitPriceMax', e.target.value)} />}</FormField>
          </>
        )}
      </div>
      <FormField label={t('master.expenseTypes.approvalRoles')} hint={t('master.expenseTypes.approvalRolesHint')}>
        <LookupMultiSelect entity="roles" value={(values.approvalRoleIds as string[]) ?? []} onChange={(ids) => set('approvalRoleIds', ids)} />
      </FormField>
      <div>
        <p className="mb-2 text-sm font-semibold text-ink-2">{t('master.expenseTypes.extraFields')}</p>
        <ExtraFieldsEditor ctx={ctx} />
      </div>
    </div>
  );
}

export default function ExpenseTypesPage() {
  const { t } = useT();
  const initial: Values = {
    code: '', nameAr: '', nameEn: '', icon: '', sortOrder: '0', glAccountId: '', extraFields: [], quantityFieldKey: '',
    unitPriceMin: '', unitPriceMax: '', minAttachments: '1', maxAttachments: '10', maxAmountWarning: '', approvalRoleIds: [], isActive: true,
  };
  return (
    <CrudPage<ExpenseType>
      resource="expense-types"
      title={t('master.expenseTypes.title')}
      subtitle={t('master.expenseTypes.subtitle')}
      modalSize="xl"
      initial={initial}
      fields={[
        { key: 'code', label: t('common.code'), type: 'text', required: true, immutable: true, ltr: true },
        { key: 'icon', label: t('master.expenseTypes.icon'), type: 'text' },
        { key: 'nameAr', label: t('common.nameAr'), type: 'text', required: true },
        { key: 'nameEn', label: t('common.nameEn'), type: 'text', required: true, ltr: true },
        { key: 'glAccountId', label: t('master.expenseTypes.gl'), type: 'lookup', lookup: 'gl-accounts', required: true },
        { key: 'sortOrder', label: t('master.expenseTypes.sortOrder'), type: 'number' },
      ]}
      toForm={(r) => ({
        code: r.code, nameAr: r.nameAr, nameEn: r.nameEn, icon: s(r.icon), sortOrder: s(r.sortOrder), glAccountId: s(r.glAccountId),
        extraFields: (r.extraFields ?? []).map(toEditable), quantityFieldKey: s(r.quantityFieldKey), unitPriceMin: s(r.unitPriceMin),
        unitPriceMax: s(r.unitPriceMax), minAttachments: s(r.minAttachments), maxAttachments: s(r.maxAttachments),
        maxAmountWarning: s(r.maxAmountWarning), approvalRoleIds: r.approvalRoleIds ?? [], isActive: r.isActive,
      })}
      toBody={(v, mode) => {
        const fields = ((v.extraFields as EditableField[]) ?? []).filter((f) => f.key.trim());
        const body: Record<string, unknown> = {
          nameAr: s(v.nameAr).trim(),
          nameEn: s(v.nameEn).trim(),
          icon: s(v.icon).trim() || null,
          sortOrder: Number(v.sortOrder) || 0,
          glAccountId: s(v.glAccountId),
          extraFields: fields.map((f, i) => ({
            key: f.key.trim(),
            labelAr: f.labelAr,
            labelEn: f.labelEn || f.labelAr,
            type: f.type,
            required: f.required,
            order: i + 1,
            ...(f.promptAr ? { promptAr: f.promptAr } : {}),
            ...(f.type === 'number' ? { min: numOrNull(f.min), max: numOrNull(f.max) } : {}),
            ...(f.type === 'select' ? { options: textToOptions(f.optionsText) } : {}),
          })),
          quantityFieldKey: s(v.quantityFieldKey) || null,
          unitPriceMin: s(v.quantityFieldKey) ? decOrNull(v.unitPriceMin) : null,
          unitPriceMax: s(v.quantityFieldKey) ? decOrNull(v.unitPriceMax) : null,
          minAttachments: Number(v.minAttachments) || 0,
          maxAttachments: Number(v.maxAttachments) || 1,
          maxAmountWarning: decOrNull(v.maxAmountWarning),
          approvalRoleIds: v.approvalRoleIds ?? [],
        };
        if (mode === 'create') body.code = s(v.code).trim();
        return body;
      }}
      extraForm={(ctx) => <ExtraForm ctx={ctx} />}
      columns={[
        { key: 'sortOrder', header: '#', sortable: true, className: 'w-12' },
        { key: 'nameAr', header: t('common.name'), sortable: true, primary: true, cell: (r) => <span>{r.icon} {r.nameAr} <span className="text-xs text-ink-3" dir="ltr">({r.code})</span></span> },
        { key: 'gl', header: t('master.expenseTypes.gl'), cell: (r) => (r.glNumber ? <Code>{r.glNumber}</Code> : '-') },
        {
          key: 'roles',
          header: t('master.expenseTypes.extraRoles'),
          cell: (r) => (r.approvalRoles?.length ? <span className="flex flex-wrap gap-1">{r.approvalRoles.map((x) => <Badge key={x.id} tone="purple">{x.nameAr}</Badge>)}</span> : '-'),
        },
        { key: 'attachments', header: t('master.expenseTypes.minAttachments') + ' / ' + t('master.expenseTypes.maxAttachments'), hideOnMobile: true, cell: (r) => `${r.minAttachments} - ${r.maxAttachments}` },
        { key: 'fields', header: t('master.expenseTypes.extraFields'), hideOnMobile: true, cell: (r) => r.extraFields?.length ?? 0 },
      ]}
    />
  );
}
