import { API_BASE_URL } from "@shared/constants";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  AngleComparison,
  RateLimitInfo,
  TrendingTopic,
} from "@shared/types";

// ─── Error types ────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True for 5xx status codes where a retry may succeed. */
  get isRetryable(): boolean {
    return this.status >= 500 && this.status < 600;
  }

  /** True when the server indicates the client is rate-limited. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

export class ApiTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`API request timed out after ${timeoutMs}ms`);
    this.name = "ApiTimeoutError";
  }
}

export class ApiNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiNetworkError";
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 1;

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseRateLimitHeaders(headers: Headers): RateLimitInfo | null {
  const remaining = headers.get("x-ratelimit-remaining");
  const limit = headers.get("x-ratelimit-limit");
  const resetAt = headers.get("x-ratelimit-reset");

  if (remaining === null || limit === null || resetAt === null) {
    return null;
  }

  return {
    remaining: parseInt(remaining, 10),
    limit: parseInt(limit, 10),
    resetAt,
  };
}

// ─── API Client ─────────────────────────────────────────────────────────────

export class AngleCheckAPI {
  private readonly baseUrl: string;
  private lastRateLimit: RateLimitInfo | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  // ── Public methods ────────────────────────────────────────────────────

  /**
   * Send an article for angle analysis.
   */
  async analyze(request: AnalyzeRequest): Promise<AnalyzeResponse> {
    const response = await this.request<AnalyzeResponse>("/api/analyze", {
      method: "POST",
      body: JSON.stringify(request),
    });
    return response;
  }

  /**
   * Fetch a previously-cached comparison by its topic fingerprint.
   */
  async getCachedComparison(fingerprint: string): Promise<AngleComparison | null> {
    try {
      const response = await this.request<{ comparison: AngleComparison | null }>(
        `/api/comparisons/${encodeURIComponent(fingerprint)}`,
        { method: "GET" },
      );
      return response.comparison;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Submit user feedback about the accuracy of an angle comparison.
   */
  async submitFeedback(
    comparisonId: string,
    rating: number,
    correction?: string,
  ): Promise<void> {
    await this.request<{ success: boolean }>("/api/feedback", {
      method: "POST",
      body: JSON.stringify({ comparisonId, rating, correction }),
    });
  }

  /**
   * Get currently trending topics.
   */
  async getTrending(): Promise<TrendingTopic[]> {
    const response = await this.request<{ topics: TrendingTopic[] }>(
      "/api/trending",
      { method: "GET" },
    );
    return response.topics;
  }

  /**
   * Get the current rate limit status from the last response, or fetch it
   * from a lightweight endpoint if no prior request has been made.
   */
  async getRateLimitInfo(): Promise<RateLimitInfo> {
    if (this.lastRateLimit) {
      return this.lastRateLimit;
    }

    // Hit a lightweight endpoint to discover rate limit headers
    const response = await this.rawRequest("/api/rate-limit", { method: "GET" });
    const info = parseRateLimitHeaders(response.headers);
    if (info) {
      this.lastRateLimit = info;
      return info;
    }

    // Fallback: parse body
    const body = (await response.json()) as RateLimitInfo;
    this.lastRateLimit = body;
    return body;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Execute a fetch with timeout, response validation, and retry logic.
   */
  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.rawRequest(path, init);

        // Capture rate limit info from every response
        const rateLimitInfo = parseRateLimitHeaders(response.headers);
        if (rateLimitInfo) {
          this.lastRateLimit = rateLimitInfo;
        }

        if (!response.ok) {
          const errorBody = await this.safeReadBody(response);
          const apiErr = new ApiError(
            errorBody.error || errorBody.message || `HTTP ${response.status}`,
            response.status,
            errorBody.code || "UNKNOWN",
          );

          // Only retry on 5xx errors
          if (apiErr.isRetryable && attempt < MAX_RETRIES) {
            lastError = apiErr;
            continue;
          }

          throw apiErr;
        }

        const data = (await response.json()) as T;
        return data;
      } catch (err) {
        // Don't retry client errors or timeout errors
        if (err instanceof ApiError && !err.isRetryable) {
          throw err;
        }
        if (err instanceof ApiTimeoutError) {
          throw err;
        }

        lastError = err;

        // On network errors, retry once
        if (attempt < MAX_RETRIES) {
          continue;
        }
      }
    }

    // If we exhausted retries, throw the last error
    if (lastError instanceof ApiError || lastError instanceof ApiTimeoutError) {
      throw lastError;
    }

    throw new ApiNetworkError(
      lastError instanceof Error ? lastError.message : "Network request failed",
    );
  }

  /**
   * Raw fetch with timeout. Does not parse the body.
   */
  private async rawRequest(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const url = `${this.baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...init.headers,
        },
      });
      return response;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ApiTimeoutError(REQUEST_TIMEOUT_MS);
      }
      throw new ApiNetworkError(
        err instanceof Error ? err.message : "Network request failed",
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Safely attempt to read a JSON body from an error response.
   */
  private async safeReadBody(
    response: Response,
  ): Promise<Record<string, string>> {
    try {
      return (await response.json()) as Record<string, string>;
    } catch {
      return { error: response.statusText };
    }
  }
}

// ─── Singleton export ───────────────────────────────────────────────────────

export const api = new AngleCheckAPI();
