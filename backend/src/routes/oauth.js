// OAuth server endpoints for MCP clients — OAuth 2.1 authorization server +
// protected-resource metadata powering claude.ai's "Add custom connector" flow.
import express from "express";

import { requireAuth } from "../middleware/auth.js";
import {
  metadataPRM,
  metadataAS,
  register as oauthRegister,
  authorize as oauthAuthorize,
  consent as oauthConsent,
  describeConsent as oauthDescribeConsent,
  token as oauthToken,
  setOauthCorsHeaders,
} from "../oauth/routes.js";

export function registerOauthRoutes(app) {
  // ---------------------------
  // OAuth 2.1 for the MCP endpoint. RFC 6749 + 7591 (DCR) + 7636 (PKCE) +
  // 8414 (AS metadata) + 9728 (PRM). Lets claude.ai's "Add custom connector"
  // flow auto-authenticate without the user pasting tokens.
  // ---------------------------
  app.use(["/oauth", "/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server"], (req, res, next) => {
    setOauthCorsHeaders(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });

  app.get("/.well-known/oauth-protected-resource", metadataPRM);
  app.get("/.well-known/oauth-authorization-server", metadataAS);

  app.post("/oauth/register", oauthRegister);
  app.get("/oauth/authorize", oauthAuthorize);
  app.post("/oauth/token", express.urlencoded({ extended: false }), oauthToken);
  // describeConsent and consent are called by the pullup.se SPA (same
  // origin via /api/) — JWT-authenticated.
  app.get("/oauth/describe-consent", oauthDescribeConsent);
  app.post("/oauth/consent", requireAuth, oauthConsent);
}
