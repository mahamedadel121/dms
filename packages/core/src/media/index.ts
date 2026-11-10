import type { Attachment } from '@prisma/client';
import type { Db } from '../common';
import type { StorageAdapter } from '../storage';
import { DomainError } from '../errors';

// TODO(WP5): implement per PLAN section 8.
export interface IngestAttachmentInput {
  bytes: Buffer;
  originalName?: string;
  botSessionId?: string;
  requestId?: string;
  lineId?: string;
  correctionRequestId?: string;
  uploadedBySubmitterId?: string;
  uploadedByUserId?: string;
  telegramFileUniqueId?: string;
}

export function sniffMime(_bytes: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | null {
  throw new DomainError('NOT_IMPLEMENTED', 'sniffMime is not implemented yet (WP5)');
}

export async function ingestAttachment(
  _db: Db,
  _storage: StorageAdapter,
  _i: IngestAttachmentInput,
): Promise<Attachment> {
  throw new DomainError('NOT_IMPLEMENTED', 'ingestAttachment is not implemented yet (WP5)');
}

export async function flagDuplicates(_db: Db, _requestId: string): Promise<number> {
  throw new DomainError('NOT_IMPLEMENTED', 'flagDuplicates is not implemented yet (WP5)');
}
