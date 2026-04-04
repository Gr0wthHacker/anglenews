import { CACHE_TTL_MS } from "@shared/constants";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CACHE_PREFIX = "ac_cache_";

// ─── ExtensionCache ─────────────────────────────────────────────────────────

class ExtensionCache {
  /**
   * Retrieve a cached value by key. Returns null if the entry does not exist
   * or has expired. Expired entries are removed as a side-effect.
   */
  async get<T>(key: string): Promise<T | null> {
    const storageKey = this.prefixedKey(key);
    const result = await chrome.storage.local.get(storageKey);
    const entry = result[storageKey] as CacheEntry<T> | undefined;

    if (!entry) {
      return null;
    }

    if (this.isExpired(entry)) {
      // Fire-and-forget cleanup of the stale entry
      await chrome.storage.local.remove(storageKey);
      return null;
    }

    return entry.data;
  }

  /**
   * Store a value in the cache.
   * @param key   Logical key (will be prefixed automatically)
   * @param data  The value to store
   * @param ttlMs Time-to-live in milliseconds (defaults to CACHE_TTL_MS)
   */
  async set<T>(key: string, data: T, ttlMs: number = CACHE_TTL_MS): Promise<void> {
    const storageKey = this.prefixedKey(key);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    };
    await chrome.storage.local.set({ [storageKey]: entry });
  }

  /**
   * Remove a single cached entry.
   */
  async remove(key: string): Promise<void> {
    await chrome.storage.local.remove(this.prefixedKey(key));
  }

  /**
   * Remove all cached entries managed by ExtensionCache.
   */
  async clear(): Promise<void> {
    const allKeys = await this.getAllCacheKeys();
    if (allKeys.length > 0) {
      await chrome.storage.local.remove(allKeys);
    }
  }

  /**
   * Scan all cache entries and remove those that have expired.
   * @returns The number of entries removed.
   */
  async cleanup(): Promise<number> {
    const allKeys = await this.getAllCacheKeys();
    if (allKeys.length === 0) {
      return 0;
    }

    const all = await chrome.storage.local.get(allKeys);
    const expiredKeys: string[] = [];

    for (const key of allKeys) {
      const entry = all[key] as CacheEntry<unknown> | undefined;
      if (entry && this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    }

    if (expiredKeys.length > 0) {
      await chrome.storage.local.remove(expiredKeys);
    }

    return expiredKeys.length;
  }

  /**
   * Return the total number of currently-stored (not necessarily valid)
   * cache entries managed by this class.
   */
  async getSize(): Promise<number> {
    const keys = await this.getAllCacheKeys();
    return keys.length;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private prefixedKey(key: string): string {
    return `${CACHE_PREFIX}${key}`;
  }

  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private async getAllCacheKeys(): Promise<string[]> {
    const everything = await chrome.storage.local.get(null);
    return Object.keys(everything).filter((k) => k.startsWith(CACHE_PREFIX));
  }
}

// ─── Singleton export ───────────────────────────────────────────────────────

export const cache = new ExtensionCache();
