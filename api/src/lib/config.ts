export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  newsDataApiKey: process.env.NEWSDATA_API_KEY || "",
  theNewsApiKey: process.env.THE_NEWS_API_KEY || "",
  port: parseInt(process.env.PORT || "3001", 10),
  environment: process.env.NODE_ENV || "development",
  cacheTTLSeconds: 7200, // 2 hours
  // One model id for every Claude call. ANTHROPIC_MODEL lets a cheaper model be trialled without a deploy.
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
  // An article's text does not change its angle: identical input reuses the earlier extraction.
  angleCacheTTLSeconds: 86400, // 24 hours
  maxSourcesPerQuery: 15,
  rateLimitPerDay: 20,
};
