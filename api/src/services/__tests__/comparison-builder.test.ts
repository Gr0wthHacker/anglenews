import { describe, it, expect } from "vitest";
import { buildComparison } from "../comparison-builder.js";
import type {
  AnalyzedArticle,
  AngleCluster,
  EmotionalRegister,
} from "../../../../shared/types.js";

// ─── Test data factories ────────────────────────────────────────────────────

function makeAnalyzedArticle(
  overrides: {
    headline?: string;
    domain?: string;
    siteName?: string;
    emotionalRegister?: EmotionalRegister;
    keyOmissions?: string[];
    headlineFraming?: string;
    centralEntity?: string;
    causalAttribution?: string;
    solutionFrame?: string;
    statisticalAnchoring?: string;
  } = {}
): AnalyzedArticle {
  return {
    article: {
      headline: overrides.headline ?? "Default Headline",
      body: "Article body text.",
      byline: "Reporter Name",
      siteName: overrides.siteName ?? "Example News",
      url: `https://${overrides.domain ?? "example.com"}/article`,
      domain: overrides.domain ?? "example.com",
      publishDate: "2026-04-01T10:00:00Z",
      imageUrl: null,
    },
    angle: {
      headline_framing: overrides.headlineFraming ?? "Default framing",
      central_entity: overrides.centralEntity ?? "Default Entity",
      causal_attribution: overrides.causalAttribution ?? "Default cause",
      emotional_register: overrides.emotionalRegister ?? "neutral",
      solution_frame: overrides.solutionFrame ?? "Default solution",
      key_omissions: overrides.keyOmissions ?? [],
      quote_sources: [
        { name: "Expert", affiliation: "Institute", stance: "Concerned" },
      ],
      statistical_anchoring: overrides.statisticalAnchoring ?? "50% stat",
      confidence: 0.8,
    },
    sentiment: { positive: 0.3, negative: 0.3, neutral: 0.4, compound: 0.0 },
    sourceBias: null,
  };
}

function makeClusters(labels: string[]): AngleCluster[] {
  return labels.map((label, i) => ({
    id: `cluster-${i}`,
    label,
    articles: [],
    dominantRegister: "neutral" as EmotionalRegister,
    distinctiveness: 0.5,
  }));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("comparison-builder", () => {
  describe("buildComparison", () => {
    it("returns a valid AngleComparison with all required fields", () => {
      const current = makeAnalyzedArticle({ headline: "Current Article" });
      const others = [
        makeAnalyzedArticle({ headline: "Other 1", domain: "other1.com" }),
        makeAnalyzedArticle({ headline: "Other 2", domain: "other2.com" }),
      ];
      const clusters = makeClusters(["Market Impact", "Policy"]);

      const result = buildComparison(
        "Trade Tariffs",
        "trade tariffs",
        current,
        others,
        clusters,
        25
      );

      expect(result.id).toBeDefined();
      expect(result.id.length).toBeGreaterThan(0);
      expect(result.topic).toBe("Trade Tariffs");
      expect(result.normalizedTopic).toBe("trade tariffs");
      expect(result.currentArticle).toBe(current);
      expect(result.clusters).toBe(clusters);
      expect(result.totalSourcesFetched).toBe(25);
      expect(result.totalSourcesAnalyzed).toBe(3); // others.length + 1
      expect(result.timestamp).toBeDefined();
      expect(result.cachedAt).toBeNull();
    });

    it("generates a UUID for the id field", () => {
      const current = makeAnalyzedArticle();
      const result = buildComparison("Topic", "topic", current, [], [], 0);

      // UUID v4 format
      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });
  });

  // ── Tone distribution ─────────────────────────────────────────────────

  describe("tone distribution", () => {
    it("calculates tone proportions across all articles", () => {
      const current = makeAnalyzedArticle({ emotionalRegister: "alarm" });
      const others = [
        makeAnalyzedArticle({ emotionalRegister: "alarm" }),
        makeAnalyzedArticle({ emotionalRegister: "neutral" }),
        makeAnalyzedArticle({ emotionalRegister: "optimistic" }),
      ];

      const result = buildComparison("Topic", "topic", current, others, [], 10);

      // 4 articles total: 2 alarm, 1 neutral, 1 optimistic
      expect(result.toneDistribution.alarm).toBe(0.5); // 2/4
      expect(result.toneDistribution.neutral).toBe(0.25); // 1/4
      expect(result.toneDistribution.optimistic).toBe(0.25); // 1/4
      expect(result.toneDistribution.adversarial).toBe(0);
      expect(result.toneDistribution.empathetic).toBe(0);
      expect(result.toneDistribution.dismissive).toBe(0);
    });

    it("handles all articles having the same tone", () => {
      const current = makeAnalyzedArticle({ emotionalRegister: "neutral" });
      const others = [
        makeAnalyzedArticle({ emotionalRegister: "neutral" }),
        makeAnalyzedArticle({ emotionalRegister: "neutral" }),
      ];

      const result = buildComparison("Topic", "topic", current, others, [], 5);

      expect(result.toneDistribution.neutral).toBe(1);
      expect(result.toneDistribution.alarm).toBe(0);
    });
  });

  // ── Coverage gap detection ────────────────────────────────────────────

  describe("coverage gap detection", () => {
    it("detects when current article omits topics covered by others", () => {
      const current = makeAnalyzedArticle({
        headline: "Current Coverage",
        domain: "current.com",
        siteName: "Current News",
        keyOmissions: ["environmental regulations impact"],
      });

      const other1 = makeAnalyzedArticle({
        headline: "Environmental Regulations Drive Change",
        domain: "other1.com",
        siteName: "Other1 News",
        headlineFraming: "Environmental regulations reshape industry",
        centralEntity: "Environmental regulations",
        causalAttribution: "New environmental policies impact manufacturing",
      });

      const other2 = makeAnalyzedArticle({
        headline: "Regulations Change Economy",
        domain: "other2.com",
        siteName: "Other2 News",
        headlineFraming: "Environmental regulations affect output",
        solutionFrame: "Adapt to environmental regulation requirements",
      });

      const result = buildComparison("Topic", "topic", current, [other1, other2], [], 10);

      expect(result.coverageGaps.length).toBeGreaterThanOrEqual(1);
      const gap = result.coverageGaps[0];
      expect(gap.description).toBe("environmental regulations impact");
      expect(gap.missedBy).toBe("Current News");
      expect(gap.mentionedBy.length).toBeGreaterThanOrEqual(1);
    });

    it("returns no gaps when current article has no omissions", () => {
      const current = makeAnalyzedArticle({ keyOmissions: [] });
      const others = [
        makeAnalyzedArticle({ domain: "other.com" }),
      ];

      const result = buildComparison("Topic", "topic", current, others, [], 5);

      expect(result.coverageGaps).toEqual([]);
    });
  });

  // ── Empty articles ────────────────────────────────────────────────────

  describe("with empty articles array", () => {
    it("returns comparison with zero others and current article only", () => {
      const current = makeAnalyzedArticle({ emotionalRegister: "alarm" });

      const result = buildComparison("Topic", "topic", current, [], [], 0);

      expect(result.totalSourcesAnalyzed).toBe(1);
      expect(result.clusters).toEqual([]);
      expect(result.coverageGaps).toEqual([]);
      // Only the current article, so alarm is 100%
      expect(result.toneDistribution.alarm).toBe(1);
    });
  });

  // ── Single article ────────────────────────────────────────────────────

  describe("with single other article", () => {
    it("correctly computes stats with one other article", () => {
      const current = makeAnalyzedArticle({ emotionalRegister: "neutral" });
      const other = makeAnalyzedArticle({
        emotionalRegister: "optimistic",
        domain: "other.com",
      });

      const result = buildComparison("Topic", "topic", current, [other], [], 5);

      expect(result.totalSourcesAnalyzed).toBe(2);
      expect(result.toneDistribution.neutral).toBe(0.5);
      expect(result.toneDistribution.optimistic).toBe(0.5);
    });
  });
});
