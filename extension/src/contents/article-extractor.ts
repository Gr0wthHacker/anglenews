/**
 * article-extractor.ts
 *
 * Chrome extension content script that extracts article data from any news
 * webpage. Uses a multi-layered extraction strategy:
 *
 *   1. Readability-shim (paragraph-density scoring)
 *   2. Open Graph / meta tag extraction
 *   3. DOM heuristics (common article selectors)
 *   4. Minimal fallback (document.title + body text)
 *
 * Designed to be fully self-contained (IIFE-compatible). Communicates with
 * the background service worker via chrome.runtime.onMessage.
 */

// ---------------------------------------------------------------------------
// Types (defined locally — mirrors @shared/types)
// ---------------------------------------------------------------------------

interface ArticleData {
  headline: string;
  body: string;
  byline: string | null;
  siteName: string | null;
  url: string;
  domain: string;
  publishDate: string | null;
  imageUrl: string | null;
}

// Type for the readability shim attached to window
interface ReadabilityShim {
  parseReadability: (doc: Document) => {
    title: string;
    textContent: string;
    byline: string | null;
    siteName: string | null;
  } | null;
  extractTitle: (doc: Document) => string;
  extractByline: (doc: Document) => string | null;
  extractParagraphText: (node: Element) => string;
  getInnerText: (node: Element) => string;
  getLinkDensity: (node: Element) => number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BODY_LENGTH = 3000;

const ARTICLE_SELECTORS = [
  "article",
  '[role="article"]',
  ".article-body",
  ".story-body",
  ".post-content",
  ".entry-content",
  ".article-content",
  ".article__body",
  ".story-content",
  "main article",
  "#article-body",
  "#story-body",
  ".post-body",
  "[itemprop='articleBody']",
];

// ---------------------------------------------------------------------------
// Helpers — Publish Date
// ---------------------------------------------------------------------------

function extractPublishDate(doc: Document): string | null {
  // 1. Meta tags
  const dateMetaSelectors = [
    'meta[property="article:published_time"]',
    'meta[name="datePublished"]',
    'meta[property="og:published_time"]',
    'meta[name="date"]',
    'meta[name="pubdate"]',
    'meta[name="publish_date"]',
    'meta[property="article:published"]',
    'meta[name="DC.date.issued"]',
    'meta[itemprop="datePublished"]',
  ];

  for (const selector of dateMetaSelectors) {
    const el = doc.querySelector(selector);
    if (el) {
      const content = el.getAttribute("content");
      if (content && isPlausibleDate(content)) {
        return normalizeDate(content);
      }
    }
  }

  // 2. <time> element with datetime attribute
  const timeElements = doc.querySelectorAll("time[datetime]");
  for (let i = 0; i < timeElements.length; i++) {
    const dt = timeElements[i].getAttribute("datetime");
    if (dt && isPlausibleDate(dt)) {
      return normalizeDate(dt);
    }
  }

  // 3. JSON-LD structured data
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    try {
      const data = JSON.parse(scripts[i].textContent || "");
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item.datePublished && isPlausibleDate(item.datePublished)) {
          return normalizeDate(item.datePublished);
        }
        if (item["@graph"] && Array.isArray(item["@graph"])) {
          for (const graphItem of item["@graph"]) {
            if (graphItem.datePublished && isPlausibleDate(graphItem.datePublished)) {
              return normalizeDate(graphItem.datePublished);
            }
          }
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }

  // 4. URL date pattern (e.g., /2026/04/04/)
  const urlDateMatch = window.location.pathname.match(
    /\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//
  );
  if (urlDateMatch) {
    const [, year, month, day] = urlDateMatch;
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    if (y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  return null;
}

function isPlausibleDate(value: string): boolean {
  // Must look like a date string (ISO, RFC, or common formats)
  if (value.length < 4 || value.length > 50) return false;
  // Quick check: contains at least 4 consecutive digits (year)
  return /\d{4}/.test(value);
}

function normalizeDate(value: string): string {
  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch {
    // fall through
  }
  return value.trim();
}

// ---------------------------------------------------------------------------
// Helpers — Site Name
// ---------------------------------------------------------------------------

function extractSiteName(doc: Document): string | null {
  // 1. og:site_name
  const ogSiteName = doc.querySelector('meta[property="og:site_name"]');
  if (ogSiteName) {
    const content = ogSiteName.getAttribute("content");
    if (content && content.trim().length > 0) {
      return content.trim();
    }
  }

  // 2. application-name
  const appName = doc.querySelector('meta[name="application-name"]');
  if (appName) {
    const content = appName.getAttribute("content");
    if (content && content.trim().length > 0) {
      return content.trim();
    }
  }

  // 3. Derive from domain
  return cleanDomainName(window.location.hostname);
}

function cleanDomainName(hostname: string): string {
  // Remove www. prefix
  let domain = hostname.replace(/^www\./, "");

  // Remove TLD (.com, .org, .co.uk, etc.)
  // Handle two-part TLDs first
  domain = domain.replace(/\.(co|com|org|net|edu|gov)\.\w{2,3}$/, "");
  domain = domain.replace(/\.\w{2,4}$/, "");

  // If there are subdomains left, take the last part (main domain)
  const parts = domain.split(".");
  domain = parts[parts.length - 1];

  // Capitalize first letter of each segment if it looks like a single word
  if (domain.length <= 12) {
    // Capitalize nicely: "nytimes" -> "NYTimes" for known patterns,
    // otherwise just Title Case
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }

  return domain;
}

// ---------------------------------------------------------------------------
// Helpers — Image
// ---------------------------------------------------------------------------

function extractImageUrl(doc: Document, articleNode?: Element | null): string | null {
  // 1. og:image
  const ogImage = doc.querySelector('meta[property="og:image"]');
  if (ogImage) {
    const content = ogImage.getAttribute("content");
    if (content && content.trim().length > 0) {
      return resolveUrl(content.trim());
    }
  }

  // 2. twitter:image
  const twitterImage = doc.querySelector(
    'meta[name="twitter:image"], meta[property="twitter:image"]'
  );
  if (twitterImage) {
    const content = twitterImage.getAttribute("content");
    if (content && content.trim().length > 0) {
      return resolveUrl(content.trim());
    }
  }

  // 3. First large image in article content
  if (articleNode) {
    const images = articleNode.querySelectorAll("img");
    for (let i = 0; i < images.length; i++) {
      const img = images[i] as HTMLImageElement;
      const src = img.src || img.getAttribute("data-src") || img.getAttribute("data-lazy-src");
      if (!src) continue;

      // Check if image is likely large enough to be a hero image
      const width = img.naturalWidth || parseInt(img.getAttribute("width") || "0", 10);
      const height = img.naturalHeight || parseInt(img.getAttribute("height") || "0", 10);

      // Accept if dimensions are large enough or unknown (we'll take the first one)
      if (width >= 200 || height >= 150 || (width === 0 && height === 0)) {
        // Skip tiny icons and tracking pixels
        if (src.includes("1x1") || src.includes("pixel") || src.includes("blank.gif")) {
          continue;
        }
        return resolveUrl(src);
      }
    }
  }

  return null;
}

function resolveUrl(url: string): string {
  if (url.startsWith("//")) {
    return window.location.protocol + url;
  }
  if (url.startsWith("/")) {
    return window.location.origin + url;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  // Relative URL
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Extraction strategies
// ---------------------------------------------------------------------------

/**
 * Strategy 1: Readability-shim paragraph-density scoring.
 * Works on ~90% of news sites.
 */
function extractViaReadability(doc: Document): Partial<ArticleData> | null {
  const shim = (window as any).__readabilityShim as ReadabilityShim | undefined;
  if (!shim) return null;

  // Clone the document so parsing doesn't mutate the live DOM
  const clonedDoc = doc.cloneNode(true) as Document;
  const result = shim.parseReadability(clonedDoc);
  if (!result || !result.textContent || result.textContent.length < 50) {
    return null;
  }

  return {
    headline: result.title,
    body: result.textContent.slice(0, MAX_BODY_LENGTH),
    byline: result.byline,
    siteName: result.siteName,
  };
}

/**
 * Strategy 2: Open Graph and meta tag extraction.
 * Good for pages with rich metadata but complex DOMs.
 */
function extractViaMeta(doc: Document): Partial<ArticleData> | null {
  const headline = getMetaContent(doc, [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
    'meta[name="title"]',
  ]);

  if (!headline) return null;

  const body = getMetaContent(doc, [
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[name="twitter:description"]',
  ]);

  if (!body || body.length < 20) return null;

  const siteName = getMetaContent(doc, [
    'meta[property="og:site_name"]',
  ]);

  return {
    headline,
    body: body.slice(0, MAX_BODY_LENGTH),
    siteName,
  };
}

function getMetaContent(doc: Document, selectors: string[]): string | null {
  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    if (el) {
      const content = el.getAttribute("content");
      if (content && content.trim().length > 0) {
        return content.trim();
      }
    }
  }
  return null;
}

/**
 * Strategy 3: DOM heuristics using common article selectors.
 */
function extractViaDomHeuristics(doc: Document): {
  data: Partial<ArticleData>;
  articleNode: Element | null;
} | null {
  // Try each selector in order of specificity
  let articleNode: Element | null = null;
  for (const selector of ARTICLE_SELECTORS) {
    const candidate = doc.querySelector(selector);
    if (candidate) {
      const text = (candidate.textContent || "").trim();
      if (text.length > 100) {
        articleNode = candidate;
        break;
      }
    }
  }

  if (!articleNode) {
    // Last resort: find the element with the highest paragraph density
    articleNode = findDensestElement(doc);
  }

  if (!articleNode) return null;

  // Extract headline from h1
  let headline: string | null = null;
  const h1 = doc.querySelector("h1");
  if (h1) {
    const text = (h1.textContent || "").trim();
    if (text.length > 0 && text.length < 300) {
      headline = text;
    }
  }

  if (!headline) {
    // Try title tag
    headline = doc.title.replace(/\s*[\|\-\u2013\u2014\u00BB]\s*.{3,30}$/, "").trim();
  }

  if (!headline) return null;

  // Concatenate paragraph text
  const paragraphs = articleNode.querySelectorAll("p");
  const bodyParts: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const text = (paragraphs[i].textContent || "").trim();
    if (text.length > 10) {
      bodyParts.push(text);
    }
  }

  let body = bodyParts.join("\n\n");

  if (body.length < 50) {
    // Fall back to innerText of the article node
    body = (articleNode.textContent || "").trim();
  }

  if (body.length < 30) return null;

  return {
    data: {
      headline,
      body: body.slice(0, MAX_BODY_LENGTH),
    },
    articleNode,
  };
}

function findDensestElement(doc: Document): Element | null {
  const candidates = doc.querySelectorAll("div, section, main, article");
  let best: Element | null = null;
  let bestScore = 0;

  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    const paragraphs = el.querySelectorAll("p");
    let paragraphTextLength = 0;
    let paragraphCount = 0;

    for (let j = 0; j < paragraphs.length; j++) {
      const text = (paragraphs[j].textContent || "").trim();
      if (text.length > 20) {
        paragraphTextLength += text.length;
        paragraphCount++;
      }
    }

    if (paragraphCount < 2) continue;

    const totalTextLength = (el.textContent || "").trim().length;
    if (totalTextLength === 0) continue;

    // Score: paragraph text ratio * paragraph count
    const density = paragraphTextLength / totalTextLength;
    const score = density * paragraphCount * paragraphTextLength;

    // Penalize very large containers (likely body or full-page wrappers)
    const penalty = totalTextLength > 10000 ? 0.5 : 1;

    if (score * penalty > bestScore) {
      bestScore = score * penalty;
      best = el;
    }
  }

  return best;
}

/**
 * Strategy 4: Minimal fallback — always succeeds.
 */
function extractMinimal(doc: Document): Partial<ArticleData> {
  let headline = doc.title || "Untitled";
  headline = headline.replace(/\s*[\|\-\u2013\u2014\u00BB]\s*.{3,30}$/, "").trim();

  let body = (doc.body.innerText || doc.body.textContent || "").trim();
  body = body.slice(0, MAX_BODY_LENGTH);

  return {
    headline,
    body,
  };
}

// ---------------------------------------------------------------------------
// Main extraction orchestrator
// ---------------------------------------------------------------------------

function extractArticle(): ArticleData {
  const doc = document;
  const url = window.location.href;
  const domain = window.location.hostname.replace(/^www\./, "");

  // Try each strategy in order; merge results as we go
  let result: Partial<ArticleData> = {};
  let articleNode: Element | null = null;

  // Strategy 1: Readability shim
  const readabilityResult = extractViaReadability(doc);
  if (readabilityResult && readabilityResult.body && readabilityResult.body.length >= 50) {
    result = { ...result, ...readabilityResult };
  }

  // Strategy 2: Meta tags (fills in gaps)
  const metaResult = extractViaMeta(doc);
  if (metaResult) {
    // Only use meta body if we don't have a good body yet
    if (!result.body || result.body.length < 50) {
      result = { ...result, ...metaResult };
    } else {
      // Use meta headline if we don't have one
      if (!result.headline && metaResult.headline) {
        result.headline = metaResult.headline;
      }
      if (!result.siteName && metaResult.siteName) {
        result.siteName = metaResult.siteName;
      }
    }
  }

  // Strategy 3: DOM heuristics
  if (!result.body || result.body.length < 50) {
    const domResult = extractViaDomHeuristics(doc);
    if (domResult) {
      result = { ...result, ...domResult.data };
      articleNode = domResult.articleNode;
    }
  } else {
    // Still try to find the article node for image extraction
    const domResult = extractViaDomHeuristics(doc);
    if (domResult) {
      articleNode = domResult.articleNode;
    }
  }

  // Strategy 4: Minimal fallback
  if (!result.headline || !result.body || result.body.length < 30) {
    const minimal = extractMinimal(doc);
    if (!result.headline) result.headline = minimal.headline;
    if (!result.body || result.body.length < 30) result.body = minimal.body;
  }

  // Fill in remaining fields
  const publishDate = result.publishDate || extractPublishDate(doc);
  const siteName = result.siteName || extractSiteName(doc);
  const imageUrl = result.imageUrl || extractImageUrl(doc, articleNode);
  const byline = result.byline || null;

  return {
    headline: result.headline || "Untitled",
    body: (result.body || "").slice(0, MAX_BODY_LENGTH),
    byline,
    siteName,
    url,
    domain,
    publishDate,
    imageUrl,
  };
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (
    message: { type: string },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ) => {
    if (message.type !== "EXTRACT_ARTICLE") {
      return false;
    }

    try {
      const data = extractArticle();
      sendResponse({
        type: "ARTICLE_EXTRACTED",
        data,
      });
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown extraction error";
      sendResponse({
        type: "EXTRACTION_FAILED",
        error: errorMessage,
      });
    }

    // Return true to indicate we will send a response synchronously
    // (extraction is synchronous, but Chrome requires this for safety)
    return true;
  }
);

export { extractArticle, ArticleData };
