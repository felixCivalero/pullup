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

const root = document.getElementById("root");
const app = (
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
// Public pages arrive pre-rendered (vite.config.js, pagesPlugin): take over
// that HTML instead of drawing it again. A difference (another language
// saved in this browser) just re-renders that part. App routes get the bare
// shell (app.html) and render from scratch.
if (root.hasChildNodes()) ReactDOM.hydrateRoot(root, app, { onRecoverableError: () => {} });
else ReactDOM.createRoot(root).render(app);
