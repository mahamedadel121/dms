import type { PrismaClient, SapPosting } from '@prisma/client';
import type { Db } from '../common';
import { DomainError } from '../errors';

// TODO(WP4): implement per PLAN sections 7.3 and 10.
export interface JournalEntryDoc {
  idempotencyKey: string;
  reference: string;
  companyCode: string;
  documentType: string;
  currency: 'EGP';
  postingDate: string;
  documentDate: string;
  headerText: string;
  items: {
    side: 'D' | 'C';
    postingKey: string;
    glAccount: string;
    costCenter?: string;
    amount: string;
    assignment: string;
    itemText: string;
  }[];
}
export interface SapPostingAdapter {
  name: string;
  post(doc: JournalEntryDoc): Promise<{ documentNumber: string; fiscalYear: string; companyCode: string; raw?: unknown }>;
  findByReference(reference: string, companyCode: string): Promise<{ documentNumber: string; fiscalYear: string } | null>;
}

const ni = (n: string): never => {
  throw new DomainError('NOT_IMPLEMENTED', `${n} is not implemented yet (WP4)`);
};

export async function buildJournalEntry(_db: Db, _requestId: string): Promise<JournalEntryDoc> {
  return ni('buildJournalEntry');
}
export function getSapAdapter(_name?: string): SapPostingAdapter {
  return ni('getSapAdapter');
}
export async function processSapPosting(
  _prisma: PrismaClient,
  _postingId: string,
  _o?: { trigger?: 'AUTO' | 'MANUAL'; userId?: string },
): Promise<SapPosting> {
  return ni('processSapPosting');
}
