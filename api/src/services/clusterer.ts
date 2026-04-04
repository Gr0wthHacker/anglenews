/**
 * clusterer.ts
 *
 * Groups analyzed articles into angle clusters based on framing similarity.
 * Uses agglomerative clustering with average linkage and a weighted similarity
 * metric combining text similarity, emotional register, entity match, and
 * sentiment proximity.
 */

import { v4 as uuidv4 } from "uuid";
import type {
  AnalyzedArticle,
  AngleCluster,
  EmotionalRegister,
} from "../../../shared/types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MERGE_THRESHOLD = 0.4;
const MAX_CLUSTERS = 6;

const EMOTIONAL_REGISTERS: EmotionalRegister[] = [
  "alarm",
  "neutral",
  "optimistic",
  "adversarial",
  "empathetic",
  "dismissive",
];

const CLUSTER_STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "also", "am",
  "an", "and", "any", "are", "as", "at", "be", "because", "been", "before",
  "being", "below", "between", "both", "but", "by", "can", "could", "did",
  "do", "does", "doing", "down", "during", "each", "few", "for", "from",
  "further", "get", "got", "had", "has", "have", "having", "he", "her",
  "here", "hers", "herself", "him", "himself", "his", "how", "i", "if", "in",
  "into", "is", "it", "its", "itself", "just", "let", "like", "may", "me",
  "might", "more", "most", "much", "must", "my", "myself", "no", "nor", "not",
  "now", "of", "off", "on", "once", "only", "or", "other", "ought", "our",
  "ours", "ourselves", "out", "over", "own", "per", "quite", "re", "s",
  "said", "same", "say", "says", "shall", "she", "should", "so", "some",
  "still", "such", "t", "take", "than", "that", "the", "their", "theirs",
  "them", "themselves", "then", "there", "these", "they", "this", "those",
  "through", "to", "too", "under", "until", "up", "upon", "us", "use",
  "used", "using", "very", "was", "we", "were", "what", "when", "where",
  "which", "while", "who", "whom", "why", "will", "with", "won", "would",
  "you", "your", "yours", "yourself", "yourselves", "been", "being",
  "article", "articles", "story", "report", "reports", "news", "new",
]);

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

function tokenizeText(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter((w) => w.length >= 2 && !CLUSTER_STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

// ---------------------------------------------------------------------------
// Feature extraction
// ---------------------------------------------------------------------------

interface FeatureVector {
  textTokens: string[];
  registerOneHot: number[];
  entityTokens: string[];
  compound: number;
}

/**
 * Extract a feature vector from an analyzed article's angle analysis.
 */
export function extractFeatures(article: AnalyzedArticle): FeatureVector {
  // Combine framing, attribution, and solution tokens
  const textTokens = [
    ...tokenizeText(article.angle.headline_framing),
    ...tokenizeText(article.angle.causal_attribution),
    ...tokenizeText(article.angle.solution_frame),
  ];

  // One-hot encode emotional register
  const registerOneHot = EMOTIONAL_REGISTERS.map((r) =>
    r === article.angle.emotional_register ? 1 : 0
  );

  // Tokenize central entity
  const entityTokens = tokenizeText(article.angle.central_entity);

  return {
    textTokens,
    registerOneHot,
    entityTokens,
    compound: article.sentiment.compound,
  };
}

// ---------------------------------------------------------------------------
// Similarity computation
// ---------------------------------------------------------------------------

/**
 * Compute cosine similarity between two token arrays using term frequencies.
 */
function tokenCosineSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  const freqA = new Map<string, number>();
  for (const t of a) freqA.set(t, (freqA.get(t) || 0) + 1);

  const freqB = new Map<string, number>();
  for (const t of b) freqB.set(t, (freqB.get(t) || 0) + 1);

  const allTerms = new Set([...freqA.keys(), ...freqB.keys()]);

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const term of allTerms) {
    const va = freqA.get(term) || 0;
    const vb = freqB.get(term) || 0;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }

  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag === 0 ? 0 : dot / mag;
}

/**
 * Check if two entity token arrays refer to the same entity.
 * Returns 1 for exact match, partial credit for substring containment, else 0.
 */
function entitySimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  const strA = a.join(" ");
  const strB = b.join(" ");

  if (strA === strB) return 1;
  if (strA.includes(strB) || strB.includes(strA)) return 0.7;

  // Jaccard overlap of entity tokens
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Compute weighted similarity between two articles.
 *
 * Weights:
 *   - Text similarity (framing + attribution + solution tokens): 0.4
 *   - Same emotional register: 0.3
 *   - Same central entity: 0.2
 *   - Sentiment proximity: 0.1
 */
export function articleSimilarity(
  a: AnalyzedArticle,
  b: AnalyzedArticle
): number {
  const featA = extractFeatures(a);
  const featB = extractFeatures(b);

  // Text similarity: cosine of combined framing/attribution/solution tokens
  const textSim = tokenCosineSimilarity(featA.textTokens, featB.textTokens);

  // Emotional register: 1 if same, 0 otherwise
  const registerSim =
    a.angle.emotional_register === b.angle.emotional_register ? 1 : 0;

  // Central entity similarity
  const entSim = entitySimilarity(featA.entityTokens, featB.entityTokens);

  // Sentiment proximity: 1 - |compound_a - compound_b|
  const sentSim = 1 - Math.abs(featA.compound - featB.compound);

  return textSim * 0.4 + registerSim * 0.3 + entSim * 0.2 + sentSim * 0.1;
}

// ---------------------------------------------------------------------------
// Agglomerative clustering
// ---------------------------------------------------------------------------

interface InternalCluster {
  indices: number[];
}

/**
 * Compute average linkage similarity between two clusters.
 * Average of all pairwise similarities between members of each cluster.
 */
function averageLinkage(
  clusterA: InternalCluster,
  clusterB: InternalCluster,
  simMatrix: number[][]
): number {
  let total = 0;
  let count = 0;

  for (const i of clusterA.indices) {
    for (const j of clusterB.indices) {
      total += simMatrix[i][j];
      count++;
    }
  }

  return count > 0 ? total / count : 0;
}

/**
 * Run agglomerative clustering with average linkage.
 * Merges the two most similar clusters at each step until:
 *   - Best similarity drops below MERGE_THRESHOLD, or
 *   - We reach MAX_CLUSTERS or fewer
 */
function agglomerativeCluster(
  articles: AnalyzedArticle[]
): InternalCluster[] {
  const n = articles.length;

  if (n <= 1) {
    return n === 0 ? [] : [{ indices: [0] }];
  }

  // Build pairwise similarity matrix
  const simMatrix: number[][] = Array.from({ length: n }, () =>
    new Array(n).fill(0)
  );

  for (let i = 0; i < n; i++) {
    simMatrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const sim = articleSimilarity(articles[i], articles[j]);
      simMatrix[i][j] = sim;
      simMatrix[j][i] = sim;
    }
  }

  // Initialize: each article is its own cluster
  let clusters: InternalCluster[] = Array.from({ length: n }, (_, i) => ({
    indices: [i],
  }));

  // Merge until stopping conditions
  while (clusters.length > 1) {
    // If already at or below MAX_CLUSTERS and no pair exceeds threshold, stop
    let bestSim = -1;
    let bestI = -1;
    let bestJ = -1;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sim = averageLinkage(clusters[i], clusters[j], simMatrix);
        if (sim > bestSim) {
          bestSim = sim;
          bestI = i;
          bestJ = j;
        }
      }
    }

    // Stop if similarity is below threshold (but allow merging down to MAX_CLUSTERS)
    if (bestSim < MERGE_THRESHOLD && clusters.length <= MAX_CLUSTERS) {
      break;
    }

    // If we are at max clusters and best similarity is below threshold, stop
    if (bestSim < MERGE_THRESHOLD) {
      // Still too many clusters but nothing to merge meaningfully;
      // force merge the most similar pair
      if (clusters.length > MAX_CLUSTERS) {
        // merge anyway to reduce cluster count
      } else {
        break;
      }
    }

    // Merge bestI and bestJ
    const merged: InternalCluster = {
      indices: [...clusters[bestI].indices, ...clusters[bestJ].indices],
    };

    // Remove in reverse order to preserve indices
    const toRemove = [bestI, bestJ].sort((a, b) => b - a);
    for (const idx of toRemove) {
      clusters.splice(idx, 1);
    }
    clusters.push(merged);
  }

  return clusters;
}

// ---------------------------------------------------------------------------
// Cluster labeling
// ---------------------------------------------------------------------------

/**
 * Generate a short 2-4 word label for a cluster based on the most common
 * headline framing keywords across its members.
 */
export function generateClusterLabel(articles: AnalyzedArticle[]): string {
  if (articles.length === 0) return "Uncategorized";

  // Collect word frequencies from headline_framing across all articles
  const wordFreq = new Map<string, number>();

  for (const article of articles) {
    const words = tokenizeText(article.angle.headline_framing);
    const seen = new Set<string>();
    for (const w of words) {
      // Count each word once per article (document frequency)
      if (!seen.has(w)) {
        wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
        seen.add(w);
      }
    }
  }

  // Also consider central entity words
  const entityFreq = new Map<string, number>();
  for (const article of articles) {
    const entity = article.angle.central_entity;
    entityFreq.set(entity, (entityFreq.get(entity) || 0) + 1);
  }

  // Get top entity
  let topEntity = "";
  let maxEntityCount = 0;
  for (const [entity, count] of entityFreq) {
    if (count > maxEntityCount) {
      maxEntityCount = count;
      topEntity = entity;
    }
  }

  // Get top framing words (sorted by frequency, then alphabetically)
  const sortedWords = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word);

  // Build label: up to 2 framing keywords, capitalized
  const framingWords = sortedWords.slice(0, 2).map(capitalizeWord);

  if (framingWords.length >= 2) {
    return framingWords.join(" ");
  }

  if (framingWords.length === 1 && topEntity) {
    // Use entity + framing word
    const entityShort =
      topEntity.length > 20 ? topEntity.split(/\s+/)[0] : topEntity;
    return `${entityShort} ${framingWords[0]}`;
  }

  if (topEntity) {
    return topEntity.length > 30 ? topEntity.split(/\s+/).slice(0, 3).join(" ") : topEntity;
  }

  // Fallback: use dominant register label
  const dominant = getDominantRegister(articles);
  const registerLabels: Record<EmotionalRegister, string> = {
    alarm: "Risk Focus",
    neutral: "Factual Reporting",
    optimistic: "Opportunity Frame",
    adversarial: "Conflict Frame",
    empathetic: "Human Impact",
    dismissive: "Skeptical Take",
  };

  return registerLabels[dominant];
}

function capitalizeWord(word: string): string {
  if (word.length === 0) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// ---------------------------------------------------------------------------
// Dominant register
// ---------------------------------------------------------------------------

/**
 * Get the mode of emotional_register across cluster members.
 */
export function getDominantRegister(
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

// ---------------------------------------------------------------------------
// Distinctiveness scoring
// ---------------------------------------------------------------------------

/**
 * For a cluster, calculate how different it is from the current article.
 * Computes average similarity of cluster members to current article, then
 * inverts: distinctiveness = 1 - avgSimilarity.
 */
function calculateDistinctiveness(
  clusterArticles: AnalyzedArticle[],
  currentArticle: AnalyzedArticle
): number {
  if (clusterArticles.length === 0) return 1;

  let totalSim = 0;
  for (const article of clusterArticles) {
    totalSim += articleSimilarity(article, currentArticle);
  }

  const avgSim = totalSim / clusterArticles.length;
  return 1 - avgSim;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Cluster analyzed articles by angle similarity, then score each cluster
 * for distinctiveness relative to the current article.
 *
 * Algorithm:
 * 1. Extract feature vectors from each article's angle analysis
 * 2. Compute pairwise similarity matrix
 * 3. Agglomerative clustering with average linkage (threshold 0.4, max 6 clusters)
 * 4. Label clusters using dominant framing keywords
 * 5. Score distinctiveness relative to currentArticle
 * 6. Sort by distinctiveness (most different first)
 */
export function clusterArticles(
  articles: AnalyzedArticle[],
  currentArticle: AnalyzedArticle
): AngleCluster[] {
  if (articles.length === 0) return [];

  // Run agglomerative clustering
  const internalClusters = agglomerativeCluster(articles);

  // Convert to output format with labeling and scoring
  const angleClusters: AngleCluster[] = internalClusters
    .filter((c) => c.indices.length > 0)
    .map((cluster) => {
      const clusterArticles = cluster.indices.map((i) => articles[i]);
      const dominantRegister = getDominantRegister(clusterArticles);
      const label = generateClusterLabel(clusterArticles);
      const distinctiveness = calculateDistinctiveness(
        clusterArticles,
        currentArticle
      );

      return {
        id: uuidv4(),
        label,
        articles: clusterArticles,
        dominantRegister,
        distinctiveness,
      };
    });

  // Sort by distinctiveness (most different from current article first)
  angleClusters.sort((a, b) => b.distinctiveness - a.distinctiveness);

  return angleClusters;
}
