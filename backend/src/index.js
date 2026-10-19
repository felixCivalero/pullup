// backend/src/index.js
//
// The API behind pullup.se — Felix's site. Public: the "Jobba med mig"
// request, the booklet link on the case pages and the site's own visit
// analytics. Private: /admin/*, Felix only (requireOwner).
//
// The old PullUp platform (events, rooms, messaging, MCP …) lives on the
// `pullup-app` branch.
import express from "express";
import crypto from "crypto";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";

// .env is authoritative over PM2's baked-in env snapshot.
dotenv.config({ override: true });

import { registerAgencyRequestRoutes } from "./routes/agencyRequests.js";
import { registerDeckDownloadRoutes } from "./routes/deckDownloads.js";
import { registerTrackBatchRoutes } from "./routes/trackBatch.js";
import { requireOwner } from "./middleware/requireOwner.js";
import { initObservability, captureError } from "./observability.js";
import { getFrontendUrl } from "./lib/urls.js";

const app = express();

// nginx is the one trusted proxy hop — req.ip is the real client for rate limits.
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true, preload: false },
  }),
);

if (process.env.NODE_ENV === "production" && !process.env.CORS_ORIGIN) {
  throw new Error("CORS_ORIGIN must be set in production. Example: CORS_ORIGIN=https://pullup.se,https://www.pullup.se");
}
app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",")
      : ["http://localhost:3000", "http://localhost:5173", "http://localhost:5199"],
    credentials: true,
    optionsSuccessStatus: 200,
  }),
);

app.use(express.json({ limit: "1mb" }));

// Liveness — the deploy gate and post-deploy check poll this.
app.get("/health", (req, res) => res.json({ ok: true }));

registerAgencyRequestRoutes(app);
registerDeckDownloadRoutes(app);
registerTrackBatchRoutes(app);

// ── Admin (Felix only) ──────────────────────────────────────────────
app.get("/admin/me", requireOwner, (req, res) => {
  res.json({ ok: true, email: req.user.email });
});

// Old platform links (/e/:slug event pages, /v/ verify links, /share/ cards)
// still reach the API through nginx. Send people to the front page instead
// of a JSON 404.
app.get(["/e/{*rest}", "/v/{*rest}", "/share/{*rest}"], (req, res) => {
  res.redirect(302, `${getFrontendUrl()}/`);
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found", path: req.path });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const requestId = crypto.randomBytes(6).toString("hex");
  const status = Number(err.statusCode || err.status) || 500;
  console.error("[globalError]", { requestId, method: req.method, path: req.originalUrl, status, message: err.message });
  if (status >= 500) captureError(err, { requestId, path: req.originalUrl });
  res.status(status).json({ error: status >= 500 ? "Internal error" : err.message, requestId });
});

const PORT = process.env.PORT || 3001;
initObservability({ serviceName: "pullup-api" }).finally(() => {
  app.listen(PORT, () => {
    console.log(`pullup-api listening on :${PORT}`);
  });
});
