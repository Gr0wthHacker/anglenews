export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  newsDataApiKey: process.env.NEWSDATA_API_KEY || "",
  theNewsApiKey: process.env.THE_NEWS_API_KEY || "",
  port: parseInt(process.env.PORT || "3001", 10),
  environment: process.env.NODE_ENV || "development",
  cacheTTLSeconds: 7200, // 2 hours
  maxSourcesPerQuery: 15,
  rateLimitPerDay: 20,
};
