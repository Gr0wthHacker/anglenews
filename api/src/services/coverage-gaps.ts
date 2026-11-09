import type { AnalyzedArticle, CoverageGap } from "../../../shared/types.js";

/**
 * Coverage gaps: points that other outlets raised and the reader's article
 * did not mention.
 *
 * The angle extractor gives each article a `key_omissions` list: what THAT
 * article does not cover. So the candidate gaps are the current article's own
 * omissions, and a candidate is reported only when at least one other outlet's
 * coverage (its headline, body text and angle fields) actually talks about it.
 * Other articles' omissions are never used: they describe what those outlets
 * left out, not what they raised.
 */

const MAX_GAPS = 5;

/** Words too common to count as evidence that an outlet raised a point. */
const STOPWORDS = new Set([
  "about", "after", "against", "also", "among", "been", "before", "being",
  "between", "both", "could", "does", "during", "each", "from", "have",
  "into", "more", "most", "other", "over", "such", "than", "that", "their",
  "them", "then", "there", "these", "they", "this", "those", "through",
  "under", "were", "what", "when", "where", "which", "while", "will",
  "with", "within", "without", "would", "article", "story", "coverage",
  "mention", "mentions", "perspective", "perspectives", "context",
]);

/** Short prefix stem so "regulation" matches "regulations" and "policy" matches "policies". */
function stem(word: string): string {
  return word.length > 5 ? word.slice(0, 5) : word;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

function sourceName(article: AnalyzedArticle): string {
  return article.article.siteName || article.article.domain;
}

/** Everything another outlet's article says, excluding its own omissions list. */
function coverageText(article: AnalyzedArticle): string {
  const { angle } = article;
  return [
    article.article.headline,
    article.article.body,
    angle.headline_framing,
    angle.central_entity,
    angle.causal_attribution,
    angle.solution_frame,
    angle.statistical_anchoring,
    ...angle.quote_sources.map((q) => `${q.name} ${q.affiliation} ${q.stance}`),
  ]
    .filter(Boolean)
    .join(" ");
}

/** True when the other outlet's text covers enough of the omission's key words. */
function raises(omissionStems: string[], otherStems: Set<string>): boolean {
  if (omissionStems.length === 0) return false;
  const matched = omissionStems.filter((s) => otherStems.has(s)).length;
  const needed = Math.min(2, omissionStems.length);
  return matched >= needed && matched / omissionStems.length >= 0.5;
}

export function identifyCoverageGaps(
  currentArticle: AnalyzedArticle,
  otherArticles: AnalyzedArticle[]
): CoverageGap[] {
  const omissions = currentArticle.angle.key_omissions
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  if (omissions.length === 0) return [];

  const currentDomain = currentArticle.article.domain;
  const others = otherArticles
    .filter((a) => a !== currentArticle && a.article.domain !== currentDomain)
    .map((a) => ({
      name: sourceName(a),
      stems: new Set(tokenize(coverageText(a)).map(stem)),
    }));
  if (others.length === 0) return [];

  const seen = new Set<string>();
  const gaps: CoverageGap[] = [];

  for (const omission of omissions) {
    const key = omission.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const omissionStems = Array.from(new Set(tokenize(omission).map(stem)));
    const mentionedBy: string[] = [];
    for (const other of others) {
      if (raises(omissionStems, other.stems) && !mentionedBy.includes(other.name)) {
        mentionedBy.push(other.name);
      }
    }

    if (mentionedBy.length > 0) {
      gaps.push({
        description: omission,
        mentionedBy,
        missedBy: sourceName(currentArticle),
      });
    }
  }

  // Points raised by the most outlets first.
  gaps.sort((a, b) => b.mentionedBy.length - a.mentionedBy.length);
  return gaps.slice(0, MAX_GAPS);
}
