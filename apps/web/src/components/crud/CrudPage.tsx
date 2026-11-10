'use client';

import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, MoreHorizontal, Pencil, Plus, Upload } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useIsDesktop } from '@/lib/useMediaQuery';
import type { Paged } from '@/lib/types';
import {
  ActiveBadge, Button, Checkbox, ConfirmDialog, DataTable, ErrorBlock, FileDrop, FilterBar, FormField, Icon, IconButton, Input, LookupSelect, Menu,
  Modal, Page, PageHeader, SearchInput, Select, Switch, Textarea, fieldErrorsFromApi, requiredErrors, useToast, type Column, type SelectOption,
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
  /** card layout of a row on mobile (use when the list has more than four columns) */
  mobileCard?: (row: T) => ReactNode;
  /** page test id suffix: `page-<testId>` (default: the resource) */
  testId?: string;
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
  const desktop = useIsDesktop();
  const qc = useQueryClient();
  const canManage = can(cfg.managePermission ?? 'masterdata.manage');
  const pageSize = cfg.pageSize ?? 25;

  const [page, setPage] = useState(1);
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
    {
      key: 'isActive',
      header: t('common.status'),
      hideOnMobile: false,
      cell: (r) =>
        canManage && !cfg.noDeactivate ? (
          <Switch
            id={'crud-toggle-' + r.id}
            checked={r.isActive !== false}
            label={<span className="sr-only">{t('common.status')}</span>}
            onChange={(on) => (on ? flip.mutate(r) : setToggle(r))}
          />
        ) : (
          <ActiveBadge active={r.isActive !== false} />
        ),
    },
  ];

  const formFields = cfg.fields.filter((f) => !(editing?.mode === 'edit' && f.createOnly));

  const doExport = () => {
    api.download(`/${cfg.resource}/export.xlsx`, undefined, `${cfg.resource}.xlsx`).catch((e) => toast.error(e));
  };
  const showImport = canManage && !cfg.noImport;

  const menuItems = [
    { key: 'import', label: t('common.import'), icon: <Icon as={Upload} size={16} />, testId: 'crud-import', hidden: !showImport, onSelect: () => setImporting(true) },
    { key: 'export', label: t('common.export'), icon: <Icon as={Download} size={16} />, testId: 'crud-export', hidden: !!cfg.noExport, onSelect: doExport },
  ];

  const activeCount = (active ? 1 : 0) + (search ? 1 : 0) + Object.values(extra).filter(Boolean).length;
  const reset = () => {
    setPage(1);
    setSearch('');
    setActive('');
    setExtra({});
  };

  return (
    <Page testId={`page-${cfg.testId ?? cfg.resource}`}>
      <PageHeader
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            {cfg.headerActions}
            {desktop ? (
              <>
                {showImport && (
                  <Button variant="secondary" icon={<Icon as={Upload} size={16} />} data-testid="crud-import" onClick={() => setImporting(true)}>
                    {t('common.import')}
                  </Button>
                )}
                {!cfg.noExport && (
                  <Button variant="secondary" icon={<Icon as={Download} size={16} />} data-testid="crud-export" onClick={doExport}>
                    {t('common.export')}
                  </Button>
                )}
              </>
            ) : (
              <Menu align="end" items={menuItems} trigger={<IconButton variant="secondary" icon={<Icon as={MoreHorizontal} size={18} />} label={t('ui.more')} />} />
            )}
            {canManage && (
              <Button icon={<Icon as={Plus} size={16} />} data-testid="crud-add" onClick={() => open('create')}>
                {t('common.create')}
              </Button>
            )}
          </>
        }
      />

      <FilterBar
        activeCount={activeCount}
        onReset={reset}
        search={
          <SearchInput
            testId="crud-search"
            value={search}
            placeholder={cfg.searchPlaceholder ?? t('common.searchPlaceholder')}
            onChange={(v) => {
              setPage(1);
              setSearch(v.trim());
            }}
          />
        }
      >
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
        <span className="ms-auto self-center text-sm text-ink-2" data-testid="crud-total">
          {t('ui.total', { n: list.data?.total ?? 0 })}
        </span>
      </FilterBar>

      {list.error ? (
        <ErrorBlock message={errorMessage(list.error)} onRetry={() => void list.refetch()} />
      ) : (
        <DataTable
          testId="crud"
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
          mobileCard={cfg.mobileCard}
          rowActions={
            canManage
              ? (row) => (
                  <>
                    {cfg.rowActions?.(row, () => void reload())}
                    <Menu
                      align="end"
                      items={[{ key: 'edit', label: t('common.edit'), icon: <Icon as={Pencil} size={16} />, testId: 'crud-edit', onSelect: () => open('edit', row) }]}
                      trigger={<IconButton icon={<Icon as={MoreHorizontal} size={18} />} label={t('ui.more')} data-testid={'crud-menu-' + row.id} />}
                    />
                  </>
                )
              : cfg.rowActions
                ? (row) => cfg.rowActions!(row, () => void reload())
                : undefined
          }
        />
      )}

      <Modal
        testId="crud-form"
        open={!!editing}
        onClose={() => setEditing(null)}
        size={cfg.modalSize ?? 'md'}
        dismissable={!save.isPending}
        title={`${editing?.mode === 'create' ? t('common.create') : t('common.edit')} - ${cfg.title}`}
        footer={
          <>
            <Button loading={save.isPending} onClick={submit} data-testid="crud-save">
              {t('common.save')}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t('common.cancel')}
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
            <div key={f.key} data-testid={'crud-field-' + f.key} className={f.wide || f.type === 'textarea' ? 'sm:col-span-2' : undefined}>
              <FormField label={f.label} required={f.required} error={errors[f.key]} hint={f.hint}>
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
                      numeric={f.type === 'number'}
                      value={String(v ?? '')}
                      invalid={invalid}
                      disabled={disabled}
                      {...(f.ltr ? { dir: 'ltr' } : {})}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  );
                }}
              </FormField>
            </div>
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
        confirmTestId="crud-toggle-confirm"
        onConfirm={() => toggle && flip.mutate(toggle)}
      />
      {importing && <ImportDialog resource={cfg.resource} onClose={() => setImporting(false)} onDone={() => void reload()} />}
    </Page>
  );
}

export { FileDrop };
