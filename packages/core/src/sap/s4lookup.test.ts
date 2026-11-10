import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SapLookupUnavailableError } from './errors';
import { buildLookupUrl, parseLookupResponse, S4Lookup, type S4LookupConfig } from './s4lookup';

const fx = (n: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', n), 'utf8')) as unknown;
const cfg: S4LookupConfig = {
  mode: 'odata',
  odataUrl: 'https://sap.invalid/odata',
  service: 'API_JOURNALENTRYITEMBASIC_SRV',
  entity: 'A_JournalEntryItemBasic',
  refField: 'DocumentReferenceID',
  user: 'u',
  password: 'p',
  client: '100',
  timeoutMs: 1000,
};
const json = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('S4 lookup', () => {
  it('builds the default lookup URL', () => {
    const u = decodeURIComponent(buildLookupUrl(cfg, 'DE-26-000123', '1000'));
    expect(u).toContain('API_JOURNALENTRYITEMBASIC_SRV/A_JournalEntryItemBasic');
    expect(u).toContain("CompanyCode eq '1000'");
    expect(u).toContain("DocumentReferenceID eq 'DE-26-000123'");
    expect(u).toContain('$top=5');
    expect(u).toContain('$format=json');
  });
  it('doubles single quotes in values', () => {
    expect(decodeURIComponent(buildLookupUrl(cfg, "A'B", '1000'))).toContain("eq 'A''B'");
  });
  it('parses an OData V2 hit', () => {
    expect(parseLookupResponse(fx('lookup-v2-found.json'))).toEqual({ documentNumber: '0100000123', fiscalYear: '2026' });
  });
  it('returns null for an empty V2 result', () => {
    expect(parseLookupResponse(fx('lookup-v2-empty.json'))).toBeNull();
  });
  it('parses an OData V4 hit', () => {
    expect(parseLookupResponse(fx('lookup-v4-found.json'))).toEqual({ documentNumber: '0100000123', fiscalYear: '2026' });
  });
  it('mode none throws a permanent SapLookupUnavailableError', async () => {
    const err = await new S4Lookup({ ...cfg, mode: 'none' }, json({})).find('R', '1000').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SapLookupUnavailableError);
    expect((err as SapLookupUnavailableError).permanent).toBe(true);
    expect((err as Error).message.startsWith('UNKNOWN_OUTCOME:')).toBe(true);
  });
  it('missing OData URL throws a permanent error', async () => {
    const err = await new S4Lookup({ ...cfg, odataUrl: undefined }, json({})).find('R', '1000').catch((e: unknown) => e);
    expect((err as SapLookupUnavailableError).permanent).toBe(true);
    expect((err as Error).message).toContain('SAP_S4_ODATA_URL');
  });
  it('sends Basic auth and sap-client and returns the document', async () => {
    let seen: { url: string; headers: Record<string, string> } | undefined;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, headers: init.headers as Record<string, string> };
      return new Response(JSON.stringify(fx('lookup-v2-found.json')), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await new S4Lookup(cfg, f).find('DE-26-000123', '1000');
    expect(r).toEqual({ documentNumber: '0100000123', fiscalYear: '2026' });
    expect(seen!.headers['sap-client']).toBe('100');
    expect(seen!.headers.Authorization).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
    expect(seen!.headers.Accept).toBe('application/json');
  });
  it('HTTP 401 is a permanent lookup error', async () => {
    const err = await new S4Lookup(cfg, json({}, 401)).find('R', '1000').catch((e: unknown) => e);
    expect((err as SapLookupUnavailableError).permanent).toBe(true);
  });
  it('HTTP 500 is a transient lookup error', async () => {
    const err = await new S4Lookup(cfg, json({}, 500)).find('R', '1000').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SapLookupUnavailableError);
    expect((err as SapLookupUnavailableError).permanent).toBe(false);
  });
  it('a timeout is a transient lookup error', async () => {
    const f = ((_u: string, init: RequestInit) =>
      new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted'))))) as unknown as typeof fetch;
    const err = await new S4Lookup({ ...cfg, timeoutMs: 20 }, f).find('R', '1000').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SapLookupUnavailableError);
    expect((err as SapLookupUnavailableError).permanent).toBe(false);
  });
  it('invalid JSON is a transient lookup error', async () => {
    const f = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
    const err = await new S4Lookup(cfg, f).find('R', '1000').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SapLookupUnavailableError);
    expect((err as SapLookupUnavailableError).permanent).toBe(false);
  });
});
