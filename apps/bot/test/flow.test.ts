import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addLine, beginRequest, jpeg, linkDriver, PDF, setup, tail, type Env } from './helpers';

let env: Env;
beforeAll(async () => {
  env = await setup('wp3-flow');
});
afterAll(async () => {
  await env.db.teardown();
});

const numberOf = (text: string | undefined) => /DE-\d{2}-\d{6}/.exec(text ?? '')?.[0];

describe('request flow', () => {
  it('happy path: vehicle confirm, odometer, line, photos, summary, confirm -> DE-YY-NNNNNN', async () => {
    const u = await linkDriver(env.h, 1);
    await u.click('طلب جديد');
    expect(u.lastText()).toContain('2157');
    expect(u.lastText()).toContain('MLF450');
    await u.click('أيوه');
    await u.text('120000');
    expect(u.lastText()).toContain('نوع المصروف');
    await addLine(u, 'صيانة', '1500');
    expect(u.lastText()).toContain('تحب تضيف');
    await u.click('كده خلصت');
    expect(u.lastText()).toContain('1500.00');
    expect(u.lastText()).toContain('الإجمالي');
    await u.click('تأكيد وإرسال');
    const num = numberOf(u.lastText());
    expect(num).toBeTruthy();
    expect(u.sent().at(-1)!.html).toBe(true);
    expect(u.lastText()).toContain('اكتب الرقم ده على الإيصالات');
    const req = await env.prisma.request.findFirstOrThrow({ where: { number: num! }, include: { lines: true } });
    expect(req.channel).toBe('TELEGRAM');
    expect(req.lines).toHaveLength(1);
    const s = await env.prisma.botSession.findFirstOrThrow({ where: { telegramUserId: 5001n } });
    expect(s.state).toBe('IDLE');
    expect(s.draft).toBeNull();
  });

  it('accepts Arabic-Indic and Persian digits for odometer and amount', async () => {
    const u = await linkDriver(env.h, 2);
    await beginRequest(u, '٣٥٠٠٠');
    await addLine(u, 'رسوم طرق', '٢٥٠٫٥');
    await u.click('كده خلصت');
    expect(u.lastText()).toContain('250.50');
    expect(u.lastText()).toContain('35000');
    await u.click('تعديل');
    await u.click('line:0');
    await u.click('تغيير المبلغ');
    await u.text('۱۲۳۴'); // Persian digits
    expect(u.lastText()).toContain('1234.00');
  });

  it('invalid amount and text when a photo is expected get friendly guidance and keep the state', async () => {
    const u = await linkDriver(env.h, 3);
    await beginRequest(u);
    await u.click('صيانة');
    await u.text('abc');
    expect(u.lastText()).toContain('أكبر من صفر');
    await u.text('0');
    expect(u.lastText()).toContain('أكبر من صفر');
    await u.text('-5');
    expect(u.lastText()).toContain('أكبر من صفر');
    await u.text('300');
    await u.text('هنا الإيصال');
    expect(u.lastText()).toContain('صورة الإيصال');
    await u.click('خلصت صور'); // none uploaded yet
    expect(u.lastText()).toContain('لازم');
    await u.photo(await jpeg());
    expect(u.lastText()).toContain('استلمت');
    // non-image document is rejected by the media pipeline
    await u.document(Buffer.from('MZ not an image'), 'virus.exe', 'application/octet-stream');
    expect(u.lastText()).toContain('مش مقبول');
    await u.click('خلصت صور');
    expect(u.lastText()).toContain('تحب تضيف');
  });

  it('odometer must be numeric', async () => {
    const u = await linkDriver(env.h, 4);
    await u.click('طلب جديد');
    await u.click('أيوه');
    await u.text('12ab');
    expect(u.lastText()).toContain('رقم صحيح');
  });

  it('stopped vehicle blocks the request', async () => {
    const u = await linkDriver(env.h, 7);
    await u.click('طلب جديد');
    expect(u.lastText()).toContain('موقوفة');
    const s = await env.prisma.botSession.findFirstOrThrow({ where: { telegramUserId: 5007n } });
    expect(s.draft).toBeNull();
  });

  it('odometer lower than last shows a warning the driver must confirm; the warning is kept for approvers', async () => {
    const u = await linkDriver(env.h, 5);
    const a = await env.prisma.driverVehicleAssignment.findFirstOrThrow({
      where: { submitter: { code: 'DRV005' }, validTo: null },
    });
    await env.prisma.vehicle.update({ where: { id: a.vehicleId }, data: { lastOdometer: 90000 } });
    await u.click('طلب جديد');
    await u.click('أيوه');
    await u.text('80000');
    expect(u.lastText()).toContain('أقل من آخر قراية');
    await u.click('هكتب تاني');
    expect(u.lastText()).toContain('اكتب قراية');
    await u.text('80000');
    await u.click('الرقم صح');
    expect(u.lastText()).toContain('نوع المصروف');
    const s = await env.prisma.botSession.findFirstOrThrow({ where: { telegramUserId: 5005n } });
    expect((s.draft as { odometerWarning?: string }).odometerWarning).toBe('LOWER_THAN_LAST');
    await addLine(u, 'إكراميات', '50');
    await u.click('كده خلصت');
    await u.click('تأكيد وإرسال');
    const num = numberOf(u.lastText())!;
    const r = await env.prisma.request.findFirstOrThrow({ where: { number: num } });
    expect(JSON.stringify(r.headerValues)).toContain('LOWER_THAN_LAST');
  });

  it('diesel asks for liters and the engine computes the price per liter', async () => {
    const u = await linkDriver(env.h, 6);
    await beginRequest(u);
    await u.click('سولار');
    await u.text('500');
    expect(u.lastText()).toContain('اللترات');
    await u.text('abc');
    expect(tail(u)).toContain('مش مظبوطة');
    await u.text('٢٠');
    await u.photo(await jpeg());
    await u.click('خلصت صور');
    await u.click('كده خلصت');
    await u.click('تأكيد وإرسال');
    const num = numberOf(u.lastText())!;
    const line = await env.prisma.requestLine.findFirstOrThrow({ where: { request: { number: num } } });
    expect(Number(line.quantity)).toBe(20);
    expect(Number(line.unitPrice)).toBe(25);
  });

  it('two lines, multi-photo and PDF on one line; edit amount and delete a line in the summary', async () => {
    const u = await linkDriver(env.h, 8);
    await beginRequest(u);
    await u.click('رسوم طرق');
    await u.text('40');
    await u.photo(await jpeg());
    await u.photo(await jpeg());
    await u.document(PDF, 'receipt.pdf');
    expect(u.lastText()).toContain('3');
    await u.click('خلصت صور');
    await u.click('إضافة مصروف تاني');
    await addLine(u, 'رسوم طرق', '60');
    await u.click('إضافة مصروف تاني');
    await addLine(u, 'ميزان', '15');
    await u.click('كده خلصت');
    expect(u.lastText()).toContain('115.00');
    await u.click('تعديل');
    await u.click('line:1');
    await u.click('تغيير المبلغ');
    await u.text('70');
    expect(u.lastText()).toContain('125.00');
    await u.click('تعديل');
    await u.click('line:2');
    await u.click('مسح المصروف');
    expect(u.lastText()).toContain('110.00');
    await u.click('تأكيد وإرسال');
    const num = numberOf(u.lastText())!;
    const lines = await env.prisma.requestLine.findMany({
      where: { request: { number: num } },
      orderBy: { lineNo: 'asc' },
      include: { attachments: true },
    });
    expect(lines.map((l) => Number(l.amount))).toEqual([40, 70]);
    expect(lines[0]!.attachments).toHaveLength(3);
    expect(lines[1]!.attachments).toHaveLength(1);
  });

  it('double tap on confirm creates exactly one request', async () => {
    const u = await linkDriver(env.h, 9);
    await beginRequest(u);
    await addLine(u, 'إكراميات', '25');
    await u.click('كده خلصت');
    await u.click('تأكيد وإرسال');
    await u.click('تأكيد وإرسال', { stale: true }); // second tap on the same (stale) button
    expect(tail(u)).toContain('قديم');
    const sub = await env.prisma.submitter.findUniqueOrThrow({ where: { code: 'DRV009' } });
    expect(await env.prisma.request.count({ where: { submitterId: sub.id } })).toBe(1);
  });

  it('cancel asks for confirmation and clears the draft', async () => {
    const u = await linkDriver(env.h, 10);
    await beginRequest(u);
    await addLine(u, 'إكراميات', '25');
    await u.click('كده خلصت');
    await u.click('إلغاء');
    expect(u.lastText()).toContain('متأكد');
    await u.click('لأ، كمّل');
    expect(u.lastText()).toContain('ملخص');
    await u.click('إلغاء');
    await u.click('أيوه، إلغاء الطلب');
    expect(tail(u)).toContain('اتلغى');
    const s = await env.prisma.botSession.findFirstOrThrow({ where: { telegramUserId: 5010n } });
    expect(s.draft).toBeNull();
  });
});
