import Anthropic from "@anthropic-ai/sdk";
import { config } from "../lib/config.js";
import type { RawArticle } from "./news-fetcher.js";
import type {
  AngleAnalysis,
  SentimentScore,
  EmotionalRegister,
} from "../../../shared/types.js";

export interface ExtractedAngle {
  article: RawArticle;
  angle: AngleAnalysis;
  sentiment: SentimentScore;
}

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT = `You are a media analysis expert. Analyze the journalistic angle of a news article.

You MUST respond with valid JSON only. Use this exact schema:
{
  "headline_framing": "How the headline frames the story (1 sentence)",
  "central_entity": "The main person/org/concept the story revolves around",
  "causal_attribution": "Who/what the article attributes causality to",
  "emotional_register": "One of: alarm, neutral, optimistic, adversarial, empathetic, dismissive",
  "solution_frame": "What solution or outcome the article implies or advocates",
  "key_omissions": ["Important perspectives or facts NOT covered (up to 3)"],
  "quote_sources": [{"name": "Source name", "affiliation": "Their org/role", "stance": "Their position"}],
  "statistical_anchoring": "Key statistic or data point used to anchor the narrative, or 'none'",
  "confidence": 0.85,
  "sentiment": {
    "positive": 0.2,
    "negative": 0.3,
    "neutral": 0.5,
    "compound": -0.1
  }
}

Rules:
- confidence is 0-1, reflecting how confident you are in the angle analysis
- sentiment scores should sum to approximately 1.0 (positive + negative + neutral)
- compound sentiment ranges from -1 (very negative) to 1 (very positive)
- emotional_register must be exactly one of the six options
- Be objective and analytical; do not editorialize
- If the content is insufficient for analysis, set confidence below 0.3`;

export async function extractAngles(
  articles: RawArticle[]
): Promise<ExtractedAngle[]> {
  // Process articles in batches to avoid rate limits
  const BATCH_SIZE = 5;
  const results: ExtractedAngle[] = [];

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((article) => analyzeArticle(article))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      if (result.status === "fulfilled" && result.value) {
        results.push(result.value);
      } else if (result.status === "rejected") {
        console.warn(
          `[angle-extractor] Failed to analyze article: ${batch[j].title.slice(0, 60)}`,
          result.reason instanceof Error ? result.reason.message : result.reason
        );
      }
    }
  }

  return results;
}

async function analyzeArticle(
  article: RawArticle
): Promise<ExtractedAngle | null> {
  const articleContent = buildArticleContent(article);

  if (articleContent.length < 50) {
    return null;
  }

  const response = await client.messages.create({
    model: "claude-3-5-haiku-latest",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Analyze this article:\n\nSource: ${article.source} (${article.domain})\nTitle: ${article.title}\n\n${articleContent}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return null;
  }

  let jsonStr = textBlock.text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    console.warn(
      `[angle-extractor] Failed to parse response for: ${article.title.slice(0, 60)}`
    );
    return null;
  }

  const sentimentData = parsed.sentiment as Record<string, number> | undefined;

  const angle: AngleAnalysis = {
    headline_framing: String(parsed.headline_framing || ""),
    central_entity: String(parsed.central_entity || ""),
    causal_attribution: String(parsed.causal_attribution || ""),
    emotional_register: validateRegister(
      String(parsed.emotional_register || "neutral")
    ),
    solution_frame: String(parsed.solution_frame || ""),
    key_omissions: Array.isArray(parsed.key_omissions)
      ? parsed.key_omissions.map(String)
      : [],
    quote_sources: Array.isArray(parsed.quote_sources)
      ? (parsed.quote_sources as Array<Record<string, string>>).map((qs) => ({
          name: String(qs.name || ""),
          affiliation: String(qs.affiliation || ""),
          stance: String(qs.stance || ""),
        }))
      : [],
    statistical_anchoring: String(parsed.statistical_anchoring || "none"),
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
  };

  const sentiment: SentimentScore = {
    positive: sentimentData?.positive ?? 0.33,
    negative: sentimentData?.negative ?? 0.33,
    neutral: sentimentData?.neutral ?? 0.34,
    compound: sentimentData?.compound ?? 0,
  };

  return { article, angle, sentiment };
}

function buildArticleContent(article: RawArticle): string {
  const parts: string[] = [];

  if (article.content) {
    parts.push(article.content.slice(0, 2000));
  } else if (article.description) {
    parts.push(article.description.slice(0, 1000));
  }

  return parts.join("\n\n");
}

function validateRegister(value: string): EmotionalRegister {
  const valid: EmotionalRegister[] = [
    "alarm",
    "neutral",
    "optimistic",
    "adversarial",
    "empathetic",
    "dismissive",
  ];
  return valid.includes(value as EmotionalRegister)
    ? (value as EmotionalRegister)
    : "neutral";
}
