'use client';

import { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/api';

import { useT } from '@/lib/i18n';
import { Button, Card, ConfirmDialog, DateText, FileDrop, Icon, Modal, Select, SkeletonCard, useToast } from '@/components/ui';

interface SignatureRow {
  id: string;
  url: string;
  isActive: boolean;
  createdAt: string;
}
interface SignatureInfo {
  current: SignatureRow | null;
  history: SignatureRow[];
}

const MAX_BYTES = 2 * 1024 * 1024;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Crops `src` to the pixel area and returns a PNG blob (transparency kept). */
export async function cropToPng(src: string, area: Area): Promise<Blob> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(area.width);
  canvas.height = Math.round(area.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('crop failed'))), 'image/png'));
}

/**
 * Signature upload with crop + preview for a user (`owner="users"`) or a driver (`owner="submitters"`).
 * Needs `signatures.manage`; show it only when `can('signatures.manage')`.
 */
export function SignatureManager({ owner, ownerId, canEdit = true, onChanged }: { owner: 'users' | 'submitters'; ownerId: string; canEdit?: boolean; onChanged?: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const base = `/${owner}/${ownerId}/signature`;
  const key = ['signature', owner, ownerId];
  const info = useQuery({ queryKey: key, queryFn: () => api.get<SignatureInfo>(base) });

  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState('3');
  const [area, setArea] = useState<Area | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => () => void (src && URL.revokeObjectURL(src)), [src]);

  const onFile = (f: File) => {
    if (!/^image\/(png|jpeg)$/.test(f.type)) return toast.error(t('sig.hint'));
    if (f.size > MAX_BYTES) return toast.error(t('sig.hint'));
    setZoom(1);
    setCrop({ x: 0, y: 0 });
    setSrc(URL.createObjectURL(f));
  };

  // live preview of the crop result
  useEffect(() => {
    if (!src || !area) return;
    let url: string | null = null;
    let cancelled = false;
    cropToPng(src, area)
      .then((b) => {
        if (cancelled) return;
        url = URL.createObjectURL(b);
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return url;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [src, area]);

  const onComplete = useCallback((_: Area, px: Area) => setArea(px), []);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ['users'] });
    onChanged?.();
  };
  const upload = useMutation({
    mutationFn: async () => {
      const blob = await cropToPng(src!, area!);
      return api.upload(base, blob, 'signature.png');
    },
    onSuccess: () => {
      toast.success(t('sig.uploaded'));
      closeCropper();
      invalidate();
    },
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({
    mutationFn: () => api.del(base),
    onSuccess: () => {
      toast.success(t('sig.removed'));
      setConfirmDelete(false);
      invalidate();
    },
    onError: (e) => toast.error(e),
  });

  function closeCropper() {
    setSrc(null);
    setArea(null);
    setPreview(null);
  }

  if (info.isLoading) return <SkeletonCard lines={3} />;
  const cur = info.data?.current ?? null;
  const history = (info.data?.history ?? []).filter((h) => h.id !== cur?.id);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium text-ink-2">{t('sig.current')}</p>
        {cur ? (
          <div className="flex flex-wrap items-center gap-3">
            <img src={cur.url} alt="signature" className="h-20 max-w-xs rounded border border-hairline bg-surface object-contain p-1" />
            <span className="text-xs text-ink-3"><DateText value={cur.createdAt} mode="dayTime" /></span>
            {canEdit && (
              <Button size="sm" variant="ghost" icon={<Icon as={Trash2} size={16} />} onClick={() => setConfirmDelete(true)}>
                {t('sig.remove')}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-3">{t('profile.noSignature')}</p>
        )}
      </div>
      {canEdit && <FileDrop accept="image/png,image/jpeg" onFile={onFile} label={t('sig.choose')} hint={t('sig.hint')} />}
      {history.length > 0 && (
        <Card title={t('sig.history')}>
          <div className="flex flex-wrap gap-3">
            {history.map((h) => (
              <figure key={h.id} className="text-center">
                <img src={h.url} alt="old signature" className="h-14 rounded border border-hairline bg-surface object-contain p-1 opacity-70" />
                <figcaption className="mt-1 text-[11px] text-ink-3"><DateText value={h.createdAt} mode="dayTime" /></figcaption>
              </figure>
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={!!src}
        onClose={closeCropper}
        size="lg"
        title={t('sig.title')}
        footer={
          <>
            <Button loading={upload.isPending} disabled={!area} onClick={() => upload.mutate()}>
              {t('sig.upload')}
            </Button>
            <Button variant="secondary" onClick={closeCropper}>
              {t('common.cancel')}
            </Button>
          </>
        }
      >
        {src && (
          <div className="space-y-3">
            <div className="relative h-64 w-full overflow-hidden rounded bg-surface-3" dir="ltr">
              <Cropper image={src} crop={crop} zoom={zoom} aspect={Number(aspect)} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onComplete} showGrid={false} />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex flex-1 items-center gap-2 text-sm text-ink-2">
                {t('sig.zoom')}
                <input type="range" min={1} max={4} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1" />
              </label>
              <Select
                className="w-28"
                value={aspect}
                options={[
                  { value: '3', label: '3 : 1' },
                  { value: '2', label: '2 : 1' },
                  { value: '1', label: '1 : 1' },
                ]}
                onChange={setAspect}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-ink-3">{t('sig.preview')}</p>
              <div className="flex h-24 items-center justify-center rounded border border-dashed border-line bg-surface">
                {preview && <img src={preview} alt="preview" className="max-h-20 max-w-full object-contain" />}
              </div>
            </div>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} danger loading={remove.isPending} onConfirm={() => remove.mutate()} message={t('sig.remove') + '?'} />
    </div>
  );
}
