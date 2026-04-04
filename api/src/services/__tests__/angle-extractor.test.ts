import { describe, it, expect } from "vitest";
import { calculateSentiment } from "../angle-extractor.js";

// ---------------------------------------------------------------------------
// Positive text
// ---------------------------------------------------------------------------

describe("calculateSentiment - positive text", () => {
  it("scores clearly positive text with positive > negative", () => {
    const result = calculateSentiment(
      "The economy shows excellent growth and strong progress. Investors celebrate a great victory."
    );
    expect(result.positive).toBeGreaterThan(result.negative);
    expect(result.compound).toBeGreaterThan(0);
  });

  it("returns positive compound for uplifting news", () => {
    const result = calculateSentiment(
      "Workers praised the successful reform that will benefit thousands of families and improve their quality of life."
    );
    expect(result.compound).toBeGreaterThan(0);
  });

  it("scores single positive word", () => {
    const result = calculateSentiment("excellent");
    expect(result.positive).toBeGreaterThan(0);
    expect(result.compound).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Negative text
// ---------------------------------------------------------------------------

describe("calculateSentiment - negative text", () => {
  it("scores clearly negative text with negative > positive", () => {
    const result = calculateSentiment(
      "The crisis threatens to destroy the economy. Markets fear a catastrophic collapse and devastating losses."
    );
    expect(result.negative).toBeGreaterThan(result.positive);
    expect(result.compound).toBeLessThan(0);
  });

  it("returns negative compound for alarming news", () => {
    const result = calculateSentiment(
      "Violence erupted as protesters condemned the corrupt regime. Victims suffered terrible injuries in the attack."
    );
    expect(result.compound).toBeLessThan(0);
  });

  it("scores single negative word", () => {
    const result = calculateSentiment("terrible");
    expect(result.negative).toBeGreaterThan(0);
    expect(result.compound).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// Neutral text
// ---------------------------------------------------------------------------

describe("calculateSentiment - neutral text", () => {
  it("scores neutral text with low positive and negative", () => {
    const result = calculateSentiment(
      "The committee met on Tuesday to discuss the proposed amendments to the existing legislation."
    );
    expect(result.neutral).toBeGreaterThan(result.positive);
    expect(result.neutral).toBeGreaterThan(result.negative);
  });

  it("returns compound near zero for factual reporting", () => {
    const result = calculateSentiment(
      "The Senate voted 52-48 on the bill. The House will consider it next week."
    );
    expect(Math.abs(result.compound)).toBeLessThan(0.3);
  });

  it("returns all zeros for empty text", () => {
    const result = calculateSentiment("");
    expect(result.positive).toBe(0);
    expect(result.negative).toBe(0);
    expect(result.neutral).toBe(1);
    expect(result.compound).toBe(0);
  });

  it("handles whitespace-only text", () => {
    const result = calculateSentiment("   ");
    expect(result.compound).toBe(0);
    expect(result.neutral).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Mixed sentiment
// ---------------------------------------------------------------------------

describe("calculateSentiment - mixed sentiment", () => {
  it("reflects both positive and negative signals", () => {
    const result = calculateSentiment(
      "While the growth is excellent and markets thrive, experts warn of dangerous instability and fear a crisis ahead."
    );
    expect(result.positive).toBeGreaterThan(0);
    expect(result.negative).toBeGreaterThan(0);
  });

  it("balances opposing sentiments", () => {
    const resultPositive = calculateSentiment(
      "The recovery is strong and growth is excellent."
    );
    const resultNegative = calculateSentiment(
      "The crisis is terrible and decline is catastrophic."
    );
    const resultMixed = calculateSentiment(
      "The recovery is strong but the crisis remains terrible."
    );

    // Mixed text should have compound between the extremes
    expect(resultMixed.compound).toBeLessThan(resultPositive.compound);
    expect(resultMixed.compound).toBeGreaterThan(resultNegative.compound);
  });
});

// ---------------------------------------------------------------------------
// Negation handling
// ---------------------------------------------------------------------------

describe("calculateSentiment - negation", () => {
  it("flips positive word to negative with 'not'", () => {
    const positive = calculateSentiment("This is good progress.");
    const negated = calculateSentiment("This is not good progress.");

    expect(negated.compound).toBeLessThan(positive.compound);
  });

  it("flips negative word to positive with 'not'", () => {
    const negative = calculateSentiment("This is a terrible failure.");
    const negated = calculateSentiment("This is not a terrible failure.");

    expect(negated.compound).toBeGreaterThan(negative.compound);
  });

  it("handles contraction negators", () => {
    const positive = calculateSentiment("The outcome is good.");
    const negated = calculateSentiment("The outcome isn't good.");

    expect(negated.compound).toBeLessThan(positive.compound);
  });

  it("handles 'never' as negation", () => {
    const base = calculateSentiment("The project was a success.");
    const negated = calculateSentiment("The project was never a success.");

    expect(negated.compound).toBeLessThan(base.compound);
  });
});

// ---------------------------------------------------------------------------
// Intensifier handling
// ---------------------------------------------------------------------------

describe("calculateSentiment - intensifiers", () => {
  it("intensified positive should be more positive than plain positive", () => {
    const plain = calculateSentiment("The results are good.");
    const intensified = calculateSentiment("The results are very good.");

    expect(intensified.compound).toBeGreaterThan(plain.compound);
  });

  it("intensified negative should be more negative than plain negative", () => {
    const plain = calculateSentiment("The situation is bad.");
    const intensified = calculateSentiment("The situation is extremely bad.");

    expect(intensified.compound).toBeLessThan(plain.compound);
  });

  it("strongly intensified text should have higher magnitude", () => {
    const mild = calculateSentiment("The reform is good.");
    const strong = calculateSentiment("The reform is remarkably good.");

    expect(Math.abs(strong.compound)).toBeGreaterThanOrEqual(
      Math.abs(mild.compound)
    );
  });
});

// ---------------------------------------------------------------------------
// Score structure
// ---------------------------------------------------------------------------

describe("calculateSentiment - score structure", () => {
  it("positive + negative + neutral should approximately sum to 1", () => {
    const result = calculateSentiment(
      "The market showed strong growth despite some concerns about trade policy."
    );
    const sum = result.positive + result.negative + result.neutral;
    expect(sum).toBeCloseTo(1.0, 1);
  });

  it("compound is between -1 and 1", () => {
    const results = [
      calculateSentiment("Everything is wonderful and amazing and perfect."),
      calculateSentiment("Everything is terrible and horrible and awful."),
      calculateSentiment("The committee met on Tuesday."),
    ];

    for (const result of results) {
      expect(result.compound).toBeGreaterThanOrEqual(-1);
      expect(result.compound).toBeLessThanOrEqual(1);
    }
  });

  it("all scores are non-negative", () => {
    const result = calculateSentiment("A mixed bag of good and bad news.");
    expect(result.positive).toBeGreaterThanOrEqual(0);
    expect(result.negative).toBeGreaterThanOrEqual(0);
    expect(result.neutral).toBeGreaterThanOrEqual(0);
  });
});
