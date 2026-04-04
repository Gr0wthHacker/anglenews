import type { Context, Next } from "hono";

type FieldType = "string" | "number" | "boolean" | "optional_string";

/**
 * Reusable request body validation middleware.
 *
 * Checks that required fields exist and are the correct type.
 * Returns 400 with descriptive error messages listing all issues.
 *
 * Usage:
 *   route.post("/", validateBody({ headline: "string", rating: "number", comment: "optional_string" }), handler);
 */
export function validateBody(
  schema: Record<string, FieldType>
) {
  return async (c: Context, next: Next) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { success: false, error: "Invalid JSON body" },
        400
      );
    }

    const errors: string[] = [];

    for (const [field, type] of Object.entries(schema)) {
      const value = body[field];

      if (type === "optional_string") {
        // Optional: if present, must be a string
        if (value !== undefined && value !== null && typeof value !== "string") {
          errors.push(`Field '${field}' must be a string if provided`);
        }
        continue;
      }

      // Required fields
      if (value === undefined || value === null) {
        errors.push(`Missing required field: ${field}`);
        continue;
      }

      if (typeof value !== type) {
        errors.push(`Field '${field}' must be of type ${type}, got ${typeof value}`);
      }
    }

    if (errors.length > 0) {
      return c.json(
        { success: false, error: errors.join("; ") },
        400
      );
    }

    await next();
  };
}
