import { crc32, deflateSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';

export const API = process.env.E2E_API_URL || 'http://localhost:4000/api/v1';
export const SIM = process.env.E2E_SIM_URL || 'http://127.0.0.1:3010';
export const PASSWORD = 'Passw0rd!';

export function noisePng(w = 96): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < w; y++) rows.push(Buffer.concat([Buffer.from([0]), randomBytes(w * 3)]));
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(w, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Any = any;

export class Api {
  token = '';
  constructor(public username: string) {}
  async login(): Promise<this> {
    const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: this.username, password: PASSWORD }) });
    if (!r.ok) throw new Error(`login ${this.username}: ${r.status} ${await r.text()}`);
    this.token = ((await r.json()) as Any).accessToken;
    return this;
  }
  async call<T = Any>(method: string, path: string, body?: unknown, ok = [200, 201]): Promise<T> {
    const r = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${this.token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    if (!ok.includes(r.status)) throw new Error(`${this.username} ${method} ${path}: ${r.status} ${text.slice(0, 400)}`);
    return (text ? JSON.parse(text) : null) as T;
  }
  get = <T = Any>(p: string) => this.call<T>('GET', p);
  post = <T = Any>(p: string, b?: unknown) => this.call<T>('POST', p, b ?? {});
  patch = <T = Any>(p: string, b: unknown) => this.call<T>('PATCH', p, b);
  async raw(path: string): Promise<Response> {
    return fetch(`${API}${path}`, { headers: { authorization: `Bearer ${this.token}` } });
  }
}

// ---- driver simulator (HTTP) ----
async function sim(driver: string, kind: 'send' | 'upload', body: Any, qs = ''): Promise<Any> {
  const r = await fetch(`${SIM}/api/${kind}?driver=${driver}${qs}`, {
    method: 'POST',
    headers: kind === 'send' ? { 'content-type': 'application/json' } : {},
    body: kind === 'send' ? JSON.stringify(body) : body,
  });
  if (!r.ok) throw new Error(`sim ${kind}: ${r.status} ${await r.text()}`);
  return r.json();
}

export class SimDriver {
  constructor(public code: string) {}
  async log(): Promise<Any> {
    return (await fetch(`${SIM}/api/log?driver=${this.code}`)).json();
  }
  async lastText(): Promise<string> {
    const l = await this.log();
    const e = [...l.entries].reverse().find((x: Any) => x.kind === 'bot');
    return (e?.text as string) ?? '';
  }
  text(t: string) {
    return sim(this.code, 'send', { type: 'text', text: t });
  }
  contact() {
    return sim(this.code, 'send', { type: 'contact' });
  }
  reset() {
    return sim(this.code, 'send', { type: 'reset' });
  }
  photo() {
    return sim(this.code, 'upload', noisePng(), '&name=receipt.png&mime=image/png');
  }
  /** click an inline button (label substring) on the latest message that has it; falls back to typing it (reply keyboard) */
  async click(label: string) {
    const l = await this.log();
    for (const e of [...l.entries].reverse()) {
      if (e.kind !== 'bot') continue;
      for (const row of e.inline ?? []) for (const b of row) if (String(b.text).includes(label)) return sim(this.code, 'send', { type: 'click', msgId: e.id, data: b.data });
    }
    return this.text(label);
  }
  async addLine(type: string, amount: string, extra: string[] = [], photos = 1) {
    await this.click(type);
    await this.text(amount);
    for (const x of extra) await this.text(x);
    for (let i = 0; i < photos; i++) await this.photo();
    await this.click('خلصت صور');
  }
}

export async function poll<T>(fn: () => Promise<T | undefined | false>, what: string, ms = 60000, every = 1000): Promise<T> {
  const end = Date.now() + ms;
  let last: unknown;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, every));
  }
  throw new Error(`timeout waiting for ${what}${last ? `: ${String(last)}` : ''}`);
}

/** Drives the simulator through a simple one-line toll request and returns the request number. */
export async function submitSimpleRequest(code: string, amount = '100'): Promise<string> {
  const d = new SimDriver(code);
  await d.reset();
  await d.text('/start');
  await d.contact();
  await d.click('طلب جديد');
  await d.click('أيوه');
  await d.text(String(100000 + Math.floor(Math.random() * 50000)));
  await d.addLine('رسوم طرق', amount);
  await d.click('كده خلصت');
  await d.click('تأكيد وإرسال');
  const m = /DE-\d{2}-\d{6}/.exec(await d.lastText());
  if (!m) throw new Error(`submit failed: ${await d.lastText()}`);
  return m[0];
}
