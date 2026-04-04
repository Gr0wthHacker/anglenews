import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { corsMiddleware } from "./middleware/cors.js";
import { rateLimiter } from "./middleware/rate-limiter.js";
import { analyzeRoute } from "./routes/analyze.js";
import { topicRoute } from "./routes/topic.js";
import { feedbackRoute } from "./routes/feedback.js";
import { trendingRoute } from "./routes/trending.js";
import { config } from "./lib/config.js";

const app = new Hono();

// ─── Global Middleware ────────────────────────────────────────────────────────

app.use("*", corsMiddleware);
app.use("/api/*", rateLimiter);

// ─── Error Handling Middleware ────────────────────────────────────────────────

app.onError((err, c) => {
  console.error("[error]", err);

  const status = "status" in err && typeof err.status === "number" ? err.status : 500;
  const message =
    config.environment === "production"
      ? "Internal server error"
      : err.message || "Internal server error";

  return c.json(
    {
      success: false,
      error: message,
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

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: config.environment,
    version: "1.0.0",
  });
});

// ─── Mount Routes ────────────────────────────────────────────────────────────

app.route("/api/analyze", analyzeRoute);
app.route("/api/topic", topicRoute);
app.route("/api/feedback", feedbackRoute);
app.route("/api/trending", trendingRoute);

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
