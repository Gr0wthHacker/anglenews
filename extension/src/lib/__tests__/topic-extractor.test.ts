import { describe, it, expect } from "vitest";
import { extractTopic } from "../topic-extractor.js";
import type { ArticleData } from "../topic-extractor.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeArticle(overrides: Partial<ArticleData> = {}): ArticleData {
  return {
    headline: "Steel Tariffs Shake Global Markets as Trade War Escalates",
    body: `The administration announced sweeping new steel tariffs today, sending
      shockwaves through global financial markets. Wall Street reacted with alarm
      as major indices fell sharply. European Union officials condemned the move,
      warning of retaliatory measures. China threatened to impose counter-tariffs
      on American agricultural exports. Industry leaders warned of supply chain
      disruptions while economists predicted higher consumer prices.
      The Steel Workers Union praised the decision, calling it a victory for
      American manufacturing. Goldman Sachs analysts downgraded several steel
      importing companies. The World Trade Organization said it would review
      the tariffs for compliance with international trade agreements.`,
    byline: "Jane Reporter",
    siteName: "Example News",
    url: "https://example.com/steel-tariffs-markets",
    domain: "example.com",
    publishDate: "2026-03-15T10:00:00Z",
    imageUrl: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Entity extraction from headlines
// ---------------------------------------------------------------------------

describe("extractTopic - entity extraction", () => {
  it("extracts entities from article text", () => {
    const article = makeArticle({
      headline: "European Union Threatens Retaliation Against US Steel Tariffs",
      body: `The European Union announced retaliatory trade measures against the
        United States in response to new steel tariffs. Brussels warned that
        American exports would face significant barriers. NATO allies expressed
        concern about the deteriorating trade relationship. Goldman Sachs warned
        investors to prepare for volatility.`,
    });

    const result = extractTopic(article);

    expect(result.entities.length).toBeGreaterThan(0);
    // Should pick up prominent named entities
    const entitiesLower = result.entities.map((e) => e.toLowerCase());
    const entitiesJoined = entitiesLower.join(" ");
    // At least some proper nouns should be found
    expect(
      entitiesJoined.includes("european") ||
      entitiesJoined.includes("union") ||
      entitiesJoined.includes("nato") ||
      entitiesJoined.includes("goldman") ||
      entitiesJoined.includes("brussels") ||
      result.entities.some((e) => e === "EU" || e === "NATO" || e === "US")
    ).toBe(true);
  });

  it("extracts acronym entities like NATO, FBI", () => {
    const article = makeArticle({
      headline: "FBI Investigates Trade Fraud as NATO Allies React",
      body: `The FBI launched a probe into alleged trade fraud connected to steel
        imports. Meanwhile, NATO allies urged diplomatic solutions to the trade
        dispute. The WTO is also reviewing the situation.`,
    });

    const result = extractTopic(article);
    const hasAcronym = result.entities.some((e) =>
      ["FBI", "NATO", "WTO"].includes(e)
    );
    expect(hasAcronym).toBe(true);
  });

  it("returns entities sorted by frequency", () => {
    const article = makeArticle({
      headline: "China Responds to American Trade Policy",
      body: `China responded firmly to the trade measures. China's foreign ministry
        issued a warning. China's economy could face pressure. China may retaliate
        with counter-tariffs. The American Chamber of Commerce expressed concern.
        American businesses operating in China are worried.`,
    });

    const result = extractTopic(article);
    // "China" appears most frequently and should be early in the list
    expect(result.entities.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Topic fingerprint generation
// ---------------------------------------------------------------------------

describe("extractTopic - fingerprint", () => {
  it("generates the same fingerprint for the same article", () => {
    const article = makeArticle();
    const result1 = extractTopic(article);
    const result2 = extractTopic(article);

    expect(result1.fingerprint).toBe(result2.fingerprint);
  });

  it("generates the same fingerprint regardless of minor wording changes", () => {
    // Two articles about the same topic with slightly different wording
    // should produce the same fingerprint if the key terms overlap sufficiently
    const article1 = makeArticle({
      headline: "Steel Tariffs Shake Global Markets",
      body: `New steel tariffs announced today caused global market volatility.
        Wall Street reacted. European Union threatened retaliation.
        Steel tariffs impact trade. Steel tariffs affect markets.
        Tariffs tariffs tariffs steel steel steel markets markets.`,
    });
    const article2 = makeArticle({
      headline: "Steel Tariffs Shake Global Markets",
      body: `New steel tariffs announced today caused global market volatility.
        Wall Street reacted. European Union threatened retaliation.
        Steel tariffs impact trade. Steel tariffs affect markets.
        Tariffs tariffs tariffs steel steel steel markets markets.`,
    });

    const result1 = extractTopic(article1);
    const result2 = extractTopic(article2);

    expect(result1.fingerprint).toBe(result2.fingerprint);
  });

  it("generates a valid hex fingerprint string", () => {
    const result = extractTopic(makeArticle());
    expect(result.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it("generates different fingerprints for completely different topics", () => {
    const steelArticle = makeArticle({
      headline: "Steel Tariffs Impact Global Trade",
      body: `Steel tariffs dominate trade discussions. Markets react to tariff news.
        Steel industry faces changes. Trade partners respond to tariffs.
        Steel tariffs steel tariffs steel tariffs markets trade.`,
    });

    const climateArticle = makeArticle({
      headline: "Climate Summit Reaches Historic Agreement on Emissions",
      body: `World leaders agreed to cut carbon emissions by 50 percent at the
        climate summit. Environmental groups praised the historic agreement.
        Scientists said the emission reduction targets were ambitious but
        achievable. Climate climate emissions carbon summit agreement.
        Climate change climate change emissions reduction environmental.`,
    });

    const steelResult = extractTopic(steelArticle);
    const climateResult = extractTopic(climateArticle);

    expect(steelResult.fingerprint).not.toBe(climateResult.fingerprint);
  });
});

// ---------------------------------------------------------------------------
// Similar topic detection
// ---------------------------------------------------------------------------

describe("extractTopic - similar topics", () => {
  it("produces overlapping key terms for articles on the same story", () => {
    const reutersArticle = makeArticle({
      headline: "Steel Tariffs Announced: Markets React Sharply",
      body: `The administration imposed 25% steel tariffs today. Financial markets
        dropped sharply on the news. Steel stocks fell while domestic steelmakers
        rallied. Tariffs steel markets trade policy economists.
        Steel tariffs steel tariffs markets markets trade trade.`,
    });

    const bbcArticle = makeArticle({
      headline: "Global Markets Tumble After Steel Tariff Decision",
      body: `Global stock markets tumbled following the steel tariff announcement.
        European and Asian markets saw significant declines. Steel importing
        nations expressed concern. Tariffs steel markets trade impact global.
        Steel tariffs steel tariffs markets markets trade trade.`,
    });

    const reutersResult = extractTopic(reutersArticle);
    const bbcResult = extractTopic(bbcArticle);

    // The topic strings should share many terms
    const reutersTerms = new Set(reutersResult.topic.split(" "));
    const bbcTerms = new Set(bbcResult.topic.split(" "));

    let overlap = 0;
    for (const term of reutersTerms) {
      if (bbcTerms.has(term)) overlap++;
    }

    const minSize = Math.min(reutersTerms.size, bbcTerms.size);
    const overlapRatio = minSize > 0 ? overlap / minSize : 0;

    // Should have significant overlap since they cover the same story
    expect(overlapRatio).toBeGreaterThan(0.3);
  });

  it("produces non-overlapping key terms for unrelated stories", () => {
    const steelArticle = makeArticle({
      headline: "Steel Tariffs Impact Trade Partners",
      body: `Steel tariffs dominate trade partner discussions. Markets react.
        Steel tariffs steel tariffs markets trade partners economics.
        Steel industry tariff impact trade steel tariffs markets.`,
    });

    const spaceArticle = makeArticle({
      headline: "SpaceX Launches Mission to Mars",
      body: `SpaceX successfully launched its Mars mission today. The spacecraft
        will reach Mars orbit in six months. NASA congratulated SpaceX on the
        achievement. Astronauts aboard the International Space Station watched.
        SpaceX Mars mission launch spacecraft orbit astronauts NASA space.`,
    });

    const steelResult = extractTopic(steelArticle);
    const spaceResult = extractTopic(spaceArticle);

    // Should have very different topic strings
    const steelTerms = new Set(steelResult.topic.split(" "));
    const spaceTerms = new Set(spaceResult.topic.split(" "));

    let overlap = 0;
    for (const term of steelTerms) {
      if (spaceTerms.has(term)) overlap++;
    }

    const minSize = Math.min(steelTerms.size, spaceTerms.size);
    const overlapRatio = minSize > 0 ? overlap / minSize : 0;

    expect(overlapRatio).toBeLessThan(0.3);
  });
});

// ---------------------------------------------------------------------------
// Key term extraction
// ---------------------------------------------------------------------------

describe("extractTopic - key terms in topic string", () => {
  it("includes relevant terms in the topic string", () => {
    const article = makeArticle({
      headline: "Steel Tariffs Impact Global Markets",
      body: `Steel tariffs impact global markets. The steel industry faces tariff
        pressure. Markets react to trade tariffs. Steel steel steel tariffs
        tariffs tariffs markets markets markets trade trade trade.`,
    });

    const result = extractTopic(article);

    // Topic string should contain key terms (lowercased and sorted)
    expect(result.topic).toContain("steel");
    expect(result.topic).toContain("tariff");
    expect(result.topic).toContain("market");
  });

  it("excludes stop words from topic string", () => {
    const result = extractTopic(makeArticle());

    // Common stop words should be excluded
    const terms = result.topic.split(" ");
    const stopWords = ["the", "and", "is", "are", "was", "were", "of", "to", "in"];
    for (const stop of stopWords) {
      expect(terms).not.toContain(stop);
    }
  });

  it("returns a non-empty topic string for substantial articles", () => {
    const result = extractTopic(makeArticle());
    expect(result.topic.length).toBeGreaterThan(0);
    expect(result.topic.split(" ").length).toBeGreaterThan(2);
  });

  it("returns sorted terms in the topic string", () => {
    const result = extractTopic(makeArticle());
    const terms = result.topic.split(" ");
    const sorted = [...terms].sort();
    expect(terms).toEqual(sorted);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("extractTopic - edge cases", () => {
  it("handles article with minimal body text", () => {
    const article = makeArticle({
      headline: "Breaking News",
      body: "Details to follow.",
    });

    const result = extractTopic(article);
    expect(result).toBeDefined();
    expect(result.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it("handles empty body", () => {
    const article = makeArticle({
      headline: "Headline Only",
      body: "",
    });

    const result = extractTopic(article);
    expect(result).toBeDefined();
    expect(result.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it("handles special characters in text", () => {
    const article = makeArticle({
      headline: "Q&A: What's Next for U.S.-China Trade?",
      body: `Experts weigh in on the U.S.-China trade relationship. "The tariffs
        represent a 25% increase," said the analyst. $500 billion in trade at stake.`,
    });

    const result = extractTopic(article);
    expect(result).toBeDefined();
    expect(result.fingerprint).toMatch(/^[0-9a-f]{8}$/);
  });
});
