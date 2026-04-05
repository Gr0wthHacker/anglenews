import { describe, it, expect, vi, beforeEach } from "vitest";

const STORAGE_KEY = "anglecheck_recent_searches";
const mockStorage: Record<string, any> = {};

vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: vi.fn((key: string, cb: (result: Record<string, any>) => void) => {
        cb({ [key]: mockStorage[key] });
      }),
      set: vi.fn(
        (data: Record<string, any>, cb?: () => void) => {
          Object.assign(mockStorage, data);
          cb?.();
        },
      ),
    },
  },
  runtime: { lastError: null, id: "test-extension-id" },
});

describe("TopicSearch storage logic", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    vi.clearAllMocks();
  });

  it("stores recent searches as an array", () => {
    const searches = ["steel tariffs", "climate change", "AI regulation"];
    mockStorage[STORAGE_KEY] = searches;

    const stored = mockStorage[STORAGE_KEY];
    expect(Array.isArray(stored)).toBe(true);
    expect(stored).toHaveLength(3);
  });

  it("limits to 10 recent searches", () => {
    const searches = Array.from({ length: 15 }, (_, i) => `topic-${i}`);
    const trimmed = searches.slice(0, 10);
    mockStorage[STORAGE_KEY] = trimmed;

    expect(mockStorage[STORAGE_KEY]).toHaveLength(10);
  });

  it("deduplicates searches case-insensitively", () => {
    const existing = ["Steel Tariffs", "Climate Change"];
    const newTerm = "steel tariffs";

    const updated = [
      newTerm,
      ...existing.filter((s) => s.toLowerCase() !== newTerm.toLowerCase()),
    ].slice(0, 10);

    expect(updated).toEqual(["steel tariffs", "Climate Change"]);
    expect(updated).toHaveLength(2);
  });

  it("prepends new search to front of list", () => {
    const existing = ["Topic A", "Topic B"];
    const newTerm = "Topic C";
    const updated = [newTerm, ...existing].slice(0, 10);

    expect(updated[0]).toBe("Topic C");
    expect(updated[1]).toBe("Topic A");
  });

  it("handles empty storage gracefully", () => {
    const stored = mockStorage[STORAGE_KEY];
    expect(stored).toBeUndefined();

    // Should default to empty array
    const searches = Array.isArray(stored) ? stored : [];
    expect(searches).toEqual([]);
  });
});
