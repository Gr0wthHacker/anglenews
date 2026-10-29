import React, { useCallback, useEffect, useRef, useState } from "react";
import type { UserPreferences } from "@shared/types";
import { API_BASE_URL } from "@shared/constants";

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_PREFERENCES: UserPreferences = {
  apiKey: null,
  theme: "system",
};

const STORAGE_KEY = "userPreferences";

const EXTENSION_VERSION = "1.0.0";

// ─── Sub-components ─────────────────────────────────────────────────────────

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
    const stored = result[STORAGE_KEY];
    if (stored && typeof stored === "object") {
      // Only known keys are kept, so settings removed in earlier versions
      // drop out of storage on the next save.
      return {
        apiKey: typeof stored.apiKey === "string" ? stored.apiKey : null,
        theme:
          stored.theme === "light" || stored.theme === "dark"
            ? stored.theme
            : "system",
      };
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
          Settings for the AngleCheck connection and side panel.
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

      {/* 2. Display Settings */}
      <Section>
        <SectionHeading>Display Settings</SectionHeading>

        <div className="space-y-4">
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
        </div>
      </Section>

      {/* 3. Data & Privacy */}
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

      {/* 4. About */}
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
