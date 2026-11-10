import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startSimulator } from '../src/simulator/server';
import { jpeg, setup, type Env } from './helpers';

let env: Env;
let sim: Awaited<ReturnType<typeof startSimulator>>;
let base = '';

beforeAll(async () => {
  env = await setup('wp3-sim');
  sim = await startSimulator({ port: 0, prisma: env.prisma, storage: env.storage });
  base = `http://127.0.0.1:${sim.port}`;
});
afterAll(async () => {
  await sim.close();
  await env.db.teardown();
});

type View = { entries: { kind: string; id?: number; text: string; inline?: { text: string; data: string }[][] }[]; replyKeyboard: { text: string; contact?: boolean }[][] | null };
const send = async (driver: string, body: unknown): Promise<View> =>
  (await fetch(`${base}/api/send?driver=${driver}`, { method: 'POST', body: JSON.stringify(body) })).json() as Promise<View>;

describe('driver simulator', () => {
  it('serves the RTL page and lists the seeded drivers', async () => {
    const html = await (await fetch(base + '/')).text();
    expect(html).toContain('dir="rtl"');
    const drivers = (await (await fetch(base + '/api/drivers')).json()) as { code: string }[];
    expect(drivers.map((d) => d.code)).toContain('DRV001');
    expect(drivers).toHaveLength(10);
  });

  it('runs onboarding, a photo upload and a full request through the same bot; the request exists for approvers', async () => {
    let v = await send('DRV001', { type: 'text', text: '/start' });
    expect(v.replyKeyboard?.flat().some((b) => b.contact)).toBe(true);
    v = await send('DRV001', { type: 'contact', mode: 'foreign' });
    expect(v.entries.at(-1)!.text).toContain('مش رقم حسابك');
    v = await send('DRV001', { type: 'contact', mode: 'own' });
    expect(v.entries.at(-1)!.text).toContain('تم ربط حسابك');
    v = await send('DRV001', { type: 'text', text: 'طلب جديد' });
    const tap = async (label: string) => {
      const last = [...v.entries].reverse().find((e) => e.inline?.flat().some((b) => b.text.includes(label)))!;
      const b = last.inline!.flat().find((x) => x.text.includes(label))!;
      v = await send('DRV001', { type: 'click', msgId: last.id, data: b.data });
    };
    await tap('أيوه');
    v = await send('DRV001', { type: 'text', text: '77000' });
    await tap('إكراميات');
    v = await send('DRV001', { type: 'text', text: '30' });
    const up = await fetch(`${base}/api/upload?driver=DRV001&name=r.png&mime=image/png`, { method: 'POST', body: await jpeg() });
    v = (await up.json()) as View;
    expect(v.entries.at(-1)!.text).toContain('استلمت');
    await tap('خلصت صور');
    await tap('كده خلصت');
    await tap('تأكيد وإرسال');
    expect(v.entries.at(-1)!.text).toMatch(/DE-\d{2}-\d{6}/);
    const sub = await env.prisma.submitter.findUniqueOrThrow({ where: { code: 'DRV001' } });
    expect(await env.prisma.request.count({ where: { submitterId: sub.id, channel: 'TELEGRAM' } })).toBe(1);
    // reset lets the demo replay onboarding
    v = await send('DRV001', { type: 'reset' });
    expect(v.entries).toHaveLength(0);
    expect((await env.prisma.submitter.findUniqueOrThrow({ where: { code: 'DRV001' } })).telegramUserId).toBeNull();
  });
});
