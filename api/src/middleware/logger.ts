import type { Context, Next } from "hono";
import { config } from "../lib/config.js";

/**
 * Simple request logger middleware.
 * Logs method, path, status code, and response time.
 * Only active in development mode.
 *
 * Format: [2026-04-04T12:00:00Z] POST /api/analyze 200 1234ms
 */
export async function requestLogger(c: Context, next: Next): Promise<void> {
  if (config.environment === "production") {
    await next();
    return;
  }

  const start = Date.now();

  await next();

  const elapsed = Date.now() - start;
  const timestamp = new Date().toISOString();
  const method = c.req.method;
  const path = c.req.path;
  const status = c.res.status;

  console.log(`[${timestamp}] ${method} ${path} ${status} ${elapsed}ms`);
}
