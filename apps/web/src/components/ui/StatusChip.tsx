'use client';

import type { ReactNode } from 'react';
import { Archive, Ban, Banknote, Check, Circle, Clock3, AlertTriangle, MessageSquareWarning, Minus, PencilLine, RefreshCw, X, type LucideIcon } from 'lucide-react';
import { Badge } from './Display';
import { Icon } from './Icon';
import { statusIconName, statusTone, type StatusKind } from './status';

const GLYPHS: Record<string, LucideIcon> = { Archive, Ban, Banknote, Check, Circle, Clock3, AlertTriangle, MessageSquareWarning, Minus, PencilLine, RefreshCw, X };

export function StatusChip({ kind, status, label, size, className }: { kind: StatusKind; status: string; label: ReactNode; size?: 'sm' | 'md'; className?: string }) {
  const glyph = GLYPHS[statusIconName(kind, status)] ?? Circle;
  return (
    <Badge tone={statusTone(kind, status)} size={size} className={className} icon={<Icon as={glyph} size={14} />}>
      {label}
    </Badge>
  );
}
