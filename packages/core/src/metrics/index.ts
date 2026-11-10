import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Db } from '../common';

export type Labels = Record<string, string>;

/** Escapes a label value for the Prometheus text format. */
export function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function fmtLabels(names: string[], labels: Labels, extra?: [string, string]): string {
  const parts = names.map((n) => `${n}="${escapeLabelValue(String(labels[n] ?? ''))}"`);
  if (extra) parts.push(`${extra[0]}="${escapeLabelValue(extra[1])}"`);
  return parts.length ? `{${parts.join(',')}}` : '';
}

const keyOf = (names: string[], labels: Labels): string => names.map((n) => String(labels[n] ?? '')).join('|');

interface Metric {
  readonly name: string;
  readonly type: 'counter' | 'gauge' | 'histogram';
  readonly help: string;
  lines(): string[];
}

export class Counter implements Metric {
  readonly type = 'counter' as const;
  private values = new Map<string, { labels: Labels; value: number }>();
  constructor(
    readonly name: string,
    readonly help: string,
    private readonly labelNames: string[] = [],
  ) {}
  inc(labels: Labels = {}, by = 1): void {
    const k = keyOf(this.labelNames, labels);
    const cur = this.values.get(k);
    if (cur) cur.value += by;
    else this.values.set(k, { labels: { ...labels }, value: by });
  }
  lines(): string[] {
    return [...this.values.values()].map((v) => `${this.name}${fmtLabels(this.labelNames, v.labels)} ${String(v.value)}`);
  }
}

export class Gauge implements Metric {
  readonly type = 'gauge' as const;
  private values = new Map<string, { labels: Labels; value: number }>();
  constructor(
    readonly name: string,
    readonly help: string,
    private readonly labelNames: string[] = [],
  ) {}
  set(value: number, labels: Labels = {}): void {
    this.values.set(keyOf(this.labelNames, labels), { labels: { ...labels }, value });
  }
  reset(): void {
    this.values.clear();
  }
  lines(): string[] {
    return [...this.values.values()].map((v) => `${this.name}${fmtLabels(this.labelNames, v.labels)} ${String(v.value)}`);
  }
}

export class Histogram implements Metric {
  readonly type = 'histogram' as const;
  private series = new Map<string, { labels: Labels; counts: number[]; sum: number; count: number }>();
  private readonly buckets: number[];
  constructor(
    readonly name: string,
    readonly help: string,
    buckets: number[],
    private readonly labelNames: string[] = [],
  ) {
    this.buckets = [...buckets].sort((a, b) => a - b);
  }
  observe(value: number, labels: Labels = {}): void {
    const k = keyOf(this.labelNames, labels);
    let s = this.series.get(k);
    if (!s) {
      s = { labels: { ...labels }, counts: this.buckets.map(() => 0), sum: 0, count: 0 };
      this.series.set(k, s);
    }
    const target = s;
    this.buckets.forEach((b, i) => {
      if (value <= b) target.counts[i]++;
    });
    s.sum += value;
    s.count++;
  }
  lines(): string[] {
    const out: string[] = [];
    for (const s of this.series.values()) {
      this.buckets.forEach((b, i) => {
        out.push(`${this.name}_bucket${fmtLabels(this.labelNames, s.labels, ['le', String(b)])} ${String(s.counts[i])}`);
      });
      out.push(`${this.name}_bucket${fmtLabels(this.labelNames, s.labels, ['le', '+Inf'])} ${String(s.count)}`);
      out.push(`${this.name}_sum${fmtLabels(this.labelNames, s.labels)} ${String(s.sum)}`);
      out.push(`${this.name}_count${fmtLabels(this.labelNames, s.labels)} ${String(s.count)}`);
    }
    return out;
  }
}

export class Registry {
  private metrics = new Map<string, Metric>();

  counter(name: string, help: string, labelNames: string[] = []): Counter {
    const ex = this.metrics.get(name);
    if (ex) return ex as Counter;
    const m = new Counter(name, help, labelNames);
    this.metrics.set(name, m);
    return m;
  }
  gauge(name: string, help: string, labelNames: string[] = []): Gauge {
    const ex = this.metrics.get(name);
    if (ex) return ex as Gauge;
    const m = new Gauge(name, help, labelNames);
    this.metrics.set(name, m);
    return m;
  }
  histogram(name: string, help: string, buckets: number[], labelNames: string[] = []): Histogram {
    const ex = this.metrics.get(name);
    if (ex) return ex as Histogram;
    const m = new Histogram(name, help, buckets, labelNames);
    this.metrics.set(name, m);
    return m;
  }
  render(): string {
    const out: string[] = [];
    for (const name of [...this.metrics.keys()].sort()) {
      const m = this.metrics.get(name)!;
      out.push(`# HELP ${m.name} ${m.help}`, `# TYPE ${m.name} ${m.type}`, ...m.lines());
    }
    return out.join('\n') + '\n';
  }
  clear(): void {
    this.metrics.clear();
  }
}

export const registry = new Registry();

export const HTTP_BUCKETS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

let cachedVersion: string | undefined;
/** Root package.json version (next to pnpm-workspace.yaml), read once; '0.0.0' when not found. */
function buildVersion(): string {
  if (cachedVersion !== undefined) return cachedVersion;
  cachedVersion = '0.0.0';
  try {
    let dir = process.cwd();
    for (let i = 0; i < 8; i++) {
      if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version?: string };
        if (pkg.version) cachedVersion = pkg.version;
        break;
      }
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  } catch {
    /* keep the fallback */
  }
  return cachedVersion;
}

export function collectProcessMetrics(reg: Registry = registry): void {
  const mem = process.memoryUsage();
  reg.gauge('dms_process_uptime_seconds', 'Process uptime in seconds').set(Math.round(process.uptime()));
  reg.gauge('dms_process_resident_memory_bytes', 'Resident set size in bytes').set(mem.rss);
  reg.gauge('dms_process_heap_used_bytes', 'Heap used in bytes').set(mem.heapUsed);
  reg.gauge('dms_build_info', 'Build information', ['version']).set(1, { version: buildVersion() });
}

/** Sets the DB-derived gauges. Sets dms_db_up 0 and returns when any query fails. */
export async function collectDbMetrics(db: Db, reg: Registry = registry): Promise<void> {
  const up = reg.gauge('dms_db_up', '1 when the database answers SELECT 1');
  try {
    await db.$queryRaw`SELECT 1`;
    const now = new Date();
    const jobs = reg.gauge('dms_jobs', 'Jobs by queue and status', ['queue', 'status']);
    const oldest = reg.gauge('dms_jobs_oldest_pending_age_seconds', 'Age of the oldest runnable PENDING job', ['queue']);
    const sap = reg.gauge('dms_sap_postings', 'SAP postings by status', ['status']);
    const notif = reg.gauge('dms_notifications', 'Pending and failed notifications', ['channel', 'status']);
    const reqs = reg.gauge('dms_requests', 'Requests by status', ['status']);
    const overdue = reg.gauge('dms_steps_overdue', 'ACTIVE step instances past their due date');

    const jobRows = await db.job.groupBy({ by: ['queue', 'status'], _count: { _all: true } });
    const oldestRows = await db.job.groupBy({
      by: ['queue'],
      where: { status: 'PENDING', runAt: { lte: now } },
      _min: { runAt: true },
    });
    const sapRows = await db.sapPosting.groupBy({ by: ['status'], _count: { _all: true } });
    const notifRows = await db.notification.groupBy({
      by: ['channel', 'status'],
      where: { status: { in: ['PENDING', 'FAILED'] } },
      _count: { _all: true },
    });
    const reqRows = await db.request.groupBy({ by: ['status'], _count: { _all: true } });
    const overdueCount = await db.requestStepInstance.count({ where: { status: 'ACTIVE', dueAt: { lt: now } } });

    jobs.reset();
    for (const r of jobRows) jobs.set(r._count._all, { queue: r.queue, status: r.status });
    oldest.reset();
    for (const r of oldestRows) {
      if (r._min.runAt) oldest.set(Math.max(0, (now.getTime() - r._min.runAt.getTime()) / 1000), { queue: r.queue });
    }
    sap.reset();
    for (const r of sapRows) sap.set(r._count._all, { status: r.status });
    notif.reset();
    for (const r of notifRows) notif.set(r._count._all, { channel: r.channel, status: r.status });
    reqs.reset();
    for (const r of reqRows) reqs.set(r._count._all, { status: r.status });
    overdue.set(overdueCount);
    up.set(1);
  } catch {
    up.set(0);
  }
}
