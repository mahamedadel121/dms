import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCashJournalEnvelope, parseCashJournalResponse, S4CashJournalAdapter, toCashJournalDoc } from './cashjournal';
import { isDefiniteFailure } from './errors';
import type { S4Lookup } from './s4lookup';
import type { JournalEntryDoc } from './types';

const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8');
const doc: JournalEntryDoc = {
  idempotencyKey: 'k1',
  reference: 'DE-26-000123',
  companyCode: '1000',
  documentType: 'KR',
  currency: 'EGP',
  postingDate: '2026-11-10',
  documentDate: '2026-11-10',
  headerText: 'Driver & Co',
  items: [
    { side: 'D', postingKey: '40', glAccount: '51501800', costCenter: 'CC1', amount: '100.00', assignment: 'DE-26-000123', itemText: 'fuel' },
    { side: 'D', postingKey: '40', glAccount: '51501500', amount: '50.50', assignment: 'DE-26-000123', itemText: 'tires <x>' },
    { side: 'C', postingKey: '50', glAccount: '11001000', amount: '150.50', assignment: 'DE-26-000123', itemText: 'pay' },
  ],
  cashJournal: { number: '0007', treasuryCode: 'T1', businessTransaction: 'EXP1' },
};
const cfg = { url: 'https://sap.invalid/cj', user: 'u', password: 'p', client: '100', functionName: 'BAPI_CASHJOURNALDOC_CREATE', timeoutMs: 1000 };
const reply = (body: string, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch;
const lookupFake = (hit: { documentNumber: string; fiscalYear: string } | null) => ({ find: async () => hit }) as unknown as S4Lookup;

describe('cash journal', () => {
  it('maps debit lines to payment items and drops the credit line', () => {
    const cj = toCashJournalDoc(doc);
    expect(cj.items.map((i) => i.position)).toEqual([1, 2]);
    expect(cj.items.map((i) => i.glAccount)).toEqual(['51501800', '51501500']);
    expect(cj.total).toBe('150.50');
    expect(cj.cashJournal).toBe('0007');
    expect(cj.businessTransaction).toBe('EXP1');
  });
  it('throws when the document has no cashJournal block', () => {
    expect(() => toCashJournalDoc({ ...doc, cashJournal: undefined })).toThrow();
  });
  it('throws when debits and credit differ', () => {
    const bad = { ...doc, items: [doc.items[0]!, { ...doc.items[2]!, amount: '1.00' }] };
    expect(() => toCashJournalDoc(bad)).toThrow(/balance/);
  });
  it('envelope contains the function name, header and items', () => {
    const x = buildCashJournalEnvelope(toCashJournalDoc(doc));
    expect(x).toContain('<urn:BAPI_CASHJOURNALDOC_CREATE>');
    expect(x).toContain('<CAJO_NUMBER>0007</CAJO_NUMBER>');
    expect(x).toContain('<REF_DOC_NO>DE-26-000123</REF_DOC_NO>');
    expect(x).toContain('<P_PAYMENTS>100.00</P_PAYMENTS>');
    expect(x).toContain('<TRANSACT_NUMBER>EXP1</TRANSACT_NUMBER>');
    expect(x.match(/<item>/g)).toHaveLength(2);
  });
  it('escapes XML in texts', () => {
    const x = buildCashJournalEnvelope(toCashJournalDoc(doc));
    expect(x).toContain('Driver &amp; Co');
    expect(x).toContain('tires &lt;x&gt;');
  });
  it('uses a custom function name', () => {
    expect(buildCashJournalEnvelope(toCashJournalDoc(doc), { functionName: 'Z_DMS_CASHJOURNAL_POST' })).toContain('<urn:Z_DMS_CASHJOURNAL_POST>');
  });
  it('parses a success response', () => {
    expect(parseCashJournalResponse(fx('cj-success.xml'))).toEqual({ ok: true, documentNumber: '0000004711', fiscalYear: '2026', companyCode: '1000' });
  });
  it('parses RETURN errors', () => {
    const r = parseCashJournalResponse(fx('cj-error.xml'));
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain('closed');
  });
  it('parses a SOAP fault', () => {
    expect((parseCashJournalResponse(fx('cj-fault.xml')) as { error: string }).error).toContain('Function module not found');
  });
  it('fails when the document number is missing or zero', () => {
    expect(parseCashJournalResponse('<COMPANY_CODE>1000</COMPANY_CODE><FISCAL_YEAR>2026</FISCAL_YEAR>').ok).toBe(false);
    expect(
      parseCashJournalResponse('<COMPANY_CODE>1000</COMPANY_CODE><FISCAL_YEAR>2026</FISCAL_YEAR><CASH_JOURNAL_DOC_NO>0000000000</CASH_JOURNAL_DOC_NO>').ok,
    ).toBe(false);
  });
  it('adapter posts and returns the cash journal document', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(fx('cj-success.xml'), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await new S4CashJournalAdapter(cfg, f, lookupFake(null)).post(doc);
    expect(r).toMatchObject({ documentNumber: '0000004711', fiscalYear: '2026', companyCode: '1000' });
    expect(seen!.url).toBe(cfg.url);
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
    expect(String(seen!.init.body)).toContain('<CAJO_NUMBER>0007</CAJO_NUMBER>');
  });
  it('adapter refuses to post when not configured', async () => {
    await expect(new S4CashJournalAdapter({ ...cfg, url: undefined }, reply(''), lookupFake(null)).post(doc)).rejects.toThrow(/not configured/);
  });
  it('a RETURN error is a definite rejection', async () => {
    const e = await new S4CashJournalAdapter(cfg, reply(fx('cj-error.xml')), lookupFake(null)).post(doc).catch((x: unknown) => x);
    expect(isDefiniteFailure(e)).toBe(true);
  });
  it('findByReference delegates to the lookup', async () => {
    const a = new S4CashJournalAdapter(cfg, reply(''), lookupFake({ documentNumber: '9', fiscalYear: '2026' }));
    expect(await a.findByReference('R', '1000')).toEqual({ documentNumber: '9', fiscalYear: '2026' });
  });
});
