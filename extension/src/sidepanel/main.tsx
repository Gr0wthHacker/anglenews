import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { useTheme } from "../lib/useTheme";
import "../styles.css";

function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const { isDark } = useTheme();
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);
  return <>{children}</>;
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Could not find #root element");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeWrapper>
        <App />
      </ThemeWrapper>
    </ErrorBoundary>
  </React.StrictMode>,
);
