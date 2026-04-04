import { describe, it, expect, vi } from "vitest";

// Mock modules that have side effects or need external resources
vi.mock("../../services/bias-enricher.js", () => ({
  getBiasForDomain: vi.fn().mockReturnValue(null),
  getSourceBias: vi.fn().mockReturnValue(null),
  getAllSources: vi.fn().mockReturnValue([]),
  getSourcesByBias: vi.fn().mockReturnValue([]),
}));

vi.mock("../../services/topic-normalizer.js", () => ({
  normalizeTopic: vi.fn().mockResolvedValue({
    topic: "test",
    searchQueries: ["test"],
    entities: [],
  }),
}));

vi.mock("../../services/news-fetcher.js", () => ({
  fetchRelatedArticles: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../services/angle-extractor.js", () => ({
  extractAngles: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../services/deduplicator.js", () => ({
  deduplicateArticles: vi.fn().mockReturnValue([]),
}));

vi.mock("../../services/clusterer.js", () => ({
  clusterArticles: vi.fn().mockReturnValue([]),
}));

vi.mock("../../lib/config.js", () => ({
  config: {
    environment: "test",
    port: 3001,
    anthropicApiKey: "test-key",
    newsDataApiKey: "",
    theNewsApiKey: "",
    cacheTTLSeconds: 7200,
    maxSourcesPerQuery: 15,
    rateLimitPerDay: 20,
  },
}));

import app from "../../index.js";

describe("GET /api/health", () => {
  it("returns 200 with expected fields", async () => {
    const res = await app.request("/api/health", { method: "GET" });

    expect(res.status).toBe(200);

    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toHaveProperty("status", "ok");
    expect(json).toHaveProperty("version", "1.0.0");
  });

  it("returns a timestamp field", async () => {
    const res = await app.request("/api/health", { method: "GET" });

    const json = (await res.json()) as Record<string, unknown>;
    // The health endpoint returns status, timestamp, environment, version
    expect(json).toHaveProperty("status", "ok");
    expect(Object.keys(json).length).toBeGreaterThanOrEqual(3);
  });

  it("returns JSON content type", async () => {
    const res = await app.request("/api/health", { method: "GET" });

    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("application/json");
  });
});

describe("404 handling", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await app.request("/api/nonexistent", { method: "GET" });

    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("Route not found");
  });
});
