'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Check, CornerUpLeft, Lock, MessageSquareWarning, Unlock, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Checkbox, FormField, Textarea } from '@/components/ui/Fields';
import { LookupSelect } from '@/components/ui/Inputs2';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useTr } from '../common/useTr';
import type { RequestDetail } from '../types';

type Dlg = null | 'approve' | 'sendBack' | 'reject';

const HEARTBEAT_MS = 60_000;

export function ActionPanel({ detail, onChanged, onOpenCorrection }: { detail: RequestDetail; onChanged: () => void; onOpenCorrection: () => void }) {
  const { t, locale } = useTr();
  const { me, can } = useAuth();
  const toast = useToast();
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
    if (e instanceof ApiError && e.code === 'LOCKED') toast.error(t('requests.lock.lockedBy', { name: String((e.details as { holder?: string } | undefined)?.holder ?? detail.lock?.userName ?? '') }));
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
  const done = (msg: string) => {
    toast.success(msg);
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
    onSuccess: () => done(my?.isPayment ? t('requests.action.paidDone') : t('requests.action.approved')),
    onError: fail,
  });
  const sendBack = useMutation({
    mutationFn: () => api.post(`${stepPath}/send-back`, { comment: comment.trim() }),
    onSuccess: () => done(t('requests.action.sentBack')),
    onError: fail,
  });
  const reject = useMutation({
    mutationFn: () => api.post(`${stepPath}/reject`, { reason: comment.trim() }),
    onSuccess: () => done(t('requests.action.rejected')),
    onError: fail,
  });

  if (!my) {
    return null;
  }

  const missingRequired = my.checklist.filter((c) => c.required && !checks[c.key]);
  const canAct = !lockedByOther;
  const anyAction = my.approve || my.requestCorrection || my.sendBack || my.reject;

  return (
    <Card
      title={t('requests.action.title')}
      className="border-brand-200"
      actions={
        <span className="flex items-center gap-2">
          {!lockedByOther && !lockedByMe && !holding && can('requests.act') && (
            <Button size="sm" variant="secondary" icon={<Lock className="h-4 w-4" />} loading={claim.isPending} onClick={() => claim.mutate()}>
              {t('requests.lock.claim')}
            </Button>
          )}
          {(lockedByMe || holding) && (
            <Button size="sm" variant="ghost" icon={<Unlock className="h-4 w-4" />} loading={release.isPending} onClick={() => release.mutate()}>
              {t('requests.lock.release')}
            </Button>
          )}
        </span>
      }
    >
      {lockedByOther && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          <Lock className="h-4 w-4" aria-hidden />
          <span className="flex-1">{t('requests.lock.beingReviewedBy', { name: detail.lock?.userName ?? '' })}</span>
          {can('requests.force_unlock') && (
            <Button size="sm" variant="danger" loading={force.isPending} onClick={() => force.mutate()}>
              {t('requests.lock.force')}
            </Button>
          )}
        </div>
      )}
      {(lockedByMe || holding) && <p className="mb-3 text-xs text-emerald-700">{t('requests.lock.heldByYou')}</p>}
      {!anyAction && <p className="text-sm text-slate-500">{t('requests.action.noneAtStep')}</p>}
      <div className="flex flex-wrap gap-2">
        {my.approve && (
          <Button disabled={!canAct} icon={<Check className="h-4 w-4" />} onClick={() => setDlg('approve')}>
            {my.isPayment ? t('requests.action.pay') : t('requests.action.approve')}
          </Button>
        )}
        {my.requestCorrection && (
          <Button variant="secondary" disabled={!canAct} icon={<MessageSquareWarning className="h-4 w-4" />} onClick={onOpenCorrection}>
            {t('requests.action.requestCorrection')}
          </Button>
        )}
        {my.sendBack && (
          <Button variant="secondary" disabled={!canAct} icon={<CornerUpLeft className="h-4 w-4" />} onClick={() => setDlg('sendBack')}>
            {t('requests.action.sendBack')}
          </Button>
        )}
        {my.reject && (
          <Button variant="danger" disabled={!canAct} icon={<X className="h-4 w-4" />} onClick={() => setDlg('reject')}>
            {t('requests.action.reject')}
          </Button>
        )}
      </div>
      {(my.editAmounts || my.reclassify) && <p className="mt-3 text-xs text-slate-500">{t('requests.action.editHint')}</p>}

      {/* approve / pay */}
      <Modal
        open={dlg === 'approve'}
        onClose={close}
        title={my.isPayment ? t('requests.action.payTitle') : t('requests.action.approveTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button loading={approve.isPending} disabled={missingRequired.length > 0} onClick={() => approve.mutate()}>
              {my.isPayment ? t('requests.action.pay') : t('requests.action.approve')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {my.checklist.length > 0 && (
            <fieldset className="space-y-2 rounded-md border border-slate-200 p-3">
              {my.checklist.map((c) => (
                <Checkbox
                  key={c.key}
                  checked={!!checks[c.key]}
                  onChange={(v) => setChecks((p) => ({ ...p, [c.key]: v }))}
                  label={
                    <span>
                      {locale === 'ar' ? c.labelAr : c.labelEn || c.labelAr}
                      {c.required && <span className="ms-1 text-red-600">*</span>}
                    </span>
                  }
                />
              ))}
              {missingRequired.length > 0 && (
                <p className="flex items-center gap-1 text-xs text-red-700">
                  <AlertCircle className="h-3.5 w-3.5" /> {t('requests.action.checklistRequired')}
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
            {(fid) => <Textarea id={fid} value={comment} onChange={(e) => setComment(e.target.value)} />}
          </FormField>
        </div>
      </Modal>

      {/* send back */}
      <Modal
        open={dlg === 'sendBack'}
        onClose={close}
        title={t('requests.action.sendBackTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button loading={sendBack.isPending} disabled={!comment.trim()} onClick={() => sendBack.mutate()}>
              {t('requests.action.sendBack')}
            </Button>
          </>
        }
      >
        <FormField label={t('requests.action.commentRequired')} required>
          {(fid) => <Textarea id={fid} value={comment} onChange={(e) => setComment(e.target.value)} />}
        </FormField>
      </Modal>

      {/* reject */}
      <Modal
        open={dlg === 'reject'}
        onClose={close}
        title={t('requests.action.rejectTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={reject.isPending} disabled={!comment.trim()} onClick={() => reject.mutate()}>
              {t('requests.action.reject')}
            </Button>
          </>
        }
      >
        <p className="mb-2 text-sm text-red-700">{t('requests.action.rejectWarn')}</p>
        <FormField label={t('requests.action.reasonRequired')} required>
          {(fid) => <Textarea id={fid} value={comment} onChange={(e) => setComment(e.target.value)} />}
        </FormField>
      </Modal>

    </Card>
  );
}
