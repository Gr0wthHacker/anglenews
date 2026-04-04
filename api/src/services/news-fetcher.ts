import Parser from "rss-parser";
import { config } from "../lib/config.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RawArticle {
  title: string;
  description: string;
  content: string | null;
  url: string;
  source: string;
  domain: string;
  publishedAt: string | null;
  imageUrl: string | null;
  apiSource: "newsdata" | "gdelt" | "googlenews" | "thenewsapi";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sanitizeQuery(query: string): string {
  // Remove special characters that might break API queries
  return query.replace(/[^\w\s\-'"]/g, " ").replace(/\s+/g, " ").trim();
}

// ─── NewsData.io ────────────────────────────────────────────────────────────

interface NewsDataResponse {
  status: string;
  totalResults: number;
  results: Array<{
    title: string;
    description: string | null;
    content: string | null;
    link: string;
    source_id: string;
    source_name?: string;
    pubDate: string | null;
    image_url: string | null;
  }>;
}

async function fetchFromNewsData(
  query: string,
  apiKey: string
): Promise<RawArticle[]> {
  if (!apiKey) return [];

  const encodedQuery = encodeURIComponent(sanitizeQuery(query));
  const url = `https://newsdata.io/api/1/latest?apikey=${apiKey}&q=${encodedQuery}&language=en`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`NewsData.io API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as NewsDataResponse;

  if (data.status !== "success" || !Array.isArray(data.results)) {
    return [];
  }

  return data.results.map((item) => ({
    title: item.title || "",
    description: item.description || "",
    content: item.content || null,
    url: item.link,
    source: item.source_name || item.source_id || "",
    domain: extractDomain(item.link),
    publishedAt: item.pubDate || null,
    imageUrl: item.image_url || null,
    apiSource: "newsdata" as const,
  }));
}

// ─── GDELT Doc API ─────────────────────────────────────────────────────────

interface GDELTResponse {
  articles?: Array<{
    title: string;
    url: string;
    seendate: string;
    socialimage: string;
    domain: string;
    sourcecountry: string;
  }>;
}

async function fetchFromGDELT(query: string): Promise<RawArticle[]> {
  const encodedQuery = encodeURIComponent(sanitizeQuery(query));
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodedQuery}&mode=artlist&maxrecords=50&format=json`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`GDELT API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as GDELTResponse;

  if (!data.articles || !Array.isArray(data.articles)) {
    return [];
  }

  return data.articles.map((item) => ({
    title: item.title || "",
    description: "",
    content: null,
    url: item.url,
    source: item.domain || "",
    domain: item.domain || extractDomain(item.url),
    publishedAt: item.seendate
      ? formatGDELTDate(item.seendate)
      : null,
    imageUrl: item.socialimage || null,
    apiSource: "gdelt" as const,
  }));
}

function formatGDELTDate(dateStr: string): string {
  // GDELT dates are in YYYYMMDDTHHMMSSZ format
  try {
    if (dateStr.length >= 8) {
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      return `${year}-${month}-${day}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

// ─── Google News RSS ────────────────────────────────────────────────────────

const rssParser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "AngleCheck/1.0",
  },
});

async function fetchFromGoogleNewsRSS(query: string): Promise<RawArticle[]> {
  const encodedQuery = encodeURIComponent(sanitizeQuery(query));
  const url = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;

  const feed = await Promise.race([
    rssParser.parseURL(url),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Google News RSS timeout after 10s")), 10000)
    ),
  ]);

  if (!feed.items || !Array.isArray(feed.items)) {
    return [];
  }

  return feed.items
    .filter((item) => item.link && item.title)
    .map((item) => ({
      title: item.title || "",
      description: item.contentSnippet || item.content || "",
      content: item.content || null,
      url: item.link!,
      source: item.creator || extractSourceFromGoogleTitle(item.title || ""),
      domain: extractDomain(item.link!),
      publishedAt: item.isoDate || item.pubDate || null,
      imageUrl: null,
      apiSource: "googlenews" as const,
    }));
}

function extractSourceFromGoogleTitle(title: string): string {
  // Google News titles often end with " - Source Name"
  const match = title.match(/\s-\s([^-]+)$/);
  return match ? match[1].trim() : "";
}

// ─── TheNewsAPI ─────────────────────────────────────────────────────────────

interface TheNewsAPIResponse {
  data: Array<{
    title: string;
    description: string;
    snippet: string;
    url: string;
    source: string;
    published_at: string;
    image_url: string | null;
  }>;
}

async function fetchFromTheNewsAPI(
  query: string,
  apiKey: string
): Promise<RawArticle[]> {
  if (!apiKey) return [];

  const encodedQuery = encodeURIComponent(sanitizeQuery(query));
  const url = `https://api.thenewsapi.com/v1/news/all?api_token=${apiKey}&search=${encodedQuery}&language=en`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`TheNewsAPI error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as TheNewsAPIResponse;

  if (!data.data || !Array.isArray(data.data)) {
    return [];
  }

  return data.data.map((item) => ({
    title: item.title || "",
    description: item.description || item.snippet || "",
    content: null,
    url: item.url,
    source: item.source || "",
    domain: extractDomain(item.url),
    publishedAt: item.published_at || null,
    imageUrl: item.image_url || null,
    apiSource: "thenewsapi" as const,
  }));
}

// ─── Main Orchestrator ──────────────────────────────────────────────────────

export async function fetchRelatedArticles(
  topic: string,
  entities: string[]
): Promise<RawArticle[]> {
  // Build search queries: use the topic as primary, plus entity-based fallback
  const queries = [topic];
  if (entities.length >= 2) {
    queries.push(entities.slice(0, 3).join(" "));
  }

  const primaryQuery = queries[0];

  // Fetch from all sources in parallel
  const results = await Promise.allSettled([
    fetchFromNewsData(primaryQuery, config.newsDataApiKey),
    fetchFromGDELT(primaryQuery),
    fetchFromGoogleNewsRSS(primaryQuery),
    fetchFromTheNewsAPI(primaryQuery, config.theNewsApiKey),
  ]);

  const allArticles: RawArticle[] = [];
  const sourceNames = ["NewsData.io", "GDELT", "Google News RSS", "TheNewsAPI"];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      allArticles.push(...result.value);
    } else {
      console.warn(
        `[news-fetcher] ${sourceNames[i]} failed:`,
        result.reason instanceof Error ? result.reason.message : result.reason
      );
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduplicated: RawArticle[] = [];

  for (const article of allArticles) {
    // Normalize URL for comparison
    const normalizedUrl = article.url
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "")
      .toLowerCase();

    if (!seen.has(normalizedUrl) && article.title.trim().length > 0) {
      seen.add(normalizedUrl);
      deduplicated.push(article);
    }
  }

  console.log(
    `[news-fetcher] Fetched ${allArticles.length} articles, ${deduplicated.length} after dedup`
  );

  return deduplicated;
}
