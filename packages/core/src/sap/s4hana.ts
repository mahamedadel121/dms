import { DomainError } from '../errors';
import type { JournalEntryDoc, SapPostResult, SapPostingAdapter } from './types';

// SAP S/4HANA journal entry bulk create (SOAP, A2A service JournalEntryBulkCreateRequest_In).
// TODO(WP4): no SAP credentials or endpoint exist. Element names, namespaces and the severity mapping below
// follow the published service but are UNVERIFIED against a real system; validate in the SAP sandbox
// before go-live (see docs/SAP_INTEGRATION.md).

const NS_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
const NS_SFIN = 'http://sap.com/xi/SAPSCORE/SFIN';

export function xmlEscape(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const sapDate = (d: string) => d; // yyyy-MM-dd as is

export function buildSoapEnvelope(doc: JournalEntryDoc, o: { messageId?: string; now?: Date; createdByUser?: string } = {}): string {
  const now = (o.now ?? new Date()).toISOString();
  const msgId = (o.messageId ?? doc.idempotencyKey).replace(/[^A-Za-z0-9]/g, '').slice(0, 36).padEnd(1, '0');
  const items = doc.items
    .map((it, i) => {
      const signed = it.side === 'D' ? it.amount : `-${it.amount}`;
      return `
        <Item>
          <ReferenceDocumentItem>${i + 1}</ReferenceDocumentItem>
          <CompanyCode>${xmlEscape(doc.companyCode)}</CompanyCode>
          <GLAccount>${xmlEscape(it.glAccount)}</GLAccount>
          <AmountInTransactionCurrency currencyCode="${xmlEscape(doc.currency)}">${xmlEscape(signed)}</AmountInTransactionCurrency>
          <DebitCreditCode>${it.side === 'D' ? 'S' : 'H'}</DebitCreditCode>
          <DocumentItemText>${xmlEscape(it.itemText)}</DocumentItemText>
          <AssignmentReference>${xmlEscape(it.assignment)}</AssignmentReference>${
            it.costCenter ? `\n          <AccountAssignment><CostCenter>${xmlEscape(it.costCenter)}</CostCenter></AccountAssignment>` : ''
          }
        </Item>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="${NS_SOAP}" xmlns:sfin="${NS_SFIN}">
  <soapenv:Header/>
  <soapenv:Body>
    <sfin:JournalEntryBulkCreateRequest>
      <MessageHeader>
        <ID>${xmlEscape(msgId)}</ID>
        <CreationDateTime>${xmlEscape(now)}</CreationDateTime>
      </MessageHeader>
      <JournalEntryCreateRequest>
        <MessageHeader>
          <ID>${xmlEscape(msgId)}1</ID>
          <CreationDateTime>${xmlEscape(now)}</CreationDateTime>
        </MessageHeader>
        <JournalEntry>
          <OriginalReferenceDocumentType>BKPFF</OriginalReferenceDocumentType>
          <BusinessTransactionType>RFBU</BusinessTransactionType>
          <AccountingDocumentType>${xmlEscape(doc.documentType)}</AccountingDocumentType>
          <DocumentReferenceID>${xmlEscape(doc.reference)}</DocumentReferenceID>
          <DocumentHeaderText>${xmlEscape(doc.headerText)}</DocumentHeaderText>
          <CreatedByUser>${xmlEscape(o.createdByUser ?? 'DMS')}</CreatedByUser>
          <CompanyCode>${xmlEscape(doc.companyCode)}</CompanyCode>
          <DocumentDate>${sapDate(doc.documentDate)}</DocumentDate>
          <PostingDate>${sapDate(doc.postingDate)}</PostingDate>${items}
        </JournalEntry>
      </JournalEntryCreateRequest>
    </sfin:JournalEntryBulkCreateRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function tag(xml: string, name: string): string | undefined {
  const m = new RegExp(`<(?:[A-Za-z0-9_]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${name}>`).exec(xml);
  return m ? m[1]!.trim() : undefined;
}
function tags(xml: string, name: string): string[] {
  const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${name}>`, 'g');
  return [...xml.matchAll(re)].map((m) => m[1]!.trim());
}
const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export type SoapParse =
  | { ok: true; documentNumber: string; fiscalYear: string; companyCode: string }
  | { ok: false; error: string };

/** Parses a JournalEntryBulkCreateConfirmation (or a SOAP Fault). Severity 3/4 (error/abort) = failure. */
export function parseSoapResponse(xml: string): SoapParse {
  const fault = tag(xml, 'Fault');
  if (fault !== undefined) {
    return { ok: false, error: `SOAP fault: ${unescapeXml(tag(fault, 'faultstring') ?? tag(fault, 'Text') ?? 'unknown')}` };
  }
  const logItems = tags(xml, 'Item').filter((i) => tag(i, 'SeverityCode') !== undefined);
  const errors = logItems.filter((i) => ['3', '4', 'E', 'A'].includes(tag(i, 'SeverityCode')!));
  if (errors.length) {
    return { ok: false, error: errors.map((i) => unescapeXml(tag(i, 'Note') ?? 'SAP error')).join('; ') };
  }
  const doc = tag(xml, 'AccountingDocument') ?? tag(xml, 'AccountingDocumentNumber');
  const fy = tag(xml, 'FiscalYear');
  const cc = tag(xml, 'CompanyCode');
  if (!doc || doc === '$' || /^0+$/.test(doc) || !fy || !cc) {
    return { ok: false, error: 'SAP response contains no accounting document number' };
  }
  return { ok: true, documentNumber: doc, fiscalYear: fy, companyCode: cc };
}

export interface S4Config {
  url?: string;
  user?: string;
  password?: string;
  client?: string;
}

export class S4HanaSapAdapter implements SapPostingAdapter {
  name = 's4hana';
  constructor(
    private readonly cfg: S4Config,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private requireConfig(): Required<Pick<S4Config, 'url' | 'user' | 'password'>> & S4Config {
    const { url, user, password } = this.cfg;
    if (!url || !user || !password) {
      throw new DomainError('INVALID_STATE', 'S/4HANA adapter is not configured (SAP_S4_URL, SAP_S4_USER, SAP_S4_PASSWORD)');
    }
    return { ...this.cfg, url, user, password };
  }

  async post(doc: JournalEntryDoc): Promise<SapPostResult> {
    const c = this.requireConfig();
    const body = buildSoapEnvelope(doc);
    const headers: Record<string, string> = {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '""',
      Authorization: `Basic ${Buffer.from(`${c.user}:${c.password}`).toString('base64')}`,
    };
    if (c.client) headers['sap-client'] = c.client;
    const res = await this.fetchImpl(c.url, { method: 'POST', headers, body });
    const text = await res.text();
    const parsed = parseSoapResponse(text);
    if (!parsed.ok) throw new DomainError('INVALID_STATE', `S/4HANA rejected the posting: ${parsed.error}`);
    if (!res.ok) throw new DomainError('INVALID_STATE', `S/4HANA HTTP ${res.status}`);
    return { documentNumber: parsed.documentNumber, fiscalYear: parsed.fiscalYear, companyCode: parsed.companyCode, raw: { http: res.status } };
  }

  /** TODO(WP4): query journal entry items by AccountingDocumentHeaderReference (OData API_JOURNALENTRYITEMBASIC). */
  async findByReference(_reference: string, _companyCode: string): Promise<{ documentNumber: string; fiscalYear: string } | null> {
    return null;
  }
}
