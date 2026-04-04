import { Hono } from "hono";
import { storeFeedback, getFeedbackStats } from "../services/cache.js";

const feedbackRoute = new Hono();

interface FeedbackRequest {
  comparisonId: string;
  rating: number; // 1-5
  comment?: string;
}

feedbackRoute.post("/", async (c) => {
  let body: FeedbackRequest;
  try {
    body = await c.req.json<FeedbackRequest>();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  // Validate required fields
  if (!body.comparisonId || typeof body.comparisonId !== "string") {
    return c.json(
      { success: false, error: "Missing required field: comparisonId" },
      400
    );
  }

  if (
    typeof body.rating !== "number" ||
    body.rating < 1 ||
    body.rating > 5 ||
    !Number.isInteger(body.rating)
  ) {
    return c.json(
      { success: false, error: "Rating must be an integer between 1 and 5" },
      400
    );
  }

  const comment =
    typeof body.comment === "string" ? body.comment.slice(0, 1000) : null;

  storeFeedback(body.comparisonId, body.rating, comment);

  const stats = getFeedbackStats();

  return c.json({
    success: true,
    message: "Feedback recorded",
    stats: {
      totalFeedback: stats.total,
      averageRating: Math.round(stats.averageRating * 100) / 100,
    },
  });
});

export { feedbackRoute };
