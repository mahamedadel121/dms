import { DomainError } from '../errors';
import type { JournalEntryDoc, SapPostResult, SapPostingAdapter } from './types';

/** In-process ledger keyed by reference. Used in dev and tests; never persists. */
export class MockSapAdapter implements SapPostingAdapter {
  name = 'mock';
  readonly ledger = new Map<string, { documentNumber: string; fiscalYear: string; companyCode: string; doc: JournalEntryDoc }>();
  postCalls = 0;
  private seq = 100000;
  private failures = 0;
  private acceptThenFail = 0;
  private message = 'Mock SAP: simulated failure';

  /** The next `n` post() calls throw before anything is booked. */
  failNext(n = 1, message?: string): void {
    this.failures = n;
    if (message) this.message = message;
  }
  /** The next post() books the document and then throws (lost response / crash after accept). */
  failAfterAccept(n = 1): void {
    this.acceptThenFail = n;
  }
  reset(): void {
    this.ledger.clear();
    this.postCalls = 0;
    this.failures = 0;
    this.acceptThenFail = 0;
  }

  async post(doc: JournalEntryDoc): Promise<SapPostResult> {
    this.postCalls++;
    if (this.failures > 0) {
      this.failures--;
      throw new DomainError('INVALID_STATE', this.message);
    }
    const key = `${doc.companyCode}|${doc.reference}`;
    let rec = this.ledger.get(key);
    if (!rec) {
      this.seq++;
      rec = {
        documentNumber: `49${this.seq}`,
        fiscalYear: doc.postingDate.slice(0, 4),
        companyCode: doc.companyCode,
        doc,
      };
      this.ledger.set(key, rec);
    }
    if (this.acceptThenFail > 0) {
      this.acceptThenFail--;
      throw new DomainError('INVALID_STATE', 'Mock SAP: connection lost after the document was accepted');
    }
    return { documentNumber: rec.documentNumber, fiscalYear: rec.fiscalYear, companyCode: rec.companyCode };
  }

  async findByReference(reference: string, companyCode: string) {
    const rec = this.ledger.get(`${companyCode}|${reference}`);
    return rec ? { documentNumber: rec.documentNumber, fiscalYear: rec.fiscalYear } : null;
  }
}
