'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, Download, FileText, Lock, MessageSquareWarning } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCount, formatDay, formatTime, ltrIsolate } from '@/lib/format';
import { useMediaQuery } from '@/lib/useMediaQuery';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Code,
  DateText,
  DL,
  DLItem,
  ErrorBlock,
  Money,
  Num,
  Page,
  PageHeader,
  Seal,
  SkeletonCard,
  StatusChip,
  useToast,
  type SealKind,
} from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { useTr } from '../common/useTr';
import { ActionPanel } from './ActionPanel';
import { CorrectionModal } from './CorrectionModal';
import { EditLineModal } from './EditLineModal';
import { EvidenceViewer } from './EvidenceViewer';
import { buildEvidence } from './evidence';
import { LineCard } from './LineCard';
import { RouteStepper } from './RouteStepper';
import { Timeline } from './Timeline';
import { odometerInfo } from './helpers';
import type { LineDto, RequestDetail } from '../types';

export function RequestDetailPage({ id }: { id: string }) {
  const { t, locale } = useTr();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const xl = useMediaQuery('(min-width: 1280px)');
  const md = useMediaQuery('(min-width: 768px)');
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [seal, setSeal] = useState<{ kind: SealKind; at: number } | null>(null);
  const [moreInfo, setMoreInfo] = useState(false);

  // The seal stays until the next data load completes, plus 1200ms.
  const sealAt = seal?.at ?? 0;
  useEffect(() => {
    if (!seal || q.isFetching || q.dataUpdatedAt <= sealAt) return;
    const timer = setTimeout(() => setSeal(null), 1200);
    return () => clearTimeout(timer);
  }, [seal, sealAt, q.isFetching, q.dataUpdatedAt]);

  const d = q.data;
  const items = useMemo(() => (d ? buildEvidence(d.lines, locale) : []), [d, locale]);

  if (q.isLoading) {
    return (
      <Page testId="page-request-detail" width="wide">
        <SkeletonCard lines={6} />
      </Page>
    );
  }
  if (q.isError || !d) {
    return (
      <Page testId="page-request-detail" width="wide">
        <ErrorBlock message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      </Page>
    );
  }

  const my = d.myActions;
  const odo = odometerInfo(d);
  const m = d.module as Record<string, unknown>;
  const submitterName = d.submitter?.fullName ?? d.submittedByUser?.fullName ?? '';
  const fail = (e: unknown) => {
    toast.error(e);
    reload();
  };
  const activeAttachmentId = activeId ?? items[0]?.attachment.id ?? null;
  const lockedByOther = !!d.lock && d.lock.userId !== me?.id;
  const vehicleNumber = String(m.vehicleNumber ?? '');
  const vehicleType = String(m.vehicleTypeName ?? m.vehicleTypeCode ?? '');
  const costCenter = String(m.costCenterCode ?? '');
  const channel = d.channel === 'TELEGRAM' ? 'Telegram' : 'Web';

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

  const staticSeal: SealKind | null = d.status === 'PAID' ? 'paid' : d.status === 'REJECTED' ? 'rejected' : d.status === 'APPROVED' ? 'approved' : null;
  const sealSub = d.status === 'PAID' ? formatDay(d.paidAt, locale, 'short') : undefined;
  const sealSize = md ? 104 : 76;

  const viewer = (variant: 'panel' | 'carousel') => (
    <EvidenceViewer
      items={items}
      activeId={activeAttachmentId}
      onActiveChange={setActiveId}
      variant={variant}
      className={variant === 'panel' ? 'sticky top-[84px] h-[calc(100dvh-84px-104px)]' : undefined}
      renderActions={
        my?.requestCorrection
          ? (item) => (
              <button
                type="button"
                onClick={() => setCorr({ open: true, target: `att:${item.attachment.id}` })}
                className="inline-flex items-center gap-1 text-xs text-viewer-ink underline"
              >
                <Icon as={MessageSquareWarning} size={14} /> {t('requests.line.askFix')}
              </button>
            )
          : undefined
      }
    />
  );

  const fullDetails = (
    <DL cols={3}>
      <DLItem label={t('requests.header.driver')}>
        <span className="inline-flex items-center gap-2">
          <Avatar name={submitterName} size={24} />
          {submitterName || '—'}
        </span>
      </DLItem>
      <DLItem label={t('requests.header.vehicle')}>
        {vehicleNumber ? <Code>{vehicleNumber}</Code> : '—'}
        {vehicleType && <div className="text-xs font-normal text-ink-3">{vehicleType}</div>}
      </DLItem>
      <DLItem label={t('requests.header.costCenter')}>{costCenter ? <Code>{costCenter}</Code> : '—'}</DLItem>
      <DLItem label={t('requests.header.submittedAt')}>
        <DateText value={d.submittedAt} mode="long" /> <span className="num text-ink-3">{formatTime(d.submittedAt)}</span>
      </DLItem>
      <DLItem label={t('requests.header.channel')}>{channel}</DLItem>
      {d.paidAt && (
        <DLItem label={t('requests.header.paidAt')}>
          <DateText value={d.paidAt} mode="dayTime" />
        </DLItem>
      )}
      <DLItem label={t('requests.header.odometer')}>
        <Num value={odo.current} />
        {odo.last !== null && (
          <div className={odo.lower ? 'text-xs font-medium text-danger' : 'text-xs font-normal text-ink-3'}>
            {t('requests.header.lastOdometer', { n: ltrIsolate(formatCount(odo.last)) })}
            {odo.delta !== null && ` ${ltrIsolate(`(${odo.delta >= 0 ? '+' : ''}${formatCount(odo.delta)})`)}`}
            {odo.lower && ` — ${t('requests.header.odometerLower')}`}
          </div>
        )}
      </DLItem>
    </DL>
  );

  return (
    <Page testId="page-request-detail" width="wide" className={my ? 'pb-24' : undefined}>
      <PageHeader
        back={{ href: '/inbox', label: t('requests.back') }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <Code className="text-2xl font-medium">
              <span data-testid="request-number">{d.number}</span>
            </Code>
            <span data-testid="request-status">
              <StatusChip kind="request" status={d.status} label={t(`requests.status.${d.status}`)} />
            </span>
            {d.hasDuplicateWarning && (
              <Badge tone="red" icon={<Icon as={AlertTriangle} size={14} />}>
                {t('requests.inbox.duplicate')}
              </Badge>
            )}
          </span>
        }
        subtitle={locale === 'ar' ? d.requestType.nameAr : d.requestType.nameEn}
        actions={
          <>
            <Button
              variant="secondary"
              data-testid="pdf-preview"
              icon={<Icon as={FileText} size={16} />}
              loading={pdfBusy}
              onClick={() => openPdf(false)}
            >
              {d.finalPdf ? t('requests.pdf.final') : t('requests.pdf.preview')}
            </Button>
            {d.finalPdf && (
              <Button variant="secondary" data-testid="pdf-download" icon={<Icon as={Download} size={16} />} onClick={() => openPdf(true)}>
                {t('requests.pdf.download')}
              </Button>
            )}
          </>
        }
      />

      {(lockedByOther || d.status === 'REJECTED' || d.status === 'CORRECTION_REQUESTED') && (
        <div className="space-y-2">
          {lockedByOther && d.lock && (
            <Banner tone="warning" icon={<Icon as={Lock} size={18} />}>
              {t('requests.lock.beingReviewedBy', { name: d.lock.userName })}
            </Banner>
          )}
          {d.status === 'REJECTED' && (
            <Banner tone="danger">
              <b>{t('requests.rejectedReason')}:</b> <span dir="auto">{d.rejectionReason}</span>
            </Banner>
          )}
          {d.status === 'CORRECTION_REQUESTED' && <Banner tone="warning">{t('requests.banner.awaitingDriver')}</Banner>}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="min-w-0 space-y-6 xl:col-span-7">
          <Card accent="rule" className="relative">
            <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <div className="space-y-2">
                <div className="text-13 text-ink-2">{t('requests.header.finalTotal')}</div>
                <span data-testid="request-total" className="block">
                  <Money size="hero" value={d.totals.final} original={d.totals.original} />
                </span>
              </div>
              <div className="pb-20 md:pb-0">
                {md || moreInfo ? (
                  fullDetails
                ) : (
                  <div className="space-y-1 text-sm text-ink-2">
                    <div>
                      {[submitterName, vehicleNumber, costCenter].filter(Boolean).map((x, i) => (
                        <span key={i}>
                          {i > 0 && ' · '}
                          <bdi>{x}</bdi>
                        </span>
                      ))}
                    </div>
                    <div className="text-xs text-ink-3">
                      <DateText value={d.submittedAt} mode="dayTime" /> · {channel}
                    </div>
                  </div>
                )}
                {!md && (
                  <button type="button" aria-expanded={moreInfo} onClick={() => setMoreInfo((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-sm text-link">
                    {t('requests.header.more')}
                    <Icon as={ChevronDown} size={16} className={moreInfo ? 'rotate-180' : ''} />
                  </button>
                )}
              </div>
            </div>
            {(seal || staticSeal) && (
              <div className="pointer-events-none absolute end-4 top-4 md:bottom-4 md:top-auto">
                {seal ? <Seal kind={seal.kind} animate size={sealSize} /> : staticSeal && <Seal kind={staticSeal} sub={sealSub} size={sealSize} />}
              </div>
            )}
          </Card>

          {!xl && viewer('carousel')}

          <Card title={t('requests.progress.title')}>
            {md ? <RouteStepper steps={d.steps} /> : <RouteStepper steps={d.steps} compact />}
          </Card>

          {d.lines.length > 0 && (
          <Card title={t('requests.lines.title', { n: d.lines.length })} padded={false}>
            {d.lines.map((l) => (
              <LineCard
                key={l.id}
                line={l}
                corrections={d.corrections}
                canEdit={!!my && (my.editAmounts || my.reclassify)}
                canCorrect={!!my?.requestCorrection}
                activeAttachmentId={activeAttachmentId}
                onSelectAttachment={setActiveId}
                onEdit={() => setEditLine(l)}
                onCorrect={(target) => setCorr({ open: true, target })}
              />
            ))}
          </Card>
          )}

          <Card title={t('requests.timeline.title')}>
            <Timeline events={d.events} corrections={d.corrections} />
          </Card>
        </div>

        {xl && <div className="xl:col-span-5">{viewer('panel')}</div>}
      </div>

      <ActionPanel
        detail={d}
        onChanged={reload}
        onOpenCorrection={() => setCorr({ open: true })}
        onSealed={(kind) => setSeal({ kind, at: Date.now() })}
      />

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
    </Page>
  );
}
