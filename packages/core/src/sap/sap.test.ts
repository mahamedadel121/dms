import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupTestDb } from '@dms/db/testing';
import type { PrismaClient } from '@prisma/client';
import { createLocalStorage } from '../storage';
import { runDueJobs } from '../jobs';
import { createRequestFixture } from '../pdf/fixtures';
import {
  FileSapAdapter,
  MockSapAdapter,
  S4HanaSapAdapter,
  buildJournalEntry,
  buildSoapEnvelope,
  getSapAdapter,
  parseSoapResponse,
  processSapPosting,
  registerSapAdapter,
  retrySapPosting,
} from './index';

let prisma: PrismaClient;
let teardown: () => Promise<void>;
let mock: MockSapAdapter;

beforeAll(async () => {
  const t = await setupTestDb('wp4-sap');
  prisma = t.prisma;
  teardown = t.teardown;
});
afterAll(async () => {
  await teardown?.();
});
beforeEach(() => {
  registerSapAdapter('mock', null);
  mock = getSapAdapter('mock') as MockSapAdapter;
});

describe('buildJournalEntry', () => {
  it('debits per line with cost center, one balanced credit to the treasury cash GL, reference = number', async () => {
    const f = await createRequestFixture(prisma, { scenario: 'both', treasuryCashGl: '11001000' });
    const je = await buildJournalEntry(prisma, f.requestId);
    expect(je.reference).toBe(f.number);
    expect(je.idempotencyKey).toBe(f.requestId);
    expect(je.currency).toBe('EGP');
    expect(je.companyCode).toBe('1000');
    expect(je.headerText.length).toBeLessThanOrEqual(25);
    const debits = je.items.filter((i) => i.side === 'D');
    const credits = je.items.filter((i) => i.side === 'C');
    expect(debits).toHaveLength(4);
    expect(debits.every((d) => d.costCenter === 'MLF450' && d.postingKey === '40' && d.assignment === f.number)).toBe(true);
    expect(debits.map((d) => d.glAccount).sort()).toEqual(['51501100', '51501400', '51501600', '51501800']);
    expect(credits).toHaveLength(1);
    expect(credits[0]).toMatchObject({ glAccount: '11001000', postingKey: '50', amount: '1550.00' });
    expect(credits[0]!.costCenter).toBeUndefined();
    const dsum = debits.reduce((a, d) => a + Number(d.amount), 0);
    expect(dsum.toFixed(2)).toBe(credits[0]!.amount);
  });

  it('leaves out zero-amount lines (D27) and aggregates by GL+cost center when configured', async () => {
    const f = await createRequestFixture(prisma, { scenario: 'tips' });
    await prisma.requestLine.updateMany({ where: { requestId: f.requestId, categoryNameAr: 'إكراميات' }, data: { amount: 0 } });
    let je = await buildJournalEntry(prisma, f.requestId);
    expect(je.items.filter((i) => i.side === 'D')).toHaveLength(2);
    expect(je.items.find((i) => i.side === 'C')!.amount).toBe('900.00');

    const g = await createRequestFixture(prisma, { scenario: 'neither' });
    const toll = await prisma.requestLine.findFirstOrThrow({ where: { requestId: g.requestId, categoryNameAr: 'رسوم طرق' }, include: { expense: true } });
    const l2 = await prisma.requestLine.create({
      data: { requestId: g.requestId, lineNo: 9, categoryId: toll.categoryId, originalCategoryId: toll.categoryId, categoryNameAr: toll.categoryNameAr, categoryNameEn: toll.categoryNameEn, originalAmount: 30, amount: 30 },
    });
    await prisma.expenseLine.create({ data: { ...toll.expense!, lineId: l2.id } });
    await prisma.setting.upsert({
      where: { key: 'sap.config' },
      create: { key: 'sap.config', value: { aggregateSameGlCostCenter: true } },
      update: { value: { aggregateSameGlCostCenter: true } },
    });
    je = await buildJournalEntry(prisma, g.requestId);
    const tolls = je.items.filter((i) => i.glAccount === '51501100');
    expect(tolls).toHaveLength(1);
    expect(tolls[0]!.amount).toBe('130.00');
    await prisma.setting.delete({ where: { key: 'sap.config' } });
  });
});

describe('processSapPosting', () => {
  it('posts once, stores doc number on posting + expense request, is a no-op when POSTED', async () => {
    const f = await createRequestFixture(prisma, { withSapPosting: true });
    const p1 = await processSapPosting(prisma, f.postingId!);
    expect(p1.status).toBe('POSTED');
    expect(p1.sapDocNumber).toBeTruthy();
    const er = await prisma.expenseRequest.findUniqueOrThrow({ where: { requestId: f.requestId } });
    expect(er.sapDocNumber).toBe(p1.sapDocNumber);
    const p2 = await processSapPosting(prisma, f.postingId!);
    expect(p2.sapDocNumber).toBe(p1.sapDocNumber);
    expect(mock.postCalls).toBe(1);
    expect(await prisma.sapPostingAttempt.count({ where: { postingId: f.postingId } })).toBe(1);
    expect(await prisma.requestEvent.count({ where: { requestId: f.requestId, type: 'SAP_POSTED' } })).toBe(1);
  });

  it('failure keeps the request PAID, retry posts exactly once', async () => {
    const f = await createRequestFixture(prisma, { withSapPosting: true });
    mock.failNext(1);
    await expect(processSapPosting(prisma, f.postingId!)).rejects.toThrow(/simulated/);
    let p = await prisma.sapPosting.findUniqueOrThrow({ where: { id: f.postingId } });
    expect(p.status).toBe('FAILED');
    expect(p.lastError).toContain('simulated');
    expect((await prisma.request.findUniqueOrThrow({ where: { id: f.requestId } })).status).toBe('PAID');
    p = await processSapPosting(prisma, f.postingId!);
    expect(p.status).toBe('POSTED');
    expect(mock.ledger.size).toBe(1);
    const attempts = await prisma.sapPostingAttempt.findMany({ where: { postingId: f.postingId }, orderBy: { attemptNo: 'asc' } });
    expect(attempts.map((a) => a.success)).toEqual([false, true]);
  });

  it('crash after SAP accepted: findByReference prevents a double post', async () => {
    const f = await createRequestFixture(prisma, { withSapPosting: true });
    mock.failAfterAccept();
    await expect(processSapPosting(prisma, f.postingId!)).rejects.toThrow(/lost after/);
    expect(mock.ledger.size).toBe(1);
    const p = await processSapPosting(prisma, f.postingId!);
    expect(p.status).toBe('POSTED');
    expect(mock.postCalls).toBe(1); // second attempt never called post()
    expect(mock.ledger.size).toBe(1);
    expect(p.sapDocNumber).toBe([...mock.ledger.values()][0]!.documentNumber);
  });

  it('simulated process crash (row left POSTING) also resolves through findByReference', async () => {
    const f = await createRequestFixture(prisma, { withSapPosting: true });
    mock.failAfterAccept();
    await expect(processSapPosting(prisma, f.postingId!)).rejects.toThrow();
    await prisma.sapPosting.update({ where: { id: f.postingId }, data: { status: 'POSTING' } });
    const p = await processSapPosting(prisma, f.postingId!);
    expect(p.status).toBe('POSTED');
    expect(mock.postCalls).toBe(1);
  });

  it('concurrent processing never double posts', async () => {
    const f = await createRequestFixture(prisma, { withSapPosting: true });
    const r = await Promise.allSettled([processSapPosting(prisma, f.postingId!), processSapPosting(prisma, f.postingId!)]);
    expect(r.some((x) => x.status === 'fulfilled')).toBe(true);
    expect(mock.ledger.size).toBe(1);
    expect((await prisma.sapPosting.findUniqueOrThrow({ where: { id: f.postingId } })).status).toBe('POSTED');
  });

  it('job-driven auto retry with backoff, then manual retry resets the same job row', async () => {
    const f = await createRequestFixture(prisma, { withSapPosting: true });
    const { enqueueJob } = await import('../jobs');
    const { id: jobId } = await enqueueJob(prisma, { type: 'sap.post', payload: { postingId: f.postingId }, dedupeKey: `sap.post:${f.requestId}`, maxAttempts: 1 });
    const handlers = {
      'sap.post': async (job: { payload: unknown }) => {
        const p = job.payload as { postingId: string; trigger?: 'AUTO' | 'MANUAL'; userId?: string };
        await processSapPosting(prisma, p.postingId, { trigger: p.trigger, userId: p.userId });
      },
    };
    mock.failNext(1);
    await runDueJobs({ prisma, queues: ['default'], handlers: handlers as never });
    expect((await prisma.job.findUniqueOrThrow({ where: { id: jobId } })).status).toBe('FAILED');
    expect((await prisma.sapPosting.findUniqueOrThrow({ where: { id: f.postingId } })).status).toBe('FAILED');

    const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
    const p = await retrySapPosting(prisma, f.postingId!, admin.id);
    expect(p.status).toBe('PENDING');
    expect(await prisma.sapPosting.count({ where: { requestId: f.requestId } })).toBe(1);
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe('PENDING');
    expect(job.attempts).toBe(0);
    await runDueJobs({ prisma, queues: ['default'], handlers: handlers as never });
    const done = await prisma.sapPosting.findUniqueOrThrow({ where: { id: f.postingId } });
    expect(done.status).toBe('POSTED');
    const att = await prisma.sapPostingAttempt.findMany({ where: { postingId: f.postingId }, orderBy: { attemptNo: 'asc' } });
    expect(att.map((a) => a.trigger)).toEqual(['AUTO', 'MANUAL']);
    expect(att[1]!.triggeredById).toBe(admin.id);
    await expect(retrySapPosting(prisma, f.postingId!, admin.id)).rejects.toThrow(/POSTED/);
  });

  it('notifies sap.retry holders after the last automatic attempt', async () => {
    const f = await createRequestFixture(prisma, { withSapPosting: true });
    await prisma.sapPosting.update({ where: { id: f.postingId }, data: { attempts: 7, status: 'FAILED' } });
    mock.failNext(1);
    await expect(processSapPosting(prisma, f.postingId!)).rejects.toThrow();
    const n = await prisma.notification.count({ where: { type: 'SAP_FAILED', requestId: f.requestId } });
    expect(n).toBeGreaterThan(0);
  });
});

describe('file adapter', () => {
  it('writes csv + xlsx, doc number FILE-<seq>, idempotent by reference, exportFileKey saved', async () => {
    const storage = createLocalStorage(mkdtempSync(join(tmpdir(), 'dms-sap-')));
    registerSapAdapter('file', new FileSapAdapter(storage));
    const f = await createRequestFixture(prisma, { withSapPosting: true });
    await prisma.sapPosting.update({ where: { id: f.postingId }, data: { adapter: 'file' } });
    const p = await processSapPosting(prisma, f.postingId!);
    expect(p.sapDocNumber).toMatch(/^FILE-\d{6}$/);
    expect(p.exportFileKey).toMatch(new RegExp(`^sap-export/\\d{4}-\\d{2}-\\d{2}/${f.number}\\.csv$`));
    const csv = (await storage.get(p.exportFileKey!)).toString('utf8');
    expect(csv).toContain(f.number);
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1 + 3);
    expect(await storage.exists(p.exportFileKey!.replace('.csv', '.xlsx'))).toBe(true);
    const again = await new FileSapAdapter(storage).findByReference(f.number);
    expect(again?.documentNumber).toBe(p.sapDocNumber);
    registerSapAdapter('file', null);
  });
});

describe('s4hana adapter (fixtures only, no network)', () => {
  const doc = {
    idempotencyKey: 'req1',
    reference: 'DE-26-000123',
    companyCode: '1000',
    documentType: 'SA',
    currency: 'EGP' as const,
    postingDate: '2026-03-10',
    documentDate: '2026-03-10',
    headerText: 'Driver 2157 & <co>',
    items: [
      { side: 'D' as const, postingKey: '40', glAccount: '51501100', costCenter: 'MLF450', amount: '100.00', assignment: 'DE-26-000123', itemText: 'Tolls' },
      { side: 'C' as const, postingKey: '50', glAccount: '11001000', amount: '100.00', assignment: 'DE-26-000123', itemText: 'Payment' },
    ],
  };

  it('builds the bulk create envelope', () => {
    const xml = buildSoapEnvelope(doc, { now: new Date('2026-03-10T10:00:00Z') });
    expect(xml).toContain('<sfin:JournalEntryBulkCreateRequest>');
    expect(xml).toContain('<DocumentReferenceID>DE-26-000123</DocumentReferenceID>');
    expect(xml).toContain('<DocumentHeaderText>Driver 2157 &amp; &lt;co&gt;</DocumentHeaderText>');
    expect(xml).toContain('<AmountInTransactionCurrency currencyCode="EGP">100.00</AmountInTransactionCurrency>');
    expect(xml).toContain('<AmountInTransactionCurrency currencyCode="EGP">-100.00</AmountInTransactionCurrency>');
    expect(xml).toContain('<CostCenter>MLF450</CostCenter>');
    expect((xml.match(/<Item>/g) ?? []).length).toBe(2);
  });

  it('parses a confirmation', () => {
    const ok = `<soap:Envelope xmlns:soap="x"><soap:Body><n0:JournalEntryBulkCreateConfirmation xmlns:n0="y">
      <JournalEntryCreateConfirmation><JournalEntryCreateConfirmation>
        <AccountingDocument>1400000123</AccountingDocument><CompanyCode>1000</CompanyCode><FiscalYear>2026</FiscalYear>
      </JournalEntryCreateConfirmation>
      <Log><Item><SeverityCode>1</SeverityCode><Note>Posted</Note></Item></Log></JournalEntryCreateConfirmation>
    </n0:JournalEntryBulkCreateConfirmation></soap:Body></soap:Envelope>`;
    expect(parseSoapResponse(ok)).toEqual({ ok: true, documentNumber: '1400000123', fiscalYear: '2026', companyCode: '1000' });
  });

  it('parses error log and SOAP fault', () => {
    const err = `<Envelope><Body><JournalEntryBulkCreateConfirmation><JournalEntryCreateConfirmation>
      <AccountingDocument>$</AccountingDocument>
      <Log><Item><SeverityCode>3</SeverityCode><Note>G/L account 51501100 is blocked</Note></Item></Log>
      </JournalEntryCreateConfirmation></JournalEntryBulkCreateConfirmation></Body></Envelope>`;
    const r = parseSoapResponse(err);
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain('blocked');
    const fault = '<soap:Envelope><soap:Body><soap:Fault><faultcode>x</faultcode><faultstring>Not authorized</faultstring></soap:Fault></soap:Body></soap:Envelope>';
    expect(parseSoapResponse(fault)).toEqual({ ok: false, error: 'SOAP fault: Not authorized' });
    expect(parseSoapResponse('<a/>')).toMatchObject({ ok: false });
  });

  it('refuses to run without configuration and never calls the network', async () => {
    let called = false;
    const a = new S4HanaSapAdapter({}, (async () => {
      called = true;
      return new Response('');
    }) as typeof fetch);
    await expect(a.post(doc)).rejects.toThrow(/not configured/);
    expect(called).toBe(false);
  });

  it('posts through an injected fetch and maps the confirmation', async () => {
    const a = new S4HanaSapAdapter({ url: 'https://sap.invalid/ws', user: 'u', password: 'p', client: '100' }, (async (_u: unknown, init: RequestInit) => {
      expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
      return new Response('<R><AccountingDocument>77</AccountingDocument><CompanyCode>1000</CompanyCode><FiscalYear>2026</FiscalYear></R>', { status: 200 });
    }) as typeof fetch);
    expect(await a.post(doc)).toMatchObject({ documentNumber: '77', fiscalYear: '2026' });
  });
});
