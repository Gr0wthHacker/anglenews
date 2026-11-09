import Anthropic from "@anthropic-ai/sdk";
import { config } from "../lib/config.js";
import { createMemo, hashKey } from "../lib/memo.js";
import { logUsage } from "../lib/usage.js";

export interface NormalizedTopic {
  topic: string;
  entities: string[];
  dateContext: string;
  searchQueries: string[];
}

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const EXCERPT_CHARS = 1500;
const TOPIC_CACHE_MAX = 5000;

export const SYSTEM_PROMPT = `You are a news topic normalizer. Given a headline and body excerpt from a news article, extract the core topic and key information.

You MUST respond with valid JSON only, no markdown or explanation. Use this exact schema:
{
  "topic": "A concise, neutral description of the core news event or topic (max 15 words)",
  "entities": ["Array of key entities: people, organizations, places mentioned"],
  "dateContext": "Relevant date context (e.g., 'April 2026', 'ongoing since March 2026')",
  "searchQueries": ["2-3 optimized search queries for finding related articles from news APIs"]
}

Rules:
- The topic should be neutral and factual, stripped of any editorial framing
- Entities should include the most important 3-7 proper nouns
- Search queries should vary in specificity: one broad, one specific, one entity-focused
- Search queries should be optimized for news API search (short, keyword-focused)`;

export function buildUserPrompt(headline: string, bodyExcerpt: string): string {
  return `Headline: ${headline}\n\nBody excerpt: ${bodyExcerpt.slice(0, EXCERPT_CHARS)}`;
}

/**
 * The model words the same topic a little differently on each call, and the comparison cache is
 * keyed by that wording. Reusing the first answer for the same article keeps a repeat view on the
 * cached comparison instead of paying for a whole new analysis. Same TTL as the comparison cache.
 */
const topicCache = createMemo<NormalizedTopic>(config.cacheTTLSeconds * 1000, TOPIC_CACHE_MAX);

/** For tests. */
export function clearTopicCache(): void {
  topicCache.clear();
}

export async function normalizeTopic(
  headline: string,
  bodyExcerpt: string
): Promise<NormalizedTopic> {
  const key = hashKey(config.anthropicModel, headline, bodyExcerpt.slice(0, EXCERPT_CHARS));
  return topicCache.get(key, () => normalizeTopicUncached(headline, bodyExcerpt));
}

async function normalizeTopicUncached(
  headline: string,
  bodyExcerpt: string
): Promise<NormalizedTopic> {
  const response = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(headline, bodyExcerpt) }],
  });
  logUsage("topic", config.anthropicModel, response.usage);

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  const raw = textBlock.text.trim();

  // Try to extract JSON from the response (handle markdown fences if present)
  let jsonStr = raw;
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse topic normalization response: ${raw.slice(0, 200)}`);
  }

  const result = parsed as Record<string, unknown>;

  // Validate required fields
  if (
    typeof result.topic !== "string" ||
    !Array.isArray(result.entities) ||
    typeof result.dateContext !== "string" ||
    !Array.isArray(result.searchQueries)
  ) {
    throw new Error("Invalid topic normalization response structure");
  }

  return {
    topic: result.topic,
    entities: result.entities.map(String),
    dateContext: result.dateContext,
    searchQueries: result.searchQueries.map(String),
  };
}
