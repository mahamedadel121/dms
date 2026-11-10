'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Condition } from '@dms/shared';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Fields';
import { cn } from '@/lib/cn';
import { useTr } from '../common/useTr';
import {
  FIELD_OPS,
  FIELD_PATHS,
  NODE_KINDS,
  TOTAL_OPS,
  conditionToJson,
  fromCondition,
  newNode,
  parseConditionJson,
  toCondition,
  type CNode,
} from './condition';

/** Rule builder (tree) <-> Condition JSON. Remount (change `key`) to load a different condition. */
export function ConditionEditor({ value, onChange, readOnly }: { value: Condition; onChange: (c: Condition) => void; readOnly?: boolean }) {
  const { t } = useTr();
  const [mode, setMode] = useState<'builder' | 'json'>('builder');
  const [node, setNode] = useState<CNode>(() => fromCondition(value));
  const [text, setText] = useState(() => conditionToJson(value));
  const [err, setErr] = useState<string | null>(null);

  const setTree = (n: CNode) => {
    setNode(n);
    const c = toCondition(n);
    setText(conditionToJson(c));
    setErr(null);
    onChange(c);
  };
  const onText = (s: string) => {
    setText(s);
    const r = parseConditionJson(s);
    if (r.ok) {
      setErr(null);
      setNode(fromCondition(r.condition));
      onChange(r.condition);
    } else setErr(r.error);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1 text-xs" role="tablist">
        {(['builder', 'json'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn('rounded-md px-3 py-1 font-semibold', mode === m ? 'bg-primary text-on-primary' : 'bg-surface-2 text-ink-2 hover:bg-surface-3')}
          >
            {t(m === 'builder' ? 'workflows.cond.builder' : 'workflows.cond.json')}
          </button>
        ))}
      </div>
      {mode === 'builder' ? (
        <NodeEditor node={node} onChange={setTree} readOnly={readOnly} depth={0} />
      ) : (
        <div>
          <Textarea dir="ltr" rows={8} className="font-mono text-xs" value={text} readOnly={readOnly} invalid={!!err} onChange={(e) => onText(e.target.value)} />
          {err && <p className="mt-1 text-xs text-danger">{err}</p>}
        </div>
      )}
    </div>
  );
}

function NodeEditor({ node, onChange, onRemove, readOnly, depth }: { node: CNode; onChange: (n: CNode) => void; onRemove?: () => void; readOnly?: boolean; depth: number }) {
  const { t } = useTr();
  const kindSelect = (
    <Select
      className="h-9 w-auto min-w-[10rem]"
      disabled={readOnly}
      value={node.kind}
      onChange={(k) => onChange(newNode(k as CNode['kind']))}
      options={NODE_KINDS.map((k) => ({ value: k, label: t(`workflows.cond.kind.${k}`) }))}
    />
  );
  const remove = onRemove && !readOnly && (
    <Button size="sm" variant="ghost" onClick={onRemove} aria-label={t('common.remove')} icon={<Trash2 className="h-4 w-4" />} />
  );
  const box = cn('rounded-lg border p-2', depth % 2 === 0 ? 'border-hairline bg-surface-2' : 'border-hairline bg-surface');

  switch (node.kind) {
    case 'ALWAYS':
    case 'LINE_CATEGORY_REQUIRES_ROLE':
      return (
        <div className={cn(box, 'flex flex-wrap items-center gap-2')}>
          {kindSelect}
          <span className="flex-1 text-xs text-ink-3">{t(`workflows.cond.hint.${node.kind}`)}</span>
          {remove}
        </div>
      );
    case 'LINE_CATEGORY_IN':
      return (
        <div className={cn(box, 'flex flex-wrap items-center gap-2')}>
          {kindSelect}
          <Input className="h-9 flex-1 min-w-[12rem]" dir="ltr" readOnly={readOnly} value={node.codes} placeholder="MAINTENANCE, SPARE_PARTS" onChange={(e) => onChange({ ...node, codes: e.target.value })} />
          {remove}
        </div>
      );
    case 'TOTAL_AMOUNT':
      return (
        <div className={cn(box, 'flex flex-wrap items-center gap-2')}>
          {kindSelect}
          <Select className="h-9 w-auto" disabled={readOnly} value={node.op} onChange={(op) => onChange({ ...node, op: op as typeof node.op })} options={TOTAL_OPS.map((o) => ({ value: o, label: t(`workflows.cond.op.${o}`) }))} />
          <Input className="h-9 w-32" dir="ltr" inputMode="decimal" readOnly={readOnly} value={node.value} onChange={(e) => onChange({ ...node, value: e.target.value })} />
          {remove}
        </div>
      );
    case 'FIELD':
      return (
        <div className={cn(box, 'space-y-2')}>
          <div className="flex flex-wrap items-center gap-2">
            {kindSelect}
            <Input list="cond-field-paths" className="h-9 w-56" dir="ltr" readOnly={readOnly} value={node.field} onChange={(e) => onChange({ ...node, field: e.target.value })} />
            <datalist id="cond-field-paths">
              {FIELD_PATHS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <Select className="h-9 w-auto" disabled={readOnly} value={node.op} onChange={(op) => onChange({ ...node, op: op as typeof node.op })} options={FIELD_OPS.map((o) => ({ value: o, label: t(`workflows.cond.op.${o}`) }))} />
            {remove}
          </div>
          {node.op !== 'exists' && (
            <div className="flex flex-wrap items-center gap-2">
              {node.op !== 'in' && node.op !== 'nin' && (
                <Select
                  className="h-9 w-auto"
                  disabled={readOnly}
                  value={node.valueType}
                  onChange={(vt) => onChange({ ...node, valueType: vt as typeof node.valueType })}
                  options={(['string', 'number', 'boolean'] as const).map((v) => ({ value: v, label: t(`workflows.cond.type.${v}`) }))}
                />
              )}
              <Input
                className="h-9 flex-1 min-w-[10rem]"
                dir="ltr"
                readOnly={readOnly}
                value={node.value}
                placeholder={node.op === 'in' || node.op === 'nin' ? 'A, B, C' : ''}
                onChange={(e) => onChange({ ...node, value: e.target.value })}
              />
            </div>
          )}
        </div>
      );
    case 'AND':
    case 'OR':
      return (
        <div className={box}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {kindSelect}
            <span className="flex-1 text-xs text-ink-3">{t(`workflows.cond.hint.${node.kind}`)}</span>
            {remove}
          </div>
          <div className="space-y-2 border-s-2 border-line ps-3">
            {node.children.map((c, i) => (
              <NodeEditor
                key={i}
                node={c}
                depth={depth + 1}
                readOnly={readOnly}
                onChange={(n) => onChange({ ...node, children: node.children.map((x, j) => (j === i ? n : x)) })}
                onRemove={node.children.length > 1 ? () => onChange({ ...node, children: node.children.filter((_, j) => j !== i) }) : undefined}
              />
            ))}
            {!readOnly && (
              <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => onChange({ ...node, children: [...node.children, newNode('ALWAYS')] })}>
                {t('workflows.cond.addRule')}
              </Button>
            )}
          </div>
        </div>
      );
    case 'NOT':
      return (
        <div className={box}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {kindSelect}
            <span className="flex-1 text-xs text-ink-3">{t('workflows.cond.hint.NOT')}</span>
            {remove}
          </div>
          <div className="border-s-2 border-line ps-3">
            <NodeEditor node={node.child} depth={depth + 1} readOnly={readOnly} onChange={(n) => onChange({ ...node, child: n })} />
          </div>
        </div>
      );
  }
}
