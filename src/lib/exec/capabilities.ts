// Session-scoped memoization for expensive capability probes (e.g. pip's
// PEP 668 detection, gem's ruby introspection) so they run at most once per run
// instead of on every scan/upgrade.
const cache = new Map<string, Promise<unknown>>();

/** Run `fn` at most once per `key` for the lifetime of the process. */
export function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = cache.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn();
  cache.set(key, p);
  return p;
}

/** Clears the cache. Intended for tests. */
export function resetCapabilities(): void {
  cache.clear();
}
