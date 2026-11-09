import { createHash } from "crypto";

/**
 * Small in-memory memo for LLM results: identical input in, the earlier answer out, so the same
 * article or topic is never paid for twice inside the TTL. Concurrent calls for the same key share
 * one in-flight promise. A failed call is not stored. Oldest entries are evicted past maxEntries.
 */
export interface Memo<T> {
  get(key: string, produce: () => Promise<T>): Promise<T>;
  clear(): void;
  readonly size: number;
}

export function hashKey(...parts: string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part).update("\u0000");
  return hash.digest("hex").slice(0, 32);
}

export function createMemo<T>(ttlMs: number, maxEntries: number): Memo<T> {
  const done = new Map<string, { value: T; expiresAt: number }>();
  const inflight = new Map<string, Promise<T>>();

  return {
    async get(key, produce) {
      const hit = done.get(key);
      if (hit && Date.now() <= hit.expiresAt) return hit.value;
      if (hit) done.delete(key);

      const pending = inflight.get(key);
      if (pending) return pending;

      const work = produce()
        .then((value) => {
          done.set(key, { value, expiresAt: Date.now() + ttlMs });
          while (done.size > maxEntries) {
            const oldest = done.keys().next().value;
            if (oldest === undefined) break;
            done.delete(oldest);
          }
          return value;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, work);
      return work;
    },
    clear() {
      done.clear();
      inflight.clear();
    },
    get size() {
      return done.size;
    },
  };
}
