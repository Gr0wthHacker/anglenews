import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AngleComparison, AnalyzedArticle } from "../../../../shared/types.js";

// ─── Mock all service dependencies before importing ─────────────────────────

vi.mock("../../services/topic-normalizer.js", () => ({
  normalizeTopic: vi.fn().mockResolvedValue({
    topic: "trade tariffs",
    searchQueries: ["trade tariffs impact"],
    entities: ["steel", "tariffs"],
  }),
}));

vi.mock("../../services/news-fetcher.js", () => ({
  fetchRelatedArticles: vi.fn().mockResolvedValue([
    {
      title: "Steel Tariffs Shake Markets",
      description: "Tariffs announced today",
      content: "Full article content about tariffs",
      url: "https://reuters.com/tariffs",
      source: "Reuters",
      domain: "reuters.com",
      publishedAt: "2026-04-01T10:00:00Z",
      imageUrl: null,
      apiSource: "gdelt",
    },
    {
      title: "Trade Policy Shifts Direction",
      description: "New trade policies emerge",
      content: "Policy analysis content",
      url: "https://bbc.com/trade",
      source: "BBC",
      domain: "bbc.com",
      publishedAt: "2026-04-01T11:00:00Z",
      imageUrl: null,
      apiSource: "googlenews",
    },
  ]),
}));

vi.mock("../../services/deduplicator.js", () => ({
  deduplicateArticles: vi.fn().mockImplementation((articles: any[]) => articles),
}));

const mockAngle = {
  headline_framing: "Market disruption from trade policy",
  central_entity: "Steel Industry",
  causal_attribution: "Trade policy shift",
  emotional_register: "alarm" as const,
  solution_frame: "Negotiate agreements",
  key_omissions: ["Worker impact"],
  quote_sources: [{ name: "Analyst", affiliation: "Bank", stance: "Concerned" }],
  statistical_anchoring: "25% tariff",
  confidence: 0.85,
};

const mockSentiment = { positive: 0.1, negative: 0.6, neutral: 0.3, compound: -0.4 };

vi.mock("../../services/angle-extractor.js", () => ({
  extractAngles: vi.fn().mockResolvedValue([
    {
      article: {
        title: "Steel Tariffs Shake Markets",
        description: "Tariffs announced today",
        content: "Full article content",
        url: "https://reuters.com/tariffs",
        source: "Reuters",
        domain: "reuters.com",
        publishedAt: "2026-04-01T10:00:00Z",
        imageUrl: null,
        apiSource: "gdelt",
      },
      angle: {
        headline_framing: "Market disruption from trade policy",
        central_entity: "Steel Industry",
        causal_attribution: "Trade policy shift",
        emotional_register: "alarm",
        solution_frame: "Negotiate agreements",
        key_omissions: ["Worker impact"],
        quote_sources: [{ name: "Analyst", affiliation: "Bank", stance: "Concerned" }],
        statistical_anchoring: "25% tariff",
        confidence: 0.85,
      },
      sentiment: { positive: 0.1, negative: 0.6, neutral: 0.3, compound: -0.4 },
    },
    {
      article: {
        title: "Trade Policy Shifts Direction",
        description: "New trade policies emerge",
        content: "Policy analysis content",
        url: "https://bbc.com/trade",
        source: "BBC",
        domain: "bbc.com",
        publishedAt: "2026-04-01T11:00:00Z",
        imageUrl: null,
        apiSource: "googlenews",
      },
      angle: {
        headline_framing: "Policy direction change",
        central_entity: "Trade Policy",
        causal_attribution: "Government decisions",
        emotional_register: "neutral",
        solution_frame: "International cooperation",
        key_omissions: [],
        quote_sources: [],
        statistical_anchoring: "15 countries affected",
        confidence: 0.78,
      },
      sentiment: { positive: 0.3, negative: 0.2, neutral: 0.5, compound: 0.1 },
    },
  ]),
}));

vi.mock("../../services/clusterer.js", () => ({
  clusterArticles: vi.fn().mockReturnValue([
    {
      id: "cluster-1",
      label: "Market Impact",
      articles: [],
      dominantRegister: "alarm",
      distinctiveness: 0.7,
    },
  ]),
}));

vi.mock("../../services/bias-enricher.js", () => ({
  getBiasForDomain: vi.fn().mockReturnValue({
    domain: "reuters.com",
    name: "Reuters",
    biasRating: "center",
    factualRating: "very-high",
    country: "UK",
    mediaType: "online",
  }),
}));

vi.mock("../../services/cache.js", () => ({
  createTopicFingerprint: vi.fn().mockReturnValue("abcdef1234567890"),
  getCachedComparison: vi.fn().mockReturnValue(null),
  cacheComparison: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({
  config: {
    maxSourcesPerQuery: 15,
    cacheTTLSeconds: 7200,
    environment: "test",
  },
}));

// ─── Import app after mocks ─────────────────────────────────────────────────

import app from "../../index.js";

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 200 with valid body", async () => {
    const res = await app.request("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        headline: "Steel Tariffs Shake Global Markets",
        url: "https://reuters.com/tariffs-article",
        domain: "reuters.com",
        body_excerpt: "The administration announced sweeping tariffs today.",
      }),
    });

    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.comparison).not.toBeNull();
    expect(json.comparison.topic).toBe("Steel Tariffs Shake Global Markets");
    expect(json.comparison.normalizedTopic).toBe("trade tariffs");
    expect(json.cached).toBe(false);
    expect(json.error).toBeNull();
  });

  it("returns 400 when headline is missing", async () => {
    const res = await app.request("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://reuters.com/article",
        domain: "reuters.com",
      }),
    });

    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("headline");
  });

  it("returns 400 when url is missing", async () => {
    const res = await app.request("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        headline: "Some Headline",
        domain: "reuters.com",
      }),
    });

    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("url");
  });

  it("returns 400 when domain is missing", async () => {
    const res = await app.request("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        headline: "Some Headline",
        url: "https://reuters.com/article",
      }),
    });

    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("domain");
  });

  it("returns 400 with empty headline", async () => {
    const res = await app.request("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        headline: "",
        url: "https://reuters.com/article",
        domain: "reuters.com",
      }),
    });

    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("headline");
  });

  it("returns 400 with invalid JSON body", async () => {
    const res = await app.request("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json{{{",
    });

    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("Invalid JSON");
  });

  it("returns cached result when cache has data", async () => {
    const { getCachedComparison } = await import("../../services/cache.js");
    const mockCached: AngleComparison = {
      id: "cached-id",
      topic: "Cached Topic",
      normalizedTopic: "cached topic",
      currentArticle: {
        article: {
          headline: "Cached Headline",
          body: "body",
          byline: null,
          siteName: "Cached News",
          url: "https://cached.com/article",
          domain: "cached.com",
          publishDate: null,
          imageUrl: null,
        },
        angle: mockAngle,
        sentiment: mockSentiment,
        sourceBias: null,
      },
      clusters: [],
      coverageGaps: [],
      toneDistribution: {
        alarm: 1,
        neutral: 0,
        optimistic: 0,
        adversarial: 0,
        empathetic: 0,
        dismissive: 0,
      },
      totalSourcesFetched: 10,
      totalSourcesAnalyzed: 5,
      timestamp: "2026-04-01T12:00:00Z",
      cachedAt: "2026-04-01T12:05:00Z",
    };

    vi.mocked(getCachedComparison).mockReturnValueOnce(mockCached);

    const res = await app.request("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        headline: "Cached Topic",
        url: "https://cached.com/article",
        domain: "cached.com",
      }),
    });

    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.cached).toBe(true);
    expect(json.comparison.id).toBe("cached-id");
  });

  it("returns 404 when no articles are fetched", async () => {
    const { fetchRelatedArticles } = await import("../../services/news-fetcher.js");
    vi.mocked(fetchRelatedArticles).mockResolvedValueOnce([]);

    const res = await app.request("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        headline: "Obscure Topic Nobody Covers",
        url: "https://obscure.com/article",
        domain: "obscure.com",
      }),
    });

    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("No related articles");
  });
});
