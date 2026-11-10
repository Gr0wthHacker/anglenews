import { describe, it, expect, vi, beforeEach } from "vitest";

const executeScript = vi.fn();
vi.stubGlobal("chrome", { scripting: { executeScript }, runtime: { id: "test" } });

import { extractArticleFromTab, EXTRACTOR_FILE } from "../extract-article";

const article = {
  headline: "Steel tariffs announced",
  body: "x".repeat(200),
  byline: null,
  siteName: "Example",
  url: "https://example.com/a",
  domain: "example.com",
  publishDate: null,
  imageUrl: null,
};

describe("extractArticleFromTab", () => {
  beforeEach(() => {
    executeScript.mockReset();
    delete (globalThis as Record<string, unknown>).__anglecheckExtractArticle;
  });

  it("injects the extractor file into the clicked tab, then runs it", async () => {
    executeScript.mockImplementation(async (injection: { files?: string[]; func?: () => unknown }) => {
      if (injection.files) {
        // Simulate what the injected bundle does in the page.
        (globalThis as Record<string, unknown>).__anglecheckExtractArticle = () => article;
        return [{ result: undefined }];
      }
      return [{ result: injection.func!() }];
    });

    const result = await extractArticleFromTab(42);

    expect(result).toEqual({ ok: true, article });
    expect(executeScript).toHaveBeenNthCalledWith(1, {
      target: { tabId: 42 },
      files: [EXTRACTOR_FILE],
    });
    expect(executeScript.mock.calls[1][0].target).toEqual({ tabId: 42 });
  });

  it("reports no-access when Chrome refuses to script the page", async () => {
    executeScript.mockRejectedValue(new Error("Cannot access contents of the page"));
    expect(await extractArticleFromTab(1)).toEqual({ ok: false, reason: "no-access" });
  });

  it("reports no-article when the extractor finds nothing or throws", async () => {
    executeScript.mockImplementation(async (injection: { files?: string[]; func?: () => unknown }) => {
      if (injection.files) {
        (globalThis as Record<string, unknown>).__anglecheckExtractArticle = () => {
          throw new Error("boom");
        };
        return [{ result: undefined }];
      }
      return [{ result: injection.func!() }];
    });
    expect(await extractArticleFromTab(1)).toEqual({ ok: false, reason: "no-article" });
  });
});
