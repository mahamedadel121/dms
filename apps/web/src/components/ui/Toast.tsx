'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/api';

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
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  error: 'border-red-300 bg-red-50 text-red-900',
  info: 'border-sky-300 bg-sky-50 text-sky-900',
};
const icons = { success: CheckCircle2, error: AlertCircle, info: Info };

export function ToastProvider({ children }: { children: ReactNode }) {
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
      <div className="pointer-events-none fixed bottom-4 end-4 start-4 z-[60] flex flex-col items-end gap-2 sm:start-auto sm:w-96" aria-live="polite">
        {items.map((it) => {
          const Icon = icons[it.kind];
          return (
            <div key={it.id} className={cn('pointer-events-auto flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-md', styles[it.kind])}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1 break-words">{it.message}</span>
              <button type="button" onClick={() => dismiss(it.id)} aria-label="close">
                <X className="h-4 w-4 opacity-60" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>');
  return v;
}
