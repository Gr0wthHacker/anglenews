import type { RawArticle } from "./news-fetcher.js";

/**
 * Deduplicates articles using URL normalization and title similarity.
 * Keeps the version with the most content.
 */
export function deduplicateArticles(articles: RawArticle[]): RawArticle[] {
  const seen = new Map<string, RawArticle>();

  for (const article of articles) {
    // First: normalize URL dedup
    const normalizedUrl = normalizeUrl(article.url);
    if (seen.has(normalizedUrl)) {
      // Keep the one with more content
      const existing = seen.get(normalizedUrl)!;
      if (contentLength(article) > contentLength(existing)) {
        seen.set(normalizedUrl, article);
      }
      continue;
    }

    // Second: title similarity dedup
    const titleKey = normalizeTitleKey(article.title);
    let isDuplicate = false;

    for (const [, existing] of seen) {
      const existingKey = normalizeTitleKey(existing.title);
      if (titleSimilarity(titleKey, existingKey) > 0.8) {
        // Keep the one with more content
        if (contentLength(article) > contentLength(existing)) {
          seen.delete(normalizeUrl(existing.url));
          seen.set(normalizedUrl, article);
        }
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seen.set(normalizedUrl, article);
    }
  }

  return Array.from(seen.values());
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Strip tracking params
    const stripParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
      "ref", "source", "fbclid", "gclid",
    ];
    for (const param of stripParams) {
      u.searchParams.delete(param);
    }
    return u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "");
  } catch {
    return url.toLowerCase();
  }
}

function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function contentLength(article: RawArticle): number {
  return (article.content?.length || 0) + (article.description?.length || 0);
}

/**
 * Simple word-overlap Jaccard similarity for titles.
 */
function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(b.split(" ").filter((w) => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}
