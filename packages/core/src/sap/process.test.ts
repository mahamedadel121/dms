import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupTestDb } from '@dms/db/testing';
import type { PrismaClient } from '@prisma/client';
import { setSetting } from '../config';
import { createRequestFixture } from '../pdf/fixtures';
import {
  S4CashJournalAdapter,
  SapLookupUnavailableError,
  SapRejectedError,
  buildJournalEntry,
  processSapPosting,
  registerSapAdapter,
  retrySapPosting,
  type SapPostingAdapter,
} from './index';

let prisma: PrismaClient;
let teardown: () => Promise<void>;

beforeAll(async () => {
  const t = await setupTestDb('p2-sap-process');
  prisma = t.prisma;
  teardown = t.teardown;
});
afterAll(async () => {
  await teardown?.();
  registerSapAdapter('mock', null);
  registerSapAdapter('s4hana-cj', null);
});
beforeEach(() => {
  registerSapAdapter('mock', null);
  registerSapAdapter('s4hana-cj', null);
});

type Hit = { documentNumber: string; fiscalYear: string } | null;
function stub(o: {
  post: (n: number) => Promise<{ documentNumber: string; fiscalYear: string; companyCode: string }> | { documentNumber: string; fiscalYear: string; companyCode: string };
  find: () => Hit | Promise<Hit>;
}) {
  const calls = { post: 0, find: 0 };
  const a: SapPostingAdapter = {
    name: 'mock',
    post: async () => o.post(++calls.post),
    findByReference: async () => {
      calls.find++;
      return o.find();
    },
  };
  registerSapAdapter('mock', a);
  return calls;
}
const ok = { documentNumber: '0100000001', fiscalYear: '2026', companyCode: '1000' };
const lookupDown = (permanent: boolean) => () => {
  throw new SapLookupUnavailableError('lookup down', permanent);
};

async function posting() {
  const f = await createRequestFixture(prisma, { withSapPosting: true });
  return f as typeof f & { postingId: string };
}

describe('processSapPosting phase 2', () => {
  it('a definite failure is retried without a lookup', async () => {
    const calls = stub({
      post: (n) => {
        if (n === 1) throw new SapRejectedError('S/4HANA rejected the posting: blocked');
        return ok;
      },
      find: () => null,
    });
    const f = await posting();
    await expect(processSapPosting(prisma, f.postingId)).rejects.toThrow();
    const p = await processSapPosting(prisma, f.postingId, { trigger: 'MANUAL' });
    expect(p.status).toBe('POSTED');
    expect(calls.find).toBe(0);
    expect(calls.post).toBe(2);
  });

  it('an ambiguous failure triggers the lookup and reuses the document', async () => {
    const calls = stub({
      post: () => {
        throw new Error('socket hang up');
      },
      find: () => ({ documentNumber: '0100000042', fiscalYear: '2026' }),
    });
    const f = await posting();
    await expect(processSapPosting(prisma, f.postingId)).rejects.toThrow('socket hang up');
    const p = await processSapPosting(prisma, f.postingId, { trigger: 'MANUAL' });
    expect(p.status).toBe('POSTED');
    expect(p.sapDocNumber).toBe('0100000042');
    expect(calls.post).toBe(1);
    const last = await prisma.sapPostingAttempt.findFirstOrThrow({ where: { postingId: f.postingId }, orderBy: { attemptNo: 'desc' } });
    expect((last.response as { reusedExisting: boolean }).reusedExisting).toBe(true);
  });

  it('stores definiteFailure on the failed attempt', async () => {
    stub({
      post: () => {
        throw new SapRejectedError('no');
      },
      find: () => null,
    });
    const f = await posting();
    await expect(processSapPosting(prisma, f.postingId)).rejects.toThrow();
    const a = await prisma.sapPostingAttempt.findFirstOrThrow({ where: { postingId: f.postingId } });
    expect(a.response).toMatchObject({ definiteFailure: true });
  });

  it('a permanent lookup failure stops with UNKNOWN_OUTCOME and marks the error fatal', async () => {
    const calls = stub({
      post: () => {
        throw new Error('timeout');
      },
      find: lookupDown(true),
    });
    const f = await posting();
    await expect(processSapPosting(prisma, f.postingId)).rejects.toThrow('timeout');
    const e = await processSapPosting(prisma, f.postingId, { trigger: 'MANUAL' }).catch((x: unknown) => x as Error & { fatal?: boolean });
    expect((e as { fatal?: boolean }).fatal).toBe(true);
    const row = await prisma.sapPosting.findUniqueOrThrow({ where: { id: f.postingId } });
    expect(row.lastError?.startsWith('UNKNOWN_OUTCOME')).toBe(true);
    expect(calls.post).toBe(1);
  });

  it('force lets an operator post after an unavailable lookup', async () => {
    const calls = stub({
      post: (n) => {
        if (n === 1) throw new Error('timeout');
        return ok;
      },
      find: lookupDown(true),
    });
    const f = await posting();
    await expect(processSapPosting(prisma, f.postingId)).rejects.toThrow();
    const p = await processSapPosting(prisma, f.postingId, { trigger: 'MANUAL', userId: undefined, force: true });
    expect(p.status).toBe('POSTED');
    expect(calls.post).toBe(2);
    const last = await prisma.sapPostingAttempt.findFirstOrThrow({ where: { postingId: f.postingId }, orderBy: { attemptNo: 'desc' } });
    expect((last.response as { forced: boolean }).forced).toBe(true);
  });

  it('force is ignored when the lookup works', async () => {
    const calls = stub({
      post: (n) => {
        if (n === 1) throw new Error('timeout');
        return ok;
      },
      find: () => ({ documentNumber: '0100000099', fiscalYear: '2026' }),
    });
    const f = await posting();
    await expect(processSapPosting(prisma, f.postingId)).rejects.toThrow();
    const p = await processSapPosting(prisma, f.postingId, { trigger: 'MANUAL', force: true });
    expect(p.sapDocNumber).toBe('0100000099');
    expect(calls.post).toBe(1);
  });

  it('retrySapPosting stores force in the job payload', async () => {
    stub({
      post: () => {
        throw new Error('timeout');
      },
      find: () => null,
    });
    const f = await posting();
    await expect(processSapPosting(prisma, f.postingId)).rejects.toThrow();
    const user = await prisma.user.findFirstOrThrow();
    await retrySapPosting(prisma, f.postingId, user.id, { force: true });
    const job = await prisma.job.findUniqueOrThrow({ where: { dedupeKey: `sap.post:${f.requestId}` } });
    expect(job.payload).toMatchObject({ postingId: f.postingId, trigger: 'MANUAL', userId: user.id, force: true });
  });

  it('buildJournalEntry fills the cashJournal block from sap.config', async () => {
    const f = await createRequestFixture(prisma, {});
    const treasury = await prisma.treasury.findFirstOrThrow({ where: { isDefault: true } });
    const { getSetting } = await import('../config');
    const cfg = await getSetting(prisma, 'sap.config');
    await setSetting(prisma, 'sap.config', {
      ...cfg,
      cashJournal: { defaultNumber: '0009', numberByTreasuryCode: { [treasury.code]: '0003' }, businessTransaction: 'EXP1' },
    });
    const mapped = await buildJournalEntry(prisma, f.requestId);
    expect(mapped.cashJournal).toEqual({ number: '0003', treasuryCode: treasury.code, businessTransaction: 'EXP1' });
    await setSetting(prisma, 'sap.config', { ...cfg, cashJournal: { defaultNumber: '0009', numberByTreasuryCode: {}, businessTransaction: 'EXP1' } });
    const fallback = await buildJournalEntry(prisma, f.requestId);
    expect(fallback.cashJournal?.number).toBe('0009');
    await setSetting(prisma, 'sap.config', cfg);
  });

  it('the s4hana-cj adapter posts through the outbox', async () => {
    const xml =
      '<COMPANY_CODE>1000</COMPANY_CODE><FISCAL_YEAR>2026</FISCAL_YEAR><CASH_JOURNAL_DOC_NO>0000004711</CASH_JOURNAL_DOC_NO><RETURN/>';
    const fake = (async () => new Response(xml, { status: 200 })) as unknown as typeof fetch;
    registerSapAdapter(
      's4hana-cj',
      new S4CashJournalAdapter({ url: 'https://sap.invalid/cj', user: 'u', password: 'p', functionName: 'BAPI_CASHJOURNALDOC_CREATE', timeoutMs: 1000 }, fake),
    );
    const f = await createRequestFixture(prisma, { withSapPosting: true });
    await prisma.sapPosting.update({ where: { id: f.postingId! }, data: { adapter: 's4hana-cj' } });
    const p = await processSapPosting(prisma, f.postingId!);
    expect(p.status).toBe('POSTED');
    expect(p.sapDocNumber).toBe('0000004711');
  });
});
