import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { normalizeTopic } from "../services/topic-normalizer.js";
import { fetchRelatedArticles } from "../services/news-fetcher.js";
import { deduplicateArticles } from "../services/deduplicator.js";
import { extractAngles } from "../services/angle-extractor.js";
import { clusterArticles } from "../services/clusterer.js";
import { getBiasForDomain } from "../services/bias-enricher.js";
import {
  createTopicFingerprint,
  getCachedComparison,
  cacheComparison,
} from "../services/cache.js";
import { config } from "../lib/config.js";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  AngleComparison,
  AnalyzedArticle,
  ArticleData,
  CoverageGap,
  EmotionalRegister,
} from "../../../shared/types.js";

const analyzeRoute = new Hono();

analyzeRoute.post("/", async (c) => {
  const startTime = Date.now();

  // ── Step 1: Validate request body ─────────────────────────────────────
  let body: AnalyzeRequest;
  try {
    body = await c.req.json<AnalyzeRequest>();
  } catch {
    return c.json<AnalyzeResponse>(
      { success: false, comparison: null, error: "Invalid JSON body", cached: false },
      400
    );
  }

  if (!body.headline || typeof body.headline !== "string") {
    return c.json<AnalyzeResponse>(
      { success: false, comparison: null, error: "Missing required field: headline", cached: false },
      400
    );
  }
  if (!body.url || typeof body.url !== "string") {
    return c.json<AnalyzeResponse>(
      { success: false, comparison: null, error: "Missing required field: url", cached: false },
      400
    );
  }
  if (!body.domain || typeof body.domain !== "string") {
    return c.json<AnalyzeResponse>(
      { success: false, comparison: null, error: "Missing required field: domain", cached: false },
      400
    );
  }

  const bodyExcerpt = body.body_excerpt || "";

  try {
    // ── Step 2: Normalize topic ───────────────────────────────────────────
    console.log(`[analyze] Normalizing topic for: ${body.headline.slice(0, 60)}...`);
    const normalized = await normalizeTopic(body.headline, bodyExcerpt);

    // ── Step 3: Check cache ───────────────────────────────────────────────
    const fingerprint = createTopicFingerprint(normalized.topic);
    const cached = getCachedComparison(fingerprint);

    if (cached) {
      console.log(`[analyze] Cache hit for fingerprint: ${fingerprint}`);
      return c.json<AnalyzeResponse>({
        success: true,
        comparison: cached,
        error: null,
        cached: true,
      });
    }

    // ── Step 4: Fetch related articles ────────────────────────────────────
    console.log(`[analyze] Fetching articles for topic: ${normalized.topic}`);
    const rawArticles = await fetchRelatedArticles(
      normalized.searchQueries[0] || normalized.topic,
      normalized.entities
    );

    if (rawArticles.length === 0) {
      return c.json<AnalyzeResponse>(
        {
          success: false,
          comparison: null,
          error: "No related articles found for this topic",
          cached: false,
        },
        404
      );
    }

    // ── Step 5: Deduplicate ───────────────────────────────────────────────
    const deduplicated = deduplicateArticles(rawArticles);
    console.log(`[analyze] ${deduplicated.length} articles after deduplication`);

    // ── Step 6: Analyze top N articles via LLM ────────────────────────────
    const toAnalyze = deduplicated.slice(0, config.maxSourcesPerQuery);
    console.log(`[analyze] Analyzing ${toAnalyze.length} articles via LLM`);
    const analyzed = await extractAngles(toAnalyze);

    if (analyzed.length === 0) {
      return c.json<AnalyzeResponse>(
        {
          success: false,
          comparison: null,
          error: "Failed to analyze articles",
          cached: false,
        },
        500
      );
    }

    // ── Step 7: Enrich with bias ratings ──────────────────────────────────
    const analyzedArticles: AnalyzedArticle[] = analyzed.map((item) => ({
      article: rawArticleToArticleData(item.article),
      angle: item.angle,
      sentiment: item.sentiment,
      sourceBias: getBiasForDomain(item.article.domain),
    }));

    // ── Step 8: Build the current article's analysis ──────────────────────
    // Find or create analysis for the user's current article
    let currentArticle = analyzedArticles.find(
      (a) => a.article.domain === body.domain || a.article.url === body.url
    );

    if (!currentArticle) {
      // The user's article might not be in our fetched results; analyze it separately
      const currentAngle = analyzed[0]; // Use first analyzed as fallback basis
      currentArticle = {
        article: {
          headline: body.headline,
          body: bodyExcerpt,
          byline: null,
          siteName: null,
          url: body.url,
          domain: body.domain,
          publishDate: null,
          imageUrl: null,
        },
        angle: currentAngle.angle,
        sentiment: currentAngle.sentiment,
        sourceBias: getBiasForDomain(body.domain),
      };
    }

    // ── Step 9: Cluster by angle similarity ───────────────────────────────
    const clusters = clusterArticles(analyzedArticles, currentArticle);

    // ── Step 10: Identify coverage gaps ───────────────────────────────────
    const coverageGaps = identifyCoverageGaps(analyzedArticles, body.domain);

    // ── Step 11: Calculate tone distribution ──────────────────────────────
    const toneDistribution = calculateToneDistribution(analyzedArticles);

    // ── Step 12: Build response ───────────────────────────────────────────
    const comparison: AngleComparison = {
      id: uuidv4(),
      topic: body.headline,
      normalizedTopic: normalized.topic,
      currentArticle,
      clusters,
      coverageGaps,
      toneDistribution,
      totalSourcesFetched: deduplicated.length,
      totalSourcesAnalyzed: analyzed.length,
      timestamp: new Date().toISOString(),
      cachedAt: null,
    };

    // ── Step 13: Cache the result ─────────────────────────────────────────
    cacheComparison(fingerprint, comparison);

    const elapsed = Date.now() - startTime;
    console.log(`[analyze] Completed in ${elapsed}ms — ${analyzed.length} articles analyzed`);

    return c.json<AnalyzeResponse>({
      success: true,
      comparison,
      error: null,
      cached: false,
    });
  } catch (error) {
    console.error("[analyze] Error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return c.json<AnalyzeResponse>(
      { success: false, comparison: null, error: message, cached: false },
      500
    );
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rawArticleToArticleData(
  raw: import("../services/news-fetcher.js").RawArticle
): ArticleData {
  return {
    headline: raw.title,
    body: raw.content || raw.description || "",
    byline: null,
    siteName: raw.source,
    url: raw.url,
    domain: raw.domain,
    publishDate: raw.publishedAt,
    imageUrl: raw.imageUrl,
  };
}

function identifyCoverageGaps(
  articles: AnalyzedArticle[],
  currentDomain: string
): CoverageGap[] {
  const gaps: CoverageGap[] = [];

  // Collect all key omissions across articles that are NOT from the current domain
  const omissionCounts = new Map<
    string,
    { description: string; mentionedBy: Set<string> }
  >();

  for (const article of articles) {
    if (article.article.domain === currentDomain) continue;

    // Check what angles/entities other articles cover that differ from current
    for (const omission of article.angle.key_omissions) {
      const key = omission.toLowerCase().trim();
      if (!omissionCounts.has(key)) {
        omissionCounts.set(key, {
          description: omission,
          mentionedBy: new Set(),
        });
      }
      omissionCounts.get(key)!.mentionedBy.add(
        article.article.siteName || article.article.domain
      );
    }
  }

  // Convert to coverage gaps (only include those mentioned by multiple sources)
  for (const [, data] of omissionCounts) {
    if (data.mentionedBy.size >= 2) {
      gaps.push({
        description: data.description,
        mentionedBy: Array.from(data.mentionedBy),
        missedBy: currentDomain,
      });
    }
  }

  return gaps.slice(0, 5); // Limit to top 5 gaps
}

function calculateToneDistribution(
  articles: AnalyzedArticle[]
): Record<EmotionalRegister, number> {
  const counts: Record<EmotionalRegister, number> = {
    alarm: 0,
    neutral: 0,
    optimistic: 0,
    adversarial: 0,
    empathetic: 0,
    dismissive: 0,
  };

  for (const article of articles) {
    counts[article.angle.emotional_register]++;
  }

  // Normalize to percentages
  const total = articles.length || 1;
  const distribution: Record<EmotionalRegister, number> = {
    alarm: 0,
    neutral: 0,
    optimistic: 0,
    adversarial: 0,
    empathetic: 0,
    dismissive: 0,
  };

  for (const key of Object.keys(counts) as EmotionalRegister[]) {
    distribution[key] = Math.round((counts[key] / total) * 100) / 100;
  }

  return distribution;
}

export { analyzeRoute };
