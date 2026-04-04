import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import "../styles.css";
import Popup from "./Popup";
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
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <ThemeWrapper>
          <Popup />
        </ThemeWrapper>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
