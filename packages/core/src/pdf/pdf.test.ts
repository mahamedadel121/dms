import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb } from '@dms/db/testing';
import type { PrismaClient } from '@prisma/client';
import { createLocalStorage, type StorageAdapter } from '../storage';
import {
  buildDocumentModel,
  closePdfBrowser,
  finalizeRequestPdf,
  renderDocumentHtml,
  renderRequestPdf,
  sha256Hex,
  verifyFinalPdf,
} from './index';
import { createRequestFixture, type Scenario } from './fixtures';

let prisma: PrismaClient;
let teardown: () => Promise<void>;
let storage: StorageAdapter;

beforeAll(async () => {
  const t = await setupTestDb('wp4-pdf');
  prisma = t.prisma;
  teardown = t.teardown;
  storage = createLocalStorage(mkdtempSync(join(tmpdir(), 'dms-pdf-')));
});
afterAll(async () => {
  await closePdfBrowser();
  await teardown?.();
});

const roles = (html: string) => [...html.matchAll(/class="sig-block" data-kind="(\w+)" data-role="([^"]*)"/g)].map((m) => m[2]!);

describe('document model + HTML', () => {
  const cases: [Scenario, string[]][] = [
    ['neither', ['السائق', 'مشرف الحملة', 'مدير الحملة', 'محاسب', 'رئيس الحسابات', 'المدير العام', 'الخزينة']],
    ['maintenance', ['السائق', 'مشرف الحملة', 'مهندس الصيانة', 'مدير الحملة', 'محاسب', 'رئيس الحسابات', 'المدير العام', 'الخزينة']],
    ['tips', ['السائق', 'مشرف الحملة', 'مسؤول الشحن', 'مدير الحملة', 'محاسب', 'رئيس الحسابات', 'المدير العام', 'الخزينة']],
    ['both', ['السائق', 'مشرف الحملة', 'مهندس الصيانة', 'مسؤول الشحن', 'مدير الحملة', 'محاسب', 'رئيس الحسابات', 'المدير العام', 'الخزينة']],
  ];
  it.each(cases)('scenario %s: exactly the applicable signature blocks', async (scenario, expected) => {
    const f = await createRequestFixture(prisma, { scenario, storage });
    const m = await buildDocumentModel(prisma, f.requestId, { storage });
    const html = renderDocumentHtml(m);
    expect(roles(html)).toEqual(expected);
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain('كشف مصاريف');
    expect(html).not.toContain('معاينة');
    // every block carries a signature image (data URI) and a Cairo date-time
    expect((html.match(/class="sig-img"/g) ?? []).length).toBe(expected.length);
    expect(html).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    // no network references
    expect(html).not.toMatch(/(src|href)="https?:/);
  });

  it('shows original vs corrected, price per liter, odometer, total digits and words', async () => {
    const f = await createRequestFixture(prisma, { scenario: 'neither', edited: true, storage });
    const html = renderDocumentHtml(await buildDocumentModel(prisma, f.requestId, { storage }));
    expect(html).toContain('800.00'); // original
    expect(html).toContain('750.50'); // corrected
    expect(html).toContain('orig-strike');
    expect(html).toContain('7.51'); // unit price
    expect(html).toContain('154200'); // odometer
    expect(html).toContain('2157'); // vehicle
    expect(html).toContain('850.50'); // total
  });

  it('total in numbers and Arabic words', async () => {
    const f = await createRequestFixture(prisma, { scenario: 'neither', edited: true, storage });
    const m = await buildDocumentModel(prisma, f.requestId, { storage });
    expect(m.totalFinal).toBe('850.50');
    expect(m.amountWords).toBe('ثمانمائة وخمسون جنيهاً مصرياً وخمسون قرشاً فقط لا غير');
    const html = renderDocumentHtml(m);
    expect(html).toContain('850.50 EGP');
    expect(html).toContain(m.amountWords!);
  });

  it('preview of an unfinished request shows only the approvals so far, with the banner', async () => {
    const f = await createRequestFixture(prisma, { scenario: 'both', status: 'IN_REVIEW', approvedUpTo: 2, storage });
    const html = renderDocumentHtml(await buildDocumentModel(prisma, f.requestId, { storage }));
    expect(roles(html)).toEqual(['السائق', 'مشرف الحملة', 'مهندس الصيانة']);
    expect(html).toContain('معاينة');
  });

  it('delegated approval shows "عن <delegator>" and the actual approver as signer', async () => {
    const f = await createRequestFixture(prisma, { scenario: 'neither', delegatedBy: 'manager', storage });
    const m = await buildDocumentModel(prisma, f.requestId, { storage });
    const b = m.signatures.find((s) => s.title === 'مشرف الحملة')!;
    expect(b.name).toBe('محمود السيد');
    expect(b.onBehalfOf).toBe('عن أحمد عبد الرحمن');
  });

  it('escapes HTML in values', async () => {
    const f = await createRequestFixture(prisma, { scenario: 'neither', storage });
    await prisma.requestLine.updateMany({ where: { requestId: f.requestId }, data: { note: '<script>alert(1)</script>' } });
    const tv = await prisma.templateVersion.findFirstOrThrow({ where: { status: 'ACTIVE' } });
    const cfg = tv.config as { lineColumns: { key: string; show: boolean }[] };
    cfg.lineColumns.find((c) => c.key === 'note')!.show = true;
    const html = renderDocumentHtml(await buildDocumentModel(prisma, f.requestId, { storage, templateConfig: cfg as never }));
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('PDF rendering + finalize', () => {
  it('renders a real PDF (> 5 KB) for preview', async () => {
    const f = await createRequestFixture(prisma, { scenario: 'both', storage });
    const pdf = await renderRequestPdf(prisma, f.requestId, { storage });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5 * 1024);
  }, 90_000);

  it('final PDF is stored, locked, hashed; second finalize is a no-op; hash verifies', async () => {
    const f = await createRequestFixture(prisma, { scenario: 'maintenance', storage });
    const d1 = await finalizeRequestPdf(prisma, storage, f.requestId);
    expect(d1.isLocked).toBe(true);
    expect(d1.kind).toBe('FINAL');
    expect(d1.storageKey).toBe(`documents/${f.number}/final.pdf`);
    const bytes = await storage.get(d1.storageKey);
    expect(sha256Hex(bytes)).toBe(d1.sha256);
    expect(d1.sizeBytes).toBe(bytes.length);
    const d2 = await finalizeRequestPdf(prisma, storage, f.requestId);
    expect(d2.id).toBe(d1.id);
    expect(d2.generatedAt).toEqual(d1.generatedAt);
    expect(await prisma.requestDocument.count({ where: { requestId: f.requestId } })).toBe(1);
    expect(await prisma.requestEvent.count({ where: { requestId: f.requestId, type: 'PDF_FINALIZED' } })).toBe(1);
    expect(await verifyFinalPdf(prisma, storage, f.requestId)).toMatchObject({ ok: true, sha256: d1.sha256 });
    // tamper -> verify fails (the file is immutable through the app; this simulates disk tampering)
    await storage.put(d1.storageKey, Buffer.from('tampered'));
    expect((await verifyFinalPdf(prisma, storage, f.requestId)).ok).toBe(false);
  }, 90_000);

  it('concurrent finalize yields one document', async () => {
    const f = await createRequestFixture(prisma, { scenario: 'tips', storage });
    const [a, b] = await Promise.all([
      finalizeRequestPdf(prisma, storage, f.requestId),
      finalizeRequestPdf(prisma, storage, f.requestId),
    ]);
    expect(a.id).toBe(b.id);
    expect(await prisma.requestDocument.count({ where: { requestId: f.requestId } })).toBe(1);
  }, 90_000);

  it('refuses to finalize an unpaid request', async () => {
    const f = await createRequestFixture(prisma, { status: 'IN_REVIEW', storage });
    await expect(finalizeRequestPdf(prisma, storage, f.requestId)).rejects.toThrow(/PAID/);
  });
});
