import { describe, it, expect } from "vitest";
import {
  deduplicateArticles,
  normalizeUrl,
  tokenize,
  cosineSimilarity,
  wordOverlap,
} from "../deduplicator.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface RawArticle {
  title: string;
  description: string;
  content: string | null;
  url: string;
  source: string;
  domain: string;
  publishedAt: string | null;
  imageUrl: string | null;
  apiSource: "newsdata" | "gdelt" | "googlenews" | "thenewsapi";
}

function makeArticle(overrides: Partial<RawArticle> = {}): RawArticle {
  return {
    title: "Steel Tariffs Shake Global Markets",
    description: "New steel tariffs announced by the administration are causing market volatility worldwide.",
    content: "The administration announced sweeping new steel tariffs today, sending shockwaves through global financial markets. Industry leaders warned of supply chain disruptions while trade partners threatened retaliatory measures.",
    url: "https://www.example.com/steel-tariffs-markets",
    source: "Example News",
    domain: "example.com",
    publishedAt: "2026-03-15T10:00:00Z",
    imageUrl: null,
    apiSource: "newsdata",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normalizeUrl
// ---------------------------------------------------------------------------

describe("normalizeUrl", () => {
  it("strips http protocol", () => {
    expect(normalizeUrl("http://example.com/article")).toBe("example.com/article");
  });

  it("strips https protocol", () => {
    expect(normalizeUrl("https://example.com/article")).toBe("example.com/article");
  });

  it("strips www prefix", () => {
    expect(normalizeUrl("https://www.example.com/article")).toBe("example.com/article");
  });

  it("removes query parameters", () => {
    expect(normalizeUrl("https://example.com/article?utm_source=twitter&ref=home")).toBe(
      "example.com/article"
    );
  });

  it("removes fragment identifiers", () => {
    expect(normalizeUrl("https://example.com/article#section-2")).toBe(
      "example.com/article"
    );
  });

  it("removes trailing slashes", () => {
    expect(normalizeUrl("https://example.com/article/")).toBe("example.com/article");
  });

  it("lowercases the URL", () => {
    expect(normalizeUrl("https://Example.COM/Article")).toBe("example.com/article");
  });

  it("normalizes http and https to the same result", () => {
    const http = normalizeUrl("http://www.example.com/article/");
    const https = normalizeUrl("https://example.com/article");
    expect(http).toBe(https);
  });

  it("handles URLs with multiple trailing slashes", () => {
    expect(normalizeUrl("https://example.com/article///")).toBe("example.com/article");
  });

  it("handles edge case of domain-only URL", () => {
    expect(normalizeUrl("https://www.example.com/")).toBe("example.com");
  });
});

// ---------------------------------------------------------------------------
// tokenize
// ---------------------------------------------------------------------------

describe("tokenize", () => {
  it("lowercases and splits text", () => {
    const tokens = tokenize("Steel Tariffs Impact");
    expect(tokens).toContain("steel");
    expect(tokens).toContain("tariffs");
    expect(tokens).toContain("impact");
  });

  it("removes stop words", () => {
    const tokens = tokenize("The new steel tariffs are very much a problem");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("are");
    expect(tokens).not.toContain("very");
    expect(tokens).not.toContain("much");
    expect(tokens).toContain("steel");
    expect(tokens).toContain("tariffs");
  });

  it("removes punctuation", () => {
    const tokens = tokenize("Tariffs, trade-war! Markets?");
    expect(tokens).toContain("tariffs");
    expect(tokens).toContain("markets");
  });

  it("filters out short words (< 2 chars)", () => {
    const tokens = tokenize("I a am steel tariff");
    expect(tokens).not.toContain("i");
    expect(tokens).not.toContain("a");
  });

  it("filters out pure numbers", () => {
    const tokens = tokenize("25 percent steel tariff");
    expect(tokens).not.toContain("25");
    expect(tokens).toContain("percent");
  });

  it("returns empty array for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("returns empty array for null-like input", () => {
    expect(tokenize("")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// cosineSimilarity
// ---------------------------------------------------------------------------

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical token arrays", () => {
    const tokens = ["steel", "tariffs", "market"];
    expect(cosineSimilarity(tokens, tokens)).toBeCloseTo(1.0, 5);
  });

  it("returns 0 for completely different token arrays", () => {
    const a = ["steel", "tariffs", "market"];
    const b = ["climate", "emissions", "carbon"];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("returns a value between 0 and 1 for partially overlapping tokens", () => {
    const a = ["steel", "tariffs", "market", "trade"];
    const b = ["steel", "tariffs", "economy", "jobs"];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it("returns 0 when either array is empty", () => {
    expect(cosineSimilarity([], ["steel"])).toBe(0);
    expect(cosineSimilarity(["steel"], [])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("accounts for term frequency", () => {
    // More repetition of shared terms should yield higher similarity
    const a = ["steel", "steel", "tariffs"];
    const b = ["steel", "steel", "economy"];
    const c = ["steel", "tariffs", "economy"];
    const simAB = cosineSimilarity(a, b);
    const simAC = cosineSimilarity(a, c);
    // a and b share "steel" appearing twice, so should be more similar
    expect(simAB).toBeGreaterThan(simAC);
  });

  it("is symmetric", () => {
    const a = ["steel", "tariffs", "trade"];
    const b = ["trade", "economy", "steel"];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });
});

// ---------------------------------------------------------------------------
// wordOverlap
// ---------------------------------------------------------------------------

describe("wordOverlap", () => {
  it("returns 1.0 for identical text", () => {
    const text = "Steel tariffs impact global markets";
    expect(wordOverlap(text, text)).toBeCloseTo(1.0);
  });

  it("returns 0 for completely different text", () => {
    const a = "Steel tariffs impact global markets";
    const b = "Climate change emissions carbon footprint";
    expect(wordOverlap(a, b)).toBe(0);
  });

  it("returns a value between 0 and 1 for partial overlap", () => {
    const a = "Steel tariffs impact global markets trade";
    const b = "Steel tariffs affect local economy trade";
    const overlap = wordOverlap(a, b);
    expect(overlap).toBeGreaterThan(0);
    expect(overlap).toBeLessThanOrEqual(1);
  });

  it("returns 0 when either text is empty", () => {
    expect(wordOverlap("", "steel tariffs")).toBe(0);
    expect(wordOverlap("steel tariffs", "")).toBe(0);
  });

  it("normalizes by smaller set size so subset detection works", () => {
    // Short text is a subset of the longer text
    const short = "steel tariffs";
    const long = "steel tariffs announced causing market volatility trade disruptions";
    const overlap = wordOverlap(short, long);
    expect(overlap).toBeCloseTo(1.0);
  });
});

// ---------------------------------------------------------------------------
// deduplicateArticles - URL dedup
// ---------------------------------------------------------------------------

describe("deduplicateArticles - URL dedup", () => {
  it("removes articles with identical URLs after normalization", () => {
    const articles = [
      makeArticle({ url: "https://www.example.com/steel-tariffs/" }),
      makeArticle({ url: "http://example.com/steel-tariffs" }),
    ];

    const result = deduplicateArticles(articles);
    expect(result).toHaveLength(1);
  });

  it("keeps the article with more content when URLs match", () => {
    const articles = [
      makeArticle({
        url: "https://example.com/article",
        content: "Short",
      }),
      makeArticle({
        url: "http://www.example.com/article",
        content: "This is a much longer piece of content about steel tariffs and their impact on the economy.",
      }),
    ];

    const result = deduplicateArticles(articles);
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain("much longer");
  });

  it("handles different URLs for different articles", () => {
    const articles = [
      makeArticle({
        title: "CNN: Steel Tariffs Impact American Economy",
        url: "https://cnn.com/steel-tariffs",
        domain: "cnn.com",
        description: "CNN reports on the impact of steel tariffs on the American economy.",
      }),
      makeArticle({
        title: "BBC: European Markets React to Trade Policy",
        url: "https://bbc.com/steel-tariffs",
        domain: "bbc.com",
        description: "BBC covers European market reactions to new trade policies.",
      }),
    ];

    const result = deduplicateArticles(articles);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// deduplicateArticles - Title similarity dedup
// ---------------------------------------------------------------------------

describe("deduplicateArticles - Title similarity", () => {
  it("removes articles with very similar titles from different sources", () => {
    const articles = [
      makeArticle({
        title: "Steel Tariffs Shake Global Markets Amid Trade Tensions",
        url: "https://reuters.com/steel-tariffs",
        domain: "reuters.com",
        content: "Full Reuters article about steel tariffs impacting markets worldwide. Analysts predict long-term consequences.",
      }),
      makeArticle({
        title: "Steel Tariffs Shake Global Markets in Trade Tensions",
        url: "https://ap.com/steel-tariffs",
        domain: "ap.com",
        content: "Short version.",
      }),
    ];

    const result = deduplicateArticles(articles);
    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe("reuters.com"); // keeps the one with more content
  });

  it("keeps articles with genuinely different titles", () => {
    const articles = [
      makeArticle({
        title: "Steel Tariffs Shake Global Markets",
        url: "https://reuters.com/markets",
        domain: "reuters.com",
        description: "Financial markets reacted sharply to the new steel tariffs.",
      }),
      makeArticle({
        title: "Workers Protest Factory Closures in Ohio",
        url: "https://nytimes.com/workers",
        domain: "nytimes.com",
        description: "Hundreds of factory workers staged protests outside closed plants.",
      }),
    ];

    const result = deduplicateArticles(articles);
    expect(result).toHaveLength(2);
  });

  it("handles identical titles across different URLs", () => {
    const articles = [
      makeArticle({
        title: "Breaking: Steel Tariffs Announced",
        url: "https://source1.com/breaking",
        domain: "source1.com",
      }),
      makeArticle({
        title: "Breaking: Steel Tariffs Announced",
        url: "https://source2.com/breaking",
        domain: "source2.com",
      }),
    ];

    const result = deduplicateArticles(articles);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// deduplicateArticles - Same-source dedup
// ---------------------------------------------------------------------------

describe("deduplicateArticles - Same-source dedup", () => {
  it("deduplicates similar articles from the same domain", () => {
    const articles = [
      makeArticle({
        title: "Steel Tariffs: Markets React to New Trade Policy",
        url: "https://cnn.com/steel-tariffs-markets",
        domain: "cnn.com",
        publishedAt: "2026-03-15T08:00:00Z",
        content: "Early morning brief.",
      }),
      makeArticle({
        title: "Steel Tariffs: Markets React Strongly to Trade Policy Shift",
        url: "https://cnn.com/steel-tariffs-markets-update",
        domain: "cnn.com",
        publishedAt: "2026-03-15T14:00:00Z",
        content: "Updated afternoon analysis with more details about the market reaction to steel tariffs.",
      }),
    ];

    const result = deduplicateArticles(articles);
    expect(result).toHaveLength(1);
    expect(result[0].publishedAt).toBe("2026-03-15T14:00:00Z");
  });

  it("keeps different stories from the same domain", () => {
    const articles = [
      makeArticle({
        title: "Steel Tariffs Impact Global Markets",
        url: "https://nytimes.com/steel",
        domain: "nytimes.com",
        description: "Markets fell sharply after tariff announcement.",
      }),
      makeArticle({
        title: "Climate Summit Reaches Historic Agreement on Emissions",
        url: "https://nytimes.com/climate",
        domain: "nytimes.com",
        description: "World leaders agreed to cut emissions at the landmark summit.",
      }),
    ];

    const result = deduplicateArticles(articles);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// deduplicateArticles - Content dedup
// ---------------------------------------------------------------------------

describe("deduplicateArticles - Content dedup", () => {
  it("removes articles with highly overlapping descriptions", () => {
    const articles = [
      makeArticle({
        title: "Market Analysis: Tariff Impact",
        url: "https://source1.com/analysis",
        domain: "source1.com",
        description: "Steel tariffs announced today caused significant market volatility affecting global trade partners",
        content: "Full article.",
      }),
      makeArticle({
        title: "Economic Report: Trade Shift",
        url: "https://source2.com/report",
        domain: "source2.com",
        description: "Steel tariffs announced today caused significant market volatility affecting global trade partners and economies",
        content: "Full article with even more detail about the economic impact.",
      }),
    ];

    const result = deduplicateArticles(articles);
    expect(result).toHaveLength(1);
    // Should keep the one with more content
    expect(result[0].domain).toBe("source2.com");
  });

  it("keeps articles with different descriptions", () => {
    const articles = [
      makeArticle({
        title: "Steel Tariffs: Market Perspective",
        url: "https://source1.com/market",
        domain: "source1.com",
        description: "Wall Street reacted sharply to new steel tariff announcement with major indices falling.",
      }),
      makeArticle({
        title: "Steel Tariffs: Worker Perspective",
        url: "https://source2.com/worker",
        domain: "source2.com",
        description: "Factory workers in Pittsburgh celebrated the new tariff protections for domestic steel industry.",
      }),
    ];

    const result = deduplicateArticles(articles);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// deduplicateArticles - Full pipeline
// ---------------------------------------------------------------------------

describe("deduplicateArticles - Full pipeline", () => {
  it("handles a mix of duplicate types", () => {
    const articles = [
      // URL duplicate pair
      makeArticle({
        title: "EU Responds Firmly to Steel Tariffs with Counter Measures",
        url: "https://www.bbc.com/eu-steel",
        domain: "bbc.com",
        description: "The European Union responded swiftly to new steel tariffs with counter measures.",
        content: "The European Union responded swiftly to new steel tariffs with plans for counter measures against American exports.",
      }),
      makeArticle({
        title: "EU Responds Firmly to Steel Tariffs with Counter Measures",
        url: "https://bbc.com/eu-steel/",
        domain: "bbc.com",
        description: "EU responds to tariffs.",
        content: "Short.",
      }),
      // Title similarity duplicate pair
      makeArticle({
        title: "China Threatens Retaliation Over American Steel Tariffs",
        url: "https://reuters.com/china-retaliation",
        domain: "reuters.com",
        description: "China warns of retaliatory trade measures.",
        content: "China warns of retaliatory trade measures in response to steep tariffs on steel imports.",
      }),
      makeArticle({
        title: "China Threatens Retaliation Against American Steel Tariffs",
        url: "https://ap.com/china-retaliates",
        domain: "ap.com",
        description: "China threatens retaliation.",
        content: "Brief.",
      }),
      // Genuinely unique article
      makeArticle({
        title: "Domestic Steel Workers Celebrate Tariff Victory in Rust Belt",
        url: "https://foxnews.com/workers-celebrate",
        domain: "foxnews.com",
        description: "Steel workers in the Rust Belt hailed the tariff decision.",
        content: "Steel workers in the Rust Belt hailed the tariff decision as a major win for American manufacturing and jobs.",
      }),
    ];

    const result = deduplicateArticles(articles);
    // Should keep: 1 BBC (URL dedup), 1 Reuters or AP (title dedup), 1 Fox (unique)
    expect(result.length).toBeLessThanOrEqual(3);
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves all unique articles", () => {
    const articles = [
      makeArticle({
        title: "Steel Tariffs Impact Wall Street",
        url: "https://cnbc.com/tariffs-wall-street",
        domain: "cnbc.com",
        description: "Markets tumbled on tariff news",
      }),
      makeArticle({
        title: "Environmental Groups Praise Tariff Side Effects",
        url: "https://guardian.com/environment-tariffs",
        domain: "guardian.com",
        description: "Reduced steel imports lower carbon emissions from shipping",
      }),
      makeArticle({
        title: "Canadian Steelmakers Brace for Impact",
        url: "https://cbc.ca/canada-steel",
        domain: "cbc.ca",
        description: "Canadian steel industry prepares for fallout from new US tariffs",
      }),
    ];

    const result = deduplicateArticles(articles);
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("deduplicateArticles - Edge cases", () => {
  it("returns empty array for empty input", () => {
    expect(deduplicateArticles([])).toEqual([]);
  });

  it("returns single article unchanged", () => {
    const articles = [makeArticle()];
    const result = deduplicateArticles(articles);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe(articles[0].title);
  });

  it("handles all-duplicate input", () => {
    const articles = [
      makeArticle({ url: "https://example.com/a" }),
      makeArticle({ url: "http://www.example.com/a/" }),
      makeArticle({ url: "https://example.com/a?utm_source=twitter" }),
    ];

    const result = deduplicateArticles(articles);
    expect(result).toHaveLength(1);
  });

  it("handles articles with missing descriptions gracefully", () => {
    const articles = [
      makeArticle({
        title: "SpaceX Launches Satellite Into Orbit Successfully",
        url: "https://source1.com/a",
        domain: "source1.com",
        description: "",
        content: "SpaceX launched a new satellite mission from Cape Canaveral.",
      }),
      makeArticle({
        title: "Federal Reserve Raises Interest Rates Again",
        url: "https://source2.com/b",
        domain: "source2.com",
        description: "",
        content: "The Federal Reserve announced another interest rate increase today.",
      }),
    ];

    const result = deduplicateArticles(articles);
    expect(result).toHaveLength(2);
  });

  it("handles articles with null content", () => {
    const articles = [
      makeArticle({
        url: "https://source1.com/a",
        domain: "source1.com",
        content: null,
      }),
      makeArticle({
        url: "https://source2.com/b",
        domain: "source2.com",
        content: null,
      }),
    ];

    const result = deduplicateArticles(articles);
    // Different URLs and titles might survive dedup
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("handles articles with no publishedAt date", () => {
    const articles = [
      makeArticle({
        url: "https://example.com/article",
        publishedAt: null,
        content: "Less content.",
      }),
      makeArticle({
        url: "http://www.example.com/article/",
        publishedAt: null,
        content: "More content here with additional details about the story.",
      }),
    ];

    const result = deduplicateArticles(articles);
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain("More content");
  });
});
