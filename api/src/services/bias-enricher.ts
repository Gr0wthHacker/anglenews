import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { BiasRating, FactualRating, SourceBias } from "../../../shared/types.js";

// ─── Load bias data ─────────────────────────────────────────────────────────

// With NodeNext module resolution we resolve the JSON path relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BIAS_DATA_PATH = resolve(__dirname, "..", "..", "..", "..", "shared", "bias-ratings.json");

interface BiasEntry {
  domain: string;
  name: string;
  biasRating: BiasRating;
  factualRating: FactualRating;
  country: string;
  mediaType: string;
}

let biasEntries: BiasEntry[];
try {
  const raw = readFileSync(BIAS_DATA_PATH, "utf-8");
  biasEntries = JSON.parse(raw) as BiasEntry[];
} catch (err) {
  console.error(`[bias-enricher] Failed to load bias-ratings.json from ${BIAS_DATA_PATH}:`, err);
  biasEntries = [];
}

// ─── Build lookup map ───────────────────────────────────────────────────────

const biasMap: Map<string, SourceBias> = new Map();

function initBiasMap(): void {
  for (const entry of biasEntries) {
    const bias: SourceBias = {
      domain: entry.domain,
      name: entry.name,
      biasRating: entry.biasRating,
      factualRating: entry.factualRating,
      country: entry.country,
      mediaType: entry.mediaType,
    };
    // Index by the canonical domain
    biasMap.set(normalizeDomain(entry.domain), bias);
  }
}

// ─── Domain normalization ───────────────────────────────────────────────────

function normalizeDomain(domain: string): string {
  let d = domain.toLowerCase().trim();

  // Strip protocol if present
  d = d.replace(/^https?:\/\//, "");

  // Strip trailing path
  d = d.split("/")[0];

  // Strip www. prefix
  d = d.replace(/^www\./, "");

  return d;
}

/**
 * Extracts the parent domain by stripping the leftmost subdomain.
 * e.g., "edition.cnn.com" -> "cnn.com"
 *       "news.bbc.co.uk" -> "bbc.co.uk"
 */
function getParentDomain(domain: string): string | null {
  const parts = domain.split(".");
  // Need at least 3 parts to strip a subdomain (sub.domain.tld)
  if (parts.length <= 2) return null;
  return parts.slice(1).join(".");
}

// Initialize on module load
initBiasMap();

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Look up bias information for a domain.
 * Handles www. prefixes, subdomains, and common domain variations.
 */
export function getSourceBias(domain: string): SourceBias | null {
  const normalized = normalizeDomain(domain);

  // Direct lookup
  const direct = biasMap.get(normalized);
  if (direct) return direct;

  // Try stripping subdomains progressively
  let candidate = normalized;
  while (true) {
    const parent = getParentDomain(candidate);
    if (!parent) break;
    const found = biasMap.get(parent);
    if (found) return found;
    candidate = parent;
  }

  return null;
}

/**
 * Return all known source bias entries.
 */
export function getAllSources(): SourceBias[] {
  return Array.from(biasMap.values());
}

/**
 * Return sources that match a specific bias rating.
 */
export function getSourcesByBias(rating: BiasRating): SourceBias[] {
  return Array.from(biasMap.values()).filter((s) => s.biasRating === rating);
}
