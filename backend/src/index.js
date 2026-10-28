// backend/src/index.js
//
// The API behind pullup.se — Felix's site and the PullUp event platform.
// Public: the "Jobba med mig" request, event pages and sign-ups, the booklet
// link, the site's own visit analytics. Signed in (any organiser, their own
// events — routes/auth.js): /admin/events, people, mail, agents. Owner only
// (requireOwner): statistics, sales, projects, Stockholm scraper.
// Stripe: /stripe/email-credits, bought sends (routes/adminEmailCredits.js).
//
// Assistants can do everything a person can (actions/): remote MCP on /mcp
// with OAuth (/oauth/*, /.well-known/*), WebMCP in the browser via /actions.
//
// The old PullUp platform (rooms, messaging …) lives on the `pullup-app` branch.
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
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAdminStockholmRoutes } from "./routes/adminStockholm.js";
import { registerAdminPlannerRoutes } from "./routes/adminPlanner.js";
import { registerAdminSalesRoutes } from "./routes/adminSales.js";
import { registerAdminClientRoutes } from "./routes/adminClients.js";
import { registerAdminProjectRoutes } from "./routes/adminProjects.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerAdminEventRoutes } from "./routes/adminEvents.js";
import { registerAdminMailRoutes, mailImageBodyParser } from "./routes/adminMail.js";
import { registerAdminEventMediaRoutes } from "./routes/adminEventMedia.js";
import { registerAdminArchiRoutes } from "./routes/adminArchi.js";
import { registerEmailCreditRoutes, emailCreditsWebhookParser } from "./routes/adminEmailCredits.js";
import { registerResendEventRoutes, resendEventsParser } from "./routes/resendEvents.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerOauthRoutes } from "./routes/oauth.js";
import { registerMcpRoutes } from "./routes/mcp.js";
import { registerActionRoutes } from "./routes/actions.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { initObservability, captureError } from "./observability.js";
import { getFrontendUrl } from "./lib/urls.js";
import { over } from "./lib/abuse.js";

const app = express();

// nginx is the one trusted proxy hop — req.ip is the real client for rate limits.
app.set("trust proxy", 1);

// The API answers JSON, plus a few plain HTML pages (unsubscribe, the event
// page for crawlers) that need no script at all: a strict policy costs nothing.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        styleSrc: ["'unsafe-inline'"],
        imgSrc: ["https:", "data:"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true, preload: false },
  }),
);

if (process.env.NODE_ENV === "production" && !process.env.CORS_ORIGIN) {
  throw new Error("CORS_ORIGIN must be set in production. Example: CORS_ORIGIN=https://pullup.se,https://www.pullup.se");
}
const siteCors = cors({
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",")
    : ["http://localhost:3000", "http://localhost:5173", "http://localhost:5199"],
  credentials: true,
  optionsSuccessStatus: 200,
});
// Assistants call the MCP server and its OAuth endpoints from anywhere (some
// from a browser). No cookies are involved — tokens travel in headers — so
// any origin may call them.
const agentCors = cors({
  origin: true,
  credentials: false,
  allowedHeaders: ["authorization", "content-type", "mcp-protocol-version", "mcp-session-id", "last-event-id"],
  exposedHeaders: ["mcp-session-id", "www-authenticate"],
  maxAge: 86400,
});
const isAgentPath = (p) => p === "/mcp" || p.startsWith("/mcp/") || p.startsWith("/.well-known/")
  || ["/oauth/register", "/oauth/token", "/oauth/revoke"].includes(p);
app.use((req, res, next) => (isAgentPath(req.path) ? agentCors : siteCors)(req, res, next));

// The mail module's image upload sends a data URL (≤ 2 MB image); it gets a
// bigger limit than every other route, parsed before the global one.
app.use("/admin/mail/images", mailImageBodyParser);
// Stripe's webhook is verified against the raw bytes.
app.use(...emailCreditsWebhookParser);
// So is Resend's (Svix).
app.use(...resendEventsParser);
app.use(express.json({ limit: "1mb" }));

// A ceiling per IP on everything (per-route limits sit under it): far above
// a person clicking around or an assistant working, a wall for a scraper or
// a flood. Payment and mail webhooks come from their providers and are signed.
const WEBHOOKS = new Set(["/stripe/email-credits", "/webhooks/resend-events"]);
app.use((req, res, next) => {
  if (WEBHOOKS.has(req.path) || req.path === "/health") return next();
  const ip = req.ip || "unknown";
  const writing = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (over(`ip:${ip}`, 900, 5 * 60_000) || (writing && over(`ip-write:${ip}`, 200, 5 * 60_000))) {
    res.set("Retry-After", "300");
    return res.status(429).json({ error: "rate_limited" });
  }
  return next();
});

// Liveness — the deploy gate and post-deploy check poll this.
app.get("/health", (req, res) => res.json({ ok: true }));

registerAgencyRequestRoutes(app);
registerDeckDownloadRoutes(app);
registerTrackBatchRoutes(app);

// ── Accounts and assistants ─────────────────────────────────────────
registerAuthRoutes(app);
registerOauthRoutes(app);
registerMcpRoutes(app);
registerActionRoutes(app);
registerAgentRoutes(app);

// ── Admin: organisers (their own events) and the owner ──────────────
registerAdminRoutes(app);
registerAdminStockholmRoutes(app);
registerAdminPlannerRoutes(app);
registerAdminSalesRoutes(app);
registerAdminClientRoutes(app);
registerAdminProjectRoutes(app);
registerEventRoutes(app);
registerAdminEventRoutes(app);
registerAdminMailRoutes(app);
registerAdminEventMediaRoutes(app);
registerAdminArchiRoutes(app);
registerEmailCreditRoutes(app);
registerResendEventRoutes(app);

// Old platform links (/v/ verify links, /share/ cards, deeper /e/ paths)
// still reach the API through nginx. Send people to the front page instead
// of a JSON 404. (/e/:slug itself is the event share preview, routes/events.js.)
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
