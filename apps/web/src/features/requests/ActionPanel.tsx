'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Banknote, Check, CornerUpLeft, Lock, MessageSquareWarning, MoreHorizontal, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, IconButton } from '@/components/ui/Button';
import { Checkbox, FormField, Textarea } from '@/components/ui/Fields';
import { Icon } from '@/components/ui/Icon';
import { Menu, type MenuItem } from '@/components/ui/Overlay';
import type { SealKind } from '@/components/ui/Seal';
import { useIsMobile } from '@/lib/useMediaQuery';
import { LookupSelect } from '@/components/ui/Inputs2';
import { Modal } from '@/components/ui/Modal';
import { Badge, Banner } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useTr } from '../common/useTr';
import type { RequestDetail } from '../types';

type Dlg = null | 'approve' | 'sendBack' | 'reject';

const HEARTBEAT_MS = 60_000;

export function ActionPanel({
  detail,
  onChanged,
  onOpenCorrection,
  onSealed,
}: {
  detail: RequestDetail;
  onChanged: () => void;
  onOpenCorrection: () => void;
  onSealed?: (kind: SealKind) => void;
}) {
  const { t, locale } = useTr();
  const { me, can } = useAuth();
  const toast = useToast();
  const mobile = useIsMobile();
  const my = detail.myActions;
  const [dlg, setDlg] = useState<Dlg>(null);
  const [comment, setComment] = useState('');
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [treasuryId, setTreasuryId] = useState('');
  const [holding, setHolding] = useState(false);
  const heldRef = useRef(false);

  const lockedByOther = !!detail.lock && detail.lock.userId !== me?.id;
  const lockedByMe = !!detail.lock && detail.lock.userId === me?.id;
  const id = detail.id;

  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.code === 'LOCKED') toast.error(t('requests.lock.lockedBy', { name: String((e.details as { userName?: string } | undefined)?.userName ?? detail.lock?.userName ?? '') }));
    else toast.error(e);
    onChanged();
  };

  // keep the lock alive while we hold it; release on leave
  useEffect(() => {
    heldRef.current = holding || lockedByMe;
  }, [holding, lockedByMe]);
  useEffect(() => {
    if (!holding) return;
    const i = setInterval(() => {
      api.post(`/requests/${id}/lock/heartbeat`).catch(() => undefined);
    }, HEARTBEAT_MS);
    return () => clearInterval(i);
  }, [holding, id]);
  useEffect(() => {
    return () => {
      if (heldRef.current) api.del(`/requests/${id}/lock`).catch(() => undefined);
    };
  }, [id]);

  const claim = useMutation({
    mutationFn: () => api.post(`/requests/${id}/lock`),
    onSuccess: () => {
      setHolding(true);
      onChanged();
    },
    onError: fail,
  });
  const release = useMutation({
    mutationFn: () => api.del(`/requests/${id}/lock`),
    onSuccess: () => {
      setHolding(false);
      onChanged();
    },
    onError: fail,
  });
  const force = useMutation({
    mutationFn: () => api.del(`/requests/${id}/lock`, { force: 1 }),
    onSuccess: () => {
      toast.success(t('requests.lock.forced'));
      onChanged();
    },
    onError: fail,
  });

  const close = () => {
    setDlg(null);
    setComment('');
  };
  const done = (msg: string, seal?: SealKind) => {
    toast.success(msg);
    if (seal) onSealed?.(seal);
    setHolding(false);
    heldRef.current = false;
    close();
    onChanged();
  };

  const stepPath = my ? `/requests/${id}/steps/${my.stepInstanceId}` : '';
  const approve = useMutation({
    mutationFn: () =>
      api.post(`${stepPath}/approve`, {
        comment: comment.trim() || undefined,
        checklist: my && my.checklist.length > 0 ? Object.fromEntries(my.checklist.map((c) => [c.key, !!checks[c.key]])) : undefined,
        actionData: my?.isPayment && treasuryId ? { treasuryId } : undefined,
      }),
    onSuccess: () => done(my?.isPayment ? t('requests.action.paidDone') : t('requests.action.approved'), my?.isPayment ? 'paid' : 'approved'),
    onError: fail,
  });
  const sendBack = useMutation({
    mutationFn: () => api.post(`${stepPath}/send-back`, { comment: comment.trim() }),
    onSuccess: () => done(t('requests.action.sentBack')),
    onError: fail,
  });
  const reject = useMutation({
    mutationFn: () => api.post(`${stepPath}/reject`, { reason: comment.trim() }),
    onSuccess: () => done(t('requests.action.rejected'), 'rejected'),
    onError: fail,
  });

  if (!my) {
    return null;
  }

  const missingRequired = my.checklist.filter((c) => c.required && !checks[c.key]);
  const canAct = !lockedByOther;
  const anyAction = my.approve || my.requestCorrection || my.sendBack || my.reject;
  const heldByMe = lockedByMe || holding;
  const canClaim = !lockedByOther && !heldByMe && can('requests.act');
  const approveLabel = my.isPayment ? t('requests.action.pay') : t('requests.action.approve');
  const approveIcon = <Icon as={my.isPayment ? Banknote : Check} size={16} />;

  // On a phone the primary button claims the lock first (when free), then opens the dialog.
  const startApprove = () => {
    if (canClaim && mobile) claim.mutate(undefined, { onSuccess: () => setDlg('approve') });
    else setDlg('approve');
  };

  const lockState = (
    <>
      {canClaim && (
        <Button size="sm" variant="secondary" icon={<Icon as={Lock} size={16} />} loading={claim.isPending} onClick={() => claim.mutate()} data-testid="action-claim">
          {t('requests.lock.claim')}
        </Button>
      )}
      {heldByMe && (
        <>
          <Badge tone="navy" icon={<Icon as={Lock} size={14} />}>
            {t('requests.lock.heldByYou')}
          </Badge>
          <Button size="sm" variant="link" loading={release.isPending} onClick={() => release.mutate()} data-testid="action-release">
            {t('requests.lock.release')}
          </Button>
        </>
      )}
      {lockedByOther && (
        <>
          <Badge tone="amber" icon={<Icon as={Lock} size={14} />}>
            {t('requests.lock.beingReviewedBy', { name: detail.lock?.userName ?? '' })}
          </Badge>
          {can('requests.force_unlock') && (
            <Button size="sm" variant="danger-outline" loading={force.isPending} onClick={() => force.mutate()} data-testid="action-force">
              {t('requests.lock.force')}
            </Button>
          )}
        </>
      )}
    </>
  );

  const moreItems: MenuItem[] = [
    { key: 'claim', label: t('requests.lock.claim'), icon: <Icon as={Lock} size={16} />, onSelect: () => claim.mutate(), hidden: !canClaim, testId: 'action-claim' },
    { key: 'release', label: t('requests.lock.release'), onSelect: () => release.mutate(), hidden: !heldByMe, testId: 'action-release' },
    { key: 'force', label: t('requests.lock.force'), onSelect: () => force.mutate(), hidden: !(lockedByOther && can('requests.force_unlock')), danger: true, testId: 'action-force' },
    { key: 'sendback', label: t('requests.action.sendBack'), icon: <Icon as={CornerUpLeft} size={16} mirror />, onSelect: () => setDlg('sendBack'), hidden: !my.sendBack, disabled: !canAct, testId: 'action-sendback' },
    { key: 'reject', label: t('requests.action.reject'), icon: <Icon as={X} size={16} />, onSelect: () => setDlg('reject'), hidden: !my.reject, disabled: !canAct, danger: true, testId: 'action-reject' },
  ];

  const bar = mobile ? (
    <div
      data-testid="action-bar"
      data-no-print
      className="fixed inset-x-0 bottom-0 z-bar flex items-center gap-2 border-t border-hairline bg-surface px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-bar"
    >
      <Menu
        align="start"
        testId="action-more-menu"
        items={moreItems}
        trigger={<IconButton variant="secondary" size="md" icon={<Icon as={MoreHorizontal} />} label={t('requests.action.more')} data-testid="action-more" />}
      />
      {lockedByOther && (
        <Badge tone="amber" icon={<Icon as={Lock} size={14} />}>
          {detail.lock?.userName ?? ''}
        </Badge>
      )}
      {my.requestCorrection && (
        <Button variant="secondary" size="lg" className="flex-1" disabled={!canAct} icon={<Icon as={MessageSquareWarning} size={16} />} onClick={onOpenCorrection} data-testid="action-correction">
          {t('requests.action.requestCorrection')}
        </Button>
      )}
      {my.approve && (
        <Button size="lg" className="flex-[1.4]" disabled={!canAct} loading={claim.isPending} icon={approveIcon} onClick={startApprove} data-testid="action-approve">
          {approveLabel}
        </Button>
      )}
    </div>
  ) : (
    <div
      data-testid="action-bar"
      data-no-print
      className="sticky bottom-4 z-bar flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-surface px-5 py-3 shadow-bar"
    >
      <div className="flex flex-wrap items-center gap-2">{lockState}</div>
      {!anyAction && <p className="text-sm text-ink-3">{t('requests.action.noneAtStep')}</p>}
      {(my.editAmounts || my.reclassify) && <p className="hidden text-xs text-ink-3 xl:block">{t('requests.action.editHint')}</p>}
      <div className="ms-auto flex flex-wrap gap-2">
        {my.reject && (
          <Button variant="danger-outline" disabled={!canAct} icon={<Icon as={X} size={16} />} onClick={() => setDlg('reject')} data-testid="action-reject">
            {t('requests.action.reject')}
          </Button>
        )}
        {my.sendBack && (
          <Button variant="secondary" disabled={!canAct} icon={<Icon as={CornerUpLeft} size={16} mirror />} onClick={() => setDlg('sendBack')} data-testid="action-sendback">
            {t('requests.action.sendBack')}
          </Button>
        )}
        {my.requestCorrection && (
          <Button variant="secondary" disabled={!canAct} icon={<Icon as={MessageSquareWarning} size={16} />} onClick={onOpenCorrection} data-testid="action-correction">
            {t('requests.action.requestCorrection')}
          </Button>
        )}
        {my.approve && (
          <Button size="lg" disabled={!canAct} icon={approveIcon} onClick={startApprove} data-testid="action-approve">
            {approveLabel}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {bar}

      {/* approve / pay */}
      <Modal
        open={dlg === 'approve'}
        onClose={close}
        testId="approve-dialog"
        title={my.isPayment ? t('requests.action.payTitle') : t('requests.action.approveTitle')}
        footer={
          <>
            <Button loading={approve.isPending} disabled={missingRequired.length > 0} onClick={() => approve.mutate()} data-testid="approve-confirm">
              {approveLabel}
            </Button>
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {my.checklist.length > 0 && (
            <fieldset className="space-y-2 rounded border border-hairline p-3">
              {my.checklist.map((c) => (
                <div key={c.key}>
                  <Checkbox
                    checked={!!checks[c.key]}
                    onChange={(v) => setChecks((p) => ({ ...p, [c.key]: v }))}
                    data-testid={'approve-check-' + c.key}
                    label={
                      <span>
                        {locale === 'ar' ? c.labelAr : c.labelEn || c.labelAr}
                        {c.required && <span className="ms-1 text-danger">*</span>}
                      </span>
                    }
                  />
                </div>
              ))}
              {missingRequired.length > 0 && (
                <p className="flex items-center gap-1 text-xs text-danger">
                  <Icon as={AlertCircle} size={14} /> {t('requests.action.checklistRequired')}
                </p>
              )}
            </fieldset>
          )}
          {my.isPayment && (
            <FormField label={t('requests.action.treasury')} hint={t('requests.action.treasuryHint')}>
              {(fid) => <LookupSelect id={fid} entity="treasuries" value={treasuryId} onChange={setTreasuryId} placeholder={t('requests.action.defaultTreasury')} />}
            </FormField>
          )}
          <FormField label={t('requests.action.commentOptional')}>
            {(fid) => <Textarea id={fid} value={comment} onChange={(e) => setComment(e.target.value)} data-testid="approve-comment" />}
          </FormField>
        </div>
      </Modal>

      {/* send back */}
      <Modal
        open={dlg === 'sendBack'}
        onClose={close}
        testId="sendback-dialog"
        title={t('requests.action.sendBackTitle')}
        footer={
          <>
            <Button loading={sendBack.isPending} disabled={!comment.trim()} onClick={() => sendBack.mutate()} data-testid="sendback-confirm">
              {t('requests.action.sendBack')}
            </Button>
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
          </>
        }
      >
        <FormField label={t('requests.action.commentRequired')} required>
          {(fid) => <Textarea id={fid} value={comment} onChange={(e) => setComment(e.target.value)} data-testid="sendback-comment" />}
        </FormField>
      </Modal>

      {/* reject */}
      <Modal
        open={dlg === 'reject'}
        onClose={close}
        testId="reject-dialog"
        title={t('requests.action.rejectTitle')}
        footer={
          <>
            <Button variant="danger" loading={reject.isPending} disabled={!comment.trim()} onClick={() => reject.mutate()} data-testid="reject-confirm">
              {t('requests.action.reject')}
            </Button>
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Banner tone="danger">{t('requests.action.rejectWarn')}</Banner>
          <FormField label={t('requests.action.reasonRequired')} required>
            {(fid) => <Textarea id={fid} value={comment} onChange={(e) => setComment(e.target.value)} data-testid="reject-reason" />}
          </FormField>
        </div>
      </Modal>
    </>
  );
}
