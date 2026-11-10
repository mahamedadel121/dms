'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronDown, GripVertical, Plus, Trash2 } from 'lucide-react';
import type { FieldDefinition } from '@dms/shared';
import { Badge, Button, Code, FormField, Icon, IconButton, Input, Select, Switch } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { FIELD_TYPES, LOOKUP_ENTITIES, blankField, normalizeOrder, validateFields } from './model';

export interface FieldListEditorProps {
  value: FieldDefinition[];
  onChange: (v: FieldDefinition[]) => void;
  testIdPrefix: string;
  reservedKeys?: string[];
  /** test id of the add button (default `${testIdPrefix}-add`) */
  addTestId?: string;
}

let uid = 0;
const nextId = () => `fld-${++uid}`;

/** Numeric text input that keeps what the user types (e.g. "1.") and commits a number or undefined. */
function NumberBox({ value, onCommit, invalid, testId }: { value: number | undefined; onCommit: (n: number | undefined) => void; invalid?: boolean; testId?: string }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => {
    const parsed = text.trim() === '' ? undefined : Number(text);
    if (parsed !== value) setText(value === undefined ? '' : String(value));
  }, [value]);
  return (
    <Input
      numeric
      value={text}
      invalid={invalid}
      data-testid={testId}
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        const n = Number(v);
        onCommit(v.trim() === '' ? undefined : Number.isFinite(n) ? n : undefined);
      }}
    />
  );
}

interface RowProps {
  id: string;
  index: number;
  field: FieldDefinition;
  errors: Record<string, string>;
  expanded: boolean;
  testIdPrefix: string;
  onToggle: () => void;
  onPatch: (patch: Partial<FieldDefinition>) => void;
  onRemove: () => void;
}

function Row({ id, index, field: f, errors, expanded, testIdPrefix, onToggle, onPatch, onRemove }: RowProps) {
  const { t } = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
    transition,
  };
  const err = (k: string) => (errors[k] ? t(errors[k]) : undefined);
  const hasErr = Object.keys(errors).length > 0;
  const options = f.options ?? [];

  const setType = (type: FieldDefinition['type']) => {
    const next: FieldDefinition = { ...f, type };
    if (type !== 'number') {
      delete next.min;
      delete next.max;
    }
    if (type !== 'text') delete next.regex;
    if (type !== 'select') delete next.options;
    else if (!next.options) next.options = [{ value: '', labelAr: '', labelEn: '' }];
    if (type !== 'lookup') delete next.lookup;
    onPatch(next);
  };
  const setOption = (i: number, patch: Partial<NonNullable<FieldDefinition['options']>[number]>) =>
    onPatch({ options: options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-testid={`${testIdPrefix}-${index}`}
      className={cn('rounded-lg border bg-surface', hasErr ? 'border-danger/50' : 'border-hairline', isDragging && 'relative z-10 shadow-pop')}
    >
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-ink-3 hover:bg-surface-2 active:cursor-grabbing"
          aria-label={t('rt.fields.drag')}
          {...attributes}
          {...listeners}
        >
          <Icon as={GripVertical} size={16} />
        </button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={onToggle} aria-expanded={expanded}>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{f.labelAr || t('rt.fields.untitled')}</span>
          <Code className="hidden text-xs text-ink-3 sm:inline">{f.key}</Code>
          <Badge size="sm" tone="gray">{t(`rt.fieldType.${f.type}`)}</Badge>
          {f.required && <Badge size="sm" tone="brass">{t('rt.fields.required')}</Badge>}
          {hasErr && <Badge size="sm" tone="red">{t('rt.fields.hasErrors')}</Badge>}
          <Icon as={ChevronDown} size={16} className={cn('text-ink-3 transition-transform', expanded && 'rotate-180')} />
        </button>
        <IconButton size="sm" icon={<Icon as={Trash2} size={16} />} label={t('common.remove')} onClick={onRemove} data-testid={`${testIdPrefix}-${index}-remove`} />
      </div>
      {expanded && (
        <div className="grid gap-4 border-t border-hairline p-4 sm:grid-cols-2">
          <FormField label={t('rt.fields.key')} error={err('key')} hint={t('rt.fields.keyHint')} required>
            {(fid) => <Input id={fid} dir="ltr" value={f.key} invalid={!!errors.key} data-testid={`${testIdPrefix}-${index}-key`} onChange={(e) => onPatch({ key: e.target.value.trim() })} />}
          </FormField>
          <FormField label={t('rt.fields.type')}>
            {(fid) => <Select id={fid} value={f.type} options={FIELD_TYPES.map((x) => ({ value: x, label: t(`rt.fieldType.${x}`) }))} onChange={(v) => setType(v as FieldDefinition['type'])} />}
          </FormField>
          <FormField label={t('common.nameAr')} error={err('labelAr')} required>
            {(fid) => <Input id={fid} value={f.labelAr} invalid={!!errors.labelAr} onChange={(e) => onPatch({ labelAr: e.target.value })} />}
          </FormField>
          <FormField label={t('common.nameEn')} error={err('labelEn')} required>
            {(fid) => <Input id={fid} dir="ltr" value={f.labelEn} invalid={!!errors.labelEn} onChange={(e) => onPatch({ labelEn: e.target.value })} />}
          </FormField>
          <FormField label={t('rt.fields.promptAr')} hint={t('rt.fields.promptHint')} className="sm:col-span-2">
            {(fid) => <Input id={fid} value={f.promptAr ?? ''} onChange={(e) => onPatch({ promptAr: e.target.value || undefined })} />}
          </FormField>
          <div className="sm:col-span-2">
            <Switch checked={f.required} onChange={(v) => onPatch({ required: v })} label={t('rt.fields.requiredLabel')} />
          </div>

          {f.type === 'number' && (
            <>
              <FormField label={t('rt.fields.min')}>{() => <NumberBox value={f.min} onCommit={(n) => onPatch({ min: n })} />}</FormField>
              <FormField label={t('rt.fields.max')} error={err('max')}>{() => <NumberBox value={f.max} invalid={!!errors.max} onCommit={(n) => onPatch({ max: n })} />}</FormField>
            </>
          )}
          {f.type === 'text' && (
            <FormField label={t('rt.fields.regex')} error={err('regex')} hint={t('rt.fields.regexHint')} className="sm:col-span-2">
              {(fid) => <Input id={fid} dir="ltr" value={f.regex ?? ''} invalid={!!errors.regex} onChange={(e) => onPatch({ regex: e.target.value || undefined })} />}
            </FormField>
          )}
          {f.type === 'lookup' && (
            <FormField label={t('rt.fields.lookup')} error={err('lookup')} className="sm:col-span-2">
              {(fid) => (
                <Select
                  id={fid}
                  value={f.lookup ?? ''}
                  invalid={!!errors.lookup}
                  placeholder={t('common.select')}
                  options={LOOKUP_ENTITIES.map((x) => ({ value: x, label: t(`rt.lookup.${x}`) }))}
                  onChange={(v) => onPatch({ lookup: v || undefined })}
                />
              )}
            </FormField>
          )}
          {f.type === 'select' && (
            <div className="space-y-2 sm:col-span-2">
              <div className="text-13 font-medium text-ink-2">{t('rt.fields.options')}</div>
              {errors.options && <p className="text-xs font-medium text-danger" role="alert">{t(errors.options)}</p>}
              {options.map((o, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
                  <Input dir="ltr" placeholder={t('rt.fields.optionValue')} value={o.value} onChange={(e) => setOption(i, { value: e.target.value })} />
                  <Input placeholder={t('common.nameAr')} value={o.labelAr} onChange={(e) => setOption(i, { labelAr: e.target.value })} />
                  <Input dir="ltr" placeholder={t('common.nameEn')} value={o.labelEn} onChange={(e) => setOption(i, { labelEn: e.target.value })} />
                  <IconButton size="sm" icon={<Icon as={Trash2} size={16} />} label={t('common.remove')} onClick={() => onPatch({ options: options.filter((_, j) => j !== i) })} />
                </div>
              ))}
              <Button size="sm" variant="secondary" icon={<Icon as={Plus} size={16} />} onClick={() => onPatch({ options: [...options, { value: '', labelAr: '', labelEn: '' }] })}>
                {t('rt.fields.addOption')}
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Sortable editor for `FieldDefinition[]`; `order` is rewritten as index * 10. Shared by header fields and category extra fields. */
export function FieldListEditor({ value, onChange, testIdPrefix, reservedKeys, addTestId }: FieldListEditorProps) {
  const { t } = useT();
  const idsRef = useRef<string[]>([]);
  while (idsRef.current.length < value.length) idsRef.current.push(nextId());
  if (idsRef.current.length > value.length) idsRef.current.length = value.length;
  const ids = idsRef.current;
  const [open, setOpen] = useState<Set<string>>(new Set());
  const errors = useMemo(() => validateFields(value, reservedKeys ?? []), [value, reservedKeys]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const emit = (next: FieldDefinition[]) => onChange(normalizeOrder(next));
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    idsRef.current = arrayMove(ids, from, to);
    emit(arrayMove(value, from, to));
  }

  function add() {
    const f = blankField(value.map((x) => x.key));
    const id = nextId();
    idsRef.current = [...ids, id];
    setOpen((s) => new Set(s).add(id));
    emit([...value, f]);
  }

  function remove(i: number) {
    idsRef.current = ids.filter((_, j) => j !== i);
    emit(value.filter((_, j) => j !== i));
  }

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-3">{t('rt.fields.empty')}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {value.map((f, i) => (
                <Row
                  key={ids[i]}
                  id={ids[i]!}
                  index={i}
                  field={f}
                  errors={errors[i] ?? {}}
                  expanded={open.has(ids[i]!)}
                  testIdPrefix={testIdPrefix}
                  onToggle={() => toggle(ids[i]!)}
                  onPatch={(patch) => emit(value.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
                  onRemove={() => remove(i)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <Button variant="secondary" icon={<Icon as={Plus} size={16} />} onClick={add} data-testid={addTestId ?? `${testIdPrefix}-add`}>
        {t('rt.fields.add')}
      </Button>
    </div>
  );
}
