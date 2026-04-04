import { describe, it, expect } from "vitest";
import {
  clusterArticles,
  extractFeatures,
  articleSimilarity,
  generateClusterLabel,
  getDominantRegister,
} from "../clusterer.js";
import type {
  AnalyzedArticle,
  EmotionalRegister,
} from "../../../../shared/types.js";

// ---------------------------------------------------------------------------
// Test data factory
// ---------------------------------------------------------------------------

function makeAnalyzedArticle(
  overrides: {
    headline?: string;
    domain?: string;
    headlineFraming?: string;
    centralEntity?: string;
    causalAttribution?: string;
    emotionalRegister?: EmotionalRegister;
    solutionFrame?: string;
    compound?: number;
  } = {}
): AnalyzedArticle {
  return {
    article: {
      headline: overrides.headline ?? "Steel Tariffs Shake Global Markets",
      body: "The administration announced sweeping new steel tariffs today.",
      byline: "John Reporter",
      siteName: "Example News",
      url: `https://${overrides.domain ?? "example.com"}/article`,
      domain: overrides.domain ?? "example.com",
      publishDate: "2026-03-15T10:00:00Z",
      imageUrl: null,
    },
    angle: {
      headline_framing:
        overrides.headlineFraming ?? "Market disruption from trade policy shift",
      central_entity: overrides.centralEntity ?? "Steel Industry",
      causal_attribution:
        overrides.causalAttribution ?? "Administration trade policy",
      emotional_register: overrides.emotionalRegister ?? "alarm",
      solution_frame:
        overrides.solutionFrame ?? "Negotiate bilateral trade agreements",
      key_omissions: ["Worker impact", "Environmental effects"],
      quote_sources: [
        { name: "Trade Analyst", affiliation: "Goldman Sachs", stance: "Concerned" },
      ],
      statistical_anchoring: "25% tariff rate",
      confidence: 0.85,
    },
    sentiment: {
      positive: 0.1,
      negative: 0.6,
      neutral: 0.3,
      compound: overrides.compound ?? -0.4,
    },
    sourceBias: {
      domain: overrides.domain ?? "example.com",
      name: "Example News",
      biasRating: "center",
      factualRating: "high",
      country: "US",
      mediaType: "online",
    },
  };
}

// ---------------------------------------------------------------------------
// extractFeatures
// ---------------------------------------------------------------------------

describe("extractFeatures", () => {
  it("extracts text tokens from headline framing, attribution, and solution", () => {
    const article = makeAnalyzedArticle({
      headlineFraming: "Market disruption from trade policy",
      causalAttribution: "Administration tariff decision",
      solutionFrame: "Bilateral trade negotiations",
    });

    const features = extractFeatures(article);

    expect(features.textTokens.length).toBeGreaterThan(0);
    expect(features.textTokens).toContain("market");
    expect(features.textTokens).toContain("disruption");
    expect(features.textTokens).toContain("tariff");
    expect(features.textTokens).toContain("bilateral");
  });

  it("one-hot encodes the emotional register", () => {
    const alarmArticle = makeAnalyzedArticle({ emotionalRegister: "alarm" });
    const optimisticArticle = makeAnalyzedArticle({ emotionalRegister: "optimistic" });

    const alarmFeatures = extractFeatures(alarmArticle);
    const optimisticFeatures = extractFeatures(optimisticArticle);

    // alarm is first in the register list
    expect(alarmFeatures.registerOneHot[0]).toBe(1);
    expect(alarmFeatures.registerOneHot.filter((v) => v === 1)).toHaveLength(1);

    // optimistic is third
    expect(optimisticFeatures.registerOneHot[2]).toBe(1);
    expect(optimisticFeatures.registerOneHot.filter((v) => v === 1)).toHaveLength(1);
  });

  it("extracts entity tokens from central entity", () => {
    const article = makeAnalyzedArticle({ centralEntity: "European Union" });
    const features = extractFeatures(article);

    expect(features.entityTokens).toContain("european");
    expect(features.entityTokens).toContain("union");
  });

  it("includes compound sentiment score", () => {
    const article = makeAnalyzedArticle({ compound: -0.5 });
    const features = extractFeatures(article);
    expect(features.compound).toBe(-0.5);
  });
});

// ---------------------------------------------------------------------------
// articleSimilarity
// ---------------------------------------------------------------------------

describe("articleSimilarity", () => {
  it("returns high similarity for nearly identical articles", () => {
    const a = makeAnalyzedArticle({
      headlineFraming: "Market disruption from trade policy",
      centralEntity: "Steel Industry",
      emotionalRegister: "alarm",
      compound: -0.4,
    });
    const b = makeAnalyzedArticle({
      headlineFraming: "Market disruption from trade policy shift",
      centralEntity: "Steel Industry",
      emotionalRegister: "alarm",
      compound: -0.35,
    });

    const sim = articleSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.7);
  });

  it("returns low similarity for very different articles", () => {
    const a = makeAnalyzedArticle({
      headlineFraming: "Market disruption from trade policy",
      centralEntity: "Steel Industry",
      emotionalRegister: "alarm",
      causalAttribution: "Administration tariff decision",
      solutionFrame: "Negotiate trade agreements",
      compound: -0.6,
    });
    const b = makeAnalyzedArticle({
      headlineFraming: "Worker protection and job creation benefits",
      centralEntity: "American Workers",
      emotionalRegister: "optimistic",
      causalAttribution: "Foreign competition undercutting wages",
      solutionFrame: "Strengthen domestic manufacturing capacity",
      compound: 0.5,
    });

    const sim = articleSimilarity(a, b);
    expect(sim).toBeLessThan(0.4);
  });

  it("gives partial credit for overlapping entities", () => {
    const a = makeAnalyzedArticle({ centralEntity: "Steel Industry" });
    const b = makeAnalyzedArticle({ centralEntity: "Steel Workers" });

    const simPartial = articleSimilarity(a, b);

    const c = makeAnalyzedArticle({ centralEntity: "Climate Policy" });
    const simDifferent = articleSimilarity(a, c);

    // Partial entity overlap should score higher than no overlap
    expect(simPartial).toBeGreaterThan(simDifferent);
  });

  it("weights emotional register match significantly", () => {
    const base = makeAnalyzedArticle({
      headlineFraming: "Tariff impact analysis",
      emotionalRegister: "alarm",
    });
    const sameRegister = makeAnalyzedArticle({
      headlineFraming: "Different framing entirely about something",
      emotionalRegister: "alarm",
    });
    const diffRegister = makeAnalyzedArticle({
      headlineFraming: "Tariff impact analysis",
      emotionalRegister: "optimistic",
    });

    const simSameReg = articleSimilarity(base, sameRegister);
    const simDiffReg = articleSimilarity(base, diffRegister);

    // Same register should contribute positively
    // (Though text sim differs, the 0.3 weight for register is substantial)
    expect(simSameReg).not.toBe(simDiffReg);
  });

  it("is symmetric", () => {
    const a = makeAnalyzedArticle({ headlineFraming: "Trade policy disruption" });
    const b = makeAnalyzedArticle({ headlineFraming: "Worker protection benefits" });

    expect(articleSimilarity(a, b)).toBeCloseTo(articleSimilarity(b, a), 10);
  });
});

// ---------------------------------------------------------------------------
// clusterArticles - clustering behavior
// ---------------------------------------------------------------------------

describe("clusterArticles - clustering", () => {
  it("produces separate clusters for clearly distinct articles", () => {
    const current = makeAnalyzedArticle({
      headlineFraming: "Market disruption from tariff announcement",
      centralEntity: "Wall Street",
      emotionalRegister: "alarm",
      compound: -0.5,
    });

    const articles = [
      // Cluster 1: Market alarm articles
      makeAnalyzedArticle({
        headline: "Markets Plunge on Tariff News",
        domain: "cnbc.com",
        headlineFraming: "Market disruption and financial instability",
        centralEntity: "Wall Street",
        emotionalRegister: "alarm",
        compound: -0.6,
      }),
      makeAnalyzedArticle({
        headline: "Investors Flee Steel Stocks",
        domain: "bloomberg.com",
        headlineFraming: "Market disruption and investor panic",
        centralEntity: "Wall Street",
        emotionalRegister: "alarm",
        compound: -0.5,
      }),
      // Cluster 2: Worker optimism articles
      makeAnalyzedArticle({
        headline: "Rust Belt Workers Cheer Tariff Decision",
        domain: "foxnews.com",
        headlineFraming: "Worker protection and job creation opportunity",
        centralEntity: "American Workers",
        emotionalRegister: "optimistic",
        solutionFrame: "Strengthen domestic manufacturing",
        causalAttribution: "Foreign competition undercutting domestic production",
        compound: 0.6,
      }),
      makeAnalyzedArticle({
        headline: "Steel Union Celebrates Historic Win",
        domain: "laborpress.com",
        headlineFraming: "Worker protection victory for labor movement",
        centralEntity: "American Workers",
        emotionalRegister: "optimistic",
        solutionFrame: "Protect domestic manufacturing jobs",
        causalAttribution: "Foreign dumping destroying American jobs",
        compound: 0.5,
      }),
    ];

    const clusters = clusterArticles(articles, current);

    expect(clusters.length).toBeGreaterThanOrEqual(2);

    // Each cluster should have articles
    for (const cluster of clusters) {
      expect(cluster.articles.length).toBeGreaterThan(0);
    }
  });

  it("merges similar articles into the same cluster", () => {
    const current = makeAnalyzedArticle();

    const articles = [
      makeAnalyzedArticle({
        headline: "Article A",
        domain: "a.com",
        headlineFraming: "Market disruption from trade policy",
        centralEntity: "Steel Industry",
        emotionalRegister: "alarm",
        compound: -0.4,
      }),
      makeAnalyzedArticle({
        headline: "Article B",
        domain: "b.com",
        headlineFraming: "Market disruption from trade policy shift",
        centralEntity: "Steel Industry",
        emotionalRegister: "alarm",
        compound: -0.35,
      }),
    ];

    const clusters = clusterArticles(articles, current);

    // These very similar articles should be in the same cluster
    expect(clusters).toHaveLength(1);
    expect(clusters[0].articles).toHaveLength(2);
  });

  it("respects max cluster limit of 6", () => {
    const current = makeAnalyzedArticle();

    // Create 10 very different articles
    const registers: EmotionalRegister[] = [
      "alarm", "neutral", "optimistic", "adversarial", "empathetic", "dismissive",
    ];
    const entities = [
      "Steel Industry", "American Workers", "European Union",
      "Chinese Government", "Environmental Groups", "Wall Street",
      "Tech Sector", "Agricultural Sector", "Defense Industry", "Consumer Groups",
    ];

    const articles = entities.map((entity, i) =>
      makeAnalyzedArticle({
        headline: `Article ${i}`,
        domain: `source${i}.com`,
        headlineFraming: `Unique framing perspective ${i} about ${entity.toLowerCase()}`,
        centralEntity: entity,
        emotionalRegister: registers[i % registers.length],
        causalAttribution: `Unique cause ${i}`,
        solutionFrame: `Unique solution ${i}`,
        compound: (i - 5) / 5,
      })
    );

    const clusters = clusterArticles(articles, current);
    expect(clusters.length).toBeLessThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// Cluster labeling
// ---------------------------------------------------------------------------

describe("generateClusterLabel", () => {
  it("generates a non-empty label", () => {
    const articles = [
      makeAnalyzedArticle({
        headlineFraming: "Market disruption from trade policy",
        centralEntity: "Steel Industry",
      }),
      makeAnalyzedArticle({
        headlineFraming: "Market disruption and financial instability",
        centralEntity: "Steel Industry",
      }),
    ];

    const label = generateClusterLabel(articles);
    expect(label.length).toBeGreaterThan(0);
  });

  it("uses common framing words across articles", () => {
    const articles = [
      makeAnalyzedArticle({
        headlineFraming: "Worker protection strengthens domestic economy",
      }),
      makeAnalyzedArticle({
        headlineFraming: "Worker protection creates manufacturing jobs",
      }),
      makeAnalyzedArticle({
        headlineFraming: "Worker protection and labor benefits",
      }),
    ];

    const label = generateClusterLabel(articles);
    // "worker" and "protection" should appear most frequently
    expect(label.toLowerCase()).toMatch(/worker|protection/);
  });

  it("handles single article cluster", () => {
    const articles = [
      makeAnalyzedArticle({
        headlineFraming: "Environmental impact of tariff policies",
        centralEntity: "Climate Change",
      }),
    ];

    const label = generateClusterLabel(articles);
    expect(label.length).toBeGreaterThan(0);
  });

  it("returns fallback label for empty cluster", () => {
    const label = generateClusterLabel([]);
    expect(label).toBe("Uncategorized");
  });
});

// ---------------------------------------------------------------------------
// getDominantRegister
// ---------------------------------------------------------------------------

describe("getDominantRegister", () => {
  it("returns the most common register", () => {
    const articles = [
      makeAnalyzedArticle({ emotionalRegister: "alarm" }),
      makeAnalyzedArticle({ emotionalRegister: "alarm" }),
      makeAnalyzedArticle({ emotionalRegister: "neutral" }),
    ];

    expect(getDominantRegister(articles)).toBe("alarm");
  });

  it("returns 'neutral' as default for empty array", () => {
    expect(getDominantRegister([])).toBe("neutral");
  });

  it("returns the register when all articles agree", () => {
    const articles = [
      makeAnalyzedArticle({ emotionalRegister: "optimistic" }),
      makeAnalyzedArticle({ emotionalRegister: "optimistic" }),
    ];

    expect(getDominantRegister(articles)).toBe("optimistic");
  });
});

// ---------------------------------------------------------------------------
// Distinctiveness scoring
// ---------------------------------------------------------------------------

describe("clusterArticles - distinctiveness", () => {
  it("scores clusters more different from current article higher", () => {
    const current = makeAnalyzedArticle({
      headlineFraming: "Market disruption and financial instability",
      centralEntity: "Wall Street",
      emotionalRegister: "alarm",
      compound: -0.5,
    });

    const articles = [
      // Similar to current
      makeAnalyzedArticle({
        headline: "Similar Alarm Article",
        domain: "similar.com",
        headlineFraming: "Market disruption and financial risk",
        centralEntity: "Wall Street",
        emotionalRegister: "alarm",
        compound: -0.4,
      }),
      // Very different from current
      makeAnalyzedArticle({
        headline: "Optimistic Worker Article",
        domain: "different.com",
        headlineFraming: "Worker protection creates opportunity",
        centralEntity: "American Workers",
        emotionalRegister: "optimistic",
        solutionFrame: "Strengthen domestic manufacturing",
        causalAttribution: "Foreign competition destroying jobs",
        compound: 0.6,
      }),
    ];

    const clusters = clusterArticles(articles, current);

    // Since they are quite different from each other, expect 2 clusters
    if (clusters.length >= 2) {
      // The cluster most different from current should have higher distinctiveness
      expect(clusters[0].distinctiveness).toBeGreaterThanOrEqual(
        clusters[clusters.length - 1].distinctiveness
      );
    }
  });

  it("assigns distinctiveness between 0 and 1", () => {
    const current = makeAnalyzedArticle();

    const articles = [
      makeAnalyzedArticle({ domain: "a.com", headline: "Article A" }),
      makeAnalyzedArticle({
        domain: "b.com",
        headline: "Article B",
        headlineFraming: "Completely different perspective",
        emotionalRegister: "optimistic",
        compound: 0.8,
      }),
    ];

    const clusters = clusterArticles(articles, current);

    for (const cluster of clusters) {
      expect(cluster.distinctiveness).toBeGreaterThanOrEqual(0);
      expect(cluster.distinctiveness).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("clusterArticles - Edge cases", () => {
  it("returns empty array for empty input", () => {
    const current = makeAnalyzedArticle();
    expect(clusterArticles([], current)).toEqual([]);
  });

  it("returns single cluster for single article", () => {
    const current = makeAnalyzedArticle();
    const articles = [makeAnalyzedArticle({ domain: "other.com" })];

    const clusters = clusterArticles(articles, current);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].articles).toHaveLength(1);
  });

  it("handles two articles", () => {
    const current = makeAnalyzedArticle();

    const articles = [
      makeAnalyzedArticle({
        domain: "a.com",
        headlineFraming: "Market alarm perspective",
        emotionalRegister: "alarm",
      }),
      makeAnalyzedArticle({
        domain: "b.com",
        headlineFraming: "Optimistic growth perspective",
        emotionalRegister: "optimistic",
        compound: 0.5,
      }),
    ];

    const clusters = clusterArticles(articles, current);
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    expect(clusters.length).toBeLessThanOrEqual(2);

    // Total articles across clusters should equal input
    const totalArticles = clusters.reduce(
      (sum, c) => sum + c.articles.length,
      0
    );
    expect(totalArticles).toBe(2);
  });

  it("each cluster has required fields", () => {
    const current = makeAnalyzedArticle();
    const articles = [
      makeAnalyzedArticle({ domain: "a.com" }),
      makeAnalyzedArticle({ domain: "b.com", emotionalRegister: "optimistic" }),
    ];

    const clusters = clusterArticles(articles, current);

    for (const cluster of clusters) {
      expect(cluster.id).toBeDefined();
      expect(typeof cluster.id).toBe("string");
      expect(cluster.id.length).toBeGreaterThan(0);
      expect(cluster.label).toBeDefined();
      expect(typeof cluster.label).toBe("string");
      expect(cluster.articles.length).toBeGreaterThan(0);
      expect(cluster.dominantRegister).toBeDefined();
      expect(typeof cluster.distinctiveness).toBe("number");
    }
  });

  it("sorted by distinctiveness descending", () => {
    const current = makeAnalyzedArticle({
      emotionalRegister: "alarm",
      compound: -0.5,
    });

    const articles = [
      makeAnalyzedArticle({
        domain: "a.com",
        headlineFraming: "Market disruption alarm",
        emotionalRegister: "alarm",
        compound: -0.4,
      }),
      makeAnalyzedArticle({
        domain: "b.com",
        headlineFraming: "Hopeful worker opportunity celebration",
        emotionalRegister: "optimistic",
        centralEntity: "Workers Union",
        causalAttribution: "Historic labor organizing",
        solutionFrame: "Expand worker benefits and protections",
        compound: 0.7,
      }),
    ];

    const clusters = clusterArticles(articles, current);

    if (clusters.length >= 2) {
      for (let i = 0; i < clusters.length - 1; i++) {
        expect(clusters[i].distinctiveness).toBeGreaterThanOrEqual(
          clusters[i + 1].distinctiveness
        );
      }
    }
  });
});
