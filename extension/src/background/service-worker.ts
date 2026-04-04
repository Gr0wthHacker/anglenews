import { CACHE_TTL_MS, MAX_BODY_LENGTH } from "@shared/constants";
import type {
  AngleComparison,
  AnalyzeRequest,
  ArticleData,
  ExtensionMessage,
} from "@shared/types";
import { cache } from "../lib/cache";
import { api, ApiError, ApiTimeoutError, ApiNetworkError } from "../lib/api-client";

// ─── Types ──────────────────────────────────────────────────────────────────

type AnalysisStatus = "idle" | "extracting" | "analyzing" | "complete" | "error";

interface TabState {
  status: AnalysisStatus;
  data?: AngleComparison;
  error?: string;
  url?: string;
}

// ─── State ──────────────────────────────────────────────────────────────────

const tabStates = new Map<number, TabState>();

const CACHE_CLEANUP_ALARM = "ac_cache_cleanup";
const CLEANUP_INTERVAL_MINUTES = 60;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a deterministic cache fingerprint from headline + domain.
 * Keeps it simple: lowercase, strip non-alphanumeric, then hash.
 */
function buildFingerprint(headline: string, domain: string): string {
  const normalized = `${headline.toLowerCase().trim()}|${domain.toLowerCase().trim()}`
    .replace(/[^a-z0-9|]/g, "");

  // Simple djb2-style hash converted to hex
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) >>> 0;
  }
  return `fp_${hash.toString(16)}`;
}

function getTabState(tabId: number): TabState {
  let state = tabStates.get(tabId);
  if (!state) {
    state = { status: "idle" };
    tabStates.set(tabId, state);
  }
  return state;
}

function setTabState(tabId: number, patch: Partial<TabState>): void {
  const current = getTabState(tabId);
  tabStates.set(tabId, { ...current, ...patch });
}

/**
 * Broadcast a message to all extension contexts (side panel, popup, etc.).
 * Silently ignores errors when no listeners are connected.
 */
function broadcast(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // No receivers — this is normal when the side panel is closed.
  });
}

// ─── Main analysis flow ─────────────────────────────────────────────────────

async function analyzeArticle(
  article: ArticleData,
  senderTabId: number | undefined,
): Promise<void> {
  const tabId = senderTabId ?? -1;

  try {
    // 1. Mark as extracting (data received from content script)
    setTabState(tabId, { status: "extracting", url: article.url });

    // 2. Build fingerprint
    const fingerprint = buildFingerprint(article.headline, article.domain);

    // 3. Check local cache
    const cached = await cache.get<AngleComparison>(fingerprint);
    if (cached) {
      setTabState(tabId, { status: "complete", data: cached });
      broadcast({ type: "ANALYSIS_COMPLETE", data: cached });
      return;
    }

    // 4. Cache miss — call backend API
    setTabState(tabId, { status: "analyzing" });

    const request: AnalyzeRequest = {
      headline: article.headline,
      body_excerpt: article.body.slice(0, MAX_BODY_LENGTH),
      url: article.url,
      domain: article.domain,
    };

    const response = await api.analyze(request);

    if (!response.success || !response.comparison) {
      const errorMsg = response.error || "Analysis returned no comparison data.";
      setTabState(tabId, { status: "error", error: errorMsg });
      broadcast({ type: "ANALYSIS_ERROR", error: errorMsg });
      return;
    }

    // 5. Cache the result
    await cache.set(fingerprint, response.comparison, CACHE_TTL_MS);

    // 6. Update state and broadcast
    setTabState(tabId, { status: "complete", data: response.comparison });
    broadcast({ type: "ANALYSIS_COMPLETE", data: response.comparison });
  } catch (err) {
    let errorMessage: string;

    if (err instanceof ApiTimeoutError) {
      errorMessage = "The analysis request timed out. Please try again.";
    } else if (err instanceof ApiError) {
      if (err.isRateLimited) {
        errorMessage = "Rate limit exceeded. Please wait a few minutes and try again.";
      } else {
        errorMessage = `Analysis failed: ${err.message}`;
      }
    } else if (err instanceof ApiNetworkError) {
      errorMessage = "Could not connect to the AngleCheck server. Check your internet connection.";
    } else {
      errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
    }

    setTabState(tabId, { status: "error", error: errorMessage });
    broadcast({ type: "ANALYSIS_ERROR", error: errorMessage });
  }
}

// ─── Extension icon click ───────────────────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return;

  // Enable the side panel for this tab
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "src/sidepanel/index.html",
    enabled: true,
  });

  // Open it
  await chrome.sidePanel.open({ tabId: tab.id });
});

// ─── Message router ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ): boolean => {
    const senderTabId = sender.tab?.id;

    switch (message.type) {
      case "ANALYZE_ARTICLE": {
        // Run async analysis — respond immediately, result comes via broadcast
        analyzeArticle(message.data, senderTabId);
        sendResponse({ received: true });
        return false;
      }

      case "GET_CACHED": {
        // Look up a cached comparison by URL fingerprint
        handleGetCached(message.url, sendResponse);
        return true; // will call sendResponse asynchronously
      }

      case "GET_ANALYSIS_STATUS": {
        // Return current tab state. The side panel doesn't have a tab id of
        // its own, so we find the active tab.
        handleGetAnalysisStatus(sendResponse);
        return true; // async
      }

      case "OPEN_SIDEPANEL": {
        handleOpenSidePanel();
        sendResponse({ opened: true });
        return false;
      }

      default:
        return false;
    }
  },
);

async function handleGetCached(
  url: string,
  sendResponse: (response?: unknown) => void,
): Promise<void> {
  try {
    // We don't know the headline for fingerprinting from just a URL, so we
    // do a reverse lookup: scan cached entries whose stored data matches the URL.
    // For efficiency, also try a simple URL-based key.
    const urlKey = `url_${url}`;
    const result = await cache.get<AngleComparison>(urlKey);
    sendResponse({ type: "CACHED_RESULT", data: result } satisfies ExtensionMessage);
  } catch {
    sendResponse({ type: "CACHED_RESULT", data: null } satisfies ExtensionMessage);
  }
}

async function handleGetAnalysisStatus(
  sendResponse: (response?: unknown) => void,
): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tab?.id;

    if (tabId === undefined) {
      sendResponse({
        type: "ANALYSIS_STATUS",
        status: "idle" as const,
      });
      return;
    }

    const state = getTabState(tabId);
    sendResponse({
      type: "ANALYSIS_STATUS",
      status: state.status,
      data: state.data ?? state.error,
    });
  } catch {
    sendResponse({
      type: "ANALYSIS_STATUS",
      status: "idle" as const,
    });
  }
}

async function handleOpenSidePanel(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) {
      await chrome.sidePanel.setOptions({
        tabId: tab.id,
        path: "src/sidepanel/index.html",
        enabled: true,
      });
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  } catch {
    // Side panel API may not be available in all contexts
  }
}

// ─── Tab update listener ────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener(
  (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
    // Reset analysis state when the tab navigates to a new page
    if (changeInfo.url) {
      const previous = tabStates.get(tabId);
      if (previous?.url !== changeInfo.url) {
        tabStates.set(tabId, { status: "idle", url: changeInfo.url });
      }
    }
  },
);

// Clean up state for closed tabs
chrome.tabs.onRemoved.addListener((tabId: number) => {
  tabStates.delete(tabId);
});

// ─── Periodic cache cleanup via alarms ──────────────────────────────────────

chrome.alarms.create(CACHE_CLEANUP_ALARM, {
  periodInMinutes: CLEANUP_INTERVAL_MINUTES,
});

chrome.alarms.onAlarm.addListener(async (alarm: chrome.alarms.Alarm) => {
  if (alarm.name === CACHE_CLEANUP_ALARM) {
    const removed = await cache.cleanup();
    if (removed > 0) {
      console.log(`[AngleCheck] Cache cleanup: removed ${removed} expired entries.`);
    }
  }
});

// ─── Service worker startup log ─────────────────────────────────────────────

console.log("[AngleCheck] Service worker started.");
