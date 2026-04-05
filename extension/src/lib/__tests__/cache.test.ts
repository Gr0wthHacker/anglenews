import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock chrome.storage.local
const store: Record<string, any> = {};

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: vi.fn(
        (keys: string | string[]) => {
          const result: Record<string, any> = {};
          const keyList = Array.isArray(keys) ? keys : [keys];
          keyList.forEach((k) => {
            if (store[k] !== undefined) result[k] = store[k];
          });
          return Promise.resolve(result);
        },
      ),
      set: vi.fn(
        (data: Record<string, any>) => {
          Object.assign(store, data);
          return Promise.resolve();
        },
      ),
      remove: vi.fn(
        (keys: string | string[]) => {
          const keyList = Array.isArray(keys) ? keys : [keys];
          keyList.forEach((k) => delete store[k]);
          return Promise.resolve();
        },
      ),
    },
  },
  runtime: { id: "test" },
});

// Import after mocking
import { cache } from "../cache";

describe("ExtensionCache", () => {
  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
    vi.clearAllMocks();
  });

  it("returns null for cache miss", async () => {
    const result = await cache.get("nonexistent");
    expect(result).toBeNull();
  });

  it("stores and retrieves a value", async () => {
    await cache.set("test-key", { hello: "world" });
    const result = await cache.get("test-key");
    expect(result).toEqual({ hello: "world" });
  });

  it("prefixes keys with ac_cache_", async () => {
    await cache.set("mykey", "myvalue");
    expect(store["ac_cache_mykey"]).toBeDefined();
    expect(store["ac_cache_mykey"].data).toBe("myvalue");
  });

  it("stores timestamp and TTL with each entry", async () => {
    await cache.set("ttl-test", "data", 5000);
    const entry = store["ac_cache_ttl-test"];
    expect(entry.timestamp).toBeDefined();
    expect(typeof entry.timestamp).toBe("number");
    expect(entry.ttl).toBe(5000);
  });

  it("returns null for expired entries", async () => {
    // Manually write an expired entry
    store["ac_cache_expired"] = {
      data: "old-data",
      timestamp: Date.now() - 100000,
      ttl: 1000,
    };

    const result = await cache.get("expired");
    expect(result).toBeNull();
  });

  it("returns valid non-expired entries", async () => {
    store["ac_cache_fresh"] = {
      data: "fresh-data",
      timestamp: Date.now(),
      ttl: 3600000,
    };

    const result = await cache.get("fresh");
    expect(result).toBe("fresh-data");
  });

  it("removes a specific key", async () => {
    await cache.set("to-remove", "value");
    expect(store["ac_cache_to-remove"]).toBeDefined();

    await cache.remove("to-remove");
    expect(store["ac_cache_to-remove"]).toBeUndefined();
  });

  describe("getOrFetch", () => {
    it("returns cached value without calling fetchFn", async () => {
      store["ac_cache_fetch-test"] = {
        data: "cached",
        timestamp: Date.now(),
        ttl: 3600000,
      };

      const fetchFn = vi.fn().mockResolvedValue("fresh");
      const result = await cache.getOrFetch("fetch-test", fetchFn);

      expect(result).toBe("cached");
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it("calls fetchFn on cache miss and caches result", async () => {
      const fetchFn = vi.fn().mockResolvedValue("new-data");
      const result = await cache.getOrFetch("miss-test", fetchFn);

      expect(result).toBe("new-data");
      expect(fetchFn).toHaveBeenCalledOnce();
      expect(store["ac_cache_miss-test"]).toBeDefined();
      expect(store["ac_cache_miss-test"].data).toBe("new-data");
    });

    it("deduplicates concurrent requests for the same key", async () => {
      let resolvePromise: (value: string) => void;
      const fetchFn = vi.fn(
        () => new Promise<string>((resolve) => { resolvePromise = resolve; }),
      );

      const promise1 = cache.getOrFetch("dedup-test", fetchFn);
      // Allow the first cache.get() to resolve so fetchFn gets called
      await new Promise((r) => setTimeout(r, 10));

      const promise2 = cache.getOrFetch("dedup-test", fetchFn);
      // Allow the second cache.get() to resolve
      await new Promise((r) => setTimeout(r, 10));

      // fetchFn should only be called once — second call should reuse pending promise
      expect(fetchFn).toHaveBeenCalledTimes(1);

      resolvePromise!("deduped-result");
      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe("deduped-result");
      expect(result2).toBe("deduped-result");
    });
  });
});
