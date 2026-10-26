// Where assistants find PullUp. In production the MCP server and its OAuth
// endpoints live on mcp.pullup.se (nginx: "/" → /mcp, /oauth/* and
// /.well-known/oauth-* pass through); locally everything is on the API port.
import { getFrontendUrl, isDevelopment } from "../lib/urls.js";

const local = `http://localhost:${process.env.PORT || 3001}`;

// The OAuth issuer (RFC 8414): metadata at <issuer>/.well-known/oauth-authorization-server.
export const ISSUER = (process.env.MCP_ISSUER || (isDevelopment ? local : "https://mcp.pullup.se")).replace(/\/+$/, "");

// The MCP server as clients address it — also the OAuth "resource" (RFC 8707).
export const MCP_URL = (process.env.MCP_URL || (isDevelopment ? `${local}/mcp` : "https://mcp.pullup.se")).replace(/\/+$/, "");

// Signed-out tools only (look at an event, sign up, ask for a meeting).
export const PUBLIC_MCP_URL = process.env.PUBLIC_MCP_URL || (isDevelopment ? `${local}/mcp/public` : `${getFrontendUrl()}/api/mcp/public`);

export const SCOPE = "pullup";
export const ACCESS_TOKEN_TTL_S = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL_S = 60 * 60 * 24 * 60; // 60 days, rotated on every use
export const AUTH_REQUEST_TTL_S = 15 * 60; // the person has 15 minutes to approve
export const AUTH_CODE_TTL_S = 5 * 60;
