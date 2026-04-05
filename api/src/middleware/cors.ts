import { cors } from "hono/cors";
import { config } from "../lib/config.js";

/**
 * CORS middleware configured for Chrome extension origins.
 * Localhost origins are only allowed in non-production environments.
 */
export const corsMiddleware = cors({
  origin: (origin) => {
    // Allow Chrome extension origins
    if (origin.startsWith("chrome-extension://")) {
      return origin;
    }

    // Allow localhost only in development/test
    if (
      config.environment !== "production" &&
      (origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:"))
    ) {
      return origin;
    }

    // Allow the production frontend
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
