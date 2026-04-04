import React from "react";
import ReactDOM from "react-dom/client";
import "../styles.css";
import Popup from "./Popup";
import ErrorBoundary from "../sidepanel/components/ErrorBoundary";

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <Popup />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
