import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles/responsive.css";
// Error reporting first — a crash during boot should still report. No-op
// until VITE_SENTRY_DSN is set (see lib/errorReporting.js).
import { initErrorReporting } from "./lib/errorReporting.js";

initErrorReporting();

// WebMCP: an assistant in this browser gets PullUp's actions as tools
// (lib/webmcp.js). Only loaded where the browser has the API.
if (document.modelContext || navigator.modelContext) {
  import("./lib/webmcp.js").then((m) => m.startWebMcp());
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
