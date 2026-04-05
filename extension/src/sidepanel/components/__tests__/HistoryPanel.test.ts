import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock chrome.storage.local — supports both promise and callback API
const mockStorage: Record<string, any> = {};
vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: vi.fn((key: string, cb?: (result: Record<string, any>) => void) => {
        const result = { [key]: mockStorage[key] };
        if (cb) { cb(result); return; }
        return Promise.resolve(result);
      }),
      set: vi.fn(
        (data: Record<string, any>, cb?: () => void) => {
          Object.assign(mockStorage, data);
          if (cb) { cb(); return; }
          return Promise.resolve();
        },
      ),
      remove: vi.fn((key: string, cb?: () => void) => {
        delete mockStorage[key];
        if (cb) { cb(); return; }
        return Promise.resolve();
      }),
    },
  },
  runtime: { lastError: null, id: "test-extension-id" },
});

// Import after mocking
import { saveToHistory, HistoryEntry } from "../HistoryPanel";
import type { AngleComparison } from "@shared/types";

function makeComparison(overrides: Partial<AngleComparison> = {}): AngleComparison {
  return {
    id: `comp-${Math.random().toString(36).slice(2)}`,
    topic: "Steel Tariffs",
    normalizedTopic: "steel tariffs trade",
    currentArticle: {
      article: {
        headline: "Steel tariffs shake markets",
        body: "The new tariffs...",
        byline: null,
        siteName: "Bloomberg",
        url: "https://bloomberg.com/article",
        domain: "bloomberg.com",
        publishDate: null,
        imageUrl: null,
      },
      angle: {
        headline_framing: "Market disruption",
        central_entity: "Global markets",
        causal_attribution: "Trade policy",
        emotional_register: "alarm",
        solution_frame: "Negotiate down",
        key_omissions: [],
        quote_sources: [],
        statistical_anchoring: "Stock drop",
        confidence: 0.9,
      },
      sentiment: { positive: 0.1, negative: 0.6, neutral: 0.3, compound: -0.5 },
      sourceBias: null,
    },
    clusters: [
      {
        id: "c1",
        label: "Market Disruption",
        articles: [],
        dominantRegister: "alarm",
        distinctiveness: 0.8,
      },
    ],
    coverageGaps: [],
    toneDistribution: { alarm: 3, neutral: 2, optimistic: 1, adversarial: 0, empathetic: 0, dismissive: 0 },
    totalSourcesFetched: 15,
    totalSourcesAnalyzed: 10,
    timestamp: new Date().toISOString(),
    cachedAt: null,
    ...overrides,
  };
}

describe("HistoryPanel", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    vi.clearAllMocks();
  });

  describe("saveToHistory", () => {
    it("saves a comparison to storage", async () => {
      const comparison = makeComparison({ id: "test-1" });
      await saveToHistory(comparison);

      const stored = mockStorage["anglecheck_comparison_history"];
      expect(stored).toBeDefined();
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe("test-1");
      expect(stored[0].topic).toBe("Steel Tariffs");
    });

    it("prepends new entries to the front", async () => {
      const comp1 = makeComparison({ id: "first", topic: "Topic A" });
      const comp2 = makeComparison({ id: "second", topic: "Topic B" });

      await saveToHistory(comp1);
      await saveToHistory(comp2);

      const stored = mockStorage["anglecheck_comparison_history"];
      expect(stored[0].id).toBe("second");
      expect(stored[1].id).toBe("first");
    });

    it("limits to 20 entries", async () => {
      for (let i = 0; i < 25; i++) {
        await saveToHistory(makeComparison({ id: `entry-${i}`, topic: `Topic ${i}` }));
      }

      const stored = mockStorage["anglecheck_comparison_history"];
      expect(stored.length).toBeLessThanOrEqual(20);
    });

    it("deduplicates by ID", async () => {
      const comp = makeComparison({ id: "same-id" });
      await saveToHistory(comp);
      await saveToHistory(comp);

      const stored = mockStorage["anglecheck_comparison_history"];
      const sameIds = stored.filter((e: HistoryEntry) => e.id === "same-id");
      expect(sameIds).toHaveLength(1);
    });

    it("includes source and cluster counts", async () => {
      const comp = makeComparison({
        id: "count-test",
        totalSourcesAnalyzed: 12,
        clusters: [
          { id: "c1", label: "A", articles: [], dominantRegister: "alarm", distinctiveness: 0.5 },
          { id: "c2", label: "B", articles: [], dominantRegister: "neutral", distinctiveness: 0.3 },
        ],
      });
      await saveToHistory(comp);

      const stored = mockStorage["anglecheck_comparison_history"];
      expect(stored[0].sourceCount).toBe(12);
      expect(stored[0].clusterCount).toBe(2);
    });
  });
});
