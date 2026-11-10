import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetConfigCache } from '@dms/core/config';
import { getStorage, signFileUrl } from '@dms/core/storage';
import { createTestApp, type TestApp } from '../helpers';

let t: TestApp;

beforeAll(async () => {
  process.env.STORAGE_ROOT = mkdtempSync(join(tmpdir(), 'wp5-api-files-'));
  resetConfigCache();
  t = await createTestApp('wp5-files');
  await getStorage().put('attachments/2026/01/abc.png', Buffer.from('PNGDATA'));
  await getStorage().put('exports/x/report.xlsx', Buffer.from('XLSXDATA'));
});
afterAll(async () => {
  await t?.close();
});

describe('GET /api/v1/files/:keyB64', () => {
  it('serves a validly signed URL without any Authorization header', async () => {
    const res = await t.http.get(signFileUrl('attachments/2026/01/abc.png', { ttlSec: 60 }));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toMatch(/^private, max-age=\d+$/);
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(res.body.toString()).toBe('PNGDATA');
  });
  it('adds Content-Disposition for download links and sanitises the name', async () => {
    const res = await t.http.get(signFileUrl('exports/x/report.xlsx', { download: true, fileName: 'تقرير "Q1".xlsx' }));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="[^"\r\n]*"; filename\*=UTF-8''/);
    expect(res.headers['content-type']).toContain('spreadsheetml');
  });
  it('rejects expired, tampered, wrong-key and malformed links with 403', async () => {
    expect((await t.http.get(signFileUrl('attachments/2026/01/abc.png', { ttlSec: -1 }))).status).toBe(403);
    const ok = signFileUrl('attachments/2026/01/abc.png', { ttlSec: 60 });
    expect((await t.http.get(ok.replace(/sig=.{4}/, 'sig=AAAA'))).status).toBe(403);
    expect((await t.http.get(ok + '&d=1')).status).toBe(403);
    const other = Buffer.from('exports/x/report.xlsx').toString('base64url');
    expect((await t.http.get(ok.replace(/files\/[^?]+/, `files/${other}`))).status).toBe(403);
    expect((await t.http.get('/api/v1/files/not-base64!!?exp=1&sig=x')).status).toBe(403);
    const trav = Buffer.from('../../etc/passwd').toString('base64url');
    expect((await t.http.get(`/api/v1/files/${trav}?exp=9999999999&sig=x`)).status).toBe(403);
    expect((await t.http.get('/api/v1/files/abc')).status).toBe(403);
  });
  it('404 for a validly signed link to a missing file', async () => {
    expect((await t.http.get(signFileUrl('attachments/2026/01/missing.png'))).status).toBe(404);
  });
});
