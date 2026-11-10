'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CornerDownLeft, FileText, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { NAV } from '@/lib/nav';
import { cn } from '@/lib/cn';
import { translate } from '@/i18n';
import { Code, Icon, Input, Modal, Money } from '@/components/ui';
import { NAV_ICONS } from './Sidebar';

interface RequestHit {
  id: string;
  number: string;
  submitterName: string | null;
  totalFinal: string | number | null;
}
interface Paged<T> {
  items: T[];
}
interface Entry {
  key: string;
  href: string;
  kind: 'page' | 'request';
  label: string;
  hit?: RequestHit;
  icon: string;
}

const LOOKS_LIKE_NUMBER = /^[A-Za-z]{0,4}-?\d/;

function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setD(v), ms);
    return () => clearTimeout(id);
  }, [v, ms]);
  return d;
}

/** Ctrl/Cmd+K palette: jump to a page the user may open, or to a request by number (C1). */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const { can } = useAuth();
  const router = useRouter();
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const term = text.trim();
  const debounced = useDebounced(term, 250);
  const wantsRequests = open && can('requests.view') && LOOKS_LIKE_NUMBER.test(debounced);

  useEffect(() => {
    if (open) {
      setText('');
      setActive(0);
    }
  }, [open]);

  const requests = useQuery({
    queryKey: ['cmdk-requests', debounced],
    queryFn: () => api.get<Paged<RequestHit>>('/requests', { number: debounced, pageSize: 5 }),
    enabled: wantsRequests,
  });

  const entries = useMemo<Entry[]>(() => {
    const q = term.toLowerCase();
    const pages: Entry[] = [];
    for (const g of NAV) {
      for (const i of g.items) {
        if (!can(i.permission)) continue;
        const labels = [translate('ar', i.labelKey), translate('en', i.labelKey)];
        if (q && !labels.some((l) => l.toLowerCase().includes(q))) continue;
        pages.push({ key: i.href, href: i.href, kind: 'page', label: t(i.labelKey), icon: i.icon });
      }
    }
    const reqs: Entry[] = wantsRequests
      ? (requests.data?.items ?? []).map((r) => ({ key: 'req-' + r.id, href: `/requests/${r.id}`, kind: 'request' as const, label: r.number, hit: r, icon: 'FileText' }))
      : [];
    return [...reqs, ...pages];
  }, [term, can, t, wantsRequests, requests.data]);

  useEffect(() => setActive(0), [term, requests.data]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  function go(e: Entry | undefined) {
    if (!e) return;
    onClose();
    router.push(e.href);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (entries.length ? (a + 1) % entries.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (entries.length ? (a - 1 + entries.length) % entries.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(entries[active]);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" testId="cmdk" title={t('shell.search.placeholder')}>
      <div onKeyDown={onKeyDown}>
        <Input
          data-testid="cmdk-input"
          autoFocus
          role="combobox"
          aria-expanded
          aria-controls="cmdk-list"
          aria-activedescendant={entries[active] ? `cmdk-opt-${active}` : undefined}
          aria-label={t('shell.search.placeholder')}
          placeholder={t('shell.search.placeholder')}
          startAdornment={<Icon as={Search} size={16} />}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <ul id="cmdk-list" ref={listRef} role="listbox" className="mt-3 max-h-[50dvh] space-y-0.5 overflow-y-auto">
          {entries.map((e, i) => {
            const Ico = NAV_ICONS[e.icon] ?? FileText;
            return (
              <li
                key={e.key}
                id={`cmdk-opt-${i}`}
                role="option"
                aria-selected={i === active}
                data-active={i === active}
                data-testid={e.kind === 'request' ? 'cmdk-request' : 'cmdk-page'}
                onMouseMove={() => setActive(i)}
                onClick={() => go(e)}
                className={cn('flex cursor-pointer items-center gap-3 rounded px-3 py-2 text-sm text-ink', i === active && 'bg-surface-2')}
              >
                <Icon as={Ico} size={16} className="shrink-0 text-ink-3" />
                {e.kind === 'request' && e.hit ? (
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <Code className="font-medium">{e.hit.number}</Code>
                    <span className="truncate text-ink-2">{e.hit.submitterName}</span>
                    <Money value={e.hit.totalFinal} className="ms-auto" />
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 truncate">{e.label}</span>
                )}
                {i === active && <Icon as={CornerDownLeft} size={14} mirror className="shrink-0 text-ink-3" />}
              </li>
            );
          })}
          {entries.length === 0 && !requests.isFetching && <li className="px-3 py-6 text-center text-sm text-ink-3">{t('shell.search.empty')}</li>}
        </ul>
      </div>
    </Modal>
  );
}
