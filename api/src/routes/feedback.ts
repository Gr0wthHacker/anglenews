import { Hono } from "hono";
import { storeFeedback, getFeedbackStats } from "../services/cache.js";
import { validateBody } from "../middleware/validator.js";

const feedbackRoute = new Hono();

interface FeedbackRequest {
  comparisonId: string;
  rating: number; // 1-5
  comment?: string;
}

feedbackRoute.post(
  "/",
  validateBody({
    comparisonId: "string",
    rating: "number",
    comment: "optional_string",
  }),
  async (c) => {
  const body = c.get("validatedBody") as FeedbackRequest;

  // Additional validation: rating range
  if (
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
