import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, Info } from "lucide-react";
import type {
  AngleComparison,
  ExtensionMessage,
  AnalyzedArticle,
} from "@shared/types";
import Header from "./components/Header";
import CurrentArticleCard from "./components/CurrentArticleCard";
import AngleSpectrum from "./components/AngleSpectrum";
import CoverageGapAlert from "./components/CoverageGapAlert";
import ToneDistributionBar from "./components/ToneDistributionBar";
import SourceList from "./components/SourceList";
import LoadingState from "./components/LoadingState";
import { DashboardSkeleton } from "./components/SkeletonLoader";
import { saveToHistory } from "./components/HistoryPanel";

type AppState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "results"; data: AngleComparison };

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({ status: "idle" });
  const [compact, setCompact] = useState(false);

  const triggerAnalysis = useCallback(() => {
    setState({ status: "loading" });
    chrome.runtime
      .sendMessage({ type: "ANALYZE_ARTICLE" } satisfies Pick<ExtensionMessage, "type">)
      .catch(() => {
        // sendMessage can fail if there's no listener — try extracting from tab directly
        setState({
          status: "error",
          message: "Could not connect to the AngleCheck service worker. Try reloading the extension.",
        });
      });
  }, []);

  // On mount: listen for messages and trigger analysis
  useEffect(() => {
    const handleMessage = (message: ExtensionMessage) => {
      if (message.type === "ANALYSIS_COMPLETE") {
        setState({ status: "results", data: message.data });
        saveToHistory(message.data).catch(() => {/* ignore storage errors */});
      } else if (message.type === "ANALYSIS_ERROR") {
        setState({ status: "error", message: message.error });
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    // Check for cached results first, then trigger analysis
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url;
      if (url) {
        chrome.runtime
          .sendMessage({ type: "GET_CACHED", url } as ExtensionMessage)
          .then((response: unknown) => {
            const msg = response as { type: string; data: AngleComparison | null } | undefined;
            if (msg?.type === "CACHED_RESULT" && msg.data) {
              setState({ status: "results", data: msg.data });
            } else {
              triggerAnalysis();
            }
          })
          .catch(() => {
            triggerAnalysis();
          });
      } else {
        // No active tab URL — probably not on a web page
        setState({ status: "idle" });
      }
    });

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [triggerAnalysis]);

  const handleRetry = () => {
    triggerAnalysis();
  };

  const handleLoadComparison = useCallback((comparison: AngleComparison) => {
    setState({ status: "results", data: comparison });
  }, []);

  const handleSearch = useCallback((topic: string) => {
    setState({ status: "loading" });
    chrome.runtime
      .sendMessage({ type: "MANUAL_TOPIC_SEARCH", topic } as ExtensionMessage)
      .catch(() => {
        setState({
          status: "error",
          message: "Could not send search request to the service worker.",
        });
      });
  }, []);

  // Collect all articles from clusters for SourceList
  const allClusterArticles: AnalyzedArticle[] =
    state.status === "results"
      ? state.data.clusters.flatMap((c) => c.articles)
      : [];

  const currentSourceName =
    state.status === "results"
      ? state.data.currentArticle.sourceBias?.name ||
        state.data.currentArticle.article.siteName ||
        state.data.currentArticle.article.domain
      : "";

  return (
    <div className="flex flex-col h-screen max-w-panel bg-white dark:bg-gray-900">
      {/* Header */}
      <Header
        topic={state.status === "results" ? state.data.topic : null}
        isCompact={compact}
        onToggleCompact={() => setCompact((prev) => !prev)}
        comparison={state.status === "results" ? state.data : null}
        onLoadComparison={handleLoadComparison}
        onSearch={handleSearch}
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* Idle / No article */}
        {state.status === "idle" && (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-4">
              <Info size={24} className="text-blue-400" />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              No article detected
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
              Navigate to a news article and click AngleCheck to see how
              different outlets cover the same story.
            </p>
          </div>
        )}

        {/* Loading */}
        {state.status === "loading" && (
          <div className="relative">
            <DashboardSkeleton />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <LoadingState />
            </div>
          </div>
        )}

        {/* Error */}
        {state.status === "error" && (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
              <span className="text-xl">!</span>
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Analysis Failed
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed mb-4">
              {state.message}
            </p>
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
            >
              <RefreshCw size={12} />
              Try Again
            </button>
          </div>
        )}

        {/* Results */}
        {state.status === "results" && (
          <>
            {/* Current article card (sticky) */}
            <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 pb-1 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06)]">
              <CurrentArticleCard
                article={state.data.currentArticle}
                compact={compact}
              />
            </div>

            {/* Angle spectrum */}
            <AngleSpectrum
              clusters={state.data.clusters}
              compact={compact}
            />

            {/* Coverage gap alert */}
            <CoverageGapAlert
              gaps={state.data.coverageGaps}
              currentSourceName={currentSourceName}
            />

            {/* Tone distribution */}
            <ToneDistributionBar
              distribution={state.data.toneDistribution}
            />

            {/* Source list */}
            <SourceList articles={allClusterArticles} />

            {/* Footer */}
            <div className="px-3 py-4 border-t border-gray-50 dark:border-gray-800 mt-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-gray-300">
                  Powered by AngleCheck
                </p>
                <p className="text-[10px] text-gray-300">
                  {state.data.totalSourcesAnalyzed} of{" "}
                  {state.data.totalSourcesFetched} sources analyzed
                </p>
              </div>
              {state.data.cachedAt && (
                <p className="text-[10px] text-gray-300 mt-1">
                  Cached{" "}
                  {new Date(state.data.cachedAt).toLocaleString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default App;
