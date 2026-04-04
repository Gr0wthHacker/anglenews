import { v4 as uuidv4 } from "uuid";
import type {
  AnalyzedArticle,
  AngleCluster,
  AngleComparison,
  CoverageGap,
  EmotionalRegister,
} from "../../../shared/types.js";
import { EMOTIONAL_REGISTERS } from "../../../shared/constants.js";

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

// ─── Coverage gap detection ─────────────────────────────────────────────────

function identifyCoverageGaps(
  currentArticle: AnalyzedArticle,
  otherArticles: AnalyzedArticle[]
): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  const currentOmissions = new Set(
    currentArticle.angle.key_omissions.map((o) => o.toLowerCase().trim())
  );

  if (currentOmissions.size === 0) return gaps;

  // For each omission in the current article, check if other articles cover it.
  // We do a fuzzy match: if any other article's headline_framing, causal_attribution,
  // solution_frame, or key text touches on the omission, we flag it.
  for (const omission of currentArticle.angle.key_omissions) {
    const omissionLower = omission.toLowerCase();
    const omissionWords = omissionLower
      .split(/\s+/)
      .filter((w) => w.length > 3); // skip short words

    const mentionedBy: string[] = [];

    for (const other of otherArticles) {
      // Build a combined text of the other article's angle fields
      const otherText = [
        other.angle.headline_framing,
        other.angle.central_entity,
        other.angle.causal_attribution,
        other.angle.solution_frame,
        other.angle.statistical_anchoring,
        other.article.headline,
      ]
        .join(" ")
        .toLowerCase();

      // Check if a meaningful number of the omission's words appear in the other article
      const matchCount = omissionWords.filter((w) => otherText.includes(w)).length;
      const matchRatio = omissionWords.length > 0 ? matchCount / omissionWords.length : 0;

      if (matchRatio >= 0.4) {
        const sourceName = other.article.siteName || other.article.domain;
        if (!mentionedBy.includes(sourceName)) {
          mentionedBy.push(sourceName);
        }
      }
    }

    if (mentionedBy.length > 0) {
      gaps.push({
        description: omission,
        mentionedBy,
        missedBy: currentArticle.article.siteName || currentArticle.article.domain,
      });
    }
  }

  return gaps;
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
