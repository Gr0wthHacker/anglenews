# AngleCheck

**Chrome extension for multi-source journalistic angle comparison.**

See how other outlets cover the story you're reading — without leaving the page.

## What It Does

Click the AngleCheck icon while reading any news article. It:
1. Extracts the article's topic and content from the page
2. Fetches coverage from 10+ sources via 4 news APIs
3. Analyzes each article's journalistic angle via Claude Haiku
4. Renders a comparison dashboard in your browser's side panel

You see: which outlets frame the story differently, what angles your current article misses, and how tone varies across the coverage spectrum.

## Architecture

```
anglecheck/
├── extension/          # Chrome Manifest V3 extension (React + Tailwind + Vite)
│   ├── src/
│   │   ├── background/     # Service worker — API orchestration, caching
│   │   ├── contents/       # Content script — article extraction from any page
│   │   ├── sidepanel/      # Main comparison dashboard (13 React components)
│   │   ├── popup/          # Compact popup with top 3 contrasting angles
│   │   ├── options/        # Settings page — API keys, source prefs, display
│   │   └── lib/            # Shared utilities — cache, API client, topic extraction
│   └── assets/icons/       # Extension icons (16/48/128px)
├── api/                # Backend API (Hono on Vercel)
│   └── src/
│       ├── routes/         # /analyze, /topic, /feedback, /trending, /health
│       ├── services/       # News fetching, angle extraction, clustering, dedup
│       ├── middleware/     # CORS, rate limiting, validation, logging
│       └── lib/            # Config, error types
└── shared/             # Shared TypeScript types, constants, bias ratings DB
```

## Quick Start

### Prerequisites
- Node.js 18+
- npm or pnpm

### 1. Install dependencies

```bash
npm install
cd extension && npm install
cd ../api && npm install
```

### 2. Configure API keys

```bash
cp api/.env.example api/.env
```

Edit `api/.env` and add:
- `ANTHROPIC_API_KEY` — Required. Get one at [console.anthropic.com](https://console.anthropic.com)
- `NEWSDATA_API_KEY` — Optional. Free at [newsdata.io](https://newsdata.io)
- `THE_NEWS_API_KEY` — Optional. Free at [thenewsapi.com](https://thenewsapi.com)

GDELT and Google News RSS work without keys.

### 3. Start the backend

```bash
cd api
npm run dev
# Runs on http://localhost:3001
```

### 4. Build the extension

```bash
cd extension
npm run dev    # Watch mode with HMR
# or
npm run build  # Production build → dist/
```

### 5. Load in Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/dist/` folder
5. Navigate to any news article and click the AngleCheck icon

## Development

### Run tests

```bash
# API tests
cd api && npm test

# Extension tests
cd extension && npm test

# All tests
npm test
```

### Test suites (10 total)
- `deduplicator.test.ts` — URL normalization, title cosine similarity, content overlap
- `clusterer.test.ts` — Feature extraction, similarity scoring, cluster merging
- `angle-extractor.test.ts` — VADER-inspired sentiment analysis
- `topic-extractor.test.ts` — Entity extraction, fingerprint generation
- `news-fetcher.test.ts` — Multi-source fetch with mocked APIs
- `bias-enricher.test.ts` — Domain matching, subdomain handling
- `cache.test.ts` — TTL, fingerprinting, trending topics
- `comparison-builder.test.ts` — Tone distribution, coverage gaps
- `analyze.test.ts` — Route validation, orchestration pipeline
- `health.test.ts` — Health endpoint responses

### Key technologies
- **Extension**: React 18, Tailwind CSS, Vite, Chrome Manifest V3
- **Backend**: Hono, Anthropic SDK (Claude Haiku), TypeScript
- **News APIs**: NewsData.io, GDELT, Google News RSS, TheNewsAPI
- **Analysis**: LLM-powered angle extraction, VADER-inspired sentiment, agglomerative clustering

## News Sources

AngleCheck includes bias ratings for 57 outlets from across the political spectrum, sourced from Media Bias/Fact Check methodology:

| Rating | Examples |
|--------|----------|
| Far Left | Jacobin, The Intercept |
| Left | CNN, MSNBC, HuffPost, Vox |
| Left-Center | NYT, WaPo, NPR, BBC, AP |
| Center | Reuters, AP, The Hill, Bloomberg |
| Right-Center | WSJ, The Economist, Forbes |
| Right | Fox News, NY Post, Washington Examiner |
| Far Right | Breitbart, Daily Wire, OANN |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/analyze` | Analyze article, fetch comparisons |
| GET | `/api/topic/:fingerprint` | Get cached comparison |
| POST | `/api/feedback` | Submit angle correction |
| GET | `/api/trending` | Top 10 compared topics |
| GET | `/api/health` | Service status + rate limits |
| GET | `/api/rate-limit` | Current rate limit status |

Rate limit: 20 comparisons/day (free tier).

## License

MIT
