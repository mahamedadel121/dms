import { randomBytes } from 'node:crypto';
import { createTransport } from 'nodemailer';
import { getConfig } from '../config';
import { getStorage, type StorageAdapter } from '../storage';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailTransport {
  name: string;
  send(msg: EmailMessage): Promise<{ messageId: string }>;
}

export function createSmtpTransport(cfg: {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
  rejectUnauthorized: boolean;
}): EmailTransport {
  const tx = createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    ...(cfg.user ? { auth: { user: cfg.user, pass: cfg.password ?? '' } } : {}),
    tls: { rejectUnauthorized: cfg.rejectUnauthorized },
  });
  return {
    name: 'smtp',
    async send(msg) {
      const info = await tx.sendMail({ from: cfg.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
      return { messageId: String(info.messageId ?? '') };
    },
  };
}

/** Writes each message as JSON to `outbox-email/<yyyy-mm-dd>/<random>.json`; the key is the message id. */
export function createFileTransport(storage: StorageAdapter, from: string): EmailTransport {
  return {
    name: 'file',
    async send(msg) {
      const at = new Date();
      const key = `outbox-email/${at.toISOString().slice(0, 10)}/${randomBytes(12).toString('hex')}.json`;
      const body = JSON.stringify({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, at: at.toISOString() });
      await storage.put(key, Buffer.from(body, 'utf8'), { contentType: 'application/json' });
      return { messageId: key };
    },
  };
}

let override: EmailTransport | null | undefined;
let cached: EmailTransport | null | undefined;

/** Test hook: overrides the cached transport (null simulates a disabled driver). */
export function registerEmailTransport(t: EmailTransport | null): void {
  override = t;
  cached = undefined;
}

export function getEmailTransport(): EmailTransport | null {
  if (override !== undefined) return override;
  if (cached !== undefined) return cached;
  const cfg = getConfig();
  if (cfg.EMAIL_DRIVER === 'smtp') {
    cached = createSmtpTransport({
      host: cfg.SMTP_HOST ?? '',
      port: cfg.SMTP_PORT,
      secure: cfg.SMTP_SECURE,
      user: cfg.SMTP_USER,
      password: cfg.SMTP_PASSWORD,
      from: cfg.SMTP_FROM,
      rejectUnauthorized: cfg.SMTP_TLS_REJECT_UNAUTHORIZED,
    });
  } else if (cfg.EMAIL_DRIVER === 'file') {
    cached = createFileTransport(getStorage(), cfg.SMTP_FROM);
  } else {
    cached = null;
  }
  return cached;
}

/** true when the SMTP server refused permanently (responseCode 500-599, or codes EENVELOPE / EAUTH). */
export function isPermanentEmailError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const x = e as { responseCode?: unknown; code?: unknown };
  if (typeof x.responseCode === 'number' && x.responseCode >= 500 && x.responseCode <= 599) return true;
  return x.code === 'EENVELOPE' || x.code === 'EAUTH';
}
