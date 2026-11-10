'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Maximize2, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useTr } from '../common/useTr';
import type { AttachmentDto } from '../types';

interface Props {
  attachments: AttachmentDto[];
  /** optional per-image extra control (e.g. "request correction on this image") */
  renderActions?: (a: AttachmentDto) => React.ReactNode;
}

/** Per-line image gallery: thumbnails + viewer with zoom, rotate, full-screen and download. */
export function ImageGallery({ attachments, renderActions }: Props) {
  const { t } = useTr();
  const [open, setOpen] = useState<number | null>(null);
  if (attachments.length === 0) return <p className="text-sm text-slate-500">{t('requests.gallery.none')}</p>;

  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {attachments.map((a, i) => (
          <li key={a.id} className="w-24">
            <button
              type="button"
              onClick={() => setOpen(i)}
              className={`relative block h-24 w-24 overflow-hidden rounded-md border bg-slate-100 ${
                a.isCurrent ? 'border-slate-300' : 'border-dashed border-amber-400 opacity-70'
              }`}
              aria-label={t('requests.gallery.open')}
            >
              <img src={a.thumbUrl || a.url} alt="" className="h-full w-full object-cover" loading="lazy" />
              {a.duplicates.length > 0 && (
                <span className="absolute end-1 top-1 rounded bg-red-600 p-0.5 text-white">
                  <AlertTriangle size={14} />
                </span>
              )}
            </button>
            {!a.isCurrent && <p className="mt-0.5 text-xs text-amber-700">{t('requests.gallery.superseded')}</p>}
            {a.duplicates.map((d) => (
              <Link
                key={d.otherRequestId + d.kind}
                href={`/requests/${d.otherRequestId}`}
                className="mt-0.5 block text-xs text-red-700 underline"
              >
                {t(d.kind === 'EXACT' ? 'requests.gallery.dupExact' : 'requests.gallery.dupNear', { number: d.otherRequestNumber })}
              </Link>
            ))}
            {renderActions?.(a)}
          </li>
        ))}
      </ul>
      {open !== null && <Viewer attachments={attachments} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

function Viewer({
  attachments,
  index,
  onIndex,
  onClose,
}: {
  attachments: AttachmentDto[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const { t } = useTr();
  const a = attachments[index]!;
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // reset view when switching image
  useEffect(() => {
    setZoom(1);
    setRot(0);
  }, [index]);

  const go = useCallback(
    (d: number) => onIndex((index + d + attachments.length) % attachments.length),
    [index, attachments.length, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(6, z + 0.25));
      else if (e.key === '-') setZoom((z) => Math.max(0.25, z - 0.25));
      else if (e.key === 'r' || e.key === 'R') setRot((r) => (r + 90) % 360);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  const fullscreen = () => {
    const el = box.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  const btn = 'rounded-md bg-white/10 p-2 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white';
  return (
    <div ref={box} className="fixed inset-0 z-50 flex flex-col bg-black/90" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between gap-2 p-2 text-white" dir="ltr">
        <span className="text-sm">
          {index + 1} / {attachments.length}
        </span>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className={btn} onClick={() => setZoom((z) => Math.min(6, z + 0.25))} aria-label={t('requests.gallery.zoomIn')}>
            <ZoomIn size={18} />
          </button>
          <button type="button" className={btn} onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} aria-label={t('requests.gallery.zoomOut')}>
            <ZoomOut size={18} />
          </button>
          <button type="button" className={btn} onClick={() => setRot((r) => (r + 90) % 360)} aria-label={t('requests.gallery.rotate')}>
            <RotateCw size={18} />
          </button>
          <button type="button" className={btn} onClick={fullscreen} aria-label={t('requests.gallery.fullscreen')}>
            <Maximize2 size={18} />
          </button>
          <a className={btn} href={a.url} download target="_blank" rel="noreferrer" aria-label={t('requests.gallery.download')}>
            <Download size={18} />
          </a>
          <button type="button" className={btn} onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto" dir="ltr">
        {attachments.length > 1 && (
          <>
            <button type="button" className={`${btn} absolute start-2 z-10`} onClick={() => go(-1)} aria-label="prev">
              <ChevronLeft size={22} />
            </button>
            <button type="button" className={`${btn} absolute end-2 z-10`} onClick={() => go(1)} aria-label="next">
              <ChevronRight size={22} />
            </button>
          </>
        )}
        <img
          src={a.url}
          alt=""
          draggable={false}
          style={{ transform: `rotate(${rot}deg) scale(${zoom})`, transition: 'transform .15s' }}
          className="max-h-full max-w-full select-none object-contain"
          onWheel={(e) => setZoom((z) => Math.min(6, Math.max(0.25, z + (e.deltaY < 0 ? 0.15 : -0.15))))}
        />
      </div>
      {(a.duplicates.length > 0 || !a.isCurrent) && (
        <div className="space-y-1 bg-black/70 p-2 text-sm text-white">
          {!a.isCurrent && <p className="text-amber-300">{t('requests.gallery.superseded')}</p>}
          {a.duplicates.map((d) => (
            <p key={d.otherRequestId + d.kind}>
              <Link href={`/requests/${d.otherRequestId}`} className="text-red-300 underline">
                {t(d.kind === 'EXACT' ? 'requests.gallery.dupExact' : 'requests.gallery.dupNear', { number: d.otherRequestNumber })}
              </Link>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
