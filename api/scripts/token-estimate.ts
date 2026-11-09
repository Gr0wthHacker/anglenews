/**
 * Offline token and cost estimate for one /api/analyze request. Makes no API call.
 *
 *   npx tsx scripts/token-estimate.ts
 *
 * Tokens are estimated at 3.8 characters per token for prose and 3.2 for the JSON template, so
 * treat the numbers as a guide. For exact counts, run the same prompts through
 * client.messages.countTokens with a key.
 */
import {
  SYSTEM_PROMPT as ANGLE_SYSTEM,
  buildUserPrompt as buildAnglePrompt,
} from "../src/services/angle-extractor.js";
import {
  SYSTEM_PROMPT as TOPIC_SYSTEM,
  buildUserPrompt as buildTopicPrompt,
} from "../src/services/topic-normalizer.js";

// Anthropic pricing, Oct 2026, $ per million tokens.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};

const prose = (s: string) => Math.round(s.length / 3.8);
const json = (s: string) => Math.round(s.length / 3.2);

const ARTICLES_PER_ANALYZE = 15; // config.maxSourcesPerQuery
const ANGLE_OUT = 350; // typical JSON answer
const TOPIC_OUT = 120;

const headline = "City council passes the 2027 budget after a late-night vote";
const body = "The council voted 7 to 2 to approve the spending plan. ".repeat(60); // over 3000 chars

const template = buildAnglePrompt("", "");
const angleStatic = prose(ANGLE_SYSTEM) + json(template);
const angleDynamic = prose(buildAnglePrompt(headline, body)) - prose(template);
const topicStatic = json(TOPIC_SYSTEM);
const topicDynamic = prose(buildTopicPrompt(headline, body));

console.log("Per call, estimated tokens");
console.log(`  angle  static ${angleStatic}  dynamic ${angleDynamic}  out ~${ANGLE_OUT}`);
console.log(`  topic  static ${topicStatic}  dynamic ${topicDynamic}  out ~${TOPIC_OUT}`);
console.log("  Static prefixes are under the minimum cacheable length (4096 on Haiku 4.5, 512 on");
console.log("  Haiku 5.5), so prompt caching cannot apply; the result caches in lib/memo.ts do the saving.\n");

for (const [model, p] of Object.entries(PRICES)) {
  const angle = ((angleStatic + angleDynamic) * p.input + ANGLE_OUT * p.output) / 1e6;
  const topic = ((topicStatic + topicDynamic) * p.input + TOPIC_OUT * p.output) / 1e6;
  const cold = topic + ARTICLES_PER_ANALYZE * angle;
  console.log(model);
  console.log(`  one angle call   $${angle.toFixed(5)}`);
  console.log(`  one topic call   $${topic.toFixed(5)}`);
  console.log(`  analyze, cold    $${cold.toFixed(4)} (1 topic + ${ARTICLES_PER_ANALYZE} angles)`);
  // repeat: share of requests that re-open an article already analyzed inside the 2 h TTL.
  // Before, about half of those still missed, because the model reworded the topic and the
  // comparison cache key changed; every repeat still paid the topic call.
  // overlap: share of fetched articles already extracted for another topic in the last 24 h.
  for (const repeat of [0.2, 0.4]) {
    for (const overlap of [0.3, 0.5]) {
      const before = repeat * (topic + 0.5 * ARTICLES_PER_ANALYZE * angle) + (1 - repeat) * cold;
      const after = (1 - repeat) * (topic + ARTICLES_PER_ANALYZE * angle * (1 - overlap));
      const saved = Math.round((1 - after / before) * 100);
      console.log(
        `  repeat ${repeat * 100}%, overlap ${overlap * 100}%: $${before.toFixed(4)} -> $${after.toFixed(4)} per request (${saved}% less)`
      );
    }
  }
  console.log("");
}
