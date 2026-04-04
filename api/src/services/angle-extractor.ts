import Anthropic from "@anthropic-ai/sdk";
import type { RawArticle } from "./news-fetcher.js";
import type {
  AngleAnalysis,
  EmotionalRegister,
  QuoteSource,
  SentimentScore,
} from "../../../shared/types.js";

// Re-export for consumers that used the old interface
export interface ExtractedAngle {
  article: RawArticle;
  angle: AngleAnalysis;
  sentiment: SentimentScore;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1000;
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;

const VALID_REGISTERS: readonly EmotionalRegister[] = [
  "alarm",
  "neutral",
  "optimistic",
  "adversarial",
  "empathetic",
  "dismissive",
];

const SYSTEM_PROMPT =
  "You are a media analysis expert. Extract structured journalistic angle metadata from news articles. Always respond with valid JSON only, no markdown.";

const STRICT_SYSTEM_PROMPT =
  "You are a media analysis expert. You MUST respond with ONLY valid JSON — no markdown fences, no commentary, no explanation. Extract structured journalistic angle metadata from the provided news article.";

// ─── Prompt builder ─────────────────────────────────────────────────────────

function buildUserPrompt(headline: string, bodyText: string): string {
  return `Analyze this news article and extract the following structured metadata as JSON.

Headline: "${headline}"

Article body:
${bodyText.slice(0, 3000)}

Return a JSON object with exactly these fields:

{
  "headline_framing": "A one-sentence description of how the headline frames the story (e.g., 'Frames the policy as a threat to workers rights')",
  "central_entity": "The main person, organization, or concept the article revolves around",
  "causal_attribution": "Who or what does the article implicitly or explicitly blame/credit for the situation",
  "emotional_register": "One of: alarm, neutral, optimistic, adversarial, empathetic, dismissive",
  "solution_frame": "What solution or path forward (if any) does the article suggest or imply",
  "key_omissions": ["List of important angles, facts, or perspectives that the article does NOT cover"],
  "quote_sources": [{"name": "source name", "affiliation": "org or role", "stance": "brief stance description"}],
  "statistical_anchoring": "What key number, statistic, or data point does the article anchor its argument on (or 'none' if absent)",
  "confidence": 1.0
}

Respond with ONLY the JSON object, nothing else.`;
}

// ─── Parse & validate ───────────────────────────────────────────────────────

function parseAngleResponse(raw: string): AngleAnalysis {
  // Strip markdown code fences if the model returns them anyway
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  // Validate and coerce fields
  const analysis: AngleAnalysis = {
    headline_framing:
      typeof parsed.headline_framing === "string" ? parsed.headline_framing : "",
    central_entity:
      typeof parsed.central_entity === "string" ? parsed.central_entity : "",
    causal_attribution:
      typeof parsed.causal_attribution === "string" ? parsed.causal_attribution : "",
    emotional_register: VALID_REGISTERS.includes(
      parsed.emotional_register as EmotionalRegister
    )
      ? (parsed.emotional_register as EmotionalRegister)
      : "neutral",
    solution_frame:
      typeof parsed.solution_frame === "string" ? parsed.solution_frame : "",
    key_omissions: Array.isArray(parsed.key_omissions)
      ? parsed.key_omissions.filter((o: unknown): o is string => typeof o === "string")
      : [],
    quote_sources: Array.isArray(parsed.quote_sources)
      ? (parsed.quote_sources as unknown[])
          .filter(
            (q: unknown): q is QuoteSource =>
              typeof q === "object" &&
              q !== null &&
              typeof (q as Record<string, unknown>).name === "string" &&
              typeof (q as Record<string, unknown>).affiliation === "string" &&
              typeof (q as Record<string, unknown>).stance === "string"
          )
          .map((q) => ({
            name: q.name,
            affiliation: q.affiliation,
            stance: q.stance,
          }))
      : [],
    statistical_anchoring:
      typeof parsed.statistical_anchoring === "string"
        ? parsed.statistical_anchoring
        : "none",
    confidence: 1.0,
  };

  // Calculate confidence based on field completeness
  let filledFields = 0;
  const totalFields = 8; // excluding confidence itself

  if (analysis.headline_framing) filledFields++;
  if (analysis.central_entity) filledFields++;
  if (analysis.causal_attribution) filledFields++;
  if (analysis.emotional_register) filledFields++;
  if (analysis.solution_frame) filledFields++;
  if (analysis.key_omissions.length > 0) filledFields++;
  if (analysis.quote_sources.length > 0) filledFields++;
  if (analysis.statistical_anchoring && analysis.statistical_anchoring !== "none")
    filledFields++;

  analysis.confidence = Math.round((filledFields / totalFields) * 100) / 100;

  return analysis;
}

// ─── Single article extraction ──────────────────────────────────────────────

export async function extractAngle(
  client: Anthropic,
  headline: string,
  bodyText: string
): Promise<AngleAnalysis> {
  const userPrompt = buildUserPrompt(headline, bodyText);
  let lastError: Error | null = null;

  // Attempt up to 2 times (initial + 1 retry with stricter prompt)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: attempt === 0 ? SYSTEM_PROMPT : STRICT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });

      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text content in Claude response");
      }

      return parseAngleResponse(textBlock.text);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === 0) {
        console.warn(
          `[angle-extractor] First attempt failed for "${headline.slice(0, 60)}…", retrying with stricter prompt: ${lastError.message}`
        );
      }
    }
  }

  throw new Error(
    `[angle-extractor] Failed to extract angle after 2 attempts for "${headline.slice(0, 60)}…": ${lastError?.message}`
  );
}

// ─── Batch extraction (keyed by URL) ────────────────────────────────────────

export async function batchExtractAngles(
  client: Anthropic,
  articles: RawArticle[]
): Promise<Map<string, AngleAnalysis>> {
  const results = new Map<string, AngleAnalysis>();

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);

    const promises = batch.map((article) => {
      const body = article.content || article.description || "";
      return extractAngle(client, article.title, body);
    });

    const settled = await Promise.allSettled(promises);

    for (let j = 0; j < settled.length; j++) {
      const result = settled[j];
      const article = batch[j];

      if (result.status === "fulfilled") {
        results.set(article.url, result.value);
      } else {
        console.warn(
          `[angle-extractor] Skipping article "${article.title.slice(0, 60)}…" (${article.url}): ${result.reason}`
        );
      }
    }

    // Delay between batches to respect rate limits (skip after last batch)
    if (i + BATCH_SIZE < articles.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}

// ─── Legacy batch API (preserves backward compatibility) ────────────────────

export async function extractAngles(
  articles: RawArticle[],
  client?: Anthropic
): Promise<ExtractedAngle[]> {
  const anthropic = client ?? new Anthropic();
  const results: ExtractedAngle[] = [];

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map(async (article) => {
        const body = article.content || article.description || "";
        if (body.length < 50) return null;

        const angle = await extractAngle(anthropic, article.title, body);
        const sentiment = calculateSentiment(`${article.title} ${body}`);
        return { article, angle, sentiment };
      })
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

    // Delay between batches (skip after last batch)
    if (i + BATCH_SIZE < articles.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return results;
}

// ─── VADER-inspired sentiment analysis ──────────────────────────────────────

const POSITIVE_WORDS = new Set([
  "good", "great", "excellent", "positive", "strong", "growth", "gain", "benefit",
  "improve", "success", "win", "support", "hope", "recovery", "progress", "best",
  "better", "boost", "breakthrough", "brilliant", "calm", "celebrate", "certain",
  "champion", "cheerful", "clean", "clear", "comfortable", "commend", "confident",
  "constructive", "courage", "creative", "delight", "eager", "effective", "efficient",
  "elegant", "empower", "encourage", "enjoy", "enthusiastic", "exceptional", "exciting",
  "fair", "fantastic", "favorable", "flourish", "fortunate", "free", "freedom", "friendly",
  "fulfill", "generous", "gentle", "genuine", "glad", "graceful", "grateful", "happy",
  "harmony", "heal", "healthy", "helpful", "hero", "honest", "honor", "ideal",
  "impressive", "innovative", "inspire", "integrity", "joy", "just", "kind", "lead",
  "liberty", "love", "loyal", "magnificent", "merit", "moral", "noble", "nurture",
  "opportunity", "optimism", "outstanding", "paradise", "passion", "peace", "perfect",
  "pleasant", "pleased", "plenty", "popular", "praise", "premium", "pride", "profit",
  "promise", "proper", "prosper", "protect", "proud", "pure", "quality", "rally",
  "recommend", "reform", "relief", "remarkable", "rescue", "resolve", "respect",
  "restore", "reward", "right", "rise", "robust", "safe", "satisfy", "save", "secure",
  "smart", "solution", "stable", "strength", "succeed", "superior", "surge", "thrive",
  "top", "transform", "triumph", "trust", "upgrade", "uplift", "value", "vibrant",
  "victory", "vital", "wealth", "welcome", "wonderful",
]);

const NEGATIVE_WORDS = new Set([
  "bad", "terrible", "crisis", "threat", "loss", "decline", "fail", "damage", "risk",
  "fear", "collapse", "attack", "danger", "concern", "warning", "worst", "worse",
  "abuse", "accuse", "adverse", "agony", "alarm", "anger", "anguish", "annoy",
  "anxiety", "appalling", "assault", "atrocity", "awful", "bankrupt", "betray", "bias",
  "blame", "bleak", "bloody", "brutal", "burden", "catastrophe", "chaos", "clash",
  "coerce", "complain", "condemn", "conflict", "confuse", "corrupt", "crash", "crime",
  "cruel", "crush", "curse", "cut", "dead", "deadly", "death", "debt", "deceive",
  "defeat", "defect", "deficit", "degrade", "delay", "demolish", "deny", "deplete",
  "depress", "deprive", "despair", "destroy", "detain", "devastate", "dire", "dirty",
  "disaster", "discriminate", "disease", "disgrace", "disrupt", "distort", "distress",
  "disturb", "divide", "doom", "doubt", "downturn", "dread", "drop", "drought",
  "exploit", "expose", "extreme", "failure", "false", "fatal", "fault", "flaw",
  "flee", "flood", "force", "fraud", "grim", "guilty", "hack", "harm", "harsh",
  "hate", "hazard", "helpless", "hostile", "hurt", "illegal", "impair", "impose",
  "incompetent", "inequality", "inflation", "injure", "injustice", "insecure", "instability",
  "intimidate", "invade", "jail", "jeopardize", "kill", "lack", "lawsuit", "lie",
  "limit", "lose", "manipulation", "menace", "mislead", "mistake", "murder", "neglect",
  "obstruct", "offend", "oppose", "oppress", "outrage", "pain", "panic", "penalty",
  "peril", "pessimism", "plague", "plummet", "pollute", "poverty", "prison", "problem",
  "prohibit", "protest", "punish", "quit", "rage", "recession", "reckless", "reject",
  "resent", "resign", "restrict", "retaliate", "retreat", "ruin", "sabotage", "scandal",
  "scare", "severe", "shock", "shortage", "shrink", "sick", "slash", "slump", "smear",
  "strain", "stress", "strike", "struggle", "suffer", "suspect", "suspend", "tension",
  "terror", "threaten", "tragic", "trauma", "turmoil", "undermine", "unemployment",
  "unfortunate", "unstable", "uprising", "vandal", "victim", "violate", "violence",
  "volatile", "vulnerable", "war", "weak", "worry",
]);

const INTENSIFIERS = new Set([
  "very", "extremely", "incredibly", "significantly", "remarkably", "absolutely",
  "completely", "deeply", "enormously", "especially", "exceedingly", "exceptionally",
  "extraordinarily", "greatly", "heavily", "highly", "hugely", "immensely", "intensely",
  "largely", "massively", "notably", "overwhelmingly", "particularly", "profoundly",
  "purely", "quite", "radically", "severely", "sharply", "strikingly", "strongly",
  "substantially", "supremely", "thoroughly", "totally", "tremendously", "truly",
  "utterly", "vastly", "wildly",
]);

const NEGATORS = new Set([
  "not", "never", "no", "neither", "nor", "barely", "hardly", "scarcely",
  "seldom", "rarely", "without", "nothing", "nobody", "nowhere", "none",
  "cannot", "can't", "don't", "doesn't", "didn't", "won't", "wouldn't",
  "shouldn't", "couldn't", "isn't", "aren't", "wasn't", "weren't", "hasn't",
  "haven't", "hadn't",
]);

export function calculateSentiment(text: string): SentimentScore {
  const words = text
    .toLowerCase()
    .replace(/[^a-z'\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);

  let positiveScore = 0;
  let negativeScore = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const prevWord = i > 0 ? words[i - 1] : "";
    const prevPrevWord = i > 1 ? words[i - 2] : "";

    let multiplier = 1.0;

    // Check if previous word is an intensifier
    if (INTENSIFIERS.has(prevWord)) {
      multiplier = 1.5;
    }

    // Check if there is a negator in the preceding 1-2 words
    const negated = NEGATORS.has(prevWord) || NEGATORS.has(prevPrevWord);

    if (POSITIVE_WORDS.has(word)) {
      if (negated) {
        negativeScore += 1.0 * multiplier;
      } else {
        positiveScore += 1.0 * multiplier;
      }
    } else if (NEGATIVE_WORDS.has(word)) {
      if (negated) {
        positiveScore += 1.0 * multiplier;
      } else {
        negativeScore += 1.0 * multiplier;
      }
    }
  }

  const total = positiveScore + negativeScore;

  if (total === 0) {
    return { positive: 0, negative: 0, neutral: 1, compound: 0 };
  }

  // Normalize scores relative to word count for stable results
  const wordCount = Math.max(words.length, 1);
  const rawPositive = positiveScore / wordCount;
  const rawNegative = negativeScore / wordCount;
  const rawNeutral = Math.max(0, 1 - rawPositive - rawNegative);

  // Normalize so positive + negative + neutral = 1
  const sum = rawPositive + rawNegative + rawNeutral;
  const positive = Math.round((rawPositive / sum) * 1000) / 1000;
  const negative = Math.round((rawNegative / sum) * 1000) / 1000;
  const neutral = Math.round((1 - positive - negative) * 1000) / 1000;

  // Compound: ranges from -1 to 1
  const compound =
    Math.round(
      Math.max(
        -1,
        Math.min(
          1,
          (positiveScore - negativeScore) /
            (positiveScore + negativeScore + neutral * wordCount)
        )
      ) * 1000
    ) / 1000;

  return { positive, negative, neutral, compound };
}
