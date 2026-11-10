'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Lock, Plus } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import {
  Badge, Button, Card, Code, EmptyState, ErrorBlock, FormField, Icon, Input, LookupSelect, Modal, Page, PageHeader, SearchInput, SkeletonRows, Tabs, Textarea,
  fieldErrorsFromApi, requiredErrors, useToast,
} from '@/components/ui';
import { diffMatrix, filterPermissions, groupState, toggleGroup as toggleGroupSet } from '@/features/admin/matrixModel';

interface RoleRow {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  description: string | null;
  scopeDepartmentId: string | null;
  isSuperUser: boolean;
  isSystem: boolean;
  isActive: boolean;
  userCount: number;
}
interface PermissionRow {
  code: string;
  groupKey: string;
  nameAr: string;
  nameEn: string;
}
interface Matrix {
  roles: RoleRow[];
  permissions: PermissionRow[];
  grants: Record<string, string[]>;
}

type Draft = Record<string, string[]>;

const toSets = (d: Draft): Record<string, Set<string>> => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, new Set(v)]));

const EMPTY = { code: '', nameAr: '', nameEn: '', description: '', scopeDepartmentId: '' };

export default function RolesPage() {
  const { t, name, locale } = useT();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const canManage = can('roles.manage');

  const matrix = useQuery({ queryKey: ['roles', 'matrix'], queryFn: () => api.get<Matrix>('/roles/matrix'), enabled: canManage });
  const rolesOnly = useQuery({ queryKey: ['roles', 'list'], queryFn: () => api.get<RoleRow[]>('/roles'), enabled: !canManage });
  const [tab, setTab] = useState('matrix');
  const [draft, setDraft] = useState<Draft>({});
  const [edit, setEdit] = useState<{ mode: 'create' | 'edit'; id?: string } | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<{ row: string | null; col: string | null }>({ row: null, col: null });

  useEffect(() => {
    if (matrix.data) setDraft(Object.fromEntries(Object.entries(matrix.data.grants).map(([k, v]) => [k, [...v]])));
  }, [matrix.data]);

  const roles = matrix.data?.roles ?? rolesOnly.data ?? [];
  const changes = useMemo(() => (matrix.data ? diffMatrix(matrix.data.grants, draft) : []), [draft, matrix.data]);
  const changed = useMemo(() => changes.map((c) => c.roleId), [changes]);
  const changedCells = useMemo(() => {
    const s = new Set<string>();
    for (const c of changes) for (const code of [...c.added, ...c.removed]) s.add(`${c.roleId}|${code}`);
    return s;
  }, [changes]);
  const sets = useMemo(() => toSets(draft), [draft]);

  const groups = useMemo(() => {
    const map = new Map<string, PermissionRow[]>();
    for (const p of filterPermissions(matrix.data?.permissions ?? [], search, locale)) (map.get(p.groupKey) ?? map.set(p.groupKey, []).get(p.groupKey)!).push(p);
    return [...map.entries()];
  }, [matrix.data, search, locale]);

  const toggle = (roleId: string, code: string) =>
    setDraft((d) => {
      const cur = d[roleId] ?? [];
      return { ...d, [roleId]: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code] };
    });
  const toggleGroup = (roleId: string, codes: string[], on: boolean) =>
    setDraft((d) => ({ ...d, [roleId]: [...toggleGroupSet(new Set(d[roleId] ?? []), codes, on)] }));
  const discard = () => matrix.data && setDraft(Object.fromEntries(Object.entries(matrix.data.grants).map(([k, v]) => [k, [...v]])));
  const toggleCollapse = (g: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  const saveAll = useMutation({
    mutationFn: async () => {
      for (const rid of changed) await api.put(`/roles/${rid}/permissions`, { codes: draft[rid] });
    },
    onSuccess: () => {
      toast.success(t('admin.roles.saved'));
      void qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e) => toast.error(e),
  });

  const saveRole = useMutation({
    mutationFn: async () => {
      const body = {
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim(),
        description: form.description.trim() || null,
        scopeDepartmentId: form.scopeDepartmentId || null,
      };
      return edit!.mode === 'create' ? api.post('/roles', { ...body, code: form.code.trim(), permissionCodes: [] }) : api.patch(`/roles/${edit!.id}`, body);
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      setEdit(null);
      void qc.invalidateQueries({ queryKey: ['roles'] });
      void qc.invalidateQueries({ queryKey: ['lookup', 'roles'] });
    },
    onError: (e) => {
      setErrors(fieldErrorsFromApi(e));
      toast.error(e);
    },
  });

  function openRole(mode: 'create' | 'edit', r?: RoleRow) {
    setErrors({});
    setForm(r ? { code: r.code, nameAr: r.nameAr, nameEn: r.nameEn, description: r.description ?? '', scopeDepartmentId: r.scopeDepartmentId ?? '' } : EMPTY);
    setEdit({ mode, id: r?.id });
  }
  function submitRole() {
    const keys = edit!.mode === 'create' ? ['code', 'nameAr', 'nameEn'] : ['nameAr', 'nameEn'];
    const missing = requiredErrors(form, keys as (keyof typeof EMPTY)[], t('common.fieldRequired'));
    if (Object.keys(missing).length) return setErrors(missing);
    saveRole.mutate();
  }

  const loading = matrix.isLoading || rolesOnly.isLoading;
  const err = matrix.error ?? rolesOnly.error;

  return (
    <Page testId="page-admin-roles" width={tab === 'matrix' && canManage ? 'full' : 'default'}>
      <PageHeader
        title={t('admin.roles.title')}
        subtitle={t('admin.roles.subtitle')}
        actions={canManage && <Button icon={<Icon as={Plus} size={16} />} onClick={() => openRole('create')}>{t('admin.roles.new')}</Button>}
      />
      {canManage && (
        <Tabs value={tab} onChange={setTab} items={[{ key: 'matrix', label: t('admin.roles.tabMatrix') }, { key: 'list', label: t('admin.roles.tabList') }]} />
      )}
      {loading && <SkeletonRows rows={8} cols={5} />}
      {err && <ErrorBlock message={errorMessage(err)} />}

      {canManage && tab === 'matrix' && matrix.data && (
        <div className="space-y-3">
          <div className="max-w-sm">
            <SearchInput value={search} onChange={setSearch} placeholder={t('admin.matrix.search')} />
          </div>
          <div data-testid="matrix" className="max-h-[calc(100dvh-220px)] overflow-auto rounded-lg border border-hairline bg-surface">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky start-0 top-0 z-20 w-72 min-w-72 border-b border-hairline bg-surface-2 px-3 py-3 text-start text-13 font-medium text-ink-2">{t('admin.roles.permission')}</th>
                  {matrix.data.roles.map((r) => (
                    <th
                      key={r.id}
                      className={cn('sticky top-0 z-10 min-w-28 border-b border-hairline bg-surface-2 px-2 py-3 text-center align-bottom', hover.col === r.id && 'bg-surface-3')}
                    >
                      <button type="button" className="text-13 font-medium text-ink hover:underline" onClick={() => openRole('edit', r)}>{name(r)}</button>
                      <div><Code className="text-[11px] text-ink-3">{r.code}</Code></div>
                      {r.isSuperUser && <Badge tone="purple" size="sm" className="mt-1">{t('admin.roles.superUser')}</Badge>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(([group, perms]) => (
                  <GroupRows
                    key={group}
                    group={group}
                    perms={perms}
                    roles={matrix.data!.roles}
                    sets={sets}
                    changedCells={changedCells}
                    locale={locale}
                    collapsed={collapsed.has(group)}
                    hover={hover}
                    setHover={setHover}
                    onCollapse={() => toggleCollapse(group)}
                    onToggle={toggle}
                    onToggleGroup={toggleGroup}
                  />
                ))}
              </tbody>
            </table>
            {groups.length === 0 && <EmptyState compact title={t('admin.matrix.empty')} />}
          </div>
          <p className="text-xs text-ink-3">{t('admin.roles.superNote')}</p>
          {changed.length > 0 && (
            <div className="sticky bottom-4 z-sticky mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-surface px-4 py-3 shadow-pop">
              <span data-testid="matrix-dirty-count" className="text-sm font-medium text-ink">{t('admin.matrix.dirty', { n: changedCells.size })}</span>
              <span className="flex gap-2">
                <Button size="sm" loading={saveAll.isPending} onClick={() => saveAll.mutate()} data-testid="matrix-save">{t('admin.roles.saveAll')}</Button>
                <Button size="sm" variant="ghost" onClick={discard} data-testid="matrix-discard">{t('admin.roles.discard')}</Button>
              </span>
            </div>
          )}
        </div>
      )}

      {(tab === 'list' || !canManage) && !loading && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {roles.map((r) => (
            <Card key={r.id} title={name(r)} actions={r.isSystem ? <Badge>{t('admin.roles.system')}</Badge> : undefined}>
              <Code className="text-[11px] text-ink-3">{r.code}</Code>
              {r.description && <p className="mt-1 text-sm text-ink-2">{r.description}</p>}
              <div className="mt-3 flex items-center justify-between text-sm text-ink-2">
                <span>{t('admin.roles.users')}: <b>{r.userCount}</b></span>
                {canManage && <Button size="sm" variant="secondary" onClick={() => openRole('edit', r)}>{t('common.edit')}</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.mode === 'create' ? t('admin.roles.new') : t('common.edit')}
        footer={
          <>
            <Button loading={saveRole.isPending} onClick={submitRole}>{t('common.save')}</Button>
            <Button variant="secondary" onClick={() => setEdit(null)}>{t('common.cancel')}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label={t('common.code')} required={edit?.mode === 'create'} error={errors.code} hint={t('admin.roles.codeHint')}>
            {(id) => <Input id={id} dir="ltr" disabled={edit?.mode === 'edit'} value={form.code} invalid={!!errors.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />}
          </FormField>
          <FormField label={t('common.nameAr')} required error={errors.nameAr}>{(id) => <Input id={id} value={form.nameAr} invalid={!!errors.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />}</FormField>
          <FormField label={t('common.nameEn')} required error={errors.nameEn}>{(id) => <Input id={id} dir="ltr" value={form.nameEn} invalid={!!errors.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />}</FormField>
          <FormField label={t('admin.roles.description')}>{(id) => <Textarea id={id} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</FormField>
          <FormField label={t('admin.roles.scopeDepartment')}>
            {(id) => <LookupSelect id={id} entity="departments" value={form.scopeDepartmentId} placeholder={t('admin.roles.allDepartments')} onChange={(v) => setForm({ ...form, scopeDepartmentId: v })} />}
          </FormField>
        </div>
      </Modal>
    </Page>
  );
}

function TriCheckbox({ state, onChange, label }: { state: 'all' | 'some' | 'none'; onChange: (on: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="h-[18px] w-[18px] rounded-sm accent-primary"
      checked={state === 'all'}
      onChange={() => onChange(state !== 'all')}
      aria-label={label}
    />
  );
}

function GroupRows({
  group, perms, roles, sets, changedCells, locale, collapsed, hover, setHover, onCollapse, onToggle, onToggleGroup,
}: {
  group: string;
  perms: PermissionRow[];
  roles: RoleRow[];
  sets: Record<string, Set<string>>;
  changedCells: Set<string>;
  locale: 'ar' | 'en';
  collapsed: boolean;
  hover: { row: string | null; col: string | null };
  setHover: (h: { row: string | null; col: string | null }) => void;
  onCollapse: () => void;
  onToggle: (roleId: string, code: string) => void;
  onToggleGroup: (roleId: string, codes: string[], on: boolean) => void;
}) {
  const { t } = useT();
  const codes = perms.map((p) => p.code);
  const title = t(`admin.roles.group.${group}`) === `admin.roles.group.${group}` ? group : t(`admin.roles.group.${group}`);
  return (
    <>
      <tr className="h-9 bg-surface-2">
        <td className="sticky start-0 z-10 bg-surface-2 px-3">
          <button type="button" className="flex items-center gap-2 text-13 font-medium text-ink" onClick={onCollapse} aria-expanded={!collapsed} aria-label={collapsed ? t('admin.matrix.expand') : t('admin.matrix.collapse')}>
            <Icon as={collapsed ? ChevronRight : ChevronDown} size={16} mirror={collapsed} className="text-ink-3" />
            {title}
          </button>
        </td>
        {roles.map((r) => (
          <td key={r.id} className="bg-surface-2 px-2 text-center">
            {!r.isSuperUser && <TriCheckbox state={groupState(codes, sets[r.id] ?? new Set())} onChange={(on) => onToggleGroup(r.id, codes, on)} label={`${r.code} ${title}`} />}
          </td>
        ))}
      </tr>
      {!collapsed &&
        perms.map((p) => (
          <tr key={p.code} className="border-t border-hairline" onMouseEnter={() => setHover({ row: p.code, col: hover.col })} onMouseLeave={() => setHover({ row: null, col: null })}>
            <td className={cn('sticky start-0 z-10 border-t border-hairline bg-surface px-3 py-2', hover.row === p.code && 'bg-surface-2')}>
              <div className="text-sm text-ink">{locale === 'ar' ? p.nameAr : p.nameEn}</div>
              <Code className="text-[11px] text-ink-3">{p.code}</Code>
            </td>
            {roles.map((r) => {
              const on = r.isSuperUser || (sets[r.id] ?? new Set<string>()).has(p.code);
              const dirty = !r.isSuperUser && changedCells.has(`${r.id}|${p.code}`);
              return (
                <td
                  key={r.id}
                  onMouseEnter={() => setHover({ row: p.code, col: r.id })}
                  className={cn('border-t border-hairline px-2 py-2 text-center', hover.row === p.code && 'bg-surface-2/60', dirty && 'bg-brass-tint')}
                >
                  {r.isSuperUser ? (
                    <Icon as={Lock} size={14} className="mx-auto text-ink-disabled" label={t('admin.roles.superUser')} />
                  ) : (
                    <input
                      type="checkbox"
                      data-testid="matrix-cell"
                      data-role={r.id}
                      data-perm={p.code}
                      className="h-[18px] w-[18px] rounded-sm accent-primary"
                      checked={on}
                      onChange={() => onToggle(r.id, p.code)}
                      aria-label={`${r.code} ${p.code}`}
                    />
                  )}
                </td>
              );
            })}
          </tr>
        ))}
    </>
  );
}
