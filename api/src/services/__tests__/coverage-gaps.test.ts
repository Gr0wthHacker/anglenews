import { describe, it, expect } from "vitest";
import { identifyCoverageGaps } from "../coverage-gaps.js";
import type { AnalyzedArticle } from "../../../../shared/types.js";

function article(opts: {
  domain: string;
  siteName?: string;
  headline?: string;
  body?: string;
  framing?: string;
  omissions?: string[];
}): AnalyzedArticle {
  return {
    article: {
      headline: opts.headline ?? "Steel tariffs announced",
      body: opts.body ?? "",
      byline: null,
      siteName: opts.siteName ?? null,
      url: `https://${opts.domain}/story`,
      domain: opts.domain,
      publishDate: null,
      imageUrl: null,
    },
    angle: {
      headline_framing: opts.framing ?? "",
      central_entity: "",
      causal_attribution: "",
      emotional_register: "neutral",
      solution_frame: "",
      key_omissions: opts.omissions ?? [],
      quote_sources: [],
      statistical_anchoring: "none",
      confidence: 0.8,
    },
    sentiment: { positive: 0, negative: 0, neutral: 1, compound: 0 },
    sourceBias: null,
  };
}

describe("identifyCoverageGaps", () => {
  it("reports the current article's omissions that other outlets raise", () => {
    const current = article({
      domain: "mine.com",
      siteName: "My Paper",
      omissions: ["Impact on factory workers", "Retaliation by trading partners"],
    });
    const others = [
      article({
        domain: "a.com",
        siteName: "Outlet A",
        body: "Union leaders warned factory workers would bear the impact.",
      }),
      article({
        domain: "b.com",
        siteName: "Outlet B",
        framing: "Frames the tariffs through the impact on workers at factories",
      }),
    ];

    const gaps = identifyCoverageGaps(current, others);

    expect(gaps).toEqual([
      {
        description: "Impact on factory workers",
        mentionedBy: ["Outlet A", "Outlet B"],
        missedBy: "My Paper",
      },
    ]);
  });

  it("ignores what other outlets omitted (regression: gaps were inverted)", () => {
    // Both other outlets list "worker impact" as something THEY leave out.
    // The old logic reported it as a point they raised and the reader's article missed.
    const current = article({
      domain: "mine.com",
      body: "Factory workers face layoffs and the impact on workers is severe.",
      omissions: [],
    });
    const others = [
      article({ domain: "a.com", omissions: ["Worker impact"] }),
      article({ domain: "b.com", omissions: ["Worker impact"] }),
    ];

    expect(identifyCoverageGaps(current, others)).toEqual([]);
  });

  it("does not count the reader's own outlet as another outlet", () => {
    const current = article({ domain: "mine.com", omissions: ["Consumer price increases"] });
    const sameOutlet = article({
      domain: "mine.com",
      body: "Consumer prices will see increases, economists said.",
    });

    expect(identifyCoverageGaps(current, [current, sameOutlet])).toEqual([]);
  });

  it("needs more than one shared common word to call a point raised", () => {
    const current = article({ domain: "mine.com", omissions: ["Impact on retirement savings"] });
    const other = article({ domain: "a.com", body: "The impact on steel prices was immediate." });

    expect(identifyCoverageGaps(current, [other])).toEqual([]);
  });

  it("orders gaps by how many outlets raised them and caps the list at five", () => {
    const omissions = [
      "alpha bravo",
      "charlie delta",
      "echo foxtrot",
      "golf hotel",
      "india juliet",
      "kilo lima",
    ];
    const current = article({ domain: "mine.com", omissions });
    const others = [
      article({ domain: "a.com", body: omissions.join(" ") }),
      article({ domain: "b.com", body: "kilo lima" }),
    ];

    const gaps = identifyCoverageGaps(current, others);

    expect(gaps).toHaveLength(5);
    expect(gaps[0].description).toBe("kilo lima");
    expect(gaps[0].mentionedBy).toEqual(["a.com", "b.com"]);
  });
});
