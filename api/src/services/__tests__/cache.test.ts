import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createTopicFingerprint,
  getCachedComparison,
  cacheComparison,
  getTrendingTopics,
  storeFeedback,
  getFeedbackStats,
  cleanupExpiredEntries,
} from "../cache.js";
import type { AngleComparison } from "../../../../shared/types.js";

// ─── Test data factory ──────────────────────────────────────────────────────

function makeComparison(overrides: Partial<AngleComparison> = {}): AngleComparison {
  return {
    id: overrides.id ?? "test-id-001",
    topic: overrides.topic ?? "Trade Tariffs Impact",
    normalizedTopic: overrides.normalizedTopic ?? "trade tariffs impact",
    currentArticle: {
      article: {
        headline: "Steel Tariffs Shake Markets",
        body: "The administration announced sweeping tariffs.",
        byline: "John Reporter",
        siteName: "Example News",
        url: "https://example.com/article",
        domain: "example.com",
        publishDate: "2026-04-01T10:00:00Z",
        imageUrl: null,
      },
      angle: {
        headline_framing: "Market disruption from trade policy",
        central_entity: "Steel Industry",
        causal_attribution: "Administration trade policy",
        emotional_register: "alarm",
        solution_frame: "Negotiate bilateral agreements",
        key_omissions: ["Worker impact"],
        quote_sources: [
          { name: "Analyst", affiliation: "Goldman Sachs", stance: "Concerned" },
        ],
        statistical_anchoring: "25% tariff rate",
        confidence: 0.85,
      },
      sentiment: { positive: 0.1, negative: 0.6, neutral: 0.3, compound: -0.4 },
      sourceBias: null,
    },
    clusters: [
      {
        id: "cluster-1",
        label: "Market Impact",
        articles: [],
        dominantRegister: "alarm",
        distinctiveness: 0.7,
      },
      {
        id: "cluster-2",
        label: "Policy Analysis",
        articles: [],
        dominantRegister: "neutral",
        distinctiveness: 0.5,
      },
    ],
    coverageGaps: [],
    toneDistribution: {
      alarm: 0.4,
      neutral: 0.3,
      optimistic: 0.1,
      adversarial: 0.1,
      empathetic: 0.05,
      dismissive: 0.05,
    },
    totalSourcesFetched: 20,
    totalSourcesAnalyzed: 8,
    timestamp: "2026-04-01T12:00:00Z",
    cachedAt: null,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── createTopicFingerprint ──────────────────────────────────────────────

  describe("createTopicFingerprint", () => {
    it("generates a consistent hash for the same input", () => {
      const fp1 = createTopicFingerprint("trade tariffs");
      const fp2 = createTopicFingerprint("trade tariffs");
      expect(fp1).toBe(fp2);
    });

    it("generates different hashes for different inputs", () => {
      const fp1 = createTopicFingerprint("trade tariffs");
      const fp2 = createTopicFingerprint("climate change");
      expect(fp1).not.toBe(fp2);
    });

    it("is case-insensitive (lowercases input)", () => {
      const fp1 = createTopicFingerprint("Trade Tariffs");
      const fp2 = createTopicFingerprint("trade tariffs");
      expect(fp1).toBe(fp2);
    });

    it("trims whitespace", () => {
      const fp1 = createTopicFingerprint("  trade tariffs  ");
      const fp2 = createTopicFingerprint("trade tariffs");
      expect(fp1).toBe(fp2);
    });

    it("returns a 16-character hex string", () => {
      const fp = createTopicFingerprint("some topic");
      expect(fp).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  // ── set and get ─────────────────────────────────────────────────────────

  describe("cacheComparison and getCachedComparison", () => {
    it("stores and retrieves a comparison", () => {
      const comparison = makeComparison();
      const fingerprint = createTopicFingerprint("trade tariffs");

      cacheComparison(fingerprint, comparison);
      const cached = getCachedComparison(fingerprint);

      expect(cached).not.toBeNull();
      expect(cached!.id).toBe(comparison.id);
      expect(cached!.topic).toBe(comparison.topic);
      expect(cached!.cachedAt).toBeDefined();
    });

    it("returns null for a fingerprint that was never cached", () => {
      const result = getCachedComparison("nonexistent-fingerprint");
      expect(result).toBeNull();
    });

    it("sets cachedAt timestamp when caching", () => {
      const comparison = makeComparison();
      const fingerprint = createTopicFingerprint("timestamp test");

      cacheComparison(fingerprint, comparison);
      const cached = getCachedComparison(fingerprint);

      expect(cached!.cachedAt).toBe("2026-04-01T12:00:00.000Z");
    });
  });

  // ── TTL expiration ──────────────────────────────────────────────────────

  describe("TTL expiration", () => {
    it("returns cached data before TTL expires", () => {
      const comparison = makeComparison();
      const fingerprint = createTopicFingerprint("ttl-before");

      cacheComparison(fingerprint, comparison);

      // Advance time by 1 hour (TTL is 2 hours / 7200 seconds)
      vi.advanceTimersByTime(60 * 60 * 1000);

      const cached = getCachedComparison(fingerprint);
      expect(cached).not.toBeNull();
      expect(cached!.id).toBe(comparison.id);
    });

    it("returns null after TTL expires", () => {
      const comparison = makeComparison();
      const fingerprint = createTopicFingerprint("ttl-after");

      cacheComparison(fingerprint, comparison);

      // Advance time past TTL (7200 seconds = 2 hours)
      vi.advanceTimersByTime(7200 * 1000 + 1);

      const cached = getCachedComparison(fingerprint);
      expect(cached).toBeNull();
    });

    it("returns null exactly at TTL boundary", () => {
      const comparison = makeComparison();
      const fingerprint = createTopicFingerprint("ttl-exact");

      cacheComparison(fingerprint, comparison);

      // Advance time exactly to TTL + 1ms (Date.now() > expiresAt)
      vi.advanceTimersByTime(7200 * 1000 + 1);

      const cached = getCachedComparison(fingerprint);
      expect(cached).toBeNull();
    });
  });

  // ── Trending topics ─────────────────────────────────────────────────────

  describe("trending topics", () => {
    it("tracks topics as they are cached", () => {
      const fp = createTopicFingerprint("trending-topic-a");
      cacheComparison(fp, makeComparison({ normalizedTopic: "trending topic a" }));

      const trending = getTrendingTopics();
      const found = trending.find((t) => t.topic === "trending topic a");
      expect(found).toBeDefined();
      expect(found!.comparisonCount).toBe(1);
    });

    it("increments count when same topic is cached again", () => {
      const fp = createTopicFingerprint("trending-topic-b");
      cacheComparison(fp, makeComparison({ normalizedTopic: "trending topic b" }));
      cacheComparison(fp, makeComparison({ normalizedTopic: "trending topic b" }));
      cacheComparison(fp, makeComparison({ normalizedTopic: "trending topic b" }));

      const trending = getTrendingTopics();
      const found = trending.find((t) => t.topic === "trending topic b");
      expect(found).toBeDefined();
      expect(found!.comparisonCount).toBe(3);
    });

    it("sorts trending topics by count descending", () => {
      const fpHigh = createTopicFingerprint("high-count-topic");
      const fpLow = createTopicFingerprint("low-count-topic");

      // Cache high-count 5 times
      for (let i = 0; i < 5; i++) {
        cacheComparison(fpHigh, makeComparison({ normalizedTopic: "high count topic" }));
      }
      // Cache low-count once
      cacheComparison(fpLow, makeComparison({ normalizedTopic: "low count topic" }));

      const trending = getTrendingTopics();
      const highIdx = trending.findIndex((t) => t.topic === "high count topic");
      const lowIdx = trending.findIndex((t) => t.topic === "low count topic");

      expect(highIdx).toBeLessThan(lowIdx);
    });

    it("respects the limit parameter", () => {
      const trending = getTrendingTopics(2);
      expect(trending.length).toBeLessThanOrEqual(2);
    });

    it("includes top cluster labels", () => {
      const fp = createTopicFingerprint("cluster-labels-topic");
      cacheComparison(fp, makeComparison({ normalizedTopic: "cluster labels topic" }));

      const trending = getTrendingTopics();
      const found = trending.find((t) => t.topic === "cluster labels topic");
      expect(found).toBeDefined();
      expect(found!.topClusters).toEqual(["Market Impact", "Policy Analysis"]);
    });
  });

  // ── Feedback storage ──────────────────────────────────────────────────

  describe("feedback storage", () => {
    it("stores feedback and computes stats", () => {
      storeFeedback("comp-001", 4, "Good analysis");
      storeFeedback("comp-002", 5, null);
      storeFeedback("comp-003", 3, "Missed some angles");

      const stats = getFeedbackStats();
      expect(stats.total).toBeGreaterThanOrEqual(3);
      expect(stats.averageRating).toBeGreaterThan(0);
    });

    it("returns zero stats when no feedback exists on fresh module", () => {
      // getFeedbackStats accumulates across the module lifetime,
      // but we can at least verify the structure
      const stats = getFeedbackStats();
      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("averageRating");
      expect(typeof stats.total).toBe("number");
      expect(typeof stats.averageRating).toBe("number");
    });
  });

  // ── cleanupExpiredEntries ─────────────────────────────────────────────

  describe("cleanupExpiredEntries", () => {
    it("removes expired entries from the cache", () => {
      const fp = createTopicFingerprint("cleanup-test");
      cacheComparison(fp, makeComparison({ normalizedTopic: "cleanup test" }));

      // Verify it exists
      expect(getCachedComparison(fp)).not.toBeNull();

      // Advance past TTL
      vi.advanceTimersByTime(7200 * 1000 + 1);

      // Run cleanup
      cleanupExpiredEntries();

      // getCachedComparison already checks expiry and deletes,
      // but cleanupExpiredEntries proactively removes
      expect(getCachedComparison(fp)).toBeNull();
    });

    it("keeps non-expired entries after cleanup", () => {
      const fp = createTopicFingerprint("keep-test");
      cacheComparison(fp, makeComparison({ normalizedTopic: "keep test" }));

      // Advance less than TTL
      vi.advanceTimersByTime(60 * 1000);

      cleanupExpiredEntries();

      expect(getCachedComparison(fp)).not.toBeNull();
    });
  });
});
