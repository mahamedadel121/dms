'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ExternalLink, FileText, ImageOff, Maximize, Maximize2, RotateCcw, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Num } from '@/components/ui/Num';
import { Modal } from '@/components/ui/Modal';
import { useTr } from '../common/useTr';
import { clampZoom, nextIndex, type EvidenceItem } from './evidence';

export interface EvidenceViewerProps {
  items: EvidenceItem[];
  activeId: string | null;
  onActiveChange: (attachmentId: string) => void;
  variant: 'panel' | 'carousel';
  renderActions?: (item: EvidenceItem) => ReactNode;
  className?: string;
  /** internal: hides the full-screen control when rendered inside the full-screen fallback modal */
  embedded?: boolean;
}

interface View {
  z: number;
  r: number;
  x: number;
  y: number;
}
const FIT: View = { z: 1, r: 0, x: 0, y: 0 };
const tbBtn = 'text-viewer-ink hover:bg-white/10 active:bg-white/20';
const overlayBtn = 'bg-black/40 text-viewer-ink hover:bg-black/60';

export function EvidenceViewer({ items, activeId, onActiveChange, variant, renderActions, className, embedded }: EvidenceViewerProps) {
  const { t } = useTr();
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(FIT);
  const [fsModal, setFsModal] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; view: View; pinch: number | null }>({ startX: 0, startY: 0, view: FIT, pinch: null });

  const found = items.findIndex((i) => i.attachment.id === activeId);
  const index = found >= 0 ? found : 0;
  const item = items[index];
  const n = items.length;
  const panel = variant === 'panel';
  const currentId = item?.attachment.id;

  // reset the view when the image changes
  useEffect(() => {
    setView(FIT);
  }, [currentId]);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (n === 0) return;
      const next = items[nextIndex(index, n, dir)];
      if (next) onActiveChange(next.attachment.id);
    },
    [items, index, n, onActiveChange],
  );

  const zoomAt = useCallback((factor: number, px = 0, py = 0) => {
    setView((v) => {
      const z = clampZoom(v.z * factor);
      const k = z / v.z;
      return { ...v, z, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);

  // wheel zoom around the pointer (needs a non-passive listener to stop the page from scrolling)
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !panel) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [panel, zoomAt, currentId]);

  const rotate = (d: number) => setView((v) => ({ ...v, r: (v.r + d + 360) % 360 }));
  const fit = () => setView(FIT);

  const pinchDistance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    gesture.current = { startX: e.clientX, startY: e.clientY, view, pinch: pointers.current.size === 2 ? pinchDistance() : null };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 2 && g.pinch) {
      const d = pinchDistance();
      if (d > 0) setView({ ...g.view, z: clampZoom((g.view.z * d) / g.pinch) });
      return;
    }
    // drag pans (always on the panel; on the carousel only while zoomed in, otherwise it is a swipe)
    if (panel || g.view.z > 1) setView({ ...g.view, x: g.view.x + e.clientX - g.startX, y: g.view.y + e.clientY - g.startY });
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const had = pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!had || panel || g.view.z > 1 || pointers.current.size > 0) return;
    const dx = e.clientX - g.startX;
    if (Math.abs(dx) > 50 && Math.abs(e.clientY - g.startY) < 60) go(dx < 0 ? 1 : -1);
  };
  const onDoubleClick = () => setView((v) => (v.z > 1 ? FIT : { ...v, z: 2, x: 0, y: 0 }));

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === '+' || e.key === '=') zoomAt(1.25);
    else if (e.key === '-') zoomAt(1 / 1.25);
    else if (e.key === '0') fit();
    else if (e.key === 'r' || e.key === 'R') rotate(90);
    else return;
    e.preventDefault();
  };

  const fullscreen = () => {
    const el = rootRef.current;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (el?.requestFullscreen) {
      el.requestFullscreen().catch(() => setFsModal(true));
    } else {
      setFsModal(true);
    }
  };

  if (!item) {
    return (
      <div
        data-testid="evidence-viewer"
        className={cn('flex flex-col items-center justify-center gap-2 rounded-lg bg-viewer p-8 text-viewer-ink', panel ? 'min-h-64' : 'h-40', className)}
      >
        <Icon as={ImageOff} size={24} />
        <p className="text-sm">{t('requests.viewer.empty')}</p>
      </div>
    );
  }

  const a = item.attachment;
  const isPdf = a.mimeType === 'application/pdf';
  const pointerHandlers = isPdf
    ? {}
    : { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick };

  return (
    <>
      <div
        ref={rootRef}
        data-testid="evidence-viewer"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={cn('relative flex flex-col overflow-hidden rounded-lg bg-viewer text-viewer-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brass', className)}
      >
        {panel && (
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-white/10 px-2" dir="ltr">
            <IconButton size="sm" className={tbBtn} icon={<Icon as={ZoomOut} />} label={t('requests.viewer.zoomOut')} data-testid="evidence-zoom-out" onClick={() => zoomAt(1 / 1.25)} />
            <span className="num w-12 text-center text-xs">
              <Num value={Math.round(view.z * 100)} />%
            </span>
            <IconButton size="sm" className={tbBtn} icon={<Icon as={ZoomIn} />} label={t('requests.viewer.zoomIn')} data-testid="evidence-zoom-in" onClick={() => zoomAt(1.25)} />
            <IconButton size="sm" className={tbBtn} icon={<Icon as={Maximize} />} label={t('requests.viewer.fit')} data-testid="evidence-fit" onClick={fit} />
            <IconButton size="sm" className={tbBtn} icon={<Icon as={RotateCcw} />} label={t('requests.viewer.rotateLeft')} data-testid="evidence-rotate-left" onClick={() => rotate(-90)} />
            <IconButton size="sm" className={tbBtn} icon={<Icon as={RotateCw} />} label={t('requests.viewer.rotateRight')} data-testid="evidence-rotate-right" onClick={() => rotate(90)} />
            <span className="flex-1" />
            <a
              href={a.url}
              target="_blank"
              rel="noreferrer"
              aria-label={t('requests.viewer.open')}
              title={t('requests.viewer.open')}
              data-testid="evidence-open"
              className={cn('inline-flex h-8 w-8 items-center justify-center rounded', tbBtn)}
            >
              <Icon as={ExternalLink} mirror />
            </a>
            {!embedded && (
              <IconButton size="sm" className={tbBtn} icon={<Icon as={Maximize2} />} label={t('requests.viewer.fullscreen')} data-testid="evidence-fullscreen" onClick={fullscreen} />
            )}
          </div>
        )}

        <div
          ref={stageRef}
          className={cn('relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden', panel ? 'cursor-grab active:cursor-grabbing' : 'h-[46dvh]')}
          {...pointerHandlers}
        >
          {isPdf ? (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <Icon as={FileText} className="h-8 w-8" />
              <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded border border-white/30 px-3 text-sm hover:bg-white/10">
                {t('requests.viewer.openPdf')}
              </a>
            </div>
          ) : (
            <img
              src={a.url}
              alt={item.lineNo > 0 ? `${t('requests.viewer.line', { n: item.lineNo })} ${item.lineLabel}` : ''}
              draggable={false}
              data-testid="evidence-image"
              className="max-h-full max-w-full object-contain"
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z}) rotate(${view.r}deg)` }}
            />
          )}
          {!panel && (
            <div className="absolute end-2 top-2 flex gap-1" dir="ltr" onPointerDown={(e) => e.stopPropagation()}>
              <IconButton size="sm" className={overlayBtn} icon={<Icon as={RotateCw} />} label={t('requests.viewer.rotateRight')} data-testid="evidence-rotate-right" onClick={() => rotate(90)} />
              {!embedded && (
                <IconButton size="sm" className={overlayBtn} icon={<Icon as={Maximize2} />} label={t('requests.viewer.fullscreen')} data-testid="evidence-fullscreen" onClick={fullscreen} />
              )}
            </div>
          )}
        </div>

        {a.duplicates.length > 0 && (
          <div className="space-y-0.5 bg-danger px-3 py-1 text-xs text-on-danger">
            {a.duplicates.map((d) => (
              <p key={d.otherRequestId + d.kind}>
                <Link href={`/requests/${d.otherRequestId}`} className="underline">
                  {t(d.kind === 'EXACT' ? 'requests.gallery.dupExact' : 'requests.gallery.dupNear', { number: d.otherRequestNumber })}
                </Link>
              </p>
            ))}
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2 border-t border-white/10 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{item.lineNo > 0 ? `${t('requests.viewer.line', { n: item.lineNo })} · ${item.lineLabel}` : ''}</span>
          {renderActions?.(item)}
          <span className="num text-xs" dir="ltr">
            <Num value={index + 1} /> / <Num value={n} />
          </span>
        </div>

        {n > 1 && (
          <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-white/10 p-2">
            {items.map((it) => {
              const active = it.attachment.id === a.id;
              return (
                <button
                  key={it.attachment.id}
                  type="button"
                  data-testid="evidence-thumb"
                  aria-current={active}
                  onClick={() => onActiveChange(it.attachment.id)}
                  className={cn('relative h-12 w-12 shrink-0 overflow-hidden rounded bg-white/10', active && 'ring-2 ring-brass')}
                >
                  {it.attachment.mimeType === 'application/pdf' ? (
                    <Icon as={FileText} className="mx-auto" />
                  ) : (
                    <img src={it.attachment.thumbUrl || it.attachment.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                  {it.lineNo > 0 && <span className="num absolute bottom-0 start-0 bg-black/60 px-1 text-[10px] leading-4">#{it.lineNo}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {fsModal && (
        <Modal open onClose={() => setFsModal(false)} size="xl" title={t('requests.viewer.fullscreen')}>
          <EvidenceViewer items={items} activeId={a.id} onActiveChange={onActiveChange} variant="panel" renderActions={renderActions} className="h-[70dvh]" embedded />
        </Modal>
      )}
    </>
  );
}
