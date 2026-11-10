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
  cashJournal?: { number: string; treasuryCode: string; businessTransaction: string };
}

export interface SapPostResult {
  documentNumber: string;
  fiscalYear: string;
  companyCode: string;
  raw?: unknown;
}

export interface SapPostingAdapter {
  name: string;
  post(doc: JournalEntryDoc): Promise<SapPostResult>;
  findByReference(reference: string, companyCode: string): Promise<{ documentNumber: string; fiscalYear: string } | null>;
}
