import Anthropic from "@anthropic-ai/sdk";
import { config } from "../lib/config.js";

export interface NormalizedTopic {
  topic: string;
  entities: string[];
  dateContext: string;
  searchQueries: string[];
}

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const SYSTEM_PROMPT = `You are a news topic normalizer. Given a headline and body excerpt from a news article, extract the core topic and key information.

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

export async function normalizeTopic(
  headline: string,
  bodyExcerpt: string
): Promise<NormalizedTopic> {
  const userPrompt = `Headline: ${headline}\n\nBody excerpt: ${bodyExcerpt.slice(0, 1500)}`;

  const response = await client.messages.create({
    model: "claude-3-5-haiku-latest",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

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
