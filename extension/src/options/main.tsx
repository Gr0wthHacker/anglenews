import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import "../styles.css";
import { Options } from "./Options";
import ErrorBoundary from "../sidepanel/components/ErrorBoundary";
import { useTheme } from "../lib/useTheme";

function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const { isDark } = useTheme();
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);
  return <>{children}</>;
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeWrapper>
        <Options />
      </ThemeWrapper>
    </ErrorBoundary>
  </React.StrictMode>,
);
