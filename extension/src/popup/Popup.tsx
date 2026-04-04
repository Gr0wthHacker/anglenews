import React, { useCallback, useEffect, useRef, useState } from "react";
import { Settings, Search, ExternalLink, AlertTriangle, RefreshCw } from "lucide-react";
import type {
  EmotionalRegister,
  BiasRating,
  SourceBias,
  AngleAnalysis,
  SentimentScore,
  ArticleData,
  AnalyzedArticle,
  AngleCluster,
  AngleComparison,
  ExtensionMessage,
} from "@shared/types";

// ─── Constants ──────────────────────────────────────────────────────────────

const BIAS_COLORS: Record<BiasRating, string> = {
  "far-left": "#1a237e",
  left: "#1565c0",
  "left-center": "#42a5f5",
  center: "#9e9e9e",
  "right-center": "#ef5350",
  right: "#c62828",
  "far-right": "#b71c1c",
};

const BIAS_LABELS: Record<BiasRating, string> = {
  "far-left": "Far Left",
  left: "Left",
  "left-center": "Left-Center",
  center: "Center",
  "right-center": "Right-Center",
  right: "Right",
  "far-right": "Far Right",
};

const REGISTER_CONFIG: Record<EmotionalRegister, { label: string; color: string; bg: string }> = {
  alarm: { label: "Alarm", color: "text-red-700", bg: "bg-red-50" },
  neutral: { label: "Neutral", color: "text-gray-600", bg: "bg-gray-50" },
  optimistic: { label: "Optimistic", color: "text-emerald-700", bg: "bg-emerald-50" },
  adversarial: { label: "Adversarial", color: "text-orange-700", bg: "bg-orange-50" },
  empathetic: { label: "Empathetic", color: "text-blue-700", bg: "bg-blue-50" },
  dismissive: { label: "Dismissive", color: "text-amber-700", bg: "bg-amber-50" },
};

type PopupState =
  | { kind: "loading"; message: string }
  | { kind: "not-article" }
  | { kind: "results"; data: AngleComparison }
  | { kind: "error"; message: string };

// ─── Helper components ──────────────────────────────────────────────────────

function BiasBadge({ rating }: { rating: BiasRating }) {
  const color = BIAS_COLORS[rating];
  const label = BIAS_LABELS[rating];
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-white whitespace-nowrap"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}

function RegisterChip({ register }: { register: EmotionalRegister }) {
  const config = REGISTER_CONFIG[register];
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-tight ${config.color} ${config.bg} whitespace-nowrap`}
    >
      {config.label}
    </span>
  );
}

function SentimentDot({ compound }: { compound: number }) {
  const hue = compound > 0 ? 142 : compound < 0 ? 0 : 45;
  const saturation = Math.round(Math.abs(compound) * 80 + 20);
  const lightness = 45;
  const bg = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

  return (
    <span
      className="inline-block h-2 w-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: bg }}
      title={`Sentiment: ${compound > 0 ? "+" : ""}${compound.toFixed(2)}`}
    />
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-blue-600"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ─── Main Popup component ───────────────────────────────────────────────────

export default function Popup() {
  const [state, setState] = useState<PopupState>({ kind: "loading", message: "Checking status..." });
  const [searchTopic, setSearchTopic] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const hasInitiated = useRef(false);

  // Listen for broadcast messages from the service worker
  useEffect(() => {
    function onMessage(message: ExtensionMessage) {
      if (message.type === "ANALYSIS_COMPLETE") {
        setState({ kind: "results", data: message.data });
      } else if (message.type === "ANALYSIS_ERROR") {
        setState({ kind: "error", message: message.error });
      }
    }

    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  // On mount: check status, then extract if idle
  useEffect(() => {
    if (hasInitiated.current) return;
    hasInitiated.current = true;

    chrome.runtime.sendMessage({ type: "GET_ANALYSIS_STATUS" } satisfies ExtensionMessage, (response) => {
      if (chrome.runtime.lastError) {
        setState({ kind: "error", message: "Could not connect to the extension background." });
        return;
      }

      if (!response) {
        initiateExtraction();
        return;
      }

      const { status, data } = response;

      if (status === "complete" && data && typeof data === "object" && data.id) {
        setState({ kind: "results", data: data as AngleComparison });
      } else if (status === "analyzing" || status === "extracting") {
        setState({ kind: "loading", message: "Analyzing..." });
      } else if (status === "error" && typeof data === "string") {
        setState({ kind: "error", message: data });
      } else {
        // idle -- kick off extraction
        initiateExtraction();
      }
    });
  }, []);

  const initiateExtraction = useCallback(() => {
    setState({ kind: "loading", message: "Extracting article..." });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        setState({ kind: "not-article" });
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_ARTICLE" } satisfies ExtensionMessage, (response) => {
        if (chrome.runtime.lastError || !response) {
          setState({ kind: "not-article" });
          return;
        }

        if (response.type === "EXTRACTION_FAILED" || !response.data) {
          setState({ kind: "not-article" });
          return;
        }

        const articleData = response.data as ArticleData;

        // Simple heuristic: if the body is too short, it's probably not a news article
        if (!articleData.body || articleData.body.trim().length < 80) {
          setState({ kind: "not-article" });
          return;
        }

        setState({ kind: "loading", message: "Analyzing..." });
        chrome.runtime.sendMessage(
          { type: "ANALYZE_ARTICLE", data: articleData } satisfies ExtensionMessage,
          () => {
            if (chrome.runtime.lastError) {
              setState({ kind: "error", message: "Failed to start analysis." });
            }
          },
        );
      });
    });
  }, []);

  const handleRetry = useCallback(() => {
    hasInitiated.current = false;
    setState({ kind: "loading", message: "Retrying..." });
    initiateExtraction();
  }, [initiateExtraction]);

  const handleManualSearch = useCallback(() => {
    const topic = searchTopic.trim();
    if (!topic || isSearching) return;

    setIsSearching(true);
    setState({ kind: "loading", message: "Searching..." });

    // Build a synthetic ArticleData for a topic-only search
    const syntheticArticle: ArticleData = {
      headline: topic,
      body: topic,
      byline: null,
      siteName: null,
      url: "",
      domain: "manual-search",
      publishDate: null,
      imageUrl: null,
    };

    chrome.runtime.sendMessage(
      { type: "ANALYZE_ARTICLE", data: syntheticArticle } satisfies ExtensionMessage,
      () => {
        setIsSearching(false);
        if (chrome.runtime.lastError) {
          setState({ kind: "error", message: "Failed to search topic." });
        }
      },
    );
  }, [searchTopic, isSearching]);

  const handleOpenSidePanel = useCallback(() => {
    chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" } satisfies ExtensionMessage, () => {
      window.close();
    });
  }, []);

  const handleOpenOptions = useCallback(() => {
    chrome.runtime.openOptionsPage();
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="w-[380px] max-h-[500px] flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold tracking-tight text-gray-900">
            Angle<span className="text-blue-600">Check</span>
          </span>
        </div>
        <button
          onClick={handleOpenOptions}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          title="Settings"
        >
          <Settings size={16} />
        </button>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {state.kind === "loading" && <LoadingView message={state.message} />}
        {state.kind === "not-article" && (
          <NotArticleView
            searchTopic={searchTopic}
            onSearchTopicChange={setSearchTopic}
            onSearch={handleManualSearch}
            isSearching={isSearching}
          />
        )}
        {state.kind === "error" && (
          <ErrorView message={state.message} onRetry={handleRetry} />
        )}
        {state.kind === "results" && (
          <ResultsView data={state.data} onOpenSidePanel={handleOpenSidePanel} />
        )}
      </div>
    </div>
  );
}

// ─── State views ────────────────────────────────────────────────────────────

function LoadingView({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-6">
      <Spinner />
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

function NotArticleView({
  searchTopic,
  onSearchTopicChange,
  onSearch,
  isSearching,
}: {
  searchTopic: string;
  onSearchTopicChange: (v: string) => void;
  onSearch: () => void;
  isSearching: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 px-5">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100">
        <AlertTriangle size={20} className="text-gray-400" />
      </div>
      <p className="text-sm text-gray-500 text-center leading-relaxed">
        This doesn't appear to be a news article.
      </p>
      <div className="w-full space-y-2">
        <p className="text-xs text-gray-400 text-center">Search a topic manually instead:</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSearch();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={searchTopic}
            onChange={(e) => onSearchTopicChange(e.target.value)}
            placeholder="e.g., AI regulation policy"
            className="flex-1 text-sm rounded-lg border border-gray-200 px-3 py-2 text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-colors"
          />
          <button
            type="submit"
            disabled={!searchTopic.trim() || isSearching}
            className="flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Search size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 px-5">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-50">
        <AlertTriangle size={20} className="text-red-500" />
      </div>
      <p className="text-sm text-gray-600 text-center leading-relaxed">{message}</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
      >
        <RefreshCw size={14} />
        Try again
      </button>
    </div>
  );
}

function ResultsView({
  data,
  onOpenSidePanel,
}: {
  data: AngleComparison;
  onOpenSidePanel: () => void;
}) {
  const { currentArticle, clusters, totalSourcesFetched, totalSourcesAnalyzed } = data;
  const { article, angle, sourceBias } = currentArticle;

  // Get top 3 most distinctive clusters (excluding any that only contain the current article)
  const topClusters = [...clusters]
    .sort((a, b) => b.distinctiveness - a.distinctiveness)
    .slice(0, 3);

  // Count unique sources across all clusters
  const uniqueSources = new Set<string>();
  for (const cluster of clusters) {
    for (const a of cluster.articles) {
      uniqueSources.add(a.article.domain);
    }
  }

  return (
    <div className="flex flex-col">
      {/* "You're reading" card */}
      <div className="mx-3 mt-3 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1.5">
          You're reading
        </p>
        <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">
          {article.headline}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          on <span className="font-medium text-gray-600">{article.siteName || article.domain}</span>
        </p>
        <div className="flex items-center gap-1.5 mt-2">
          {sourceBias && <BiasBadge rating={sourceBias.biasRating} />}
          <RegisterChip register={angle.emotional_register} />
        </div>
      </div>

      {/* Contrasting angles */}
      {topClusters.length > 0 && (
        <div className="mt-3 px-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-2">
            Contrasting angles
          </p>
          <div className="space-y-2">
            {topClusters.map((cluster) => (
              <ClusterCard key={cluster.id} cluster={cluster} />
            ))}
          </div>
        </div>
      )}

      {/* Open full comparison button */}
      <div className="px-3 mt-3">
        <button
          onClick={onOpenSidePanel}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          Open full comparison
          <ExternalLink size={13} />
        </button>
      </div>

      {/* Stats footer */}
      <div className="px-3 py-3 mt-2 border-t border-gray-100">
        <p className="text-[11px] text-gray-400 text-center">
          Analyzed {totalSourcesAnalyzed} articles from {uniqueSources.size || totalSourcesFetched} sources
        </p>
      </div>
    </div>
  );
}

function ClusterCard({ cluster }: { cluster: AngleCluster }) {
  // Pick the first article in the cluster as the representative
  const representative = cluster.articles[0];
  if (!representative) return null;

  const { article, angle, sentiment, sourceBias } = representative;

  return (
    <div className="rounded-lg border border-gray-100 bg-white p-2.5 shadow-sm hover:shadow transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-800 leading-tight truncate">
            {cluster.label}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[11px] text-gray-500 truncate">
              {article.siteName || article.domain}
            </span>
            {sourceBias && <BiasBadge rating={sourceBias.biasRating} />}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
          <RegisterChip register={cluster.dominantRegister} />
          <SentimentDot compound={sentiment.compound} />
        </div>
      </div>
      <p className="text-[11px] text-gray-500 leading-snug mt-1.5 line-clamp-1">
        {angle.headline_framing}
      </p>
    </div>
  );
}
