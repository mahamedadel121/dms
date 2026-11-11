import type { TokenPair } from './types';

export const API_BASE = '/api/v1';
const TOKEN_KEY = 'dms.tokens';
export const UNAUTHORIZED_EVENT = 'dms:unauthorized';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/* ---------- token storage (localStorage, D11) ---------- */
export const tokens = {
  get(): TokenPair | null {
    try {
      const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY);
      return raw ? (JSON.parse(raw) as TokenPair) : null;
    } catch {
      return null;
    }
  },
  set(t: TokenPair): void {
    try {
      window.localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: t.accessToken, refreshToken: t.refreshToken }));
    } catch {
      /* storage unavailable */
    }
  },
  clear(): void {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

/** Builds `?a=1&b=2`, skipping empty values. Arrays become comma-separated. */
export function qs(query?: Query): string {
  if (!query) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const t = tokens.get();
  if (!t?.refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: t.refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as TokenPair;
    tokens.set(data);
    return true;
  } catch {
    return false;
  }
}

/** Single-flight refresh so parallel 401s share one rotation. */
function refreshOnce(): Promise<boolean> {
  if (!refreshing) refreshing = doRefresh().finally(() => (refreshing = null));
  return refreshing;
}

async function toError(res: Response): Promise<ApiError> {
  let code = 'HTTP_' + res.status;
  let message = res.statusText || 'Request failed';
  let details: unknown;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } };
    if (body.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details;
    }
  } catch {
    /* non-JSON body */
  }
  return new ApiError(res.status, code, message, details);
}

interface Opts {
  query?: Query;
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
  /** do not attempt token refresh / unauthorized handling (login, refresh) */
  anonymous?: boolean;
}

async function send(method: string, path: string, o: Opts = {}): Promise<Response> {
  const exec = (): Promise<Response> => {
    const headers: Record<string, string> = {};
    const t = tokens.get();
    if (t?.accessToken && !o.anonymous) headers.Authorization = `Bearer ${t.accessToken}`;
    let body: BodyInit | undefined;
    if (o.form) body = o.form;
    else if (o.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(o.body);
    }
    return fetch(`${API_BASE}${path}${qs(o.query)}`, { method, headers, body, signal: o.signal });
  };
  let res = await exec();
  if (res.status === 401 && !o.anonymous) {
    if (await refreshOnce()) res = await exec();
    if (res.status === 401) {
      tokens.clear();
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
  }
  if (!res.ok) throw await toError(res);
  return res;
}

async function json<T>(method: string, path: string, o?: Opts): Promise<T> {
  const res = await send(method, path, o);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function filenameFrom(res: Response, fallback: string): string {
  const cd = res.headers.get('Content-Disposition') ?? '';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star?.[1]) return decodeURIComponent(star[1]);
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain?.[1] ?? fallback;
}

export const api = {
  get: <T = unknown>(path: string, query?: Query, signal?: AbortSignal) => json<T>('GET', path, { query, signal }),
  post: <T = unknown>(path: string, body?: unknown, query?: Query) => json<T>('POST', path, { body, query }),
  put: <T = unknown>(path: string, body?: unknown) => json<T>('PUT', path, { body }),
  patch: <T = unknown>(path: string, body?: unknown) => json<T>('PATCH', path, { body }),
  del: <T = unknown>(path: string, query?: Query) => json<T>('DELETE', path, { query }),
  /** multipart upload; `fields` are appended as strings */
  upload: <T = unknown>(path: string, file: Blob, fileName = 'file', fields?: Record<string, string>, query?: Query) => {
    const form = new FormData();
    form.append('file', file, fileName);
    for (const [k, v] of Object.entries(fields ?? {})) form.append(k, v);
    return json<T>('POST', path, { form, query });
  },
  /** authenticated binary fetch (xlsx, pdf, images behind auth) */
  blob: async (path: string, query?: Query): Promise<{ blob: Blob; fileName: string }> => {
    const res = await send('GET', path, { query });
    return { blob: await res.blob(), fileName: filenameFrom(res, 'download') };
  },
  /** fetch and trigger a browser download */
  download: async (path: string, query?: Query, fallbackName = 'download'): Promise<void> => {
    const res = await send('GET', path, { query });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filenameFrom(res, fallbackName);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
  /** login/refresh style calls that must not trigger the 401 flow */
  anonymousPost: <T = unknown>(path: string, body?: unknown) => json<T>('POST', path, { body, anonymous: true }),
};

/**
 * Open a binary (e.g. a PDF) fetched with auth in a new tab.
 * The tab is opened synchronously in the click handler (keeps user activation, avoids popup blockers) and
 * WITHOUT `noopener`: Chromium shows an empty tab for blob: URLs opened with `noopener`.
 * If the browser blocks the tab, the file is downloaded instead.
 */
export async function openBlobInNewTab(load: () => Promise<Blob>, fallbackName: string): Promise<void> {
  const win = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  try {
    const blob = await load();
    const url = URL.createObjectURL(blob);
    if (win) {
      win.location.href = url;
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = fallbackName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    win?.close();
    throw e;
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
