import { Hono } from "hono";
import { getRateLimitStatus, getClientIP } from "../middleware/rate-limiter.js";

const rateLimitRoute = new Hono();

/**
 * GET /api/rate-limit
 * Returns the current rate limit status for the requesting IP.
 */
rateLimitRoute.get("/", (c) => {
  const ip = getClientIP(c);
  const status = getRateLimitStatus(ip);

  return c.json({
    remaining: status.remaining,
    limit: status.limit,
    resetAt: status.resetAt,
  });
});

export { rateLimitRoute };
