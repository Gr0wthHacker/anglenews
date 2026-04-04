// ─── Article Extraction ──────────────────────────────────────────────────────

export interface ArticleData {
  headline: string;
  body: string;
  byline: string | null;
  siteName: string | null;
  url: string;
  domain: string;
  publishDate: string | null;
  imageUrl: string | null;
}

// ─── Angle Decomposition (LLM output) ───────────────────────────────────────

export type EmotionalRegister =
  | "alarm"
  | "neutral"
  | "optimistic"
  | "adversarial"
  | "empathetic"
  | "dismissive";

export interface QuoteSource {
  name: string;
  affiliation: string;
  stance: string;
}

export interface AngleAnalysis {
  headline_framing: string;
  central_entity: string;
  causal_attribution: string;
  emotional_register: EmotionalRegister;
  solution_frame: string;
  key_omissions: string[];
  quote_sources: QuoteSource[];
  statistical_anchoring: string;
  confidence: number; // 0-1
}

// ─── Sentiment ───────────────────────────────────────────────────────────────

export interface SentimentScore {
  positive: number;
  negative: number;
  neutral: number;
  compound: number; // -1 to 1
}

// ─── Source Bias ─────────────────────────────────────────────────────────────

export type BiasRating =
  | "far-left"
  | "left"
  | "left-center"
  | "center"
  | "right-center"
  | "right"
  | "far-right";

export type FactualRating =
  | "very-high"
  | "high"
  | "mostly-factual"
  | "mixed"
  | "low"
  | "very-low";

export interface SourceBias {
  domain: string;
  name: string;
  biasRating: BiasRating;
  factualRating: FactualRating;
  country: string;
  mediaType: string; // "newspaper", "tv", "online", "magazine"
}

// ─── Analyzed Article ────────────────────────────────────────────────────────

export interface AnalyzedArticle {
  article: ArticleData;
  angle: AngleAnalysis;
  sentiment: SentimentScore;
  sourceBias: SourceBias | null;
}

// ─── Angle Clusters ─────────────────────────────────────────────────────────

export interface AngleCluster {
  id: string;
  label: string; // e.g., "Market Disruption", "Worker Protection"
  articles: AnalyzedArticle[];
  dominantRegister: EmotionalRegister;
  distinctiveness: number; // 0-1, how different from the "current" article
}

// ─── Coverage Gaps ───────────────────────────────────────────────────────────

export interface CoverageGap {
  description: string;
  mentionedBy: string[]; // source names that cover this angle
  missedBy: string; // the current article's source
}

// ─── Full Comparison Response ────────────────────────────────────────────────

export interface AngleComparison {
  id: string;
  topic: string;
  normalizedTopic: string;
  currentArticle: AnalyzedArticle;
  clusters: AngleCluster[];
  coverageGaps: CoverageGap[];
  toneDistribution: Record<EmotionalRegister, number>;
  totalSourcesFetched: number;
  totalSourcesAnalyzed: number;
  timestamp: string;
  cachedAt: string | null;
}

// ─── API Types ───────────────────────────────────────────────────────────────

export interface AnalyzeRequest {
  headline: string;
  body_excerpt: string;
  url: string;
  domain: string;
}

export interface AnalyzeResponse {
  success: boolean;
  comparison: AngleComparison | null;
  error: string | null;
  cached: boolean;
}

export interface TrendingTopic {
  topic: string;
  comparisonCount: number;
  sourceCount: number;
  topClusters: string[];
  lastUpdated: string;
}

// ─── Extension Messaging ─────────────────────────────────────────────────────

export type ExtensionMessage =
  | { type: "EXTRACT_ARTICLE" }
  | { type: "ARTICLE_EXTRACTED"; data: ArticleData }
  | { type: "ANALYZE_ARTICLE"; data: ArticleData }
  | { type: "ANALYSIS_COMPLETE"; data: AngleComparison }
  | { type: "ANALYSIS_ERROR"; error: string }
  | { type: "GET_CACHED"; url: string }
  | { type: "CACHED_RESULT"; data: AngleComparison | null }
  | { type: "OPEN_SIDEPANEL" };

// ─── User Preferences ───────────────────────────────────────────────────────

export interface UserPreferences {
  apiKey: string | null;
  maxSourcesPerQuery: number; // default 15
  cacheTTLHours: number; // default 4
  preferredSources: string[];
  excludedSources: string[];
  showBiasLabels: boolean; // default true
  autoDetectArticles: boolean; // default false
  theme: "light" | "dark" | "system";
  compactMode: boolean; // default false
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: string;
}
