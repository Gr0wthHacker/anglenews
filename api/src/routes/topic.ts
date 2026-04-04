import { Hono } from "hono";
import { getCachedComparison } from "../services/cache.js";

const topicRoute = new Hono();

topicRoute.get("/:fingerprint", async (c) => {
  const fingerprint = c.req.param("fingerprint");

  if (!fingerprint || fingerprint.length < 8) {
    return c.json(
      { success: false, error: "Invalid fingerprint", comparison: null },
      400
    );
  }

  const comparison = getCachedComparison(fingerprint);

  if (!comparison) {
    return c.json(
      {
        success: false,
        error: "Comparison not found or expired",
        comparison: null,
      },
      404
    );
  }

  return c.json({
    success: true,
    comparison,
    error: null,
    cached: true,
  });
});

export { topicRoute };
