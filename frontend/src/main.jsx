import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles/responsive.css";
// Error reporting first — a crash during boot should still report. No-op
// until VITE_SENTRY_DSN is set (see lib/errorReporting.js).
import { initErrorReporting } from "./lib/errorReporting.js";

initErrorReporting();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
