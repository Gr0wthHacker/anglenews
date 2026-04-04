import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Shared mock for the rss-parser parseURL method ─────────────────────────
const mockParseURL = vi.fn();

vi.mock("rss-parser", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      parseURL: mockParseURL,
    })),
  };
});

// ─── Mock config ────────────────────────────────────────────────────────────
vi.mock("../../lib/config.js", () => ({
  config: {
    newsDataApiKey: "",
    theNewsApiKey: "",
  },
}));

import { fetchRelatedArticles, type RawArticle } from "../news-fetcher.js";
import { config } from "../../lib/config.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeGDELTResponse(articles: Array<{ title: string; url: string; domain: string }>) {
  return {
    ok: true,
    json: async () => ({
      articles: articles.map((a) => ({
        title: a.title,
        url: a.url,
        seendate: "20260401T120000Z",
        socialimage: "https://example.com/img.jpg",
        domain: a.domain,
        sourcecountry: "US",
      })),
    }),
  };
}

function makeNewsDataResponse(
  results: Array<{ title: string; link: string; source_id: string }>
) {
  return {
    ok: true,
    json: async () => ({
      status: "success",
      totalResults: results.length,
      results: results.map((r) => ({
        title: r.title,
        description: "A description",
        content: "Some content",
        link: r.link,
        source_id: r.source_id,
        source_name: r.source_id,
        pubDate: "2026-04-01",
        image_url: null,
      })),
    }),
  };
}

function makeTheNewsAPIResponse(
  data: Array<{ title: string; url: string; source: string }>
) {
  return {
    ok: true,
    json: async () => ({
      data: data.map((d) => ({
        title: d.title,
        description: "Desc",
        snippet: "Snippet",
        url: d.url,
        source: d.source,
        published_at: "2026-04-01T10:00:00Z",
        image_url: null,
      })),
    }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("news-fetcher", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockParseURL.mockReset();
    mockParseURL.mockResolvedValue({ items: [] });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ── fetchFromGDELT via fetchRelatedArticles ─────────────────────────────

  describe("fetchFromGDELT (via orchestrator)", () => {
    it("returns articles from GDELT when fetch succeeds", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("gdeltproject.org")) {
          return Promise.resolve(
            makeGDELTResponse([
              {
                title: "GDELT Article One",
                url: "https://reuters.com/article-1",
                domain: "reuters.com",
              },
            ])
          );
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: "success", results: [], data: [] }),
        });
      });

      const results = await fetchRelatedArticles("trade tariffs", []);

      expect(results.length).toBeGreaterThanOrEqual(1);
      const gdeltArticle = results.find((a) => a.apiSource === "gdelt");
      expect(gdeltArticle).toBeDefined();
      expect(gdeltArticle!.title).toBe("GDELT Article One");
      expect(gdeltArticle!.domain).toBe("reuters.com");
    });

    it("handles GDELT returning no articles", async () => {
      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ articles: [], status: "success", results: [], data: [] }),
        })
      );

      const results = await fetchRelatedArticles("obscure topic xyz", []);
      expect(results).toEqual([]);
    });

    it("formats GDELT seendate to YYYY-MM-DD", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("gdeltproject.org")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              articles: [
                {
                  title: "Date Test Article",
                  url: "https://example.com/date-test",
                  seendate: "20260315T143022Z",
                  socialimage: "",
                  domain: "example.com",
                  sourcecountry: "US",
                },
              ],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: "success", results: [], data: [] }),
        });
      });

      const results = await fetchRelatedArticles("date test", []);
      const article = results.find((a) => a.apiSource === "gdelt");
      expect(article).toBeDefined();
      expect(article!.publishedAt).toBe("2026-03-15");
    });
  });

  // ── fetchFromGoogleNewsRSS ──────────────────────────────────────────────

  describe("fetchFromGoogleNewsRSS (via orchestrator)", () => {
    it("returns articles from Google News RSS", async () => {
      mockParseURL.mockResolvedValue({
        items: [
          {
            title: "Google RSS Article - CNN",
            link: "https://cnn.com/article-rss",
            contentSnippet: "A snippet from RSS",
            content: "<p>Content</p>",
            creator: "CNN",
            isoDate: "2026-04-01T08:00:00Z",
          },
          {
            title: "Another RSS Article - BBC",
            link: "https://bbc.com/article-rss",
            contentSnippet: "BBC snippet",
            content: null,
            creator: null,
            isoDate: "2026-04-01T09:00:00Z",
          },
        ],
      });

      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ articles: [], status: "success", results: [], data: [] }),
        })
      );

      const results = await fetchRelatedArticles("global markets", []);

      const rssArticles = results.filter((a) => a.apiSource === "googlenews");
      expect(rssArticles.length).toBe(2);
      expect(rssArticles[0].source).toBe("CNN");
      expect(rssArticles[1].domain).toBe("bbc.com");
    });

    it("extracts source name from Google News title format", async () => {
      mockParseURL.mockResolvedValue({
        items: [
          {
            title: "Big Story Happens - The Wall Street Journal",
            link: "https://wsj.com/story",
            contentSnippet: "snippet",
            isoDate: "2026-04-01T08:00:00Z",
          },
        ],
      });

      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ articles: [], status: "success", results: [], data: [] }),
        })
      );

      const results = await fetchRelatedArticles("news story", []);
      const rssArticle = results.find((a) => a.apiSource === "googlenews");
      expect(rssArticle).toBeDefined();
      // creator is undefined so it falls back to extractSourceFromGoogleTitle
      expect(rssArticle!.source).toBe("The Wall Street Journal");
    });

    it("filters out RSS items without link or title", async () => {
      mockParseURL.mockResolvedValue({
        items: [
          { title: null, link: "https://example.com/no-title", isoDate: "2026-04-01T08:00:00Z" },
          { title: "No Link Article", link: null, isoDate: "2026-04-01T08:00:00Z" },
          {
            title: "Valid Article",
            link: "https://example.com/valid",
            isoDate: "2026-04-01T08:00:00Z",
          },
        ],
      });

      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ articles: [], status: "success", results: [], data: [] }),
        })
      );

      const results = await fetchRelatedArticles("filter rss", []);
      const rssArticles = results.filter((a) => a.apiSource === "googlenews");
      expect(rssArticles.length).toBe(1);
      expect(rssArticles[0].title).toBe("Valid Article");
    });
  });

  // ── Failed sources don't break everything ───────────────────────────────

  describe("resilience with Promise.allSettled", () => {
    it("returns results from successful sources even when others fail", async () => {
      mockParseURL.mockRejectedValue(new Error("RSS timeout"));

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("gdeltproject.org")) {
          return Promise.resolve(
            makeGDELTResponse([
              {
                title: "Surviving Article",
                url: "https://example.com/survive",
                domain: "example.com",
              },
            ])
          );
        }
        if (typeof url === "string" && url.includes("newsdata.io")) {
          return Promise.reject(new Error("NewsData down"));
        }
        if (typeof url === "string" && url.includes("thenewsapi.com")) {
          return Promise.reject(new Error("TheNewsAPI down"));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: "success", results: [], data: [] }),
        });
      });

      const results = await fetchRelatedArticles("resilience test", []);

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].title).toBe("Surviving Article");
    });

    it("returns empty array when all sources fail", async () => {
      mockParseURL.mockRejectedValue(new Error("RSS down"));

      globalThis.fetch = vi.fn().mockRejectedValue(new Error("All APIs down"));

      const results = await fetchRelatedArticles("failing topic", []);
      expect(results).toEqual([]);
    });

    it("logs warnings for failed sources", async () => {
      mockParseURL.mockRejectedValue(new Error("RSS timeout"));

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("gdeltproject.org")) {
          return Promise.reject(new Error("GDELT network error"));
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: "success", results: [], data: [] }),
        });
      });

      await fetchRelatedArticles("log test", []);

      expect(console.warn).toHaveBeenCalled();
    });
  });

  // ── Empty results handling ──────────────────────────────────────────────

  describe("empty results handling", () => {
    it("returns empty array when all sources return empty", async () => {
      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            articles: [],
            status: "success",
            results: [],
            data: [],
          }),
        })
      );

      const results = await fetchRelatedArticles("nothing here", []);
      expect(results).toEqual([]);
    });

    it("filters out articles with empty titles", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("gdeltproject.org")) {
          return Promise.resolve(
            makeGDELTResponse([
              { title: "", url: "https://example.com/empty-title", domain: "example.com" },
              { title: "   ", url: "https://example.com/blank-title", domain: "example.com" },
              { title: "Valid Title", url: "https://example.com/valid", domain: "example.com" },
            ])
          );
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: "success", results: [], data: [] }),
        });
      });

      const results = await fetchRelatedArticles("filter test", []);
      expect(results.length).toBe(1);
      expect(results[0].title).toBe("Valid Title");
    });

    it("handles null articles array from GDELT", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("gdeltproject.org")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ articles: null }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: "success", results: [], data: [] }),
        });
      });

      const results = await fetchRelatedArticles("null articles", []);
      expect(results).toEqual([]);
    });
  });

  // ── URL dedup ───────────────────────────────────────────────────────────

  describe("URL deduplication", () => {
    it("removes duplicate URLs across sources", async () => {
      mockParseURL.mockResolvedValue({
        items: [
          {
            title: "Same Article From RSS",
            link: "https://reuters.com/article-dup",
            contentSnippet: "Snippet",
            content: "Content",
            isoDate: "2026-04-01T08:00:00Z",
          },
        ],
      });

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("gdeltproject.org")) {
          return Promise.resolve(
            makeGDELTResponse([
              {
                title: "Same Article From GDELT",
                url: "https://reuters.com/article-dup",
                domain: "reuters.com",
              },
            ])
          );
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: "success", results: [], data: [] }),
        });
      });

      const results = await fetchRelatedArticles("dedup test", []);

      const reutersArticles = results.filter((a) =>
        a.url.includes("reuters.com/article-dup")
      );
      expect(reutersArticles.length).toBe(1);
    });

    it("treats http and https versions of same URL as duplicates", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("gdeltproject.org")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              articles: [
                {
                  title: "HTTP Version",
                  url: "http://example.com/article",
                  seendate: "20260401T120000Z",
                  socialimage: "",
                  domain: "example.com",
                  sourcecountry: "US",
                },
                {
                  title: "HTTPS Version",
                  url: "https://example.com/article",
                  seendate: "20260401T120000Z",
                  socialimage: "",
                  domain: "example.com",
                  sourcecountry: "US",
                },
              ],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: "success", results: [], data: [] }),
        });
      });

      const results = await fetchRelatedArticles("http dedup", []);
      expect(results.length).toBe(1);
    });

    it("normalizes trailing slashes for dedup", async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("gdeltproject.org")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              articles: [
                {
                  title: "With Slash",
                  url: "https://example.com/article/",
                  seendate: "20260401T120000Z",
                  socialimage: "",
                  domain: "example.com",
                  sourcecountry: "US",
                },
                {
                  title: "Without Slash",
                  url: "https://example.com/article",
                  seendate: "20260401T120000Z",
                  socialimage: "",
                  domain: "example.com",
                  sourcecountry: "US",
                },
              ],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: "success", results: [], data: [] }),
        });
      });

      const results = await fetchRelatedArticles("slash dedup", []);
      expect(results.length).toBe(1);
    });
  });

  // ── Missing API keys ───────────────────────────────────────────────────

  describe("missing API keys", () => {
    it("gracefully skips NewsData and TheNewsAPI when keys are empty", async () => {
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("gdeltproject.org")) {
          return Promise.resolve(
            makeGDELTResponse([
              {
                title: "GDELT Only",
                url: "https://gdelt-only.com/article",
                domain: "gdelt-only.com",
              },
            ])
          );
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: "success", results: [], data: [] }),
        });
      });
      globalThis.fetch = fetchSpy;

      const results = await fetchRelatedArticles("api key test", []);

      // Should NOT have called newsdata.io or thenewsapi.com since keys are empty
      const calledUrls = fetchSpy.mock.calls.map((c) => String(c[0]));
      expect(calledUrls.some((u) => u.includes("newsdata.io"))).toBe(false);
      expect(calledUrls.some((u) => u.includes("thenewsapi.com"))).toBe(false);

      // But should still return GDELT results
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── fetchRelatedArticles combines sources ───────────────────────────────

  describe("fetchRelatedArticles combines sources", () => {
    it("combines articles from multiple sources", async () => {
      // Set API keys so all sources are tried
      (config as any).newsDataApiKey = "test-newsdata-key";
      (config as any).theNewsApiKey = "test-thenewsapi-key";

      mockParseURL.mockResolvedValue({
        items: [
          {
            title: "RSS Article - Source",
            link: "https://rss-source.com/article",
            contentSnippet: "RSS content",
            isoDate: "2026-04-01T08:00:00Z",
          },
        ],
      });

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === "string" && url.includes("gdeltproject.org")) {
          return Promise.resolve(
            makeGDELTResponse([
              {
                title: "GDELT Article",
                url: "https://gdelt-source.com/article",
                domain: "gdelt-source.com",
              },
            ])
          );
        }
        if (typeof url === "string" && url.includes("newsdata.io")) {
          return Promise.resolve(
            makeNewsDataResponse([
              {
                title: "NewsData Article",
                link: "https://newsdata-source.com/article",
                source_id: "newsdata-source",
              },
            ])
          );
        }
        if (typeof url === "string" && url.includes("thenewsapi.com")) {
          return Promise.resolve(
            makeTheNewsAPIResponse([
              {
                title: "TheNewsAPI Article",
                url: "https://thenewsapi-source.com/article",
                source: "TheNewsAPI Source",
              },
            ])
          );
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: "success", results: [], data: [] }),
        });
      });

      const results = await fetchRelatedArticles("multi-source test", ["entity1", "entity2"]);

      const apiSources = new Set(results.map((r) => r.apiSource));
      expect(apiSources.has("gdelt")).toBe(true);
      expect(apiSources.has("newsdata")).toBe(true);
      expect(apiSources.has("thenewsapi")).toBe(true);
      expect(apiSources.has("googlenews")).toBe(true);
      expect(results.length).toBe(4);

      // Cleanup
      (config as any).newsDataApiKey = "";
      (config as any).theNewsApiKey = "";
    });
  });
});
