/**
 * deduplicator.ts
 *
 * Removes duplicate articles from combined fetch results using multiple
 * strategies: URL normalization, title cosine similarity (TF-IDF-like),
 * same-source dedup, and near-duplicate content detection.
 */

import type { RawArticle } from "./news-fetcher.js";

// ---------------------------------------------------------------------------
// Stop words (200+ common English words)
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a", "about", "above", "across", "after", "afterwards", "again", "against",
  "all", "almost", "alone", "along", "already", "also", "although", "always",
  "am", "among", "amongst", "an", "and", "another", "any", "anyhow", "anyone",
  "anything", "anyway", "anywhere", "are", "aren't", "around", "as", "at",
  "back", "be", "became", "because", "become", "becomes", "becoming", "been",
  "before", "beforehand", "behind", "being", "below", "beside", "besides",
  "between", "beyond", "both", "but", "by", "can", "can't", "cannot", "could",
  "couldn't", "dare", "daren't", "did", "didn't", "do", "does", "doesn't",
  "doing", "don't", "done", "down", "during", "each", "either", "else",
  "elsewhere", "enough", "etc", "even", "ever", "every", "everyone",
  "everything", "everywhere", "except", "few", "first", "for", "former",
  "formerly", "from", "further", "get", "gets", "getting", "give", "given",
  "go", "goes", "going", "gone", "got", "had", "hadn't", "has", "hasn't",
  "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here",
  "here's", "hers", "herself", "him", "himself", "his", "how", "how's",
  "however", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is",
  "isn't", "it", "it's", "its", "itself", "just", "keep", "kept", "know",
  "known", "last", "later", "latter", "latterly", "least", "less", "let",
  "let's", "like", "likewise", "long", "look", "lot", "lots", "made", "make",
  "makes", "many", "may", "me", "mean", "meanwhile", "might", "mine", "more",
  "moreover", "most", "mostly", "much", "must", "mustn't", "my", "myself",
  "name", "namely", "need", "needn't", "neither", "never", "nevertheless",
  "new", "next", "no", "nobody", "none", "nor", "not", "nothing", "now",
  "nowhere", "of", "off", "often", "oh", "on", "once", "one", "only", "onto",
  "or", "other", "others", "otherwise", "ought", "our", "ours", "ourselves",
  "out", "over", "own", "part", "per", "perhaps", "please", "put", "quite",
  "rather", "re", "really", "regarding", "right", "s", "said", "same", "say",
  "says", "see", "seem", "seemed", "seeming", "seems", "several", "shall",
  "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "show",
  "since", "so", "some", "somehow", "someone", "something", "sometime",
  "sometimes", "somewhere", "still", "such", "sure", "t", "take", "taken",
  "tell", "than", "that", "that's", "the", "their", "theirs", "them",
  "themselves", "then", "thence", "there", "there's", "thereafter", "thereby",
  "therefore", "therein", "thereupon", "these", "they", "they'd", "they'll",
  "they're", "they've", "thing", "things", "think", "this", "those", "though",
  "through", "throughout", "thus", "to", "together", "too", "toward",
  "towards", "two", "under", "unless", "unlike", "unlikely", "until", "up",
  "upon", "us", "use", "used", "uses", "using", "usually", "very", "via",
  "want", "was", "wasn't", "way", "we", "we'd", "we'll", "we're", "we've",
  "well", "went", "were", "weren't", "what", "what's", "whatever", "when",
  "when's", "whence", "whenever", "where", "where's", "whereafter", "whereas",
  "whereby", "wherein", "whereupon", "wherever", "whether", "which", "while",
  "whither", "who", "who's", "whoever", "whole", "whom", "whose", "why",
  "why's", "will", "with", "within", "without", "won't", "would", "wouldn't",
  "yet", "you", "you'd", "you'll", "you're", "you've", "your", "yours",
  "yourself", "yourselves", "year", "years", "people", "time", "day", "days",
  "week", "weeks", "month", "months", "according", "come", "every", "good",
  "great", "high", "old", "work", "world", "number", "three",
]);

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Normalize a URL for dedup comparison:
 * - Strip protocol (http/https)
 * - Strip www. prefix
 * - Remove query parameters and fragments
 * - Remove trailing slashes
 * - Lowercase
 */
export function normalizeUrl(url: string): string {
  try {
    let normalized = url.trim().toLowerCase();

    // Strip protocol
    normalized = normalized.replace(/^https?:\/\//, "");

    // Strip www.
    normalized = normalized.replace(/^www\./, "");

    // Remove query string and fragment
    normalized = normalized.replace(/[?#].*$/, "");

    // Remove trailing slashes
    normalized = normalized.replace(/\/+$/, "");

    return normalized;
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * Tokenize text into lowercase words, removing punctuation and stop words.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];

  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

/**
 * Compute cosine similarity between two arrays of tokens.
 * Builds term-frequency vectors and computes the cosine of the angle between them.
 */
export function cosineSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  // Build term frequency maps
  const freqA = new Map<string, number>();
  for (const token of a) {
    freqA.set(token, (freqA.get(token) || 0) + 1);
  }

  const freqB = new Map<string, number>();
  for (const token of b) {
    freqB.set(token, (freqB.get(token) || 0) + 1);
  }

  // Collect all unique terms
  const allTerms = new Set([...freqA.keys(), ...freqB.keys()]);

  // Compute dot product and magnitudes
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (const term of allTerms) {
    const valA = freqA.get(term) || 0;
    const valB = freqB.get(term) || 0;
    dotProduct += valA * valB;
    magA += valA * valA;
    magB += valB * valB;
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Compute word overlap ratio between two texts.
 * Returns a value between 0 and 1 representing the fraction of words
 * from the smaller set that appear in the larger set.
 */
export function wordOverlap(textA: string, textB: string): number {
  if (!textA || !textB) return 0;

  const wordsA = new Set(tokenize(textA));
  const wordsB = new Set(tokenize(textB));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) {
      intersection++;
    }
  }

  // Normalize by the smaller set size to detect when a short description
  // is a near-subset of a longer one
  const minSize = Math.min(wordsA.size, wordsB.size);
  return intersection / minSize;
}

/**
 * Get the combined content length of an article.
 */
function contentLength(article: RawArticle): number {
  let len = 0;
  if (article.content) len += article.content.length;
  if (article.description) len += article.description.length;
  return len;
}

/**
 * Parse a date string into a timestamp, returning 0 if unparseable.
 */
function parseDate(dateStr: string | null): number {
  if (!dateStr) return 0;
  const ts = Date.parse(dateStr);
  return isNaN(ts) ? 0 : ts;
}

/**
 * Choose the "better" article between two candidates.
 * Prefers more content, then more recent publication date.
 */
function chooseBetter(a: RawArticle, b: RawArticle): RawArticle {
  const lenA = contentLength(a);
  const lenB = contentLength(b);

  if (lenA !== lenB) return lenA > lenB ? a : b;

  const dateA = parseDate(a.publishedAt);
  const dateB = parseDate(b.publishedAt);

  return dateA >= dateB ? a : b;
}

// ---------------------------------------------------------------------------
// Deduplication strategies
// ---------------------------------------------------------------------------

/**
 * Step 1: URL deduplication.
 * Normalize URLs and remove exact matches, keeping the better article.
 */
function deduplicateByUrl(articles: RawArticle[]): RawArticle[] {
  const urlMap = new Map<string, RawArticle>();

  for (const article of articles) {
    const normalized = normalizeUrl(article.url);
    const existing = urlMap.get(normalized);

    if (!existing) {
      urlMap.set(normalized, article);
    } else {
      urlMap.set(normalized, chooseBetter(existing, article));
    }
  }

  return Array.from(urlMap.values());
}

/**
 * Step 2: Title similarity dedup using cosine similarity.
 * If cosine similarity of title tokens > 0.8, treat as duplicate.
 */
function deduplicateByTitle(articles: RawArticle[]): RawArticle[] {
  if (articles.length <= 1) return articles;

  const tokenizedTitles = articles.map((a) => tokenize(a.title));
  const removed = new Set<number>();

  for (let i = 0; i < articles.length; i++) {
    if (removed.has(i)) continue;

    for (let j = i + 1; j < articles.length; j++) {
      if (removed.has(j)) continue;

      const sim = cosineSimilarity(tokenizedTitles[i], tokenizedTitles[j]);
      if (sim > 0.8) {
        const better = chooseBetter(articles[i], articles[j]);
        if (better === articles[i]) {
          removed.add(j);
        } else {
          removed.add(i);
          break; // i is removed, stop comparing it
        }
      }
    }
  }

  return articles.filter((_, idx) => !removed.has(idx));
}

/**
 * Step 3: Same-source dedup.
 * Within articles from the same domain, merge near-duplicates using a lower
 * title similarity threshold (0.6) and keep the best version.
 */
function deduplicateBySameSource(articles: RawArticle[]): RawArticle[] {
  if (articles.length <= 1) return articles;

  const domainGroups = new Map<string, RawArticle[]>();

  for (const article of articles) {
    const domain = article.domain.toLowerCase();
    const group = domainGroups.get(domain) || [];
    group.push(article);
    domainGroups.set(domain, group);
  }

  const result: RawArticle[] = [];

  for (const [, group] of domainGroups) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    const removedIndices = new Set<number>();

    for (let i = 0; i < group.length; i++) {
      if (removedIndices.has(i)) continue;

      for (let j = i + 1; j < group.length; j++) {
        if (removedIndices.has(j)) continue;

        const titleSim = cosineSimilarity(
          tokenize(group[i].title),
          tokenize(group[j].title)
        );

        // Lower threshold for same-source articles
        if (titleSim > 0.6) {
          const better = chooseBetter(group[i], group[j]);
          if (better === group[i]) {
            removedIndices.add(j);
          } else {
            removedIndices.add(i);
            break;
          }
        }
      }
    }

    for (let k = 0; k < group.length; k++) {
      if (!removedIndices.has(k)) {
        result.push(group[k]);
      }
    }
  }

  return result;
}

/**
 * Step 4: Near-duplicate content dedup.
 * If two articles have > 85% word overlap in their descriptions, keep the longer one.
 */
function deduplicateByContent(articles: RawArticle[]): RawArticle[] {
  if (articles.length <= 1) return articles;

  const removed = new Set<number>();

  for (let i = 0; i < articles.length; i++) {
    if (removed.has(i)) continue;
    if (!articles[i].description) continue;

    for (let j = i + 1; j < articles.length; j++) {
      if (removed.has(j)) continue;
      if (!articles[j].description) continue;

      const overlap = wordOverlap(
        articles[i].description,
        articles[j].description
      );

      if (overlap > 0.85) {
        const better = chooseBetter(articles[i], articles[j]);
        if (better === articles[i]) {
          removed.add(j);
        } else {
          removed.add(i);
          break;
        }
      }
    }
  }

  return articles.filter((_, idx) => !removed.has(idx));
}

// ---------------------------------------------------------------------------
// Main dedup pipeline
// ---------------------------------------------------------------------------

/**
 * Run all deduplication strategies in sequence:
 * 1. URL dedup (normalize and remove exact URL matches)
 * 2. Title similarity dedup (cosine similarity > 0.8)
 * 3. Same-source dedup (within same domain, lower threshold)
 * 4. Near-duplicate content dedup (description word overlap > 85%)
 */
export function deduplicateArticles(articles: RawArticle[]): RawArticle[] {
  if (articles.length <= 1) return [...articles];

  let result = deduplicateByUrl(articles);
  result = deduplicateByTitle(result);
  result = deduplicateBySameSource(result);
  result = deduplicateByContent(result);

  return result;
}

export { STOP_WORDS };
