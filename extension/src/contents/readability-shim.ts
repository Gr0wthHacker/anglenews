/**
 * readability-shim.ts
 *
 * A standalone, lightweight article extraction engine inspired by Mozilla's
 * Readability.js. Designed to run inside a Chrome content script without
 * any external dependencies or ES module imports.
 *
 * The algorithm works by scoring every DOM node based on paragraph density,
 * text length, link density, and semantic signals (tag names, class/id names).
 * The highest-scoring node is treated as the article container, and its text
 * content is extracted and cleaned.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReadabilityResult {
  title: string;
  textContent: string;
  byline: string | null;
  siteName: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UNLIKELY_CANDIDATES =
  /combx|comment|community|disqus|extra|foot|header|menu|remark|rss|shoutbox|sidebar|sponsor|ad-break|agegate|pagination|pager|popup|tweet|twitter|share|social|related|newsletter|nav|masthead|cookie|consent|banner|promo|breadcrumb/i;

const POSITIVE_CANDIDATES =
  /article|body|content|entry|hentry|main|page|post|text|blog|story/i;

const NEGATIVE_CANDIDATES =
  /hidden|banner|combx|comment|com-|contact|foot|footer|footnote|masthead|media|meta|outbrain|promo|related|scroll|shoutbox|sidebar|sponsor|shopping|tags|tool|widget|ad|newsletter/i;

const BLOCK_ELEMENTS = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DETAILS", "DIALOG", "DD",
  "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "FORM",
  "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HGROUP", "HR", "LI",
  "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "UL",
]);

const BYLINE_PATTERN =
  /byline|author|dateline|writtenby|p-author/i;

const MAX_TEXT_LENGTH = 3000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInnerText(node: Element): string {
  return (node.textContent || "").trim();
}

function getLinkDensity(node: Element): number {
  const textLength = getInnerText(node).length;
  if (textLength === 0) return 1;
  let linkLength = 0;
  const links = node.querySelectorAll("a");
  for (let i = 0; i < links.length; i++) {
    linkLength += getInnerText(links[i]).length;
  }
  return linkLength / textLength;
}

function getClassIdWeight(node: Element): number {
  let weight = 0;
  const className = node.className;
  const id = node.id;

  if (typeof className === "string") {
    if (POSITIVE_CANDIDATES.test(className)) weight += 25;
    if (NEGATIVE_CANDIDATES.test(className)) weight -= 25;
  }
  if (id) {
    if (POSITIVE_CANDIDATES.test(id)) weight += 25;
    if (NEGATIVE_CANDIDATES.test(id)) weight -= 25;
  }
  return weight;
}

function isUnlikelyCandidate(node: Element): boolean {
  const tag = node.tagName;
  if (tag === "BODY" || tag === "HTML" || tag === "ARTICLE" || tag === "MAIN") {
    return false;
  }
  const matchString = (node.className || "") + " " + (node.id || "");
  if (UNLIKELY_CANDIDATES.test(matchString) && !POSITIVE_CANDIDATES.test(matchString)) {
    return true;
  }
  return false;
}

function countParagraphs(node: Element): number {
  let count = 0;
  const paragraphs = node.querySelectorAll("p");
  for (let i = 0; i < paragraphs.length; i++) {
    const text = getInnerText(paragraphs[i]);
    if (text.length > 25) {
      count++;
    }
  }
  return count;
}

function extractParagraphText(node: Element): string {
  const paragraphs = node.querySelectorAll("p");
  const texts: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const text = getInnerText(paragraphs[i]);
    if (text.length > 10) {
      texts.push(text);
    }
  }
  if (texts.length === 0) {
    // Fallback: get text from block-level children
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (BLOCK_ELEMENTS.has(child.tagName)) {
        const text = getInnerText(child);
        if (text.length > 20 && getLinkDensity(child) < 0.3) {
          texts.push(text);
        }
      }
    }
  }
  return texts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Byline extraction
// ---------------------------------------------------------------------------

function extractByline(doc: Document): string | null {
  // Check meta tags first
  const authorMeta = doc.querySelector(
    'meta[name="author"], meta[property="article:author"], meta[name="dc.creator"]'
  );
  if (authorMeta) {
    const content = authorMeta.getAttribute("content");
    if (content && content.trim().length > 0 && content.trim().length < 100) {
      return content.trim();
    }
  }

  // Check for byline-like elements
  const candidates = doc.querySelectorAll(
    '[class*="byline"], [class*="author"], [rel="author"], [itemprop="author"], .byline, .author'
  );
  for (let i = 0; i < candidates.length; i++) {
    const text = getInnerText(candidates[i]);
    if (text.length > 0 && text.length < 100) {
      return text.replace(/^by\s+/i, "").trim();
    }
  }

  // Check JSON-LD
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    try {
      const data = JSON.parse(scripts[i].textContent || "");
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item.author) {
          if (typeof item.author === "string") return item.author;
          if (item.author.name) return item.author.name;
          if (Array.isArray(item.author) && item.author[0]) {
            const first = item.author[0];
            return typeof first === "string" ? first : first.name || null;
          }
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Title extraction
// ---------------------------------------------------------------------------

function extractTitle(doc: Document): string {
  // Try og:title first — usually the cleanest
  const ogTitle = doc.querySelector('meta[property="og:title"]');
  if (ogTitle) {
    const content = ogTitle.getAttribute("content");
    if (content && content.trim().length > 0) {
      return content.trim();
    }
  }

  // Try the first h1
  const h1 = doc.querySelector("h1");
  if (h1) {
    const text = getInnerText(h1);
    if (text.length > 0 && text.length < 300) {
      return text;
    }
  }

  // Fallback to document.title, cleaned up
  let title = doc.title || "";
  // Remove site name suffixes like " - The New York Times" or " | CNN"
  title = title.replace(/\s*[\|\-\u2013\u2014\u00BB]\s*.{3,30}$/, "").trim();
  return title || "Untitled";
}

// ---------------------------------------------------------------------------
// Main scoring algorithm
// ---------------------------------------------------------------------------

interface ScoredNode {
  node: Element;
  score: number;
}

function scoreNodes(doc: Document): ScoredNode[] {
  const scored: Map<Element, number> = new Map();
  const paragraphs = doc.querySelectorAll("p, pre");

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const text = getInnerText(para);

    // Skip short paragraphs
    if (text.length < 25) continue;

    const parent = para.parentElement;
    const grandparent = parent?.parentElement;

    if (!parent) continue;

    // Skip unlikely candidates
    if (isUnlikelyCandidate(parent)) continue;

    // Initialize scores
    if (!scored.has(parent)) {
      scored.set(parent, 0 + getClassIdWeight(parent));
    }
    if (grandparent && !scored.has(grandparent)) {
      scored.set(grandparent, 0 + getClassIdWeight(grandparent));
    }

    // Base score: 1 point per paragraph
    let contentScore = 1;

    // Bonus for commas (indicates real prose)
    const commas = (text.match(/,/g) || []).length;
    contentScore += commas;

    // Bonus for text length (capped)
    contentScore += Math.min(Math.floor(text.length / 100), 3);

    // Add to parent
    scored.set(parent, (scored.get(parent) || 0) + contentScore);

    // Add half to grandparent
    if (grandparent) {
      scored.set(grandparent, (scored.get(grandparent) || 0) + contentScore / 2);
    }
  }

  // Apply link density penalty
  const results: ScoredNode[] = [];
  scored.forEach((score, node) => {
    const linkDensity = getLinkDensity(node);
    const adjustedScore = score * (1 - linkDensity);
    results.push({ node, score: adjustedScore });
  });

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function parseReadability(doc: Document): ReadabilityResult | null {
  try {
    const title = extractTitle(doc);
    const byline = extractByline(doc);

    // Score all candidate nodes
    const scored = scoreNodes(doc);

    if (scored.length === 0) {
      return null;
    }

    // Take the top candidate
    const topCandidate = scored[0];

    // Extract text from the winning node
    let textContent = extractParagraphText(topCandidate.node);

    // If the top candidate has very little text, try combining top candidates
    if (textContent.length < 200 && scored.length > 1) {
      const combined: string[] = [textContent];
      for (let i = 1; i < Math.min(scored.length, 5); i++) {
        // Only include nodes that scored at least 30% of the top
        if (scored[i].score >= topCandidate.score * 0.3) {
          const extra = extractParagraphText(scored[i].node);
          if (extra.length > 0) {
            combined.push(extra);
          }
        }
      }
      textContent = combined.join("\n\n");
    }

    // If still too short, fall back to innerText of top candidate
    if (textContent.length < 100) {
      textContent = getInnerText(topCandidate.node);
    }

    // Truncate
    if (textContent.length > MAX_TEXT_LENGTH) {
      textContent = textContent.slice(0, MAX_TEXT_LENGTH);
    }

    if (textContent.length < 50) {
      return null;
    }

    // Try to get site name from meta
    const siteNameMeta = doc.querySelector('meta[property="og:site_name"]');
    const siteName = siteNameMeta?.getAttribute("content")?.trim() || null;

    return {
      title,
      textContent,
      byline,
      siteName,
    };
  } catch {
    return null;
  }
}

// Export for use in article-extractor.ts
// In a content script context these will be concatenated or bundled,
// so we attach to a namespace on the window object.
(window as any).__readabilityShim = {
  parseReadability,
  extractTitle,
  extractByline,
  extractParagraphText,
  getInnerText,
  getLinkDensity,
};

export { parseReadability, extractTitle, extractByline, ReadabilityResult };
