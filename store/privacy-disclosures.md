# AngleCheck: Chrome Web Store privacy disclosures (T346)

Answers for the Privacy practices tab of the Developer Dashboard, written from
the code in `extension/` and `api/` as of this commit. Each answer names the
code it rests on so it can be rechecked after changes.

## Single purpose

AngleCheck shows how other news outlets cover the story in the article the user is reading, by comparing the framing, tone and coverage gaps across sources.

## Permission justifications

Manifest: `permissions: ["activeTab", "sidePanel", "storage", "alarms"]`, `host_permissions: ["https://api.anglecheck.dev/*"]`, and a content script matching `<all_urls>`.

**activeTab**
When the user clicks the AngleCheck toolbar button, this gives temporary access to that tab so the side panel can read the tab's address and match the comparison to the article on screen (`sidepanel/App.tsx`, `background/service-worker.ts`). No access is kept after the user leaves the page.

**sidePanel**
Shows the full comparison (framing, angle groups, coverage gaps, tone and source list) in Chrome's side panel next to the article. The popup's "Open full comparison" button opens it (`background/service-worker.ts`).

**storage**
Saves the user's settings (`chrome.storage.sync`, key `userPreferences`: theme, compact mode, bias labels and the other options on the settings page, including an API key if the user enters one). Caches comparison results for 4 hours, and keeps the last 20 comparisons and last 10 topic searches so the user can reopen them (`chrome.storage.local`; `lib/cache.ts`, `HistoryPanel.tsx`, `TopicSearch.tsx`). The user can clear the cache on the settings page.

**alarms**
Runs an hourly cleanup that deletes expired cached comparisons from local storage (`background/service-worker.ts`).

**Host permission: https://api.anglecheck.dev/***
AngleCheck's own analysis server. When the user asks for a comparison, the extension sends the article's headline, up to 3,000 characters of its text, its address and its domain, and receives the comparison back (`lib/api-client.ts`). This is the only host the extension sends article data to. Separately, the side panel shows each listed outlet's icon as an image from Google's favicon service (`https://www.google.com/s2/favicons?domain=<outlet domain>`), so Google receives the domains of the outlets in a comparison (`ArticleCard.tsx`, `SourceList.tsx`). Image loads need no permission.

**Content script on all sites (`<all_urls>`)**
News articles can be on any site, so the article reader must be available on any page. The script only listens for a request from the popup or side panel; when asked, it reads the page's headline, article text, byline, site name, publish date and lead image and returns them to the extension (`contents/article-extractor.ts`). It does not read pages on its own, change pages, or send anything over the network.

## Remote code

No, I am not using remote code. All JavaScript is bundled in the package (React, Readability-style extraction and icons are built in by Vite). The extension fetches JSON data from api.anglecheck.dev and never loads or evaluates remote scripts.

## Data usage

What the extension collects (data that leaves the user's device) and the form checkbox for each:

| Category | Checked? | What and why |
|---|---|---|
| Personally identifiable information | No | Not requested or sent. |
| Health information | No | |
| Financial and payment information | No | |
| Authentication information | Yes, while the API key field exists | The settings page accepts an optional API key. It is stored in `chrome.storage.sync` and sent to api.anglecheck.dev only when the user clicks "Test connection" (`options/Options.tsx`). Analysis requests do not send it. If the field is removed, uncheck this. |
| Personal communications | No | |
| Location | No | Not collected. The server sees the requester's IP address like any web server and holds it in memory only to rate-limit requests (`api/src/middleware/rate-limiter.ts`); request logs record method, path, status and timing, not the IP (`api/src/middleware/logger.ts`). |
| Web history | Yes | The address and headline of the page the user asks AngleCheck to analyze, sent only when the user opens the popup or side panel on that page. No other browsing is recorded or sent. |
| User activity | No | No clicks, keystrokes, scrolling or mouse movement are recorded. |
| Website content | Yes | The article's headline and up to 3,000 characters of its text, sent for analysis when the user asks. |

What happens to that data on the AngleCheck server (`api/src/routes/analyze.ts`, `api/src/services/`):
- The headline and text excerpt go to Anthropic's API (Claude) to identify the story's topic and summarize framing.
- Search terms derived from the topic go to news search services (GDELT, Google News RSS, and NewsData.io or TheNewsAPI when keys are configured) to find other coverage.
- The finished comparison, which includes the analyzed article's headline and address, is kept in server memory for up to 2 hours to answer repeat requests for the same story. There is no database.
- Server logs include the first 60 characters of the headline and the detected topic for each request.

## Certifications (all three apply)

- I do not sell or transfer user data to third parties, outside of the approved use cases. (Anthropic and the news search services receive request data only to produce the comparison the user asked for.)
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Privacy policy URL

Required because the extension sends website content and page addresses to a server. A draft is in `store/privacy-policy.md`; it needs a public URL and a contact address before submission.
