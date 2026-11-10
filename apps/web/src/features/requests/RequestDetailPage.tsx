'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Download, FileText, Lock } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatEgp } from '@/lib/format';
import { Badge, Card, ErrorBlock, LoadingBlock, PageHeader } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useTr } from '../common/useTr';
import { ActionPanel } from './ActionPanel';
import { CorrectionModal } from './CorrectionModal';
import { EditLineModal } from './EditLineModal';
import { LineCard } from './LineCard';
import { ProgressBar } from './ProgressBar';
import { Timeline } from './Timeline';
import { odometerInfo, statusTone } from './helpers';
import type { LineDto, RequestDetail } from '../types';

export function RequestDetailPage({ id }: { id: string }) {
  const { t, locale } = useTr();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['request', id],
    queryFn: () => api.get<RequestDetail>(`/requests/${id}`),
    refetchInterval: 30_000,
  });
  const reload = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['request', id] });
    void qc.invalidateQueries({ queryKey: ['queue'] });
    void qc.invalidateQueries({ queryKey: ['queue-counters'] });
  }, [qc, id]);

  const [editLine, setEditLine] = useState<LineDto | null>(null);
  const [corr, setCorr] = useState<{ open: boolean; target?: string }>({ open: false });
  const [pdfBusy, setPdfBusy] = useState(false);

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !q.data) return <ErrorBlock message={errorMessage(q.error)} />;
  const d = q.data;
  const my = d.myActions;
  const odo = odometerInfo(d);
  const m = d.module as Record<string, unknown>;
  const submitterName = d.submitter?.fullName ?? d.submittedByUser?.fullName ?? '';
  const fail = (e: unknown) => {
    toast.error(e);
    reload();
  };
  const originalTotal = d.totals.original;
  const finalTotal = d.totals.final;

  const openPdf = async (download: boolean) => {
    setPdfBusy(true);
    try {
      const { blob, fileName } = await api.blob(`/requests/${id}/pdf`);
      const url = URL.createObjectURL(blob);
      if (download) {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName.endsWith('.pdf') ? fileName : `${d.number}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(url, '_blank', 'noopener');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(e);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Link href="/inbox" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" aria-hidden /> {t('requests.back')}
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {d.number}
            <Badge tone={statusTone(d.status)}>{t(`requests.status.${d.status}`)}</Badge>
            {d.hasDuplicateWarning && (
              <Badge tone="red" className="gap-1">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                {t('requests.inbox.duplicate')}
              </Badge>
            )}
          </span>
        }
        subtitle={locale === 'ar' ? d.requestType.nameAr : d.requestType.nameEn}
        actions={
          <>
            <Button variant="secondary" icon={<FileText className="h-4 w-4" />} loading={pdfBusy} onClick={() => openPdf(false)}>
              {d.finalPdf ? t('requests.pdf.final') : t('requests.pdf.preview')}
            </Button>
            {d.finalPdf && (
              <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => openPdf(true)}>
                {t('requests.pdf.download')}
              </Button>
            )}
          </>
        }
      />

      {d.lock && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Lock className="h-4 w-4" aria-hidden /> {t('requests.lock.beingReviewedBy', { name: d.lock.userName })}
        </div>
      )}
      {d.status === 'REJECTED' && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          <b>{t('requests.rejectedReason')}:</b> {d.rejectionReason}
        </div>
      )}

      <Card title={t('requests.progress.title')}>
        <ProgressBar steps={d.steps} />
      </Card>

      <Card title={t('requests.header.title')}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-4">
          <Field label={t('requests.header.driver')} value={submitterName} />
          <Field label={t('requests.header.vehicle')} value={String(m.vehicleNumber ?? '')} />
          <Field label={t('requests.header.vehicleType')} value={String(m.vehicleTypeName ?? m.vehicleTypeCode ?? '')} />
          <Field label={t('requests.header.costCenter')} value={String(m.costCenterCode ?? '')} />
          <Field label={t('requests.header.submittedAt')} value={formatDateTime(d.submittedAt)} />
          <Field label={t('requests.header.channel')} value={d.channel === 'TELEGRAM' ? 'Telegram' : 'Web'} />
          {d.paidAt && <Field label={t('requests.header.paidAt')} value={formatDateTime(d.paidAt)} />}
          <div>
            <dt className="text-xs text-slate-500">{t('requests.header.odometer')}</dt>
            <dd className="font-semibold tabular-nums">
              {odo.current ?? '—'}
              {odo.last !== null && (
                <span className={odo.lower ? 'ms-2 text-xs font-bold text-red-700' : 'ms-2 text-xs font-normal text-slate-500'}>
                  {t('requests.header.lastOdometer', { n: odo.last })}
                  {odo.delta !== null && ` (${odo.delta >= 0 ? '+' : ''}${odo.delta})`}
                  {odo.lower && ` — ${t('requests.header.odometerLower')}`}
                </span>
              )}
            </dd>
          </div>
          <div className="col-span-2 md:col-span-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-slate-100 pt-3">
            <div>
              <span className="text-xs text-slate-500">{t('requests.header.originalTotal')} </span>
              <span className={`tabular-nums ${originalTotal !== finalTotal ? 'line-through text-slate-500' : 'font-semibold'}`}>{formatEgp(originalTotal, locale)}</span>
            </div>
            {originalTotal !== finalTotal && (
              <div>
                <span className="text-xs text-slate-500">{t('requests.header.finalTotal')} </span>
                <span className="text-lg font-bold text-purple-800 tabular-nums">{formatEgp(finalTotal, locale)}</span>
              </div>
            )}
          </div>
        </dl>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <h2 className="text-base font-bold text-slate-800">{t('requests.lines.title', { n: d.lines.length })}</h2>
          {d.lines.map((l) => (
            <LineCard
              key={l.id}
              line={l}
              corrections={d.corrections}
              canEdit={!!my && (my.editAmounts || my.reclassify)}
              canCorrect={!!my?.requestCorrection}
              onEdit={() => setEditLine(l)}
              onCorrect={(target) => setCorr({ open: true, target })}
            />
          ))}
        </div>
        <div className="space-y-4">
          <ActionPanel detail={d} onChanged={reload} onOpenCorrection={() => setCorr({ open: true })} />
          <Card title={t('requests.timeline.title')}>
            <Timeline events={d.events} corrections={d.corrections} />
          </Card>
        </div>
      </div>

      {my && (
        <>
          <EditLineModal
            detail={d}
            line={editLine}
            onClose={() => setEditLine(null)}
            onDone={() => {
              toast.success(t('requests.edit.saved'));
              setEditLine(null);
              reload();
            }}
            onError={fail}
          />
          <CorrectionModal
            open={corr.open}
            onClose={() => setCorr({ open: false })}
            detail={d}
            initialTarget={corr.target}
            onDone={() => {
              toast.success(t('requests.action.correctionSent'));
              setCorr({ open: false });
              reload();
            }}
            onError={fail}
          />
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-semibold">{value || '—'}</dd>
    </div>
  );
}
