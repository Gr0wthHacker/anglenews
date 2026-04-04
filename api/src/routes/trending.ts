import { Hono } from "hono";
import { getTrendingTopics } from "../services/cache.js";

const trendingRoute = new Hono();

trendingRoute.get("/", async (c) => {
  const limitParam = c.req.query("limit");
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 10), 50) : 10;

  const topics = getTrendingTopics(limit);

  return c.json({
    success: true,
    topics,
    count: topics.length,
  });
});

export { trendingRoute };
