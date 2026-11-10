'use client';

import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { LineCategoryDto } from '@dms/shared';
import { api, errorMessage } from '@/lib/api';
import { Card, FileDrop, FormField, Icon, IconButton, Input, Select, Spinner, Textarea, useToast } from '@/components/ui';
import { useTr } from '../common/useTr';
import { FieldInput, useFieldText } from './FieldInput';
import { acceptedMimeTypes, checkFile, lineKey, sortedFields, type IssueMap, type LineDraft } from './model';

interface Props {
  index: number;
  line: LineDraft;
  categories: LineCategoryDto[];
  issues: IssueMap;
  canRemove: boolean;
  onChange: (next: LineDraft) => void;
  onRemove: () => void;
}

export function LineEditor({ index, line, categories, issues, canRemove, onChange, onRemove }: Props) {
  const { t, locale } = useTr();
  const toast = useToast();
  const txt = useFieldText();
  const [uploading, setUploading] = useState(false);
  const cat = categories.find((c) => c.id === line.categoryId);

  const upload = async (file: File) => {
    const pre = checkFile(cat, line.files.length, file.type);
    if (!pre.ok) {
      toast.error(t(pre.code === 'max' ? 'requests.submit.err.fileMax' : 'requests.submit.err.fileType'));
      return;
    }
    setUploading(true);
    try {
      const r = await api.upload<{ attachmentId: string; mimeType?: string }>('/requests/attachments', file, file.name);
      const mimeType = r.mimeType ?? file.type;
      if (!checkFile(cat, line.files.length, mimeType).ok) {
        toast.error(t('requests.submit.err.fileType'));
        return;
      }
      onChange({ ...line, files: [...line.files, { id: r.attachmentId, name: file.name, mimeType }] });
    } catch (e) {
      toast.error(errorMessage(e) || t('requests.submit.err.upload'));
    } finally {
      setUploading(false);
    }
  };

  const filesIssue = txt.issue(issues[lineKey(index, 'files')]);
  const accept = acceptedMimeTypes(cat).join(',');

  return (
    <div data-testid={`submit-line-${index + 1}`}>
      <Card
        title={t('requests.submit.line.n', { n: index + 1 })}
        actions={canRemove ? <IconButton icon={<Icon as={Trash2} />} label={t('requests.submit.line.remove')} onClick={onRemove} /> : undefined}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('requests.submit.line.category')} required error={txt.issue(issues[lineKey(index, 'category')])}>
            {(id) => (
              <Select
                id={id}
                data-testid={`submit-line-${index + 1}-category`}
                value={line.categoryId}
                invalid={!!issues[lineKey(index, 'category')]}
                placeholder={t('common.select')}
                // switching category drops the old category's extra values and files
                onChange={(v) => onChange({ ...line, categoryId: v, extra: {}, files: [] })}
                options={categories.map((c) => ({ value: c.id, label: locale === 'ar' ? c.nameAr : c.nameEn }))}
              />
            )}
          </FormField>
          <FormField label={t('requests.submit.line.amount')} required error={txt.issue(issues[lineKey(index, 'amount')])}>
            {(id) => (
              <Input id={id} data-testid={`submit-line-${index + 1}-amount`} numeric value={line.amount} invalid={!!issues[lineKey(index, 'amount')]} onChange={(e) => onChange({ ...line, amount: e.target.value })} />
            )}
          </FormField>
          {sortedFields(cat?.extraFields ?? []).map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              value={line.extra[f.key] ?? ''}
              issue={issues[lineKey(index, f.key)]}
              testId={`submit-line-${index + 1}-field-${f.key}`}
              onChange={(v) => onChange({ ...line, extra: { ...line.extra, [f.key]: v } })}
            />
          ))}
          <FormField label={t('requests.submit.line.note')} className="sm:col-span-2">
            {(id) => <Textarea id={id} rows={2} value={line.note} onChange={(e) => onChange({ ...line, note: e.target.value })} />}
          </FormField>
        </div>

        {cat && (
          <div className="mt-4 space-y-2">
            <FormField label={t('requests.submit.line.files')} error={filesIssue} hint={t('requests.submit.line.filesHint', { min: cat.minAttachments, max: cat.maxAttachments })}>
              <div className="space-y-2">
                {line.files.map((f) => (
                  <div key={f.id} className="flex items-center justify-between gap-2 rounded border border-hairline bg-surface-2 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate" dir="auto">
                      {f.name}
                    </span>
                    <IconButton
                      size="sm"
                      icon={<Icon as={X} />}
                      label={t('requests.submit.line.removeFile')}
                      onClick={() => onChange({ ...line, files: line.files.filter((x) => x.id !== f.id) })}
                    />
                  </div>
                ))}
                {uploading ? (
                  <div className="flex items-center gap-2 text-sm text-ink-3">
                    <Spinner /> {t('requests.submit.line.uploading')}
                  </div>
                ) : (
                  line.files.length < cat.maxAttachments && <FileDrop accept={accept} onFile={(f) => void upload(f)} label={t('requests.submit.line.upload')} />
                )}
              </div>
            </FormField>
          </div>
        )}
      </Card>
    </div>
  );
}

