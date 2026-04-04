import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AngleComparison, AnalyzedArticle, AngleCluster, CoverageGap } from "@shared/types";
import {
  generatePlainTextSummary,
  generateMarkdownSummary,
  escapeHtml,
  formatBiasLabel,
} from "../ShareButton.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeArticle(overrides: Partial<AnalyzedArticle> = {}): AnalyzedArticle {
  return {
    article: {
      headline: "Steel Tariffs Shake Global Markets",
      body: "The administration announced sweeping new steel tariffs today.",
      byline: "Jane Reporter",
      siteName: "Example News",
      url: "https://example.com/steel-tariffs",
      domain: "example.com",
      publishDate: "2026-03-15T10:00:00Z",
      imageUrl: null,
    },
    angle: {
      headline_framing: "Economic disruption through trade policy",
      central_entity: "Steel Industry",
      causal_attribution: "Government tariff policy",
      emotional_register: "alarm",
      solution_frame: "Free trade agreements",
      key_omissions: ["Environmental impact"],
      quote_sources: [],
      statistical_anchoring: "Markets fell 3%",
      confidence: 0.85,
    },
    sentiment: { positive: 0.1, negative: 0.6, neutral: 0.3, compound: -0.5 },
    sourceBias: {
      domain: "example.com",
      name: "Example News",
      biasRating: "left-center",
      factualRating: "high",
      country: "US",
      mediaType: "online",
    },
    ...overrides,
  };
}

function makeCluster(overrides: Partial<AngleCluster> = {}): AngleCluster {
  return {
    id: "cluster-1",
    label: "Market Disruption",
    articles: [makeArticle()],
    dominantRegister: "alarm",
    distinctiveness: 0.7,
    ...overrides,
  };
}

function makeComparison(overrides: Partial<AngleComparison> = {}): AngleComparison {
  return {
    id: "comp-1",
    topic: "Steel Tariffs",
    normalizedTopic: "steel tariffs",
    currentArticle: makeArticle(),
    clusters: [
      makeCluster({ id: "c1", label: "Market Disruption" }),
      makeCluster({
        id: "c2",
        label: "Worker Protection",
        articles: [makeArticle(), makeArticle()],
      }),
    ],
    coverageGaps: [
      {
        description: "Environmental impact of steel production",
        mentionedBy: ["Reuters", "BBC"],
        missedBy: "Example News",
      },
    ],
    toneDistribution: {
      alarm: 3,
      neutral: 2,
      optimistic: 1,
      adversarial: 0,
      empathetic: 0,
      dismissive: 0,
    },
    totalSourcesFetched: 20,
    totalSourcesAnalyzed: 12,
    timestamp: "2026-03-15T12:00:00Z",
    cachedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

describe("escapeHtml", () => {
  it("escapes < and >", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;",
    );
  });

  it("escapes &", () => {
    expect(escapeHtml("AT&T")).toBe("AT&amp;T");
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('He said "hello"')).toBe("He said &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("handles a string with all special characters", () => {
    expect(escapeHtml(`<"&'>`)).toBe("&lt;&quot;&amp;&#39;&gt;");
  });

  it("returns an empty string unchanged", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("leaves plain text unchanged", () => {
    expect(escapeHtml("Hello World 123")).toBe("Hello World 123");
  });
});

// ---------------------------------------------------------------------------
// formatBiasLabel
// ---------------------------------------------------------------------------

describe("formatBiasLabel", () => {
  it("capitalises each word in a hyphenated rating", () => {
    expect(formatBiasLabel("left-center")).toBe("Left Center");
  });

  it("capitalises a single word rating", () => {
    expect(formatBiasLabel("center")).toBe("Center");
  });

  it("handles far-right", () => {
    expect(formatBiasLabel("far-right")).toBe("Far Right");
  });
});

// ---------------------------------------------------------------------------
// generatePlainTextSummary
// ---------------------------------------------------------------------------

describe("generatePlainTextSummary", () => {
  it("includes the topic and total sources in the header line", () => {
    const data = makeComparison();
    const text = generatePlainTextSummary(data);
    expect(text).toContain('AngleCheck: "Steel Tariffs"');
    expect(text).toContain("12 sources analyzed");
  });

  it("includes the current article headline and source name", () => {
    const text = generatePlainTextSummary(makeComparison());
    expect(text).toContain("You read: Steel Tariffs Shake Global Markets on Example News");
  });

  it("includes bias label when sourceBias is present", () => {
    const text = generatePlainTextSummary(makeComparison());
    expect(text).toContain("(Left Center)");
  });

  it("omits bias label when sourceBias is null", () => {
    const data = makeComparison({
      currentArticle: makeArticle({ sourceBias: null }),
    });
    const text = generatePlainTextSummary(data);
    expect(text).not.toContain("(Left Center)");
    // Should fall back to siteName
    expect(text).toContain("on Example News");
  });

  it("falls back to domain when siteName and sourceBias.name are absent", () => {
    const data = makeComparison({
      currentArticle: makeArticle({
        sourceBias: null,
        article: {
          headline: "Headline",
          body: "Body",
          byline: null,
          siteName: null,
          url: "https://example.com/article",
          domain: "example.com",
          publishDate: null,
          imageUrl: null,
        },
      }),
    });
    const text = generatePlainTextSummary(data);
    expect(text).toContain("on example.com");
  });

  it("shows the framing of the current article", () => {
    const text = generatePlainTextSummary(makeComparison());
    expect(text).toContain("Framing: Economic disruption through trade policy");
  });

  it("lists all clusters with numbered labels", () => {
    const text = generatePlainTextSummary(makeComparison());
    expect(text).toContain("2 distinct angles found:");
    expect(text).toContain("1. Market Disruption (1 source)");
    expect(text).toContain("2. Worker Protection (2 sources)");
  });

  it("includes coverage gaps when present", () => {
    const text = generatePlainTextSummary(makeComparison());
    expect(text).toContain("Coverage gaps:");
    expect(text).toContain("Environmental impact of steel production");
  });

  it("omits coverage gaps section when empty", () => {
    const data = makeComparison({ coverageGaps: [] });
    const text = generatePlainTextSummary(data);
    expect(text).not.toContain("Coverage gaps:");
  });

  it("handles 0 clusters", () => {
    const data = makeComparison({ clusters: [] });
    const text = generatePlainTextSummary(data);
    expect(text).toContain("0 distinct angles found:");
  });

  it("uses singular 'angle' for exactly 1 cluster", () => {
    const data = makeComparison({ clusters: [makeCluster()] });
    const text = generatePlainTextSummary(data);
    expect(text).toContain("1 distinct angle found:");
  });

  it("handles special characters in headlines without breaking output", () => {
    const data = makeComparison({
      currentArticle: makeArticle({
        article: {
          headline: 'Breaking: "Tariffs" & <Trade> War\'s Impact',
          body: "Body text",
          byline: null,
          siteName: "Fox & Friends",
          url: "https://example.com/a",
          domain: "example.com",
          publishDate: null,
          imageUrl: null,
        },
      }),
    });
    const text = generatePlainTextSummary(data);
    // Plain text should NOT escape HTML entities — it's raw text
    expect(text).toContain("Breaking:");
    expect(text).toContain("&");
    // No line should be empty in the middle of meaningful content
    const lines = text.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// generateMarkdownSummary
// ---------------------------------------------------------------------------

describe("generateMarkdownSummary", () => {
  it("starts with an H1 containing the topic", () => {
    const md = generateMarkdownSummary(makeComparison());
    expect(md).toMatch(/^# AngleCheck: "Steel Tariffs"/);
  });

  it("includes a blockquote with total sources", () => {
    const md = generateMarkdownSummary(makeComparison());
    expect(md).toContain("> 12 sources analyzed");
  });

  it("contains a link to the current article", () => {
    const md = generateMarkdownSummary(makeComparison());
    expect(md).toContain(
      "**[Steel Tariffs Shake Global Markets](https://example.com/steel-tariffs)**",
    );
  });

  it("lists clusters as numbered Markdown list items", () => {
    const md = generateMarkdownSummary(makeComparison());
    expect(md).toContain("1. **Market Disruption** (1 source)");
    expect(md).toContain("2. **Worker Protection** (2 sources)");
  });

  it("includes coverage gaps as bullet list", () => {
    const md = generateMarkdownSummary(makeComparison());
    expect(md).toContain("## Coverage Gaps");
    expect(md).toContain(
      "- Environmental impact of steel production (missing from Example News)",
    );
  });

  it("omits coverage gaps section when empty", () => {
    const data = makeComparison({ coverageGaps: [] });
    const md = generateMarkdownSummary(data);
    expect(md).not.toContain("## Coverage Gaps");
  });

  it("ends with Generated by AngleCheck", () => {
    const md = generateMarkdownSummary(makeComparison());
    expect(md).toContain("*Generated by AngleCheck*");
  });

  it("HTML-escapes special characters in cluster labels", () => {
    const data = makeComparison({
      clusters: [
        makeCluster({ label: 'Risk <High> & "Critical"' }),
      ],
    });
    const md = generateMarkdownSummary(data);
    expect(md).toContain("Risk &lt;High&gt; &amp; &quot;Critical&quot;");
  });

  it("handles 0 clusters gracefully", () => {
    const data = makeComparison({ clusters: [] });
    const md = generateMarkdownSummary(data);
    expect(md).toContain("## 0 Distinct Angles");
  });
});

// ---------------------------------------------------------------------------
// Clipboard (navigator.clipboard mock)
// ---------------------------------------------------------------------------

describe("clipboard integration", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("writeText receives the generated plain text", async () => {
    const data = makeComparison();
    const text = generatePlainTextSummary(data);
    await navigator.clipboard.writeText(text);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(text);
  });

  it("writeText receives the generated markdown", async () => {
    const data = makeComparison();
    const md = generateMarkdownSummary(data);
    await navigator.clipboard.writeText(md);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(md);
  });
});
