import { v4 as uuidv4 } from "uuid";
import type {
  AnalyzedArticle,
  AngleCluster,
  EmotionalRegister,
} from "../../../shared/types.js";

/**
 * Groups analyzed articles into clusters based on angle similarity.
 * Uses a simple greedy approach: each article is assigned to the most similar
 * existing cluster, or starts a new one if similarity is too low.
 */
export function clusterArticles(
  articles: AnalyzedArticle[],
  currentArticleDomain: string
): AngleCluster[] {
  if (articles.length === 0) return [];

  const clusters: InternalCluster[] = [];
  const SIMILARITY_THRESHOLD = 0.35;

  for (const article of articles) {
    let bestCluster: InternalCluster | null = null;
    let bestScore = 0;

    for (const cluster of clusters) {
      const score = clusterSimilarity(article, cluster);
      if (score > bestScore && score >= SIMILARITY_THRESHOLD) {
        bestScore = score;
        bestCluster = cluster;
      }
    }

    if (bestCluster) {
      bestCluster.articles.push(article);
    } else {
      clusters.push({
        articles: [article],
      });
    }
  }

  // Convert to output format
  return clusters
    .filter((c) => c.articles.length > 0)
    .map((cluster) => {
      const dominantRegister = getDominantRegister(cluster.articles);
      const label = generateClusterLabel(cluster.articles);
      const distinctiveness = calculateDistinctiveness(
        cluster.articles,
        currentArticleDomain
      );

      return {
        id: uuidv4(),
        label,
        articles: cluster.articles,
        dominantRegister,
        distinctiveness,
      };
    })
    .sort((a, b) => b.articles.length - a.articles.length);
}

// ─── Internal Types ─────────────────────────────────────────────────────────

interface InternalCluster {
  articles: AnalyzedArticle[];
}

// ─── Similarity ─────────────────────────────────────────────────────────────

function clusterSimilarity(
  article: AnalyzedArticle,
  cluster: InternalCluster
): number {
  // Compare against the first article in the cluster as representative
  const representative = cluster.articles[0];
  return angleSimilarity(article, representative);
}

function angleSimilarity(a: AnalyzedArticle, b: AnalyzedArticle): number {
  let score = 0;
  let weights = 0;

  // Emotional register match (weight: 3)
  if (a.angle.emotional_register === b.angle.emotional_register) {
    score += 3;
  }
  weights += 3;

  // Central entity overlap (weight: 2)
  if (
    a.angle.central_entity.toLowerCase() ===
    b.angle.central_entity.toLowerCase()
  ) {
    score += 2;
  } else if (
    a.angle.central_entity
      .toLowerCase()
      .includes(b.angle.central_entity.toLowerCase()) ||
    b.angle.central_entity
      .toLowerCase()
      .includes(a.angle.central_entity.toLowerCase())
  ) {
    score += 1;
  }
  weights += 2;

  // Causal attribution similarity (weight: 2)
  const causalSim = wordOverlap(
    a.angle.causal_attribution,
    b.angle.causal_attribution
  );
  score += causalSim * 2;
  weights += 2;

  // Solution frame similarity (weight: 1.5)
  const solutionSim = wordOverlap(
    a.angle.solution_frame,
    b.angle.solution_frame
  );
  score += solutionSim * 1.5;
  weights += 1.5;

  // Sentiment direction match (weight: 1.5)
  const sentDiff = Math.abs(a.sentiment.compound - b.sentiment.compound);
  score += (1 - sentDiff) * 1.5;
  weights += 1.5;

  return score / weights;
}

function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(
    a
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  const wordsB = new Set(
    b
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

// ─── Cluster Metadata ───────────────────────────────────────────────────────

function getDominantRegister(
  articles: AnalyzedArticle[]
): EmotionalRegister {
  const counts = new Map<EmotionalRegister, number>();

  for (const article of articles) {
    const register = article.angle.emotional_register;
    counts.set(register, (counts.get(register) || 0) + 1);
  }

  let maxCount = 0;
  let dominant: EmotionalRegister = "neutral";

  for (const [register, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      dominant = register;
    }
  }

  return dominant;
}

function generateClusterLabel(articles: AnalyzedArticle[]): string {
  // Use the most common central entity and emotional register to create a label
  const entities = new Map<string, number>();
  const framings = new Map<string, number>();

  for (const article of articles) {
    const entity = article.angle.central_entity;
    entities.set(entity, (entities.get(entity) || 0) + 1);

    // Extract key framing words
    const words = article.angle.headline_framing
      .split(/\s+/)
      .filter((w) => w.length > 4);
    for (const word of words) {
      framings.set(word.toLowerCase(), (framings.get(word.toLowerCase()) || 0) + 1);
    }
  }

  // Get top entity
  let topEntity = "";
  let maxEntityCount = 0;
  for (const [entity, count] of entities) {
    if (count > maxEntityCount) {
      maxEntityCount = count;
      topEntity = entity;
    }
  }

  // Get dominant register for the label suffix
  const dominant = getDominantRegister(articles);
  const registerLabels: Record<EmotionalRegister, string> = {
    alarm: "Risk Focus",
    neutral: "Factual Reporting",
    optimistic: "Opportunity Frame",
    adversarial: "Conflict Frame",
    empathetic: "Human Impact",
    dismissive: "Skeptical Take",
  };

  if (topEntity) {
    return `${topEntity} — ${registerLabels[dominant]}`;
  }

  return registerLabels[dominant];
}

function calculateDistinctiveness(
  clusterArticles: AnalyzedArticle[],
  currentArticleDomain: string
): number {
  // Check if the current article's domain is in this cluster
  const hasCurrentDomain = clusterArticles.some(
    (a) => a.article.domain === currentArticleDomain
  );

  if (hasCurrentDomain) {
    // This cluster contains the same source, so it's less "distinctive"
    return 0.2;
  }

  // Calculate based on how different the emotional registers are from the cluster average
  const registers = clusterArticles.map((a) => a.angle.emotional_register);
  const uniqueRegisters = new Set(registers).size;

  // More uniform = more distinctive as a cohesive angle
  const uniformity = 1 - (uniqueRegisters - 1) / 5;

  // Average confidence also matters
  const avgConfidence =
    clusterArticles.reduce((sum, a) => sum + a.angle.confidence, 0) /
    clusterArticles.length;

  return Math.min(1, uniformity * 0.6 + avgConfidence * 0.4);
}
