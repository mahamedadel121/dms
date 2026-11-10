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

/**
 * Cash Journal (FBCJ) placeholder: posting a payment through a SAP cash journal instead of a
 * general-ledger journal entry. Interface only; no adapter exists yet (see docs/SAP_INTEGRATION.md).
 * TODO(WP4): implement once the SAP team confirms the Cash Journal API and cash-journal numbers.
 */
export interface CashJournalAdapter {
  name: string;
  postCashPayment(p: {
    companyCode: string;
    cashJournal: string;
    reference: string;
    postingDate: string;
    glAccount: string;
    costCenter?: string;
    amount: string;
    text: string;
  }): Promise<{ documentNumber: string; fiscalYear: string }>;
}
