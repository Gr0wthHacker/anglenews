import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { corsMiddleware } from "./middleware/cors.js";
import { rateLimiter, getRateLimitStatus, getClientIP } from "./middleware/rate-limiter.js";
import { requestLogger } from "./middleware/logger.js";
import { analyzeRoute } from "./routes/analyze.js";
import { topicRoute } from "./routes/topic.js";
import { feedbackRoute } from "./routes/feedback.js";
import { trendingRoute } from "./routes/trending.js";
import { rateLimitRoute } from "./routes/rate-limit.js";
import { config } from "./lib/config.js";
import { getCacheStats } from "./services/cache.js";
import { AppError } from "./lib/errors.js";

const app = new Hono();

// ─── Global Middleware ────────────────────────────────────────────────────────

app.use("*", corsMiddleware);
app.use("*", requestLogger);
app.use("/api/*", rateLimiter);

// ─── Error Handling Middleware ────────────────────────────────────────────────

app.onError((err, c) => {
  console.error("[error]", err);

  // Handle typed AppError instances with structured responses
  if (err instanceof AppError) {
    return c.json(
      {
        success: false,
        error: err.message,
        code: err.code,
      },
      err.statusCode as 400
    );
  }

  const status = "status" in err && typeof err.status === "number" ? err.status : 500;
  const message =
    config.environment === "production"
      ? "Internal server error"
      : err.message || "Internal server error";

  return c.json(
    {
      success: false,
      error: message,
      code: "INTERNAL_ERROR",
    },
    status as 500
  );
});

// ─── Not Found Handler ───────────────────────────────────────────────────────

app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: `Route not found: ${c.req.method} ${c.req.path}`,
    },
    404
  );
});

// ─── Health Check ────────────────────────────────────────────────────────────

const startedAt = Date.now();

app.get("/api/health", (c) => {
  const ip = getClientIP(c);
  const rateLimitStatus = getRateLimitStatus(ip);
  const cacheStats = getCacheStats();

  return c.json({
    status: "ok",
    version: "1.0.0",
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    services: {
      anthropic: !!config.anthropicApiKey,
      newsdata: !!config.newsDataApiKey,
      thenewsapi: !!config.theNewsApiKey,
      gdelt: true,
      cache: cacheStats,
    },
    rateLimit: {
      remaining: rateLimitStatus.remaining,
      limit: rateLimitStatus.limit,
      resetAt: rateLimitStatus.resetAt,
    },
  });
});

// ─── Mount Routes ────────────────────────────────────────────────────────────

app.route("/api/analyze", analyzeRoute);
app.route("/api/topic", topicRoute);
app.route("/api/feedback", feedbackRoute);
app.route("/api/trending", trendingRoute);
app.route("/api/rate-limit", rateLimitRoute);

// ─── Local Development Server ────────────────────────────────────────────────

if (config.environment !== "production") {
  const port = config.port;
  console.log(`[server] Starting AngleCheck API on port ${port}`);
  console.log(`[server] Environment: ${config.environment}`);
  console.log(`[server] Anthropic API key: ${config.anthropicApiKey ? "configured" : "MISSING"}`);
  console.log(`[server] NewsData.io key: ${config.newsDataApiKey ? "configured" : "not set"}`);
  console.log(`[server] TheNewsAPI key: ${config.theNewsApiKey ? "configured" : "not set"}`);

  serve({
    fetch: app.fetch,
    port,
  });

  console.log(`[server] Listening at http://localhost:${port}`);
  console.log(`[server] Health check: http://localhost:${port}/api/health`);
}

// ─── Vercel Export ───────────────────────────────────────────────────────────

export default app;
