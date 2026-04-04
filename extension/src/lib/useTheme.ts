import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'userPreferences';

function getSystemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveIsDark(theme: Theme): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return getSystemDark();
}

export function useTheme(): { isDark: boolean; theme: Theme; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>('system');
  const [isDark, setIsDark] = useState<boolean>(() => resolveIsDark('system'));

  // Load theme from chrome.storage.sync on mount
  useEffect(() => {
    try {
      chrome.storage.sync.get(STORAGE_KEY, (result) => {
        const prefs = result[STORAGE_KEY];
        if (prefs && typeof prefs === 'object' && prefs.theme) {
          const t = prefs.theme as Theme;
          setThemeState(t);
          setIsDark(resolveIsDark(t));
        }
      });
    } catch {
      // Not in extension context — fall back to system
    }
  }, []);

  // Listen for storage changes (e.g. Options page changes theme)
  useEffect(() => {
    try {
      const listener = (
        changes: { [key: string]: chrome.storage.StorageChange },
        areaName: string,
      ) => {
        if (areaName === 'sync' && changes[STORAGE_KEY]) {
          const newPrefs = changes[STORAGE_KEY].newValue;
          if (newPrefs && typeof newPrefs === 'object' && newPrefs.theme) {
            const t = newPrefs.theme as Theme;
            setThemeState(t);
            setIsDark(resolveIsDark(t));
          }
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    } catch {
      // Not in extension context
      return undefined;
    }
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      // Only update if the theme is set to 'system'
      setThemeState((current) => {
        if (current === 'system') {
          setIsDark(getSystemDark());
        }
        return current;
      });
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    setIsDark(resolveIsDark(t));
    try {
      chrome.storage.sync.get(STORAGE_KEY, (result) => {
        const prefs = result[STORAGE_KEY] || {};
        chrome.storage.sync.set({ [STORAGE_KEY]: { ...prefs, theme: t } });
      });
    } catch {
      // Not in extension context
    }
  }, []);

  return { isDark, theme, setTheme };
}
