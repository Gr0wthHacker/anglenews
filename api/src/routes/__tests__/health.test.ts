import { describe, it, expect, vi } from "vitest";

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

    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.timestamp).toBeDefined();
    expect(typeof json.timestamp).toBe("string");
    expect(json.environment).toBe("test");
    expect(json.version).toBe("1.0.0");
  });

  it("returns valid ISO timestamp", async () => {
    const res = await app.request("/api/health", { method: "GET" });

    const json = await res.json();
    const date = new Date(json.timestamp);
    expect(date.getTime()).not.toBeNaN();
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
