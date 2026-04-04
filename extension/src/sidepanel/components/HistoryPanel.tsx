import React, { useState, useEffect, useRef } from "react";
import { Clock, Trash2, Layers, BarChart3, ChevronRight } from "lucide-react";
import type { AngleComparison } from "@shared/types";

const STORAGE_KEY = "anglecheck_comparison_history";
const MAX_HISTORY_ITEMS = 20;
const MAX_STORAGE_BYTES = 500 * 1024; // 500KB

export interface HistoryEntry {
  id: string;
  topic: string;
  timestamp: string;
  sourceCount: number;
  clusterCount: number;
  comparison: AngleComparison;
}

interface HistoryPanelProps {
  onLoadComparison: (comparison: AngleComparison) => void;
}

/** Validate that an object has the shape of a HistoryEntry. */
function isValidHistoryEntry(obj: unknown): obj is HistoryEntry {
  if (typeof obj !== 'object' || obj === null) return false;
  const e = obj as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.topic === 'string' &&
    typeof e.timestamp === 'string' &&
    typeof e.sourceCount === 'number' &&
    typeof e.clusterCount === 'number' &&
    typeof e.comparison === 'object' &&
    e.comparison !== null
  );
}

/** Deduplicate entries by id, keeping the first occurrence. */
function deduplicateEntries(entries: HistoryEntry[]): HistoryEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

/** Trim entries until serialized size is under the max. */
function trimToSizeLimit(entries: HistoryEntry[]): HistoryEntry[] {
  let trimmed = entries;
  while (trimmed.length > 0) {
    const size = new Blob([JSON.stringify(trimmed)]).size;
    if (size <= MAX_STORAGE_BYTES) break;
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

/** Save a comparison to history in chrome.storage.local. */
export async function saveToHistory(comparison: AngleComparison): Promise<void> {
  const entry: HistoryEntry = {
    id: comparison.id,
    topic: comparison.topic,
    timestamp: comparison.timestamp,
    sourceCount: comparison.totalSourcesAnalyzed,
    clusterCount: comparison.clusters.length,
    comparison,
  };

  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const raw = result[STORAGE_KEY];
    const existing: HistoryEntry[] = Array.isArray(raw)
      ? raw.filter(isValidHistoryEntry)
      : [];

    // Deduplicate by id, prepend new entry, trim to max count, then trim to size limit
    const updated = trimToSizeLimit(
      deduplicateEntries([entry, ...existing]).slice(0, MAX_HISTORY_ITEMS),
    );

    await chrome.storage.local.set({ [STORAGE_KEY]: updated });
  } catch {
    // Outside extension context, use localStorage fallback
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const existing: HistoryEntry[] = raw
        ? (JSON.parse(raw) as unknown[]).filter(isValidHistoryEntry)
        : [];

      const updated = trimToSizeLimit(
        deduplicateEntries([entry, ...existing]).slice(0, MAX_HISTORY_ITEMS),
      );

      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // localStorage also unavailable, skip persistence
    }
  }
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ onLoadComparison }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load history on open
  useEffect(() => {
    if (!isOpen) return;

    try {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        if (chrome.runtime.lastError) {
          console.warn('Failed to load history:', chrome.runtime.lastError);
          return;
        }
        const stored = result[STORAGE_KEY];
        if (Array.isArray(stored)) {
          const validated = stored.filter(isValidHistoryEntry);
          setHistory(deduplicateEntries(validated));
        }
      });
    } catch {
      // Outside extension context, use localStorage fallback
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as unknown[];
          const validated = parsed.filter(isValidHistoryEntry);
          setHistory(deduplicateEntries(validated));
        }
      } catch {
        // localStorage also unavailable
      }
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleClearHistory = async () => {
    await chrome.storage.local.remove(STORAGE_KEY);
    setHistory([]);
  };

  const handleSelect = (entry: HistoryEntry) => {
    onLoadComparison(entry.comparison);
    setIsOpen(false);
  };

  const formatDate = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        title="Comparison history"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="Comparison history"
      >
        <Clock size={14} />
      </button>

      {/* Panel dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-100 z-50 overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-700">
              Recent Comparisons
            </span>
            {history.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="inline-flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                title="Clear history"
              >
                <Trash2 size={10} />
                Clear
              </button>
            )}
          </div>

          {/* History list */}
          <div className="max-h-80 overflow-y-auto scrollbar-hide">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <Clock size={20} className="text-gray-300 mb-2" />
                <p className="text-xs text-gray-400">
                  No comparisons yet. Analyze an article to get started.
                </p>
              </div>
            ) : (
              history.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => handleSelect(entry)}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-700 truncate">
                      {entry.topic}
                    </p>
                    <div className="flex items-center gap-2.5 mt-1">
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400">
                        <BarChart3 size={9} className="shrink-0" />
                        {entry.sourceCount} source{entry.sourceCount !== 1 ? "s" : ""}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400">
                        <Layers size={9} className="shrink-0" />
                        {entry.clusterCount} angle{entry.clusterCount !== 1 ? "s" : ""}
                      </span>
                      <span className="text-[10px] text-gray-300">
                        {formatDate(entry.timestamp)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight
                    size={12}
                    className="text-gray-300 shrink-0 mt-0.5"
                  />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryPanel;
