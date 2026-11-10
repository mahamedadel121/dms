import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb } from '@dms/db/testing';
import type { PrismaClient } from '@prisma/client';
import { Registry, collectDbMetrics, collectProcessMetrics, escapeLabelValue } from './index';

let prisma: PrismaClient;
let teardown: () => Promise<void>;

beforeAll(async () => {
  const t = await setupTestDb('p2-metrics');
  prisma = t.prisma;
  teardown = t.teardown;
});
afterAll(async () => {
  await teardown?.();
});

describe('metrics registry', () => {
  it('renders HELP, TYPE and a sample for a counter', () => {
    const r = new Registry();
    r.counter('c_total', 'A counter').inc();
    r.counter('c_total', 'A counter').inc({}, 2);
    expect(r.render()).toBe('# HELP c_total A counter\n# TYPE c_total counter\nc_total 3\n');
  });
  it('renders labels in declared order and escapes values', () => {
    const r = new Registry();
    r.counter('x_total', 'X', ['b', 'a']).inc({ a: '1', b: 'q"u\\o\nte' });
    expect(r.render()).toContain('x_total{b="q\\"u\\\\o\\nte",a="1"} 1');
    expect(escapeLabelValue('a\\b"c\nd')).toBe('a\\\\b\\"c\\nd');
  });
  it('returns the same metric for the same name', () => {
    const r = new Registry();
    expect(r.counter('same', 'h')).toBe(r.counter('same', 'h'));
    expect(r.gauge('g', 'h')).toBe(r.gauge('g', 'h'));
  });
  it('gauge set and reset', () => {
    const r = new Registry();
    const g = r.gauge('g', 'G', ['k']);
    g.set(5, { k: 'a' });
    expect(r.render()).toContain('g{k="a"} 5');
    g.reset();
    expect(r.render()).not.toContain('g{k="a"}');
  });
  it('histogram renders cumulative buckets, +Inf, sum and count', () => {
    const r = new Registry();
    const h = r.histogram('h_seconds', 'H', [0.1, 1], ['m']);
    h.observe(0.05, { m: 'GET' });
    h.observe(0.5, { m: 'GET' });
    h.observe(5, { m: 'GET' });
    const out = r.render();
    expect(out).toContain('# TYPE h_seconds histogram');
    expect(out).toContain('h_seconds_bucket{m="GET",le="0.1"} 1');
    expect(out).toContain('h_seconds_bucket{m="GET",le="1"} 2');
    expect(out).toContain('h_seconds_bucket{m="GET",le="+Inf"} 3');
    expect(out).toContain('h_seconds_sum{m="GET"} 5.55');
    expect(out).toContain('h_seconds_count{m="GET"} 3');
  });
  it('render sorts metrics and ends with a newline', () => {
    const r = new Registry();
    r.gauge('zzz', 'Z').set(1);
    r.gauge('aaa', 'A').set(1);
    const out = r.render();
    expect(out.indexOf('# HELP aaa')).toBeLessThan(out.indexOf('# HELP zzz'));
    expect(out.endsWith('\n')).toBe(true);
  });
});

describe('collectors', () => {
  it('collectProcessMetrics sets uptime and memory', () => {
    const r = new Registry();
    collectProcessMetrics(r);
    const out = r.render();
    expect(out).toMatch(/dms_process_uptime_seconds \d+/);
    expect(out).toMatch(/dms_process_resident_memory_bytes \d+/);
    expect(out).toMatch(/dms_process_heap_used_bytes \d+/);
    expect(out).toContain('dms_build_info{version="');
  });
  it('collectDbMetrics reports db up and job counts', async () => {
    await prisma.job.create({
      data: { type: 'p2.metrics.test', queue: 'default', status: 'PENDING', runAt: new Date(Date.now() - 5000) },
    });
    const r = new Registry();
    await collectDbMetrics(prisma, r);
    const out = r.render();
    expect(out).toContain('dms_db_up 1');
    expect(out).toMatch(/dms_jobs\{queue="default",status="PENDING"\} [1-9]/);
    expect(out).toMatch(/dms_jobs_oldest_pending_age_seconds\{queue="default"\} \d/);
  });
  it('collectDbMetrics reports db down when a query fails', async () => {
    const r = new Registry();
    const broken = {
      $queryRaw: async () => {
        throw new Error('down');
      },
    } as unknown as PrismaClient;
    await collectDbMetrics(broken, r);
    expect(r.render()).toContain('dms_db_up 0');
  });
});
