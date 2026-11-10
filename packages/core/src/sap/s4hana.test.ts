import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isDefiniteFailure } from './errors';
import { buildSoapEnvelope, S4HanaSapAdapter } from './s4hana';
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
  headerText: 'Driver 123',
  items: [
    { side: 'D', postingKey: '40', glAccount: '51501800', costCenter: 'CC1', amount: '100.00', assignment: 'DE-26-000123', itemText: 'fuel' },
    { side: 'C', postingKey: '50', glAccount: '11001000', amount: '100.00', assignment: 'DE-26-000123', itemText: 'pay' },
  ],
};
const base = { url: 'https://sap.invalid/ws', user: 'u', password: 'p', duplicatePattern: 'already (been )?posted|duplicate' };
const reply = (body: string, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch;
const lookupFake = (hit: { documentNumber: string; fiscalYear: string } | null) => ({ find: async () => hit }) as unknown as S4Lookup;
const err = (p: Promise<unknown>): Promise<Error> => p.then(() => new Error("did not throw"), (e: unknown) => e as Error);

describe('S4HanaSapAdapter phase 2', () => {
  it('envelope has no OriginalReferenceDocument without a logical system', () => {
    expect(buildSoapEnvelope(doc)).not.toContain('<OriginalReferenceDocument>');
  });
  it('envelope carries OriginalReferenceDocument and the logical system when configured', () => {
    const x = buildSoapEnvelope(doc, { logicalSystem: 'DMSCLNT100' });
    expect(x).toContain('<OriginalReferenceDocument>DE-26-000123</OriginalReferenceDocument>');
    expect(x).toContain('<OriginalReferenceDocumentLogicalSystem>DMSCLNT100</OriginalReferenceDocumentLogicalSystem>');
    expect(x.indexOf('OriginalReferenceDocumentType')).toBeLessThan(x.indexOf('<OriginalReferenceDocument>'));
  });
  it('HTTP 401 is a definite rejection', async () => {
    const e = await err(new S4HanaSapAdapter(base, reply('', 401), lookupFake(null)).post(doc));
    expect(isDefiniteFailure(e)).toBe(true);
  });
  it('an error log item is a definite rejection', async () => {
    const xml = '<Log><Item><SeverityCode>3</SeverityCode><Note>Account blocked</Note></Item></Log>';
    const e = await err(new S4HanaSapAdapter({ ...base, duplicatePattern: undefined }, reply(xml), lookupFake(null)).post(doc));
    expect(isDefiniteFailure(e)).toBe(true);
    expect(e.message).toContain('Account blocked');
  });
  it('a duplicate message reuses the document found by the lookup', async () => {
    const r = await new S4HanaSapAdapter(base, reply(fx('je-duplicate.xml')), lookupFake({ documentNumber: '0100000123', fiscalYear: '2026' })).post(doc);
    expect(r).toMatchObject({ documentNumber: '0100000123', fiscalYear: '2026', companyCode: '1000', raw: { reusedAfterDuplicate: true } });
  });
  it('a duplicate message with no document found is an unknown outcome', async () => {
    const e = await err(new S4HanaSapAdapter(base, reply(fx('je-duplicate.xml')), lookupFake(null)).post(doc));
    expect(e.message.startsWith('UNKNOWN_OUTCOME')).toBe(true);
    expect(isDefiniteFailure(e)).toBe(false);
  });
  it('HTTP 502 is not a definite failure', async () => {
    const e = await err(new S4HanaSapAdapter(base, reply('Bad gateway', 502), lookupFake(null)).post(doc));
    expect(isDefiniteFailure(e)).toBe(false);
  });
  it('a timeout is not a definite failure', async () => {
    const f = ((_u: string, init: RequestInit) =>
      new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch;
    const e = await err(new S4HanaSapAdapter({ ...base, timeoutMs: 20 }, f, lookupFake(null)).post(doc));
    expect(e).toBeInstanceOf(Error);
    expect(isDefiniteFailure(e)).toBe(false);
  });
  it('findByReference delegates to the lookup', async () => {
    const a = new S4HanaSapAdapter(base, reply(''), lookupFake({ documentNumber: '77', fiscalYear: '2026' }));
    expect(await a.findByReference('DE-26-000123', '1000')).toEqual({ documentNumber: '77', fiscalYear: '2026' });
  });
});
