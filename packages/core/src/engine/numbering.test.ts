import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createEnv, submitExpense, type Env } from './testkit';

let env: Env;
let prisma: PrismaClient;
beforeAll(async () => {
  env = await createEnv('wp2-numbering');
  prisma = env.prisma;
});
afterAll(async () => {
  await env?.teardown();
});

describe('request numbering', () => {
  it('50 concurrent submits give 50 distinct consecutive numbers', async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }], driverCode: ['DRV001', 'DRV002', 'DRV003', 'DRV004', 'DRV005', 'DRV006'][i % 6] }),
      ),
    );
    const nums = results.map((r) => Number(r.number.slice(-6))).sort((a, b) => a - b);
    expect(new Set(results.map((r) => r.number)).size).toBe(50);
    expect(nums[49] - nums[0]).toBe(49);
    expect(nums[0]).toBe(1);
    expect(results[0].number).toMatch(/^DE-\d\d-\d{6}$/);
    expect(results[0].number).toHaveLength(12);
  }, 120000);

  it('concurrent submits with the same clientKey create one request', async () => {
    const rs = await Promise.all(Array.from({ length: 5 }, () => submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }], clientKey: 'dup-key' })));
    expect(new Set(rs.map((r) => r.id)).size).toBe(1);
    expect(await prisma.request.count({ where: { clientKey: 'dup-key' } })).toBe(1);
  }, 60000);

  it('a rolled back submit leaves no gap', async () => {
    const before = await prisma.requestNumberCounter.findFirstOrThrow({ where: { prefix: 'DE' } });
    await expect(submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }], odometer: -1 })).rejects.toBeTruthy();
    const mid = await prisma.requestNumberCounter.findFirstOrThrow({ where: { prefix: 'DE' } });
    expect(mid.lastValue).toBe(before.lastValue);
    const ok = await submitExpense(prisma, { lines: [{ cat: 'TOLLS', amount: '10' }] });
    expect(Number(ok.number.slice(-6))).toBe(before.lastValue + 1);
  });
});
