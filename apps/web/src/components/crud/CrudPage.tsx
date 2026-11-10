'use client';

import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Pencil, Plus, Power, PowerOff, Search, Upload } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import type { Paged } from '@/lib/types';
import {
  ActiveBadge, Button, Card, Checkbox, ConfirmDialog, DataTable, ErrorBlock, FileDrop, FormField, Input, LookupSelect, Modal, PageHeader,
  Select, Textarea, fieldErrorsFromApi, requiredErrors, useToast, type Column, type SelectOption,
} from '@/components/ui';
import { ImportDialog } from './ImportDialog';

export type Values = Record<string, unknown>;

export interface CrudField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'select' | 'lookup' | 'checkbox';
  required?: boolean;
  options?: SelectOption[];
  lookup?: string;
  /** cannot be changed after creation (codes) */
  immutable?: boolean;
  /** shown only when creating */
  createOnly?: boolean;
  hint?: string;
  ltr?: boolean;
  wide?: boolean;
}

export interface CrudFilter {
  key: string;
  label: string;
  options: SelectOption[];
}

export interface FormCtx {
  values: Values;
  set: (key: string, v: unknown) => void;
  errors: Record<string, string | undefined>;
  mode: 'create' | 'edit';
}

export interface CrudConfig<T extends { id: string; isActive?: boolean }> {
  /** API resource, e.g. `vehicles` -> `/vehicles` */
  resource: string;
  title: string;
  subtitle?: string;
  columns: Column<T>[];
  fields: CrudField[];
  /** form values for "create" */
  initial: Values;
  /** row -> form values for "edit" (default: copy fields by key) */
  toForm?: (row: T) => Values;
  /** form values -> request body (default: fields by key, numbers coerced, empty optional -> null) */
  toBody?: (values: Values, mode: 'create' | 'edit') => unknown;
  /** server-side list filters (sent as query params) */
  filters?: CrudFilter[];
  /** extra form UI below the generic fields (expense types) */
  extraForm?: (ctx: FormCtx) => ReactNode;
  /** extra per-row buttons */
  rowActions?: (row: T, reload: () => void) => ReactNode;
  /** extra header buttons */
  headerActions?: ReactNode;
  noImport?: boolean;
  noExport?: boolean;
  noDeactivate?: boolean;
  modalSize?: 'md' | 'lg' | 'xl';
  /** permission to create/edit (default masterdata.manage) */
  managePermission?: string;
  searchPlaceholder?: string;
  pageSize?: number;
}

function defaultToForm<T>(row: T, fields: CrudField[]): Values {
  const out: Values = {};
  for (const f of fields) {
    const v = (row as Record<string, unknown>)[f.key];
    out[f.key] = v === null || v === undefined ? (f.type === 'checkbox' ? false : '') : f.type === 'number' ? String(v) : v;
  }
  return out;
}

function defaultToBody(values: Values, fields: CrudField[], mode: 'create' | 'edit'): Values {
  const out: Values = {};
  for (const f of fields) {
    if (mode === 'edit' && (f.immutable || f.createOnly)) continue;
    const v = values[f.key];
    if (f.type === 'checkbox') out[f.key] = Boolean(v);
    else if (f.type === 'number') out[f.key] = v === '' || v === null || v === undefined ? (f.required ? 0 : null) : Number(v);
    else out[f.key] = typeof v === 'string' && v.trim() === '' && !f.required ? null : typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

/** Config-driven list + search + create/edit modal + activate/deactivate + xlsx import/export. */
export function CrudPage<T extends { id: string; isActive?: boolean }>(cfg: CrudConfig<T>) {
  const { t } = useT();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const canManage = can(cfg.managePermission ?? 'masterdata.manage');
  const pageSize = cfg.pageSize ?? 25;

  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('');
  const [active, setActive] = useState('');
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ mode: 'create' | 'edit'; id?: string } | null>(null);
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [toggle, setToggle] = useState<T | null>(null);
  const [importing, setImporting] = useState(false);

  const params = { page, pageSize, q: search, sort, active, ...extra };
  const list = useQuery({
    queryKey: ['master', cfg.resource, params],
    queryFn: () => api.get<Paged<T>>(`/${cfg.resource}`, params),
    placeholderData: (prev) => prev,
  });
  const reload = () => qc.invalidateQueries({ queryKey: ['master', cfg.resource] });

  function open(mode: 'create' | 'edit', row?: T) {
    setErrors({});
    setValues(mode === 'create' ? { ...cfg.initial } : cfg.toForm ? cfg.toForm(row!) : { ...cfg.initial, ...defaultToForm(row!, cfg.fields) });
    setEditing({ mode, id: row?.id });
  }
  const set = (key: string, v: unknown) => {
    setValues((s) => ({ ...s, [key]: v }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const save = useMutation({
    mutationFn: async () => {
      const mode = editing!.mode;
      const body = cfg.toBody ? cfg.toBody(values, mode) : defaultToBody(values, cfg.fields, mode);
      return mode === 'create' ? api.post(`/${cfg.resource}`, body) : api.patch(`/${cfg.resource}/${editing!.id}`, body);
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      setEditing(null);
      void reload();
    },
    onError: (e) => {
      const fe = fieldErrorsFromApi(e);
      if (Object.keys(fe).length) setErrors(fe);
      toast.error(e);
    },
  });

  const flip = useMutation({
    mutationFn: (row: T) => api.post(`/${cfg.resource}/${row.id}/${row.isActive ? 'deactivate' : 'activate'}`),
    onSuccess: () => {
      setToggle(null);
      void reload();
    },
    onError: (e) => toast.error(e),
  });

  function submit() {
    const visible = cfg.fields.filter((f) => !(editing!.mode === 'edit' && f.createOnly));
    const missing = requiredErrors(values, visible.filter((f) => f.required && f.type !== 'checkbox').map((f) => f.key), t('common.fieldRequired'));
    if (Object.keys(missing).length) return setErrors(missing);
    save.mutate();
  }

  const columns: Column<T>[] = [
    ...cfg.columns,
    { key: 'isActive', header: t('common.status'), cell: (r) => <ActiveBadge active={r.isActive !== false} />, hideOnMobile: false },
  ];

  const formFields = cfg.fields.filter((f) => !(editing?.mode === 'edit' && f.createOnly));

  return (
    <>
      <PageHeader
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            {cfg.headerActions}
            {!cfg.noExport && (
              <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => api.download(`/${cfg.resource}/export.xlsx`, undefined, `${cfg.resource}.xlsx`).catch((e) => toast.error(e))}>
                {t('common.export')}
              </Button>
            )}
            {canManage && !cfg.noImport && (
              <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => setImporting(true)}>
                {t('common.import')}
              </Button>
            )}
            {canManage && (
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => open('create')}>
                {t('common.create')}
              </Button>
            )}
          </>
        }
      />
      <Card padded={false}>
        <form
          className="flex flex-wrap items-end gap-2 border-b border-slate-100 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(q.trim());
          }}
        >
          <div className="min-w-48 flex-1">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={cfg.searchPlaceholder ?? t('common.searchPlaceholder')} />
          </div>
          {cfg.filters?.map((f) => (
            <Select
              key={f.key}
              aria-label={f.label}
              className="w-44"
              value={extra[f.key] ?? ''}
              placeholder={f.label}
              options={f.options}
              onChange={(v) => {
                setPage(1);
                setExtra((s) => ({ ...s, [f.key]: v }));
              }}
            />
          ))}
          <Select
            aria-label={t('common.status')}
            className="w-36"
            value={active}
            placeholder={t('common.status')}
            options={[
              { value: '1', label: t('common.active') },
              { value: '0', label: t('common.inactive') },
            ]}
            onChange={(v) => {
              setPage(1);
              setActive(v);
            }}
          />
          <Button type="submit" variant="secondary" icon={<Search className="h-4 w-4" />}>
            {t('common.search')}
          </Button>
        </form>
        {list.error ? (
          <div className="p-4">
            <ErrorBlock message={errorMessage(list.error)} />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={list.data?.items}
            rowKey={(r) => r.id}
            loading={list.isFetching}
            page={page}
            pageSize={pageSize}
            total={list.data?.total ?? 0}
            onPageChange={setPage}
            sort={sort}
            onSortChange={setSort}
            rowActions={
              canManage
                ? (row) => (
                    <>
                      {cfg.rowActions?.(row, () => void reload())}
                      <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => open('edit', row)} aria-label={t('common.edit')} title={t('common.edit')} />
                      {!cfg.noDeactivate && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={row.isActive === false ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                          onClick={() => setToggle(row)}
                          aria-label={row.isActive === false ? t('common.activate') : t('common.deactivate')}
                          title={row.isActive === false ? t('common.activate') : t('common.deactivate')}
                        />
                      )}
                    </>
                  )
                : cfg.rowActions
                  ? (row) => cfg.rowActions!(row, () => void reload())
                  : undefined
            }
          />
        )}
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        size={cfg.modalSize ?? 'md'}
        title={`${editing?.mode === 'create' ? t('common.create') : t('common.edit')} - ${cfg.title}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button loading={save.isPending} onClick={submit}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {formFields.map((f) => (
            <FormField key={f.key} label={f.label} required={f.required} error={errors[f.key]} hint={f.hint} className={f.wide || f.type === 'textarea' ? 'sm:col-span-2' : undefined}>
              {(id) => {
                const v = values[f.key];
                const disabled = editing?.mode === 'edit' && f.immutable;
                const invalid = !!errors[f.key];
                if (f.type === 'checkbox') return <Checkbox checked={Boolean(v)} onChange={(c) => set(f.key, c)} label={f.label} disabled={disabled} />;
                if (f.type === 'textarea') return <Textarea id={id} value={String(v ?? '')} invalid={invalid} onChange={(e) => set(f.key, e.target.value)} />;
                if (f.type === 'select') return <Select id={id} value={String(v ?? '')} invalid={invalid} disabled={disabled} options={f.options ?? []} placeholder={t('common.select')} onChange={(x) => set(f.key, x)} />;
                if (f.type === 'lookup') return <LookupSelect id={id} entity={f.lookup!} value={String(v ?? '')} invalid={invalid} disabled={disabled} onChange={(x) => set(f.key, x)} />;
                return (
                  <Input
                    id={id}
                    type={f.type === 'number' ? 'number' : 'text'}
                    value={String(v ?? '')}
                    invalid={invalid}
                    disabled={disabled}
                    dir={f.ltr ? 'ltr' : undefined}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                );
              }}
            </FormField>
          ))}
          {cfg.extraForm && <div className="sm:col-span-2">{cfg.extraForm({ values, set, errors, mode: editing?.mode ?? 'create' })}</div>}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toggle}
        onClose={() => setToggle(null)}
        danger={toggle?.isActive !== false}
        loading={flip.isPending}
        message={toggle?.isActive === false ? t('common.activate') + '?' : t('common.deactivate') + '?'}
        onConfirm={() => toggle && flip.mutate(toggle)}
      />
      {importing && <ImportDialog resource={cfg.resource} onClose={() => setImporting(false)} onDone={() => void reload()} />}
    </>
  );
}

export { FileDrop };
