'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Button, FileDrop, Modal, useToast } from '@/components/ui';

interface ImportResult {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
  dryRun?: boolean;
}

/** xlsx import: dry run first (row errors), then apply. */
export function ImportDialog({ resource, onClose, onDone }: { resource: string; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    try {
      const res = await api.upload<ImportResult>(`/${resource}/import`, file, file.name, undefined, dryRun ? { dryRun: 1 } : undefined);
      if (dryRun) setResult(res);
      else {
        toast.success(t('import.done'));
        onDone();
        onClose();
      }
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('import.title')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button variant="secondary" disabled={!file} loading={busy} onClick={() => void run(true)}>
            {t('import.dryRun')}
          </Button>
          <Button disabled={!file || !result || result.errors.length > 0} loading={busy} onClick={() => void run(false)}>
            {t('import.apply')}
          </Button>
        </>
      }
    >
      <FileDrop
        accept=".xlsx"
        onFile={(f) => {
          setFile(f);
          setResult(null);
        }}
        label={file ? file.name : t('import.chooseFile')}
      />
      {result && (
        <div className="mt-4 space-y-2 text-sm">
          <p className="font-semibold text-emerald-700">{t('import.created', { n: result.created })}</p>
          <p className="font-semibold text-sky-700">{t('import.updated', { n: result.updated })}</p>
          {result.errors.length > 0 && (
            <div>
              <p className="mb-1 font-semibold text-red-700">{t('import.errors', { n: result.errors.length })}</p>
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md bg-red-50 p-2 text-red-800">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    <b>{t('import.row', { row: e.row })}:</b> {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
