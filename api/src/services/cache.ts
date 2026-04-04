import { createHash } from "crypto";
import { config } from "../lib/config.js";
import type { AngleComparison, TrendingTopic } from "../../../shared/types.js";

/**
 * In-memory cache for MVP. Replace with Redis in production.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const comparisonCache = new Map<string, CacheEntry<AngleComparison>>();
const trendingCounts = new Map<
  string,
  { topic: string; count: number; sourceCount: number; clusters: string[]; lastUpdated: string }
>();

// ─── Fingerprinting ─────────────────────────────────────────────────────────

export function createTopicFingerprint(normalizedTopic: string): string {
  return createHash("sha256")
    .update(normalizedTopic.toLowerCase().trim())
    .digest("hex")
    .slice(0, 16);
}

// ─── Comparison Cache ───────────────────────────────────────────────────────

export function getCachedComparison(
  fingerprint: string
): AngleComparison | null {
  const entry = comparisonCache.get(fingerprint);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    comparisonCache.delete(fingerprint);
    return null;
  }

  return entry.data;
}

export function cacheComparison(
  fingerprint: string,
  comparison: AngleComparison
): void {
  const ttlMs = config.cacheTTLSeconds * 1000;
  comparisonCache.set(fingerprint, {
    data: { ...comparison, cachedAt: new Date().toISOString() },
    expiresAt: Date.now() + ttlMs,
  });

  // Update trending counts
  const existing = trendingCounts.get(fingerprint);
  const clusterLabels = comparison.clusters.map((c) => c.label).slice(0, 3);

  if (existing) {
    existing.count += 1;
    existing.sourceCount = comparison.totalSourcesAnalyzed;
    existing.clusters = clusterLabels;
    existing.lastUpdated = new Date().toISOString();
  } else {
    trendingCounts.set(fingerprint, {
      topic: comparison.normalizedTopic,
      count: 1,
      sourceCount: comparison.totalSourcesAnalyzed,
      clusters: clusterLabels,
      lastUpdated: new Date().toISOString(),
    });
  }
}

// ─── Trending ───────────────────────────────────────────────────────────────

export function getTrendingTopics(limit: number = 10): TrendingTopic[] {
  const topics = Array.from(trendingCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return topics.map((t) => ({
    topic: t.topic,
    comparisonCount: t.count,
    sourceCount: t.sourceCount,
    topClusters: t.clusters,
    lastUpdated: t.lastUpdated,
  }));
}

// ─── Feedback Storage ───────────────────────────────────────────────────────

interface FeedbackEntry {
  comparisonId: string;
  rating: number;
  comment: string | null;
  timestamp: string;
}

const feedbackStore: FeedbackEntry[] = [];

export function storeFeedback(
  comparisonId: string,
  rating: number,
  comment: string | null
): void {
  feedbackStore.push({
    comparisonId,
    rating,
    comment,
    timestamp: new Date().toISOString(),
  });
}

export function getFeedbackStats(): {
  total: number;
  averageRating: number;
} {
  if (feedbackStore.length === 0) {
    return { total: 0, averageRating: 0 };
  }

  const sum = feedbackStore.reduce((acc, f) => acc + f.rating, 0);
  return {
    total: feedbackStore.length,
    averageRating: sum / feedbackStore.length,
  };
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

/** Periodically clean expired cache entries */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of comparisonCache) {
    if (now > entry.expiresAt) {
      comparisonCache.delete(key);
    }
  }
}

// Run cleanup every 15 minutes
setInterval(cleanupExpiredEntries, 15 * 60 * 1000).unref();
