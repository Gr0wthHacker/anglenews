import type { BiasRating, EmotionalRegister, FactualRating } from "./types";

// ─── API ─────────────────────────────────────────────────────────────────────

export const API_BASE_URL = "https://api.anglecheck.dev";

// ─── Caching ─────────────────────────────────────────────────────────────────

/** Client-side cache TTL: 4 hours in milliseconds */
export const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 14_400_000

/** Server-side cache TTL: 2 hours in milliseconds */
export const SERVER_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 7_200_000

// ─── Limits ──────────────────────────────────────────────────────────────────

/** Maximum article body length sent to the API (characters) */
export const MAX_BODY_LENGTH = 3000;

/** Maximum number of comparison sources fetched per query */
export const MAX_SOURCES_PER_QUERY = 15;

/** Default rate limit (requests per hour) */
export const DEFAULT_RATE_LIMIT = 20;

// ─── Emotional Registers ─────────────────────────────────────────────────────

export const EMOTIONAL_REGISTERS: readonly EmotionalRegister[] = [
  "alarm",
  "neutral",
  "optimistic",
  "adversarial",
  "empathetic",
  "dismissive",
] as const;

// ─── Bias Rating Order (left → right) ───────────────────────────────────────

export const BIAS_RATING_ORDER: readonly BiasRating[] = [
  "far-left",
  "left",
  "left-center",
  "center",
  "right-center",
  "right",
  "far-right",
] as const;

// ─── Bias Colors ─────────────────────────────────────────────────────────────

export const BIAS_COLORS: Record<BiasRating, string> = {
  "far-left": "#1a237e",
  "left": "#1565c0",
  "left-center": "#42a5f5",
  "center": "#9e9e9e",
  "right-center": "#ef5350",
  "right": "#c62828",
  "far-right": "#b71c1c",
};

// ─── Factual Rating Colors ───────────────────────────────────────────────────

export const FACTUAL_COLORS: Record<FactualRating, string> = {
  "very-high": "#1b5e20",
  "high": "#388e3c",
  "mostly-factual": "#7cb342",
  "mixed": "#fbc02d",
  "low": "#e65100",
  "very-low": "#bf360c",
};
