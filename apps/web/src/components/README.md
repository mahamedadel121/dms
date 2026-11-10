# Web kit (WP6) - how to build a page

Everything is client-rendered (`'use client'`), RTL/Arabic-first, Tailwind **logical** utilities only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`). Never use `left/right/ml/mr`.

## Where pages go
`src/app/(app)/<route>/page.tsx` - the `(app)` layout already gives you the sidebar, top bar, auth guard (redirects to `/login`) and the permission guard for routes listed in `src/lib/nav.ts`. The sidebar already links `/inbox /requests /vehicle-changes /workflows /templates /sap /reports /dashboard`.

## Lib (`@/lib/*`)
- `api.ts` - `api.get<T>(path, query?)`, `post/put/patch/del`, `upload(path, file, name?, fields?)`, `blob(path)`, `download(path, query?, fallbackName?)`. Paths are relative to `/api/v1` (`api.get('/requests/queue', { tab: 'active' })`). Handles the Bearer token, single-flight refresh on 401, and throws `ApiError {status, code, message, details}`. Arrays in `query` become comma lists; empty values are skipped. `errorMessage(e)`.
- `auth.tsx` - `useAuth()` -> `{ me, can(code | codes[]), logout, reloadMe }`. `can` is any-of for arrays; the Super User passes everything.
- `i18n.tsx` - `useT()` -> `{ t, locale, dir, setLocale, name(obj) }`. `t('requests.inbox.title')` = namespace `requests` + key `inbox.title`; `t('common.rowsTotal', { n: 3 })` replaces `{n}`. `name({nameAr,nameEn})` picks by locale.
- Dictionaries: `src/i18n/{ar,en}/<ns>.ts`, default export is a flat `Dict` (`{ 'inbox.title': '...' }`). WP7 owns requests, workflows, templates, reports, sap, dashboard (empty stubs exist; overwrite them). Shared words live in `common` (`common.save`, `common.cancel`, `common.status`, ...): reuse them. A missing key falls back to the other language, then to the key.
- `format.ts` - `formatDate`, `formatDateTime` (Africa/Cairo, `yyyy-MM-dd HH:mm`), `formatEgp(v, locale)`, `formatNumber`, `todayCairo()`, `cairoDayToIso('2026-03-05', end?)` (date-input value to the ISO instant of the Cairo day start/end; use it for `from`/`to` filters), `formatBytes`.
- `permissions.ts` - pure `can(me, code)`. `types.ts` - `Me`, `Paged<T>`, `LookupItem`. `cn(...)` class joiner.

## UI kit (`@/components/ui`, import from the index)
- `Button` (`variant` primary|secondary|danger|ghost, `size` sm|md, `loading`, `icon`), `Input`, `Textarea`, `Select` (`options`, `placeholder`, `onChange(value)`), `Checkbox` (`onChange(checked)`), `FormField` (label, error, hint, required; children may be a function receiving the input id).
- `Modal` (`open,onClose,title,footer,size`), `ConfirmDialog` (`onConfirm`, `danger`).
- `DataTable<T>` - `columns: {key, header, cell?, sortable?, sortKey?, hideOnMobile?, primary?}[]`, `rows`, `rowKey`, `loading`, `page/pageSize/total/onPageChange`, `sort` (`"field:desc"`)/`onSortChange`, `onRowClick`, `rowActions(row)`. Renders cards under `md`. `Pagination` is exported separately; `parseSort`.
- `Badge` (`tone` gray|green|red|amber|blue|purple), `ActiveBadge`, `Card` (`title, actions`), `PageHeader` (`title, subtitle, actions`), `EmptyState`, `Spinner`, `LoadingBlock`, `ErrorBlock`, `Tabs` (`items, value, onChange`).
- `useToast()` -> `toast.success(msg)`, `toast.error(errOrMsg)`, `toast.info(msg)`.
- `DateRange` (yyyy-MM-dd strings), `LookupSelect entity="vehicles"` (single, `GET /lookups/:entity`), `LookupMultiSelect`, `useLookup(entity)`, `FileDrop`.
- Forms: `useFormState(initial)` -> `{ values, set(key, v), errors, setErrors, reset }`; `fieldErrorsFromApi(e)`, `requiredErrors(values, keys, msg)`.
- Notification helpers: `components/layout/NotificationsBell.tsx`.

## Typical list page
```tsx
'use client';
const [page, setPage] = useState(1);
const q = useQuery({ queryKey: ['x', page], queryFn: () => api.get<Paged<Row>>('/x', { page, pageSize: 25 }) });
<PageHeader title={t('requests.title')} />
<Card padded={false}>
  <DataTable columns={...} rows={q.data?.items} total={q.data?.total} page={page} pageSize={25}
    onPageChange={setPage} rowKey={(r) => r.id} loading={q.isFetching} />
</Card>
```
Mutations: `useMutation` + `toast.error(e)` in `onError`, then `queryClient.invalidateQueries`.

## Conventions
- Numbers, codes and URLs inside Arabic text: wrap in `<bdi>` or set `dir="ltr"` on inputs that hold codes.
- Gate buttons with `can(...)`; the API enforces permissions regardless.
- Build/run with `NEXT_DIST_DIR=.next-wp7 next build` and port 3007.
