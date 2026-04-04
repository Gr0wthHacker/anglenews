import React, { useState, useRef, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";

const MAX_RECENT_SEARCHES = 10;
const DEBOUNCE_MS = 300;
const STORAGE_KEY = "anglecheck_recent_searches";

interface TopicSearchProps {
  onSearch: (topic: string) => void;
}

const TopicSearch: React.FC<TopicSearchProps> = ({ onSearch }) => {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load recent searches from storage on mount
  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const stored = result[STORAGE_KEY];
      if (Array.isArray(stored)) {
        setRecentSearches(stored);
      }
    });
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowRecent(false);
        if (!query.trim()) {
          setExpanded(false);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [query]);

  // Focus input when expanding
  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  const saveSearch = useCallback(
    (topic: string) => {
      const trimmed = topic.trim();
      if (!trimmed) return;

      const updated = [
        trimmed,
        ...recentSearches.filter(
          (s) => s.toLowerCase() !== trimmed.toLowerCase(),
        ),
      ].slice(0, MAX_RECENT_SEARCHES);

      setRecentSearches(updated);
      chrome.storage.local.set({ [STORAGE_KEY]: updated });
    },
    [recentSearches],
  );

  const submitSearch = useCallback(
    (topic: string) => {
      const trimmed = topic.trim();
      if (!trimmed) return;

      saveSearch(trimmed);
      onSearch(trimmed);
      setQuery("");
      setShowRecent(false);
      setExpanded(false);
    },
    [onSearch, saveSearch],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    // Show recent searches dropdown when typing
    setShowRecent(value.trim().length === 0 && recentSearches.length > 0);

    // Debounced auto-submit is handled via Enter or explicit submit, but we
    // debounce sending the message to the service worker so rapid typing
    // doesn't fire multiple requests.
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      submitSearch(query);
    } else if (e.key === "Escape") {
      setQuery("");
      setShowRecent(false);
      setExpanded(false);
    }
  };

  const handleFocus = () => {
    if (query.trim().length === 0 && recentSearches.length > 0) {
      setShowRecent(true);
    }
  };

  const handleClear = () => {
    setQuery("");
    setShowRecent(recentSearches.length > 0);
    inputRef.current?.focus();
  };

  const handleRecentClick = (topic: string) => {
    submitSearch(topic);
  };

  const handleExpand = () => {
    setExpanded(true);
  };

  // Filtered recent searches based on current query
  const filteredRecent =
    query.trim().length > 0
      ? recentSearches.filter((s) =>
          s.toLowerCase().includes(query.toLowerCase()),
        )
      : recentSearches;

  const shouldShowDropdown = showRecent && filteredRecent.length > 0;

  if (!expanded) {
    return (
      <button
        onClick={handleExpand}
        className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        title="Search topic"
        aria-label="Search topic"
      >
        <Search size={14} />
      </button>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-1 bg-gray-50 rounded-md border border-gray-200 px-2 py-1 transition-all">
        <Search size={12} className="text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder="Search topic..."
          className="bg-transparent text-xs text-gray-700 outline-none w-28 placeholder-gray-400"
          aria-label="Search for a topic"
          autoComplete="off"
        />
        {query && (
          <button
            onClick={handleClear}
            className="p-0.5 rounded text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Clear search"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Recent searches dropdown */}
      {shouldShowDropdown && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50">
          <p className="px-3 py-1 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
            Recent Searches
          </p>
          {filteredRecent.map((term) => (
            <button
              key={term}
              onClick={() => handleRecentClick(term)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors text-left"
            >
              <Search size={10} className="text-gray-300 shrink-0" />
              <span className="truncate">{term}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default TopicSearch;
