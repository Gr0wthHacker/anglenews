import { v4 as uuidv4 } from "uuid";
import type {
  AnalyzedArticle,
  AngleCluster,
  AngleComparison,
  EmotionalRegister,
} from "../../../shared/types.js";
import { EMOTIONAL_REGISTERS } from "../../../shared/constants.js";
import { identifyCoverageGaps } from "./coverage-gaps.js";

// ─── Tone distribution ─────────────────────────────────────────────────────

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
    const register = article.angle.emotional_register;
    if (register in counts) {
      counts[register]++;
    }
  }

  // Normalize to proportions (0-1)
  const total = articles.length || 1;
  const distribution: Record<EmotionalRegister, number> = { ...counts };
  for (const key of EMOTIONAL_REGISTERS) {
    distribution[key] = Math.round((counts[key] / total) * 1000) / 1000;
  }

  return distribution;
}

// ─── Build comparison ───────────────────────────────────────────────────────

export function buildComparison(
  topic: string,
  normalizedTopic: string,
  currentArticle: AnalyzedArticle,
  analyzedArticles: AnalyzedArticle[],
  clusters: AngleCluster[],
  totalFetched: number
): AngleComparison {
  // All articles includes the current one for tone distribution
  const allArticles = [currentArticle, ...analyzedArticles];

  const toneDistribution = calculateToneDistribution(allArticles);
  const coverageGaps = identifyCoverageGaps(currentArticle, analyzedArticles);

  return {
    id: uuidv4(),
    topic,
    normalizedTopic,
    currentArticle,
    clusters,
    coverageGaps,
    toneDistribution,
    totalSourcesFetched: totalFetched,
    totalSourcesAnalyzed: analyzedArticles.length + 1, // +1 for current article
    timestamp: new Date().toISOString(),
    cachedAt: null,
  };
}
