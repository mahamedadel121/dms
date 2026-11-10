import type { RequestModule } from './types';

const modules = new Map<string, RequestModule>();

/** Registers (or replaces) a request module keyed by `RequestType.moduleKey`. */
export function registerModule(m: RequestModule): void {
  modules.set(m.key, m);
}
/** Sorted keys of the registered request modules. */
export function listModules(): string[] {
  return [...modules.keys()].sort();
}
export function getModule(key: string | null | undefined): RequestModule | undefined {
  return key ? modules.get(key) : undefined;
}
