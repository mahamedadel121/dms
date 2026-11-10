import { dec, sumDecimals } from '@dms/shared';
import { DomainError } from '../errors';
import { postAndClassify, tag, tags, unescapeXml, xmlEscape, type SoapParse } from './s4hana';
import { lookupConfigFromEnv, S4Lookup } from './s4lookup';
import type { JournalEntryDoc, SapPostResult, SapPostingAdapter } from './types';

// Cash Journal (FBCJ) posting through an RFC-style SOAP service (default BAPI_CASHJOURNALDOC_CREATE).
// UNVERIFIED: every element name below follows the BAPI documentation but is not checked against a real
// system; confirm with the SAP team (docs/SAP_INTEGRATION.md "Phase 2: cash journal").

export interface CashJournalDoc {
  reference: string;
  companyCode: string;
  cashJournal: string;
  businessTransaction: string;
  currency: 'EGP';
  postingDate: string;
  documentDate: string;
  headerText: string;
  items: { position: number; glAccount: string; costCenter?: string; amount: string; text: string; assignment: string }[];
  total: string;
}

/** Debit lines become cash-journal payment items; the credit (cash GL) line is implied by the cash journal itself. */
export function toCashJournalDoc(doc: JournalEntryDoc): CashJournalDoc {
  if (!doc.cashJournal) throw new DomainError('INVALID_STATE', 'Journal entry has no cashJournal block (re-create the posting payload)');
  const debits = doc.items.filter((i) => i.side === 'D');
  const credits = doc.items.filter((i) => i.side === 'C');
  const sumD = sumDecimals(debits.map((i) => i.amount));
  const sumC = sumDecimals(credits.map((i) => i.amount));
  if (debits.length === 0 || !dec(sumD).eq(dec(sumC))) {
    throw new DomainError('INVALID_STATE', `Cash journal document does not balance (${sumD} vs ${sumC})`);
  }
  return {
    reference: doc.reference,
    companyCode: doc.companyCode,
    cashJournal: doc.cashJournal.number,
    businessTransaction: doc.cashJournal.businessTransaction,
    currency: doc.currency,
    postingDate: doc.postingDate,
    documentDate: doc.documentDate,
    headerText: doc.headerText,
    items: debits.map((i, idx) => ({
      position: idx + 1,
      glAccount: i.glAccount,
      ...(i.costCenter ? { costCenter: i.costCenter } : {}),
      amount: i.amount,
      text: i.itemText,
      assignment: i.assignment,
    })),
    total: sumD,
  };
}

/** UNVERIFIED element names. */
export const CJ_ELEMENTS = {
  header: 'HEADER',
  compCode: 'COMP_CODE',
  cajoNumber: 'CAJO_NUMBER',
  currency: 'CURRENCY',
  docDate: 'DOC_DATE',
  postingDate: 'PSTNG_DATE',
  refDocNo: 'REF_DOC_NO',
  headerText: 'BP_NAME',
  testRun: 'TESTRUN',
  items: 'ITEMS',
  item: 'item',
  position: 'POSITION_NUMBER',
  transaction: 'TRANSACT_NUMBER',
  payments: 'P_PAYMENTS',
  glAccount: 'GL_ACCOUNT',
  costCenter: 'COSTCENTER',
  positionText: 'POSITION_TEXT',
  allocation: 'ALLOC_NMBR',
  return: 'RETURN',
  returnType: 'TYPE',
  returnMessage: 'MESSAGE',
  docNo: 'CASH_JOURNAL_DOC_NO',
  fiscalYear: 'FISCAL_YEAR',
  companyCode: 'COMPANY_CODE',
} as const;

const E = CJ_ELEMENTS;

export function buildCashJournalEnvelope(cj: CashJournalDoc, o: { functionName?: string } = {}): string {
  const fn = o.functionName ?? 'BAPI_CASHJOURNALDOC_CREATE';
  const items = cj.items
    .map(
      (it) =>
        `\n        <${E.item}><${E.position}>${String(it.position).padStart(3, '0')}</${E.position}><${E.transaction}>${xmlEscape(cj.businessTransaction)}</${E.transaction}><${E.payments}>${xmlEscape(it.amount)}</${E.payments}><${E.glAccount}>${xmlEscape(it.glAccount)}</${E.glAccount}>${
          it.costCenter ? `<${E.costCenter}>${xmlEscape(it.costCenter)}</${E.costCenter}>` : ''
        }<${E.positionText}>${xmlEscape(it.text)}</${E.positionText}><${E.allocation}>${xmlEscape(it.assignment)}</${E.allocation}></${E.item}>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:sap-com:document:sap:rfc:functions">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:${xmlEscape(fn)}>
      <${E.header}>
        <${E.compCode}>${xmlEscape(cj.companyCode)}</${E.compCode}><${E.cajoNumber}>${xmlEscape(cj.cashJournal)}</${E.cajoNumber}><${E.currency}>${xmlEscape(cj.currency)}</${E.currency}>
        <${E.docDate}>${xmlEscape(cj.documentDate)}</${E.docDate}><${E.postingDate}>${xmlEscape(cj.postingDate)}</${E.postingDate}>
        <${E.refDocNo}>${xmlEscape(cj.reference)}</${E.refDocNo}><${E.headerText}>${xmlEscape(cj.headerText)}</${E.headerText}>
      </${E.header}>
      <${E.testRun}></${E.testRun}>
      <${E.items}>${items}
      </${E.items}>
      <${E.return}/>
    </urn:${xmlEscape(fn)}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

export type CashJournalParse = SoapParse;

export function parseCashJournalResponse(xml: string): CashJournalParse {
  const fault = tag(xml, 'Fault');
  if (fault !== undefined) {
    return { ok: false, error: `SOAP fault: ${unescapeXml(tag(fault, 'faultstring') ?? tag(fault, 'Text') ?? 'unknown')}` };
  }
  const ret = tag(xml, E.return) ?? '';
  const errs = tags(ret, E.item).filter((i) => ['E', 'A'].includes(tag(i, E.returnType) ?? ''));
  if (errs.length) {
    return { ok: false, error: errs.map((i) => unescapeXml(tag(i, E.returnMessage) ?? 'SAP error')).join('; ') };
  }
  const doc = tag(xml, E.docNo);
  const fy = tag(xml, E.fiscalYear);
  const cc = tag(xml, E.companyCode);
  if (!doc || /^0+$/.test(doc) || !fy || !cc) {
    return { ok: false, error: 'SAP response contains no cash journal document number' };
  }
  return { ok: true, documentNumber: doc, fiscalYear: fy, companyCode: cc };
}

export interface S4CashJournalConfig {
  url?: string;
  user?: string;
  password?: string;
  client?: string;
  functionName: string;
  timeoutMs: number;
  duplicatePattern?: string;
}

export class S4CashJournalAdapter implements SapPostingAdapter {
  name = 's4hana-cj';
  private lookupInst?: S4Lookup;
  constructor(
    private readonly cfg: S4CashJournalConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    lookup?: S4Lookup,
  ) {
    this.lookupInst = lookup;
  }

  private get lookup(): S4Lookup {
    return (this.lookupInst ??= new S4Lookup(lookupConfigFromEnv(), this.fetchImpl));
  }

  async post(doc: JournalEntryDoc): Promise<SapPostResult> {
    const { url, user, password, client } = this.cfg;
    if (!url || !user || !password) {
      throw new DomainError('INVALID_STATE', 'Cash journal adapter is not configured (SAP_S4_CJ_URL, SAP_S4_USER, SAP_S4_PASSWORD)');
    }
    const cj = toCashJournalDoc(doc);
    const headers: Record<string, string> = {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '""',
      Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
    };
    if (client) headers['sap-client'] = client;
    return postAndClassify(
      {
        url,
        headers,
        body: buildCashJournalEnvelope(cj, { functionName: this.cfg.functionName }),
        timeoutMs: this.cfg.timeoutMs,
        duplicatePattern: this.cfg.duplicatePattern,
        label: 'Cash journal',
        parse: parseCashJournalResponse,
        lookup: () => this.lookup,
        reference: doc.reference,
        companyCode: doc.companyCode,
      },
      this.fetchImpl,
    );
  }

  async findByReference(reference: string, companyCode: string): Promise<{ documentNumber: string; fiscalYear: string } | null> {
    return this.lookup.find(reference, companyCode);
  }
}
