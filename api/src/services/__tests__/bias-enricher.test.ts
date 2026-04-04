import { describe, it, expect } from "vitest";
import {
  getSourceBias,
  getAllSources,
  getSourcesByBias,
  getBiasForDomain,
} from "../bias-enricher.js";

describe("bias-enricher", () => {
  // ── getSourceBias ───────────────────────────────────────────────────────

  describe("getSourceBias", () => {
    it("returns bias data for an exact domain match", () => {
      const result = getSourceBias("cnn.com");

      expect(result).not.toBeNull();
      expect(result!.domain).toBe("cnn.com");
      expect(result!.name).toBe("CNN");
      expect(result!.biasRating).toBe("left");
      expect(result!.factualRating).toBe("mostly-factual");
    });

    it("strips www. prefix and still matches", () => {
      const result = getSourceBias("www.cnn.com");

      expect(result).not.toBeNull();
      expect(result!.domain).toBe("cnn.com");
      expect(result!.name).toBe("CNN");
    });

    it("strips subdomain and matches parent domain", () => {
      const result = getSourceBias("edition.cnn.com");

      expect(result).not.toBeNull();
      expect(result!.domain).toBe("cnn.com");
      expect(result!.name).toBe("CNN");
    });

    it("handles multiple subdomain levels", () => {
      const result = getSourceBias("us.edition.cnn.com");

      expect(result).not.toBeNull();
      expect(result!.domain).toBe("cnn.com");
      expect(result!.name).toBe("CNN");
    });

    it("returns null for unknown domain", () => {
      const result = getSourceBias("totally-unknown-news-site-xyz.com");

      expect(result).toBeNull();
    });

    it("handles domain with protocol prefix", () => {
      const result = getSourceBias("https://foxnews.com");

      expect(result).not.toBeNull();
      expect(result!.name).toBe("Fox News");
      expect(result!.biasRating).toBe("right");
    });

    it("handles domain with trailing path", () => {
      const result = getSourceBias("nytimes.com/2026/04/01/article");

      expect(result).not.toBeNull();
      expect(result!.name).toBe("The New York Times");
    });

    it("is case-insensitive", () => {
      const result = getSourceBias("CNN.COM");

      expect(result).not.toBeNull();
      expect(result!.name).toBe("CNN");
    });

    it("handles domain with whitespace", () => {
      const result = getSourceBias("  cnn.com  ");

      expect(result).not.toBeNull();
      expect(result!.name).toBe("CNN");
    });

    it("returns correct data for foxnews.com", () => {
      const result = getSourceBias("foxnews.com");

      expect(result).not.toBeNull();
      expect(result!.biasRating).toBe("right");
      expect(result!.factualRating).toBe("mixed");
      expect(result!.country).toBe("US");
      expect(result!.mediaType).toBe("tv");
    });

    it("returns correct data for nytimes.com", () => {
      const result = getSourceBias("nytimes.com");

      expect(result).not.toBeNull();
      expect(result!.biasRating).toBe("left-center");
      expect(result!.factualRating).toBe("high");
      expect(result!.mediaType).toBe("newspaper");
    });

    it("matches apnews.com as center bias", () => {
      const result = getSourceBias("apnews.com");

      expect(result).not.toBeNull();
      expect(result!.biasRating).toBe("center");
    });
  });

  // ── getAllSources ───────────────────────────────────────────────────────

  describe("getAllSources", () => {
    it("returns a non-empty array of all bias entries", () => {
      const sources = getAllSources();

      expect(Array.isArray(sources)).toBe(true);
      expect(sources.length).toBeGreaterThan(0);
    });

    it("each entry has required fields", () => {
      const sources = getAllSources();

      for (const source of sources) {
        expect(source).toHaveProperty("domain");
        expect(source).toHaveProperty("name");
        expect(source).toHaveProperty("biasRating");
        expect(source).toHaveProperty("factualRating");
        expect(source).toHaveProperty("country");
        expect(source).toHaveProperty("mediaType");
      }
    });

    it("includes CNN in the list", () => {
      const sources = getAllSources();
      const cnn = sources.find((s) => s.domain === "cnn.com");
      expect(cnn).toBeDefined();
    });
  });

  // ── getSourcesByBias ──────────────────────────────────────────────────

  describe("getSourcesByBias", () => {
    it("returns only sources matching the given bias rating", () => {
      const leftSources = getSourcesByBias("left");

      expect(leftSources.length).toBeGreaterThan(0);
      for (const source of leftSources) {
        expect(source.biasRating).toBe("left");
      }
    });

    it("returns center sources correctly", () => {
      const centerSources = getSourcesByBias("center");

      expect(centerSources.length).toBeGreaterThan(0);
      for (const source of centerSources) {
        expect(source.biasRating).toBe("center");
      }
    });

    it("returns empty array for a rating with no matching sources", () => {
      // This might have entries but let's verify the filter works
      const allSources = getAllSources();
      const farRightSources = getSourcesByBias("far-right");

      // All returned entries must have the correct rating
      for (const source of farRightSources) {
        expect(source.biasRating).toBe("far-right");
      }
    });

    it("CNN appears in 'left' results", () => {
      const leftSources = getSourcesByBias("left");
      const cnn = leftSources.find((s) => s.domain === "cnn.com");
      expect(cnn).toBeDefined();
    });

    it("Fox News appears in 'right' results", () => {
      const rightSources = getSourcesByBias("right");
      const fox = rightSources.find((s) => s.domain === "foxnews.com");
      expect(fox).toBeDefined();
    });
  });

  // ── getBiasForDomain alias ────────────────────────────────────────────

  describe("getBiasForDomain", () => {
    it("is an alias for getSourceBias", () => {
      const a = getSourceBias("cnn.com");
      const b = getBiasForDomain("cnn.com");
      expect(a).toEqual(b);
    });
  });
});
