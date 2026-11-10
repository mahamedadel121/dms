'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Banner, Button, Code, FileDrop, Modal, useToast } from '@/components/ui';

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
        <div className="mt-4 space-y-3 text-sm" data-testid="import-result">
          <Banner tone={result.errors.length > 0 ? 'danger' : 'success'}>
            <span className="num">{t('import.created', { n: result.created })}</span> · <span className="num">{t('import.updated', { n: result.updated })}</span>
            {result.errors.length > 0 && (
              <>
                {' · '}
                <span className="num font-semibold">{t('import.errors', { n: result.errors.length })}</span>
              </>
            )}
          </Banner>
          {result.errors.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded border border-hairline">
              <table className="w-full text-sm">
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i} className="border-b border-hairline last:border-0">
                      <td className="w-24 px-3 py-1.5 text-ink-3">
                        <Code>{t('import.row', { row: e.row })}</Code>
                      </td>
                      <td className="px-3 py-1.5 text-danger">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
