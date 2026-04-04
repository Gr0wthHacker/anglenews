import type { Context, Next } from "hono";
import { config } from "../lib/config.js";

interface WindowEntry {
  timestamps: number[];
}

/**
 * In-memory sliding window rate limiter.
 * Tracks requests per IP with a 24-hour window.
 *
 * For production, replace with Redis-backed implementation.
 */
const windows = new Map<string, WindowEntry>();

// Clean up stale entries every 10 minutes
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

let lastCleanup = Date.now();

function cleanup(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const cutoff = now - WINDOW_MS;
  for (const [key, entry] of windows.entries()) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) {
      windows.delete(key);
    }
  }
}

function getClientIP(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    c.req.header("cf-connecting-ip") ||
    "unknown"
  );
}

export async function rateLimiter(c: Context, next: Next): Promise<Response | void> {
  // Skip rate limiting for health checks
  if (c.req.path === "/api/health") {
    return next();
  }

  cleanup();

  const ip = getClientIP(c);
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const limit = config.rateLimitPerDay;

  let entry = windows.get(ip);
  if (!entry) {
    entry = { timestamps: [] };
    windows.set(ip, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  const remaining = Math.max(0, limit - entry.timestamps.length);
  const resetAt = entry.timestamps.length > 0
    ? new Date(entry.timestamps[0] + WINDOW_MS).toISOString()
    : new Date(now + WINDOW_MS).toISOString();

  // Set rate limit headers on all responses
  c.header("X-RateLimit-Limit", String(limit));
  c.header("X-RateLimit-Remaining", String(remaining));
  c.header("X-RateLimit-Reset", resetAt);

  if (entry.timestamps.length >= limit) {
    const retryAfterSeconds = Math.ceil(
      (entry.timestamps[0] + WINDOW_MS - now) / 1000
    );
    c.header("Retry-After", String(retryAfterSeconds));

    return c.json(
      {
        success: false,
        error: "Rate limit exceeded. Free tier allows 20 requests per day.",
        retryAfter: retryAfterSeconds,
      },
      429
    );
  }

  // Record this request
  entry.timestamps.push(now);

  // Update remaining after recording
  c.header("X-RateLimit-Remaining", String(remaining - 1));

  await next();
}
