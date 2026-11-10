import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetConfigCache } from '@dms/core/config';
import { createTestApp, type TestApp } from '../helpers';

let t: TestApp;
const saved = { ...process.env };

beforeAll(async () => {
  t = await createTestApp('p2-api-metrics');
});
afterAll(async () => {
  await t?.close();
});
afterEach(() => {
  process.env = { ...saved };
  resetConfigCache();
});

describe('GET /api/v1/metrics', () => {
  it('serves Prometheus text when open', async () => {
    const res = await t.http.get('/api/v1/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.text).toContain('dms_process_uptime_seconds');
    expect(res.text).toContain('dms_db_up 1');
  });
  it('counts HTTP requests by route', async () => {
    await t.http.get('/api/v1/health');
    await t.http.get('/api/v1/health');
    const res = await t.http.get('/api/v1/metrics');
    expect(res.text).toMatch(/dms_http_requests_total\{method="GET",route="[^"]*health",status="200"\} \d+/);
  });
  it('requires the bearer token when METRICS_TOKEN is set', async () => {
    process.env.METRICS_TOKEN = 'secret-token-123';
    resetConfigCache();
    expect((await t.http.get('/api/v1/metrics')).status).toBe(401);
    expect((await t.http.get('/api/v1/metrics').set('Authorization', 'Bearer wrong')).status).toBe(401);
    expect((await t.http.get('/api/v1/metrics').set('Authorization', 'Bearer secret-token-123')).status).toBe(200);
  });
  it('is hidden in production without a token', async () => {
    delete process.env.METRICS_TOKEN;
    process.env.NODE_ENV = 'production';
    resetConfigCache();
    expect((await t.http.get('/api/v1/metrics')).status).toBe(404);
  });
  it('health still returns JSON', async () => {
    const res = await t.http.get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
