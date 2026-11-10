import type { ArticleData } from "@shared/types";

/** Built path of the extractor bundle inside dist/ (see vite.config.ts). */
export const EXTRACTOR_FILE = "contents/article-extractor.js";

export type ExtractResult =
  | { ok: true; article: ArticleData }
  /** The page could not be scripted: no activeTab grant, or a page Chrome protects (chrome://, the Web Store). */
  | { ok: false; reason: "no-access" }
  /** The script ran but found nothing usable. */
  | { ok: false; reason: "no-article" };

/** Runs inside the page, in the same isolated world as the injected extractor. */
function runInjectedExtractor(): ArticleData | null {
  const fn = (globalThis as { __anglecheckExtractArticle?: () => ArticleData })
    .__anglecheckExtractArticle;
  if (typeof fn !== "function") return null;
  try {
    return fn();
  } catch {
    return null;
  }
}

/**
 * Reads the article from a tab on the user's click. Relies on the activeTab
 * grant that Chrome gives when the toolbar button is clicked, so the
 * extension never needs a content script on every site.
 */
export async function extractArticleFromTab(tabId: number): Promise<ExtractResult> {
  let article: ArticleData | null = null;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [EXTRACTOR_FILE] });
    const [frame] = await chrome.scripting.executeScript({
      target: { tabId },
      func: runInjectedExtractor,
    });
    article = (frame?.result as ArticleData | null | undefined) ?? null;
  } catch {
    return { ok: false, reason: "no-access" };
  }
  if (!article) return { ok: false, reason: "no-article" };
  return { ok: true, article };
}
