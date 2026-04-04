import React from "react";
import ReactDOM from "react-dom/client";
import "../styles.css";
import { Options } from "./Options";
import ErrorBoundary from "../sidepanel/components/ErrorBoundary";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Options />
    </ErrorBoundary>
  </React.StrictMode>,
);
