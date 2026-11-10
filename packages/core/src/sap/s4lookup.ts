import { getConfig } from '../config';
import { SapLookupUnavailableError } from './errors';

// Idempotency lookup: OData read of journal entry items by reference. Service, entity and field names are
// configuration and UNVERIFIED against a real system (see docs/SAP_INTEGRATION.md "Phase 2: idempotency lookup").

export interface S4LookupConfig {
  mode: 'odata' | 'none';
  odataUrl?: string;
  service: string;
  entity: string;
  refField: string;
  user?: string;
  password?: string;
  client?: string;
  timeoutMs: number;
}

export type LookupHit = { documentNumber: string; fiscalYear: string };

const q = (v: string) => v.replace(/'/g, "''");

export function buildLookupUrl(cfg: S4LookupConfig, reference: string, companyCode: string): string {
  const base = (cfg.odataUrl ?? '').replace(/\/+$/, '');
  const filter = `CompanyCode eq '${q(companyCode)}' and ${cfg.refField} eq '${q(reference)}'`;
  return `${base}/${cfg.service}/${cfg.entity}?$filter=${encodeURIComponent(filter)}&$select=CompanyCode,FiscalYear,AccountingDocument&$top=5&$format=json`;
}

export function parseLookupResponse(json: unknown): LookupHit | null {
  const j = json as { d?: { results?: unknown }; value?: unknown } | null;
  const rows = Array.isArray(j?.d?.results) ? j!.d!.results : Array.isArray(j?.value) ? j!.value : [];
  for (const r of rows as Record<string, unknown>[]) {
    const doc = r?.AccountingDocument;
    if (typeof doc === 'string' && doc.trim() !== '') {
      return { documentNumber: doc.trim(), fiscalYear: String(r.FiscalYear ?? '') };
    }
  }
  return null;
}

export class S4Lookup {
  constructor(
    private readonly cfg: S4LookupConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async find(reference: string, companyCode: string): Promise<LookupHit | null> {
    const c = this.cfg;
    if (c.mode === 'none') throw new SapLookupUnavailableError('SAP lookup is disabled (SAP_S4_LOOKUP_MODE=none)', true);
    if (!c.odataUrl) throw new SapLookupUnavailableError('SAP lookup is not configured (SAP_S4_ODATA_URL missing)', true);
    if (!c.user) throw new SapLookupUnavailableError('SAP lookup is not configured (SAP_S4_USER missing)', true);
    if (!c.password) throw new SapLookupUnavailableError('SAP lookup is not configured (SAP_S4_PASSWORD missing)', true);
    const headers: Record<string, string> = {
      Authorization: `Basic ${Buffer.from(`${c.user}:${c.password}`).toString('base64')}`,
      Accept: 'application/json',
    };
    if (c.client) headers['sap-client'] = c.client;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), c.timeoutMs);
    let res: Response;
    let text: string;
    try {
      res = await this.fetchImpl(buildLookupUrl(c, reference, companyCode), { method: 'GET', headers, signal: ac.signal });
      if ([401, 403, 404].includes(res.status)) throw new SapLookupUnavailableError(`lookup HTTP ${res.status}`, true);
      if (res.status !== 200) throw new SapLookupUnavailableError(`lookup failed: HTTP ${res.status}`, false);
      text = await res.text();
    } catch (e) {
      if (e instanceof SapLookupUnavailableError) throw e;
      throw new SapLookupUnavailableError(`lookup failed: ${e instanceof Error ? e.message : String(e)}`, false);
    } finally {
      clearTimeout(timer);
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new SapLookupUnavailableError('lookup failed: response is not valid JSON', false);
    }
    return parseLookupResponse(json);
  }
}

export function lookupConfigFromEnv(): S4LookupConfig {
  const c = getConfig();
  return {
    mode: c.SAP_S4_LOOKUP_MODE,
    odataUrl: c.SAP_S4_ODATA_URL,
    service: c.SAP_S4_LOOKUP_SERVICE,
    entity: c.SAP_S4_LOOKUP_ENTITY,
    refField: c.SAP_S4_LOOKUP_REF_FIELD,
    user: c.SAP_S4_USER,
    password: c.SAP_S4_PASSWORD,
    client: c.SAP_S4_CLIENT,
    timeoutMs: c.SAP_S4_TIMEOUT_MS,
  };
}
