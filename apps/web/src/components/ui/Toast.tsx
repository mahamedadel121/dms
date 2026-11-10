'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Icon } from './Icon';

type Kind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: Kind;
  message: string;
}

export interface ToastApi {
  success: (message: string) => void;
  info: (message: string) => void;
  error: (messageOrError: unknown) => void;
}

const Ctx = createContext<ToastApi | null>(null);

const styles: Record<Kind, string> = {
  success: 'border-s-success text-success',
  error: 'border-s-danger text-danger',
  info: 'border-s-info text-info',
};
const icons = { success: CheckCircle2, error: AlertCircle, info: Info };

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: Kind, message: string) => {
      const id = ++seq.current;
      setItems((l) => [...l.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      info: (m) => push('info', m),
      error: (e) => push('error', typeof e === 'string' ? e : errorMessage(e)),
    }),
    [push],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-[76px] z-toast flex flex-col gap-2 md:inset-x-auto md:bottom-4 md:end-4 md:w-96">
        {items.map((it) => (
          <div
            key={it.id}
            data-testid={'toast-' + it.kind}
            role={it.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border border-s-[3px] border-hairline bg-surface px-4 py-3 text-sm text-ink shadow-pop animate-pop-in',
              styles[it.kind],
            )}
          >
            <Icon as={icons[it.kind]} size={18} className="mt-0.5" />
            <span className="flex-1 break-words text-ink">{it.message}</span>
            <button type="button" onClick={() => dismiss(it.id)} aria-label={t('common.close')} className="text-ink-3 hover:text-ink">
              <Icon as={X} size={16} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>');
  return v;
}
