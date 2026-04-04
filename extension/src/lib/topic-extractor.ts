/**
 * topic-extractor.ts
 *
 * Extracts a topic fingerprint from ArticleData for cache lookup and
 * deduplication. Uses regex heuristics to identify entities and key terms,
 * then generates a normalized topic string and a fast string hash.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArticleData {
  headline: string;
  body: string;
  byline: string | null;
  siteName: string | null;
  url: string;
  domain: string;
  publishDate: string | null;
  imageUrl: string | null;
}

interface TopicResult {
  topic: string;
  fingerprint: string;
  entities: string[];
}

// ---------------------------------------------------------------------------
// Stop words — common English words to exclude from key term extraction
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "also", "am",
  "an", "and", "any", "are", "aren't", "as", "at", "be", "because", "been",
  "before", "being", "below", "between", "both", "but", "by", "can", "can't",
  "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't",
  "doing", "don't", "down", "during", "each", "even", "few", "first", "for",
  "from", "further", "get", "gets", "got", "had", "hadn't", "has", "hasn't",
  "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here",
  "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i",
  "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it",
  "it's", "its", "itself", "just", "last", "let", "let's", "like", "make",
  "may", "me", "might", "more", "most", "much", "must", "mustn't", "my",
  "myself", "new", "no", "nor", "not", "now", "of", "off", "on", "once",
  "one", "only", "or", "other", "ought", "our", "ours", "ourselves", "out",
  "over", "own", "per", "put", "quite", "rather", "re", "really", "right",
  "s", "said", "same", "say", "says", "shall", "shan't", "she", "she'd",
  "she'll", "she's", "should", "shouldn't", "since", "so", "some", "still",
  "such", "t", "take", "than", "that", "that's", "the", "their", "theirs",
  "them", "themselves", "then", "there", "there's", "these", "they", "they'd",
  "they'll", "they're", "they've", "this", "those", "through", "to", "too",
  "two", "under", "until", "up", "upon", "us", "use", "used", "using",
  "very", "was", "wasn't", "way", "we", "we'd", "we'll", "we're", "we've",
  "well", "went", "were", "weren't", "what", "what's", "when", "when's",
  "where", "where's", "which", "while", "who", "who's", "whom", "why",
  "why's", "will", "with", "won't", "would", "wouldn't", "year", "years",
  "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself",
  "yourselves", "people", "time", "many", "long", "part", "number", "day",
  "days", "week", "weeks", "month", "months", "according", "back", "going",
  "around", "come", "every", "good", "great", "high", "know", "look",
  "made", "need", "old", "think", "three", "want", "work", "world",
]);

// ---------------------------------------------------------------------------
// Entity extraction — proper nouns, organizations, locations
// ---------------------------------------------------------------------------

/**
 * Extract named entities using capitalization and pattern heuristics.
 * This is a lightweight alternative to NER — sufficient for topic
 * fingerprinting.
 */
function extractEntities(text: string): string[] {
  const entities = new Map<string, number>();

  // Strategy 1: Multi-word capitalized sequences (e.g., "United States", "Joe Biden")
  // Match 2-5 consecutive capitalized words, but not at sentence start
  const multiWordPattern =
    /(?<=[.!?]\s+\w+\s+|,\s+|;\s+|\n\s*\w+\s+)([A-Z][a-z]+(?:\s+(?:of|the|and|de|van|von|al|el|la|le|bin|ibn)\s+)?(?:[A-Z][a-z]+\s*){1,4})/g;
  let match: RegExpExecArray | null;
  while ((match = multiWordPattern.exec(text)) !== null) {
    const entity = match[1].trim();
    if (entity.length >= 3 && !isCommonWord(entity)) {
      entities.set(entity, (entities.get(entity) || 0) + 1);
    }
  }

  // Strategy 2: Single capitalized words that appear mid-sentence
  // (These are likely proper nouns)
  const singleCapPattern =
    /(?<=[a-z.,;:!?]\s)([A-Z][a-z]{2,})/g;
  while ((match = singleCapPattern.exec(text)) !== null) {
    const word = match[1];
    if (!isCommonWord(word) && word.length >= 3) {
      entities.set(word, (entities.get(word) || 0) + 1);
    }
  }

  // Strategy 3: All-caps abbreviations/acronyms (e.g., NATO, FBI, WHO)
  const acronymPattern = /\b([A-Z]{2,6})\b/g;
  while ((match = acronymPattern.exec(text)) !== null) {
    const acronym = match[1];
    // Filter out common non-entity acronyms
    if (!isCommonAcronym(acronym)) {
      entities.set(acronym, (entities.get(acronym) || 0) + 1);
    }
  }

  // Strategy 4: Quoted proper names
  const quotedPattern = /[""\u201C]([A-Z][^"""\u201D]{2,40})[""\u201D]/g;
  while ((match = quotedPattern.exec(text)) !== null) {
    const quoted = match[1].trim();
    if (quoted.length >= 3 && /^[A-Z]/.test(quoted)) {
      entities.set(quoted, (entities.get(quoted) || 0) + 1);
    }
  }

  // Sort by frequency, then alphabetically
  const sorted = Array.from(entities.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([entity]) => entity);

  // Deduplicate: if a shorter entity is a substring of a longer one, keep the longer one
  const deduped: string[] = [];
  for (const entity of sorted) {
    const isSubstring = deduped.some(
      (existing) =>
        existing !== entity &&
        existing.toLowerCase().includes(entity.toLowerCase())
    );
    if (!isSubstring) {
      deduped.push(entity);
    }
  }

  return deduped.slice(0, 20);
}

function isCommonWord(word: string): boolean {
  return STOP_WORDS.has(word.toLowerCase());
}

function isCommonAcronym(acronym: string): boolean {
  const common = new Set([
    "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN", "HER",
    "WAS", "ONE", "OUR", "OUT", "HAS", "HIS", "HOW", "ITS", "MAY", "NEW",
    "NOW", "OLD", "SEE", "WAY", "WHO", "DID", "GOT", "HIM", "LET", "SAY",
    "SHE", "TOO", "USE", "AM", "AN", "AS", "AT", "BE", "BY", "DO", "GO",
    "IF", "IN", "IS", "IT", "ME", "MY", "NO", "OF", "ON", "OR", "SO",
    "TO", "UP", "US", "WE",
  ]);
  return common.has(acronym);
}

// ---------------------------------------------------------------------------
// Key term extraction
// ---------------------------------------------------------------------------

/**
 * Extract the most frequent meaningful terms from text.
 */
function extractKeyTerms(text: string, maxTerms: number = 15): string[] {
  // Tokenize: split on non-word characters, lowercase
  const words = text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

  // Count frequencies
  const freq = new Map<string, number>();
  for (const word of words) {
    // Normalize: strip trailing 's for basic stemming
    const normalized = word.replace(/'s$/, "").replace(/s$/, "");
    if (normalized.length >= 3 && !STOP_WORDS.has(normalized)) {
      freq.set(normalized, (freq.get(normalized) || 0) + 1);
    }
  }

  // Sort by frequency descending, then alphabetically
  const sorted = Array.from(freq.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([term]) => term);

  return sorted.slice(0, maxTerms);
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * FNV-1a 32-bit hash — fast, good distribution, no crypto dependency.
 */
function fnv1aHash(str: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // FNV prime: multiply by 16777619 using bit ops for speed
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert to unsigned 32-bit and then to hex
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function extractTopic(article: ArticleData): TopicResult {
  // Combine headline and body for analysis
  const fullText = `${article.headline} ${article.body}`;

  // Extract entities from the full text
  const entities = extractEntities(fullText);

  // Extract key terms (most frequent non-stopword terms)
  const keyTerms = extractKeyTerms(fullText);

  // Generate the normalized topic string:
  // Combine entity-derived terms and frequency terms, lowercase, sort, dedupe
  const allTerms = new Set<string>();

  // Add lowercased entities (split multi-word entities into individual words)
  for (const entity of entities) {
    const words = entity.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length >= 3 && !STOP_WORDS.has(word)) {
        allTerms.add(word);
      }
    }
  }

  // Add key terms
  for (const term of keyTerms) {
    allTerms.add(term);
  }

  // Sort and join for a stable, normalized topic string
  const sortedTerms = Array.from(allTerms).sort();
  const topic = sortedTerms.join(" ");

  // Generate fingerprint by hashing the topic string
  const fingerprint = fnv1aHash(topic);

  return {
    topic,
    fingerprint,
    entities,
  };
}

export { extractTopic, TopicResult, ArticleData };
