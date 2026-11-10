'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Plus } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import {
  Badge, Button, Card, ErrorBlock, FormField, Input, LoadingBlock, LookupSelect, Modal, PageHeader, Tabs, Textarea,
  fieldErrorsFromApi, requiredErrors, useToast,
} from '@/components/ui';

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

  useEffect(() => {
    if (matrix.data) setDraft(Object.fromEntries(Object.entries(matrix.data.grants).map(([k, v]) => [k, [...v]])));
  }, [matrix.data]);

  const roles = matrix.data?.roles ?? rolesOnly.data ?? [];
  const changed = useMemo(() => {
    if (!matrix.data) return [] as string[];
    return Object.keys(draft).filter((rid) => [...(draft[rid] ?? [])].sort().join('|') !== [...(matrix.data!.grants[rid] ?? [])].sort().join('|'));
  }, [draft, matrix.data]);

  const groups = useMemo(() => {
    const map = new Map<string, PermissionRow[]>();
    for (const p of matrix.data?.permissions ?? []) (map.get(p.groupKey) ?? map.set(p.groupKey, []).get(p.groupKey)!).push(p);
    return [...map.entries()];
  }, [matrix.data]);

  const toggle = (roleId: string, code: string) =>
    setDraft((d) => {
      const cur = d[roleId] ?? [];
      return { ...d, [roleId]: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code] };
    });
  const toggleGroup = (roleId: string, codes: string[], on: boolean) =>
    setDraft((d) => {
      const cur = new Set(d[roleId] ?? []);
      for (const c of codes) {
        if (on) cur.add(c);
        else cur.delete(c);
      }
      return { ...d, [roleId]: [...cur] };
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
    <>
      <PageHeader
        title={t('admin.roles.title')}
        subtitle={t('admin.roles.subtitle')}
        actions={canManage && <Button icon={<Plus className="h-4 w-4" />} onClick={() => openRole('create')}>{t('admin.roles.new')}</Button>}
      />
      {canManage && (
        <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ key: 'matrix', label: t('admin.roles.tabMatrix') }, { key: 'list', label: t('admin.roles.tabList') }]} />
      )}
      {loading && <LoadingBlock />}
      {err && <ErrorBlock message={errorMessage(err)} />}

      {canManage && tab === 'matrix' && matrix.data && (
        <Card padded={false}>
          {changed.length > 0 && (
            <div className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2">
              <span className="text-sm font-semibold text-amber-900">{t('admin.roles.unsaved', { n: changed.length })}</span>
              <span className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setDraft(Object.fromEntries(Object.entries(matrix.data!.grants).map(([k, v]) => [k, [...v]])))}>{t('admin.roles.discard')}</Button>
                <Button size="sm" loading={saveAll.isPending} onClick={() => saveAll.mutate()}>{t('admin.roles.saveAll')}</Button>
              </span>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky start-0 z-10 min-w-56 bg-slate-50 px-3 py-3 text-start text-xs font-bold text-slate-500">{t('admin.roles.permission')}</th>
                  {matrix.data.roles.map((r) => (
                    <th key={r.id} className="min-w-28 px-2 py-3 text-center align-bottom text-xs font-bold text-slate-700">
                      <button type="button" className="hover:underline" onClick={() => openRole('edit', r)} disabled={!canManage}>{name(r)}</button>
                      <div className="mt-0.5 font-normal text-slate-400" dir="ltr">{r.code}</div>
                      {r.isSuperUser && <Badge tone="purple" className="mt-1">{t('admin.roles.superUser')}</Badge>}
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
                    draft={draft}
                    grants={matrix.data!.grants}
                    locale={locale}
                    onToggle={toggle}
                    onToggleGroup={toggleGroup}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">{t('admin.roles.superNote')}</p>
        </Card>
      )}

      {(tab === 'list' || !canManage) && !loading && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {roles.map((r) => (
            <Card key={r.id} title={name(r)} actions={r.isSystem ? <Badge>{t('admin.roles.system')}</Badge> : undefined}>
              <p className="text-xs text-slate-400" dir="ltr">{r.code}</p>
              {r.description && <p className="mt-1 text-sm text-slate-600">{r.description}</p>}
              <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
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
            <Button variant="secondary" onClick={() => setEdit(null)}>{t('common.cancel')}</Button>
            <Button loading={saveRole.isPending} onClick={submitRole}>{t('common.save')}</Button>
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
    </>
  );
}

function GroupRows({
  group, perms, roles, draft, grants, locale, onToggle, onToggleGroup,
}: {
  group: string;
  perms: PermissionRow[];
  roles: RoleRow[];
  draft: Draft;
  grants: Record<string, string[]>;
  locale: 'ar' | 'en';
  onToggle: (roleId: string, code: string) => void;
  onToggleGroup: (roleId: string, codes: string[], on: boolean) => void;
}) {
  const { t } = useT();
  const codes = perms.map((p) => p.code);
  return (
    <>
      <tr className="bg-slate-100">
        <td className="sticky start-0 bg-slate-100 px-3 py-1.5 text-xs font-bold uppercase text-slate-600">{t(`admin.roles.group.${group}`) === `admin.roles.group.${group}` ? group : t(`admin.roles.group.${group}`)}</td>
        {roles.map((r) => {
          const cur = draft[r.id] ?? [];
          const all = codes.every((c) => cur.includes(c));
          return (
            <td key={r.id} className="px-2 py-1.5 text-center">
              {!r.isSuperUser && (
                <button type="button" className="text-[11px] font-semibold text-brand-700 hover:underline" onClick={() => onToggleGroup(r.id, codes, !all)}>
                  {all ? '-' : '+'}
                </button>
              )}
            </td>
          );
        })}
      </tr>
      {perms.map((p) => (
        <tr key={p.code} className="border-t border-slate-100 hover:bg-slate-50">
          <td className="sticky start-0 bg-white px-3 py-2">
            <div className="font-medium text-slate-800">{locale === 'ar' ? p.nameAr : p.nameEn}</div>
            <div className="text-[11px] text-slate-400" dir="ltr">{p.code}</div>
          </td>
          {roles.map((r) => {
            const on = r.isSuperUser || (draft[r.id] ?? []).includes(p.code);
            const dirty = !r.isSuperUser && on !== (grants[r.id] ?? []).includes(p.code);
            return (
              <td key={r.id} className={cn('px-2 py-2 text-center', dirty && 'bg-amber-50')}>
                {r.isSuperUser ? (
                  <Lock className="mx-auto h-3.5 w-3.5 text-slate-300" aria-label={t('admin.roles.superUser')} />
                ) : (
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
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
