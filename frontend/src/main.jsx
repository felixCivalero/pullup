import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import { AuthProvider } from "./contexts/AuthContext.jsx";
import "./styles/responsive.css";
// Side-effect import: starts capturing `beforeinstallprompt` at the earliest
// moment (it fires before React mounts) so the install CTA knows whether this
// visitor can convert the site into an app.
import "./lib/pwa/installState.js";
// Side-effect import: tags <html class="pwa-standalone"> when running installed.
import "./lib/pwa/displayMode.js";
import { registerServiceWorker } from "./lib/pwa/registerSW.js";

registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
