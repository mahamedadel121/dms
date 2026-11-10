import { getConfig } from '../config';
import { DomainError } from '../errors';
import { getStorage } from '../storage';
import { FileSapAdapter } from './file';
import { MockSapAdapter } from './mock';
import { S4CashJournalAdapter } from './cashjournal';
import { S4HanaSapAdapter } from './s4hana';
import type { SapPostingAdapter } from './types';

const registry = new Map<string, SapPostingAdapter>();

/** Test hook / DI: replaces the adapter instance returned for `name`. */
export function registerSapAdapter(name: string, adapter: SapPostingAdapter | null): void {
  if (adapter) registry.set(name, adapter);
  else registry.delete(name);
}

export function getAdapterByName(name: string): SapPostingAdapter {
  const hit = registry.get(name);
  if (hit) return hit;
  let a: SapPostingAdapter;
  switch (name) {
    case 'mock':
      a = new MockSapAdapter();
      break;
    case 'file':
      a = new FileSapAdapter(getStorage());
      break;
    case 's4hana': {
      const c = getConfig();
      a = new S4HanaSapAdapter({
        url: c.SAP_S4_URL,
        user: c.SAP_S4_USER,
        password: c.SAP_S4_PASSWORD,
        client: c.SAP_S4_CLIENT,
        timeoutMs: c.SAP_S4_TIMEOUT_MS,
        logicalSystem: c.SAP_S4_LOGICAL_SYSTEM,
        duplicatePattern: c.SAP_S4_DUPLICATE_PATTERN,
      });
      break;
    }
    case 's4hana-cj': {
      const c = getConfig();
      a = new S4CashJournalAdapter({
        url: c.SAP_S4_CJ_URL,
        user: c.SAP_S4_USER,
        password: c.SAP_S4_PASSWORD,
        client: c.SAP_S4_CLIENT,
        functionName: c.SAP_S4_CJ_FUNCTION,
        timeoutMs: c.SAP_S4_TIMEOUT_MS,
        duplicatePattern: c.SAP_S4_DUPLICATE_PATTERN,
      });
      break;
    }
    default:
      throw new DomainError('VALIDATION', `Unknown SAP adapter: ${name}`);
  }
  registry.set(name, a);
  return a;
}

/** Adapter by name; default = SAP_ADAPTER env (mock | file | s4hana | s4hana-cj). */
export function getSapAdapter(name?: string): SapPostingAdapter {
  return getAdapterByName(name ?? getConfig().SAP_ADAPTER);
}
