import { z } from 'zod';
import { SETTING_DEFAULTS, type SettingKey, type SettingTypes } from '@dms/shared';
import type { Db, Actor } from '../common';
import { DomainError } from '../errors';

const int = (def: number) => z.coerce.number().int().default(def);
const bool = (def: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : v === true || v === 'true' || v === '1'));
const optStr = z.string().optional().transform((v) => (v === '' ? undefined : v));

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().default('postgresql://postgres@localhost:54329/dms'),
  API_PORT: int(4000),
  WEB_PORT: int(3000),
  API_INTERNAL_URL: z.string().default('http://localhost:4000'),
  WEB_PUBLIC_URL: z.string().default('http://localhost:3000'),
  JWT_SECRET: z.string().default('dev-only-jwt-secret-change-me-0123456789'),
  JWT_ACCESS_TTL_SEC: int(900),
  REFRESH_TTL_DAYS: int(30),
  FILE_URL_SECRET: z.string().default('dev-only-file-url-secret-change-me-0123456789'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_ROOT: z.string().default('./storage-data'),
  BOT_TOKEN: optStr,
  BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
  BOT_WEBHOOK_URL: optStr,
  BOT_WEBHOOK_SECRET: optStr,
  BOT_WEBHOOK_PORT: int(4100),
  SAP_ADAPTER: z.enum(['mock', 'file', 's4hana', 's4hana-cj']).default('mock'),
  SAP_S4_URL: optStr,
  SAP_S4_USER: optStr,
  SAP_S4_PASSWORD: optStr,
  SAP_S4_CLIENT: optStr,
  SAP_S4_TIMEOUT_MS: int(30000),
  SAP_S4_LOGICAL_SYSTEM: optStr,
  SAP_S4_LOOKUP_MODE: z.enum(['odata', 'none']).default('odata'),
  SAP_S4_ODATA_URL: optStr,
  SAP_S4_LOOKUP_SERVICE: z.string().default('API_JOURNALENTRYITEMBASIC_SRV'),
  SAP_S4_LOOKUP_ENTITY: z.string().default('A_JournalEntryItemBasic'),
  SAP_S4_LOOKUP_REF_FIELD: z.string().default('DocumentReferenceID'),
  SAP_S4_DUPLICATE_PATTERN: z.string().default('already (been )?posted|duplicate'),
  SAP_S4_CJ_URL: optStr,
  SAP_S4_CJ_FUNCTION: z.string().default('BAPI_CASHJOURNALDOC_CREATE'),
  S3_ENDPOINT: optStr,
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: optStr,
  S3_ACCESS_KEY_ID: optStr,
  S3_SECRET_ACCESS_KEY: optStr,
  S3_FORCE_PATH_STYLE: bool(true),
  S3_PREFIX: optStr,
  S3_PRESIGNED_REDIRECT: bool(false),
  EMAIL_DRIVER: z.enum(['none', 'smtp', 'file']).default('none'),
  SMTP_HOST: optStr,
  SMTP_PORT: int(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: optStr,
  SMTP_PASSWORD: optStr,
  SMTP_FROM: z.string().default('DMS <no-reply@localhost>'),
  SMTP_TLS_REJECT_UNAUTHORIZED: bool(true),
  METRICS_TOKEN: optStr,
  BOT_USERNAME: optStr,
  TELEGRAM_LINK_TTL_SEC: int(900),
  PDF_BROWSER_CHANNEL: optStr,
  WORKER_CONCURRENCY: int(2),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | undefined;

/** Parses and validates process.env (cached). Pass `env` to bypass the cache (tests). */
export function getConfig(env?: Record<string, string | undefined>): AppConfig {
  if (!env && cached) return cached;
  const parsed = envSchema.safeParse(env ?? process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new DomainError('VALIDATION', `Invalid environment: ${msg}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === 'production') {
    if (cfg.JWT_SECRET.length < 32 || cfg.JWT_SECRET.startsWith('dev-only')) {
      throw new DomainError('VALIDATION', 'JWT_SECRET must be set to a strong value (>= 32 chars) in production');
    }
    if (cfg.FILE_URL_SECRET.length < 32 || cfg.FILE_URL_SECRET.startsWith('dev-only')) {
      throw new DomainError('VALIDATION', 'FILE_URL_SECRET must be set to a strong value (>= 32 chars) in production');
    }
  }
  if (cfg.STORAGE_DRIVER === 's3' && !cfg.S3_BUCKET) {
    throw new DomainError('VALIDATION', 'S3_BUCKET must be set when STORAGE_DRIVER=s3');
  }
  if (cfg.EMAIL_DRIVER === 'smtp' && !cfg.SMTP_HOST) {
    throw new DomainError('VALIDATION', 'SMTP_HOST must be set when EMAIL_DRIVER=smtp');
  }
  if (!env) cached = cfg;
  return cfg;
}

export function resetConfigCache(): void {
  cached = undefined;
}

/** Reads a setting; falls back to the default table in @dms/shared. */
export async function getSetting<K extends SettingKey>(db: Db, key: K): Promise<SettingTypes[K]> {
  const row = await db.setting.findUnique({ where: { key } });
  if (!row) return SETTING_DEFAULTS[key];
  const def = SETTING_DEFAULTS[key];
  // object-valued settings are merged over defaults so newly added fields always exist
  if (def !== null && typeof def === 'object' && row.value !== null && typeof row.value === 'object' && !Array.isArray(row.value)) {
    return { ...(def as object), ...(row.value as object) } as SettingTypes[K];
  }
  return row.value as SettingTypes[K];
}

export async function getSettings(db: Db): Promise<SettingTypes> {
  const rows = await db.setting.findMany();
  const out: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const r of rows) {
    if (r.key in SETTING_DEFAULTS) out[r.key] = await getSetting(db, r.key as SettingKey);
  }
  return out as unknown as SettingTypes;
}

export async function setSetting<K extends SettingKey>(
  db: Db,
  key: K,
  value: SettingTypes[K],
  actor?: Pick<Actor, 'userId'>,
): Promise<void> {
  if (!(key in SETTING_DEFAULTS)) throw new DomainError('VALIDATION', `Unknown setting key: ${key}`);
  if (typeof value !== typeof SETTING_DEFAULTS[key]) {
    throw new DomainError('VALIDATION', `Setting ${key} expects ${typeof SETTING_DEFAULTS[key]}`);
  }
  await db.setting.upsert({
    where: { key },
    create: { key, value: value as never, updatedById: actor?.userId ?? null },
    update: { value: value as never, updatedById: actor?.userId ?? null },
  });
}
