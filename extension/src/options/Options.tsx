import React, { useCallback, useEffect, useRef, useState } from "react";
import type { UserPreferences } from "@shared/types";
import type { BiasRating } from "@shared/types";
import { API_BASE_URL } from "@shared/constants";

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_PREFERENCES: UserPreferences = {
  apiKey: null,
  maxSourcesPerQuery: 15,
  cacheTTLHours: 4,
  preferredSources: [],
  excludedSources: [],
  showBiasLabels: true,
  autoDetectArticles: false,
  theme: "system",
  compactMode: false,
};

const STORAGE_KEY = "userPreferences";

const CACHE_DURATION_OPTIONS = [
  { value: 1, label: "1 hour" },
  { value: 2, label: "2 hours" },
  { value: 4, label: "4 hours" },
  { value: 8, label: "8 hours" },
  { value: 12, label: "12 hours" },
  { value: 24, label: "24 hours" },
];

interface KnownSource {
  domain: string;
  name: string;
  bias: BiasRating;
}

const KNOWN_SOURCES: KnownSource[] = [
  { domain: "apnews.com", name: "AP News", bias: "center" },
  { domain: "reuters.com", name: "Reuters", bias: "center" },
  { domain: "bbc.com", name: "BBC News", bias: "left-center" },
  { domain: "npr.org", name: "NPR", bias: "left-center" },
  { domain: "pbs.org", name: "PBS NewsHour", bias: "center" },
  { domain: "nytimes.com", name: "The New York Times", bias: "left-center" },
  { domain: "washingtonpost.com", name: "Washington Post", bias: "left-center" },
  { domain: "theguardian.com", name: "The Guardian", bias: "left-center" },
  { domain: "cnn.com", name: "CNN", bias: "left" },
  { domain: "msnbc.com", name: "MSNBC", bias: "left" },
  { domain: "foxnews.com", name: "Fox News", bias: "right" },
  { domain: "wsj.com", name: "Wall Street Journal", bias: "right-center" },
  { domain: "economist.com", name: "The Economist", bias: "left-center" },
  { domain: "aljazeera.com", name: "Al Jazeera", bias: "left-center" },
  { domain: "nbcnews.com", name: "NBC News", bias: "left-center" },
  { domain: "cbsnews.com", name: "CBS News", bias: "left-center" },
  { domain: "abcnews.go.com", name: "ABC News", bias: "left-center" },
  { domain: "usatoday.com", name: "USA Today", bias: "left-center" },
  { domain: "politico.com", name: "Politico", bias: "left-center" },
  { domain: "thehill.com", name: "The Hill", bias: "center" },
  { domain: "breitbart.com", name: "Breitbart", bias: "far-right" },
  { domain: "huffpost.com", name: "HuffPost", bias: "left" },
  { domain: "dailywire.com", name: "Daily Wire", bias: "right" },
  { domain: "vox.com", name: "Vox", bias: "left" },
  { domain: "nationalreview.com", name: "National Review", bias: "right" },
  { domain: "theatlantic.com", name: "The Atlantic", bias: "left-center" },
  { domain: "newsweek.com", name: "Newsweek", bias: "center" },
  { domain: "time.com", name: "Time", bias: "left-center" },
  { domain: "bloomberg.com", name: "Bloomberg", bias: "left-center" },
  { domain: "axios.com", name: "Axios", bias: "center" },
];

const BIAS_BADGE_COLORS: Record<BiasRating, { bg: string; text: string }> = {
  "far-left": { bg: "bg-blue-900", text: "text-white" },
  left: { bg: "bg-blue-600", text: "text-white" },
  "left-center": { bg: "bg-blue-300", text: "text-blue-900" },
  center: { bg: "bg-gray-300", text: "text-gray-800" },
  "right-center": { bg: "bg-red-300", text: "text-red-900" },
  right: { bg: "bg-red-600", text: "text-white" },
  "far-right": { bg: "bg-red-900", text: "text-white" },
};

const EXTENSION_VERSION = "1.0.0";

// ─── Sub-components ─────────────────────────────────────────────────────────

function ToggleSwitch({
  enabled,
  onChange,
  id,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  id: string;
}) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-angle-blue focus:ring-offset-2 ${
        enabled ? "bg-angle-blue" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function Slider({
  value,
  min,
  max,
  onChange,
  id,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  id: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-angle-blue"
      />
      <span className="min-w-[2.5rem] rounded bg-gray-100 px-2 py-0.5 text-center text-sm font-medium text-gray-700">
        {value}
      </span>
    </div>
  );
}

function BiasBadge({ bias }: { bias: BiasRating }) {
  const colors = BIAS_BADGE_COLORS[bias];
  const label = bias
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-tight ${colors.bg} ${colors.text}`}
    >
      {label}
    </span>
  );
}

function TagInput({
  selected,
  onChange,
  exclude,
  label,
  id,
}: {
  selected: string[];
  onChange: (domains: string[]) => void;
  exclude: string[];
  label: string;
  id: string;
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const available = KNOWN_SOURCES.filter(
    (s) => !selected.includes(s.domain) && !exclude.includes(s.domain),
  );

  const filtered = query.trim()
    ? available.filter(
        (s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          s.domain.toLowerCase().includes(query.toLowerCase()),
      )
    : available;

  const addSource = (domain: string) => {
    onChange([...selected, domain]);
    setQuery("");
    setIsOpen(false);
  };

  const removeSource = (domain: string) => {
    onChange(selected.filter((d) => d !== domain));
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedSources = selected
    .map((d) => KNOWN_SOURCES.find((s) => s.domain === d))
    .filter((s): s is KnownSource => s !== undefined);

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>

      {selectedSources.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedSources.map((source) => (
            <span
              key={source.domain}
              className="inline-flex items-center gap-1 rounded-full bg-gray-100 py-0.5 pl-2.5 pr-1 text-sm text-gray-700"
            >
              {source.name}
              <BiasBadge bias={source.bias} />
              <button
                onClick={() => removeSource(source.domain)}
                className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-400 hover:bg-gray-300 hover:text-gray-600"
                aria-label={`Remove ${source.name}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        id={id}
        type="text"
        placeholder="Type to search sources..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-angle-blue focus:outline-none focus:ring-1 focus:ring-angle-blue"
      />

      {isOpen && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {filtered.map((source) => (
            <li key={source.domain}>
              <button
                onClick={() => addSource(source.domain)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                <span>
                  <span className="font-medium text-gray-800">
                    {source.name}
                  </span>
                  <span className="ml-1.5 text-xs text-gray-400">
                    {source.domain}
                  </span>
                </span>
                <BiasBadge bias={source.bias} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {isOpen && query.trim() && filtered.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 shadow-lg">
          No matching sources found
        </div>
      )}
    </div>
  );
}

function SaveToast({ visible }: { visible: boolean }) {
  return (
    <div
      className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transform rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-lg transition-all duration-300 ${
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0"
      }`}
    >
      Settings saved
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 border-b border-gray-200 pb-2 text-base font-semibold text-gray-900">
      {children}
    </h2>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <section className="mb-8">{children}</section>;
}

// ─── Cache info ─────────────────────────────────────────────────────────────

interface CacheInfo {
  count: number;
  sizeKB: number;
}

async function getCacheInfo(): Promise<CacheInfo> {
  try {
    const everything = await chrome.storage.local.get(null);
    const cacheKeys = Object.keys(everything).filter((k) =>
      k.startsWith("ac_cache_"),
    );
    const cacheData: Record<string, unknown> = {};
    for (const key of cacheKeys) {
      cacheData[key] = everything[key];
    }
    const sizeBytes = new Blob([JSON.stringify(cacheData)]).size;
    return { count: cacheKeys.length, sizeKB: Math.round(sizeBytes / 1024) };
  } catch {
    return { count: 0, sizeKB: 0 };
  }
}

async function clearCache(): Promise<void> {
  try {
    const everything = await chrome.storage.local.get(null);
    const cacheKeys = Object.keys(everything).filter((k) =>
      k.startsWith("ac_cache_"),
    );
    if (cacheKeys.length > 0) {
      await chrome.storage.local.remove(cacheKeys);
    }
  } catch {
    // Silently handle errors in non-extension environments
  }
}

// ─── Persistence helpers ────────────────────────────────────────────────────

async function loadPreferences(): Promise<UserPreferences> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    if (result[STORAGE_KEY]) {
      return { ...DEFAULT_PREFERENCES, ...result[STORAGE_KEY] };
    }
  } catch {
    // Not running in extension context
  }
  return { ...DEFAULT_PREFERENCES };
}

async function savePreferences(prefs: UserPreferences): Promise<void> {
  try {
    await chrome.storage.sync.set({ [STORAGE_KEY]: prefs });
  } catch {
    // Not running in extension context
  }
}

// ─── Connection test ────────────────────────────────────────────────────────

type ConnectionStatus = "idle" | "testing" | "connected" | "disconnected";

async function testConnection(apiKey: string | null): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ─── Main Options Component ─────────────────────────────────────────────────

export function Options() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("idle");
  const [showToast, setShowToast] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<CacheInfo>({
    count: 0,
    sizeKB: 0,
  });
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load preferences and cache info on mount
  useEffect(() => {
    loadPreferences().then((p) => {
      setPrefs(p);
      setLoaded(true);
    });
    getCacheInfo().then(setCacheInfo);
  }, []);

  // Debounced auto-save
  const updatePrefs = useCallback(
    (partial: Partial<UserPreferences>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...partial };

        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
          savePreferences(next).then(() => {
            setShowToast(true);
            if (toastTimeoutRef.current) {
              clearTimeout(toastTimeoutRef.current);
            }
            toastTimeoutRef.current = setTimeout(
              () => setShowToast(false),
              2000,
            );
          });
        }, 500);

        return next;
      });
    },
    [],
  );

  const handleTestConnection = async () => {
    setConnectionStatus("testing");
    const ok = await testConnection(prefs.apiKey);
    setConnectionStatus(ok ? "connected" : "disconnected");
  };

  const handleClearCache = async () => {
    await clearCache();
    setCacheInfo({ count: 0, sizeKB: 0 });
    setShowClearConfirm(false);
  };

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-angle-blue" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[640px] px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">AngleCheck Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure how AngleCheck analyzes and displays news article
          comparisons.
        </p>
      </div>

      {/* 1. API Configuration */}
      <Section>
        <SectionHeading>API Configuration</SectionHeading>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="apiKey"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              API Key
            </label>
            <div className="relative">
              <input
                id="apiKey"
                type={showApiKey ? "text" : "password"}
                value={prefs.apiKey ?? ""}
                onChange={(e) =>
                  updatePrefs({
                    apiKey: e.target.value || null,
                  })
                }
                placeholder="Enter your API key"
                className="w-full rounded-md border border-gray-300 py-2 pl-3 pr-10 text-sm shadow-sm focus:border-angle-blue focus:outline-none focus:ring-1 focus:ring-angle-blue"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7.5a11.72 11.72 0 013.168-4.477M6.343 6.343A9.972 9.972 0 0112 5c5 0 9.27 3.11 11 7.5a11.72 11.72 0 01-4.168 4.477M6.343 6.343L3 3m3.343 3.343l2.829 2.829m4.243 4.243l2.829 2.829M6.343 6.343l11.314 11.314"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                  </svg>
                )}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              <a
                href="https://anglecheck.dev/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-angle-blue hover:underline"
              >
                Get an API Key
              </a>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleTestConnection}
              disabled={connectionStatus === "testing"}
              className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connectionStatus === "testing"
                ? "Testing..."
                : "Test Connection"}
            </button>
            {connectionStatus === "connected" && (
              <span className="flex items-center gap-1.5 text-sm text-green-600">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                Connected
              </span>
            )}
            {connectionStatus === "disconnected" && (
              <span className="flex items-center gap-1.5 text-sm text-red-600">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                Connection failed
              </span>
            )}
          </div>
        </div>
      </Section>

      {/* 2. Analysis Settings */}
      <Section>
        <SectionHeading>Analysis Settings</SectionHeading>

        <div className="space-y-5">
          <div>
            <label
              htmlFor="maxSources"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Max sources per query
            </label>
            <Slider
              id="maxSources"
              value={prefs.maxSourcesPerQuery}
              min={5}
              max={25}
              onChange={(v) => updatePrefs({ maxSourcesPerQuery: v })}
            />
            <p className="mt-1 text-xs text-gray-500">
              Higher values provide broader coverage but may take longer.
            </p>
          </div>

          <div>
            <label
              htmlFor="cacheDuration"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Cache duration
            </label>
            <select
              id="cacheDuration"
              value={prefs.cacheTTLHours}
              onChange={(e) =>
                updatePrefs({ cacheTTLHours: Number(e.target.value) })
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-angle-blue focus:outline-none focus:ring-1 focus:ring-angle-blue"
            >
              {CACHE_DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              How long to keep cached article comparisons before refreshing.
            </p>
          </div>
        </div>
      </Section>

      {/* 3. Source Preferences */}
      <Section>
        <SectionHeading>Source Preferences</SectionHeading>

        <div className="space-y-5">
          <TagInput
            id="preferredSources"
            label="Preferred Sources"
            selected={prefs.preferredSources}
            onChange={(domains) => updatePrefs({ preferredSources: domains })}
            exclude={prefs.excludedSources}
          />

          <TagInput
            id="excludedSources"
            label="Excluded Sources"
            selected={prefs.excludedSources}
            onChange={(domains) => updatePrefs({ excludedSources: domains })}
            exclude={prefs.preferredSources}
          />
        </div>
      </Section>

      {/* 4. Display Settings */}
      <Section>
        <SectionHeading>Display Settings</SectionHeading>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="showBiasLabels"
                className="text-sm font-medium text-gray-700"
              >
                Show bias labels
              </label>
              <p className="text-xs text-gray-500">
                Display political bias indicators on sources.
              </p>
            </div>
            <ToggleSwitch
              id="showBiasLabels"
              enabled={prefs.showBiasLabels}
              onChange={(v) => updatePrefs({ showBiasLabels: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="autoDetect"
                className="text-sm font-medium text-gray-700"
              >
                Auto-detect articles
              </label>
              <p className="text-xs text-amber-600">
                May increase resource usage
              </p>
            </div>
            <ToggleSwitch
              id="autoDetect"
              enabled={prefs.autoDetectArticles}
              onChange={(v) => updatePrefs({ autoDetectArticles: v })}
            />
          </div>

          <div>
            <span className="mb-2 block text-sm font-medium text-gray-700">
              Theme
            </span>
            <div className="flex gap-2">
              {(["light", "dark", "system"] as const).map((t) => (
                <label
                  key={t}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                    prefs.theme === t
                      ? "border-angle-blue bg-blue-50 text-angle-blue"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={t}
                    checked={prefs.theme === t}
                    onChange={() => updatePrefs({ theme: t })}
                    className="sr-only"
                  />
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="compactMode"
                className="text-sm font-medium text-gray-700"
              >
                Compact mode
              </label>
              <p className="text-xs text-gray-500">
                Reduce spacing and use smaller text in the side panel.
              </p>
            </div>
            <ToggleSwitch
              id="compactMode"
              enabled={prefs.compactMode}
              onChange={(v) => updatePrefs({ compactMode: v })}
            />
          </div>
        </div>
      </Section>

      {/* 5. Data & Privacy */}
      <Section>
        <SectionHeading>Data &amp; Privacy</SectionHeading>

        <div className="space-y-4">
          <div className="rounded-md bg-gray-50 p-3">
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-800">
                {cacheInfo.count} cached comparison{cacheInfo.count !== 1 ? "s" : ""}
              </span>
              {cacheInfo.count > 0 && (
                <span className="text-gray-400">
                  {" "}
                  &middot; ~{cacheInfo.sizeKB}KB
                </span>
              )}
            </p>
          </div>

          {showClearConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Are you sure?</span>
              <button
                onClick={handleClearCache}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Yes, clear all
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={cacheInfo.count === 0}
              className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear cached comparisons
            </button>
          )}

          <div className="rounded-md border border-gray-200 bg-white p-4 text-xs leading-relaxed text-gray-500">
            <p className="mb-2 font-medium text-gray-700">Your data</p>
            <ul className="list-inside list-disc space-y-1">
              <li>
                <strong>Sent to server:</strong> article headline, a short body
                excerpt, and the page URL for analysis. No personal data is
                transmitted.
              </li>
              <li>
                <strong>Stored locally:</strong> your preferences (synced via
                Chrome storage), cached comparison results, and your API key.
                All data stays in your browser.
              </li>
              <li>
                <strong>Not collected:</strong> browsing history, personal
                identifiers, or any data from non-news pages.
              </li>
            </ul>
          </div>
        </div>
      </Section>

      {/* 6. About */}
      <Section>
        <SectionHeading>About</SectionHeading>

        <div className="space-y-3 text-sm">
          <p className="text-gray-600">
            <span className="font-medium text-gray-800">AngleCheck</span>{" "}
            v{EXTENSION_VERSION}
          </p>

          <div className="flex gap-4">
            <a
              href="https://github.com/anglecheck/anglecheck-extension/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-angle-blue hover:underline"
            >
              Report a bug
            </a>
            <a
              href="https://chrome.google.com/webstore/detail/anglecheck"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-angle-blue hover:underline"
            >
              Rate on Chrome Web Store
            </a>
          </div>
        </div>
      </Section>

      <SaveToast visible={showToast} />
    </div>
  );
}
