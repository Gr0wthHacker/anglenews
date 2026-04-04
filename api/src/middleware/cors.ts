import { cors } from "hono/cors";

/**
 * CORS middleware configured for Chrome extension origins.
 * In production, restrict to the actual extension ID.
 * During development, allow localhost origins as well.
 */
export const corsMiddleware = cors({
  origin: (origin) => {
    // Allow Chrome extension origins
    if (origin.startsWith("chrome-extension://")) {
      return origin;
    }

    // Allow localhost during development
    if (
      origin.startsWith("http://localhost:") ||
      origin.startsWith("http://127.0.0.1:")
    ) {
      return origin;
    }

    // Allow the production frontend if any
    if (origin === "https://anglecheck.dev") {
      return origin;
    }

    return "";
  },
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  exposeHeaders: [
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
  ],
  maxAge: 86400,
  credentials: true,
});
